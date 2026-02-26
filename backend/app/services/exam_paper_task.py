"""仿高考组卷后台任务执行器

采用与 grading_task.py 相同的模式：
- 同步入口供 BackgroundTasks 调用（asyncio.run）
- 独立数据库引擎，避免与请求会话冲突
- 通过数据库 + 内存 asyncio.Queue 双通道推送进度
"""

import asyncio
import contextlib
import json
import logging

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from backend.app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# SSE 进度队列（job_id → asyncio.Queue）
# 每个 SSE 连接订阅自己的 job_id 队列
# ---------------------------------------------------------------------------

_sse_queues: dict[str, asyncio.Queue] = {}
_sse_lock = asyncio.Lock()

# 进度内存计数器
_job_completed_counts: dict[str, int] = {}

# 主事件循环引用
_main_loop: asyncio.AbstractEventLoop | None = None


def set_main_loop(loop: asyncio.AbstractEventLoop) -> None:
    """在应用启动时调用，保存主事件循环引用供跨线程使用。"""
    global _main_loop
    _main_loop = loop


async def subscribe_job_progress(job_id: str) -> asyncio.Queue:
    async with _sse_lock:
        if job_id not in _sse_queues:
            _sse_queues[job_id] = asyncio.Queue(maxsize=500)
        return _sse_queues[job_id]


async def unsubscribe_job_progress(job_id: str) -> None:
    async with _sse_lock:
        _sse_queues.pop(job_id, None)


def _push_to_queue(job_id: str, event: str, data: dict) -> None:
    """跨线程安全地向主 loop 的 SSE 队列推送事件。

    后台任务通过 asyncio.run() 在独立线程运行，直接调用 queue.put_nowait()
    无法唤醒主 loop 里正在 await queue.get() 的协程（跨 loop 的 Future.set_result
    不会触发正确的 call_soon 唤醒）。必须用 call_soon_threadsafe 调度到主 loop。
    """
    queue = _sse_queues.get(job_id)
    if not queue:
        return
    msg = {"event": event, "data": data}
    if _main_loop is not None and _main_loop.is_running():
        with contextlib.suppress(RuntimeError):
            _main_loop.call_soon_threadsafe(queue.put_nowait, msg)
    else:
        # 回退：同一 loop 内直接 put
        try:
            queue.put_nowait(msg)
        except asyncio.QueueFull:
            logger.warning(f"SSE 队列已满（job_id={job_id}），丢弃事件 {event}")


# ---------------------------------------------------------------------------
# 进度状态聚合（用于写入数据库 / 前端轮询）
# ---------------------------------------------------------------------------


class JobProgressTracker:
    def __init__(self, job_id: str, total: int) -> None:
        self.job_id = job_id
        self.total = total
        self.completed = 0
        self.failed = 0
        self.skipped = 0
        self.current_actions: dict[int, str] = {}  # position → 当前动作

    def to_dict(self) -> dict:
        return {
            "total": self.total,
            "completed": self.completed,
            "failed": self.failed,
            "skipped": self.skipped,
            "current_actions": self.current_actions,
        }


# ---------------------------------------------------------------------------
# 同步入口（BackgroundTasks 调用）
# ---------------------------------------------------------------------------


def run_exam_generation_in_background(job_id: str) -> None:
    """同步入口，由 FastAPI BackgroundTasks 在线程池中调用。"""
    asyncio.run(_run_async(job_id))


async def _run_async(job_id: str) -> None:
    engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        try:
            from backend.app.services.config_service import load_config_cache

            await load_config_cache(session)

            from backend.app.graph.exam_agents.schemas import PaperRequirement
            from backend.app.graph.exam_paper_generator import ExamPaperGenerator
            from backend.app.services.config_service import get_config_int
            from backend.app.services.exam_paper_service import (
                ExamJobService,
                ExamPermissionService,
                estimate_tokens,
            )

            job_service = ExamJobService(session)
            perm_service = ExamPermissionService(session)

            # 加载 Job
            job = await job_service.get_job(job_id)
            if not job:
                logger.error(f"Job {job_id} 不存在")
                return

            if job.status not in ("pending", "resuming"):
                logger.warning(f"Job {job_id} 状态为 {job.status}，跳过")
                return

            # 解析需求
            requirement = PaperRequirement(**json.loads(job.requirement))
            existing_questions: dict[int, str] = {}
            already_done_positions: set[int] = set()

            if job.completed_questions and job.completed_questions != "{}":
                existing_questions = {
                    int(k): v for k, v in json.loads(job.completed_questions).items()
                }
                already_done_positions = set(existing_questions.keys())

            # 更新状态为运行中
            await job_service.update_status(job_id, "running")
            await session.commit()

            # Token 配额预估
            solve_count = get_config_int("exam_agent_solve_count")
            remaining_questions = requirement.total_questions - len(
                already_done_positions
            )
            estimated = estimate_tokens(remaining_questions, solve_count)

            quota_exhausted = asyncio.Event()

            def _check_quota_mid_job() -> bool:
                """在生成过程中异步检查配额（允许当前批次完成）"""
                return quota_exhausted.is_set()

            def make_progress_callback(tracker: JobProgressTracker):
                def callback(event: str, data: dict) -> None:
                    pos = data.get("position_index")
                    if pos:
                        tracker.current_actions[pos] = event

                    if event == "question_approved":
                        tracker.completed += 1
                        _job_completed_counts[job_id] = tracker.completed
                        tracker.current_actions.pop(pos, None)
                    elif event == "question_skipped":
                        tracker.skipped += 1
                        tracker.current_actions.pop(pos, None)

                    _push_to_queue(job_id, event, data)

                return callback

            tracker = JobProgressTracker(job_id, remaining_questions)
            generator = ExamPaperGenerator(
                session=session,
                progress_callback=make_progress_callback(tracker),
            )

            # 通知前端开始
            _push_to_queue(
                job_id,
                "job_started",
                {
                    "job_id": job_id,
                    "total_questions": requirement.total_questions,
                    "remaining": remaining_questions,
                },
            )

            result = await generator.generate(
                requirement=requirement,
                already_done_positions=already_done_positions,
                existing_questions=existing_questions,
                quota_exhausted=quota_exhausted,
            )

            # 保存到 QuestionSet
            from backend.app.services.question_service import QuestionService

            question_service = QuestionService(session)
            question_set = await question_service.create_question_set(
                title=result["title"],
                course_id=requirement.course_id,
                teacher_id=job.teacher_id,
                json_content=result["json_content"],
                description=f"仿高考模拟卷 · {requirement.subject} · {requirement.target_region}",
            )

            # 更新 Job 状态
            job.question_set_id = question_set.id
            await job_service.update_status(
                job_id,
                status="completed",
                completed_questions=result["completed_questions"],
                warnings=result["warnings"],
            )

            # 保存追踪日志
            trace_spans = result.get("trace_spans")
            if trace_spans:
                import json as _json

                job.trace_log = _json.dumps(trace_spans, ensure_ascii=False)

            # 统计 token 消耗（近似值）
            await perm_service.consume_tokens(job.teacher_id, estimated)
            await job_service.add_token_usage(job_id, estimated)

            await session.commit()

            _push_to_queue(
                job_id,
                "job_completed",
                {
                    "job_id": job_id,
                    "question_set_id": question_set.id,
                    "title": result["title"],
                    "warnings": result["warnings"],
                },
            )
            logger.info(f"Job {job_id} 完成，question_set_id={question_set.id}")

        except Exception as e:
            logger.error(f"Job {job_id} 异常: {e}", exc_info=True)
            try:
                from backend.app.services.exam_paper_service import ExamJobService

                job_service = ExamJobService(session)
                await job_service.update_status(job_id, "failed", error_message=str(e))
                await session.commit()
            except Exception:
                await session.rollback()

            _push_to_queue(job_id, "job_failed", {"job_id": job_id, "error": str(e)})
        finally:
            _job_completed_counts.pop(job_id, None)
            await engine.dispose()
