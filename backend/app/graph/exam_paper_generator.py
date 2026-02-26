"""仿高考组卷 Multi-Agent 主编排器

流程：
  1. HotspotAgent（可选）
  2. DispatchAgent → [QuestionTask × N]
  3. 并发窗口（asyncio.Semaphore）：
     ├─ QuestionAgent
     ├─ QualityCheckAgent（失败 → 重试 QuestionAgent）
     ├─ SolveAgent × K 并行
     ├─ GradeAgent × K 并行
     └─ DifficultyAgent（失败 → 重试 QuestionAgent）
  4. AssembleAgent → 生成最终 Markdown

进度通过回调函数推送到外部（SSE / 数据库）。
"""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator, Callable
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.graph.exam_agents.assemble_agent import AssembleAgent
from backend.app.graph.exam_agents.difficulty_agent import DifficultyAgent
from backend.app.graph.exam_agents.dispatch_agent import DispatchAgent
from backend.app.graph.exam_agents.grade_agent import GradeAgent
from backend.app.graph.exam_agents.hotspot_agent import HotspotAgent
from backend.app.graph.exam_agents.quality_check_agent import QualityCheckAgent
from backend.app.graph.exam_agents.question_agent import QuestionAgent
from backend.app.graph.exam_agents.schemas import (
    AssembleInput,
    DifficultyResult,
    GeneratedQuestion,
    HotspotResult,
    PaperRequirement,
    QuestionTask,
)
from backend.app.graph.exam_agents.solve_agent import SolveAgent
from backend.app.graph.trace_collector import TraceCollector
from backend.app.services.config_service import get_config_int, get_solve_agent_configs

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[str, dict], None]  # (event_type, data)


class ExamPaperGenerator:
    """单次组卷任务的编排器（每个 Job 一个实例）"""

    def __init__(
        self,
        session: AsyncSession,
        progress_callback: ProgressCallback | None = None,
    ) -> None:
        self.session = session
        self.progress_callback = progress_callback or (lambda e, d: None)

        self.question_agent = QuestionAgent()
        self.quality_check_agent = QualityCheckAgent()
        # 多模型 SolveAgent：每个配置实例模拟不同水平的考生
        solve_configs = get_solve_agent_configs()
        self.solve_agents = [SolveAgent(cfg) for cfg in solve_configs]
        logger.info(
            f"SolveAgent 已加载 {len(self.solve_agents)} 个模型实例: "
            + ", ".join(a.label for a in self.solve_agents)
        )
        self.grade_agent = GradeAgent()
        self.difficulty_agent = DifficultyAgent()
        self.assemble_agent = AssembleAgent()

    def _emit(self, event: str, data: dict) -> None:
        try:
            self.progress_callback(event, data)
        except Exception as e:
            logger.warning(f"进度回调异常: {e}")

    async def _process_single_question(
        self,
        task: QuestionTask,
        semaphore: asyncio.Semaphore,
        quota_exhausted: asyncio.Event,
        solve_count: int,
        max_retry: int,
        tracer: TraceCollector | None = None,
    ) -> tuple[GeneratedQuestion | None, DifficultyResult | None, list[str]]:
        """
        处理单道题目的完整生命周期（含重试）。
        返回：(通过的题目 | None, 难度结果 | None, 警告列表)
        """
        warnings: list[str] = []
        retry_count = 0

        while retry_count <= max_retry:
            async with semaphore:
                if quota_exhausted.is_set():
                    warnings.append(f"第{task.position_index}题：Token 配额耗尽，跳过")
                    return None, None, warnings

                # ---- 1. 生成题目 ----
                self._emit(
                    "question_start",
                    {
                        "position_index": task.position_index,
                        "question_type": task.question_type,
                        "knowledge_point": task.knowledge_point,
                        "retry_count": retry_count,
                    },
                )
                try:
                    question = await self.question_agent.run(task, tracer=tracer)
                except Exception as e:
                    logger.error(f"QuestionAgent 异常 pos={task.position_index}: {e}")
                    task.retry_feedback = f"生成失败，请重新出题: {e}"
                    task.retry_count += 1
                    retry_count += 1
                    self._emit(
                        "question_error",
                        {
                            "position_index": task.position_index,
                            "error": str(e),
                        },
                    )
                    continue

                # ---- 2. 质量审核 ----
                self._emit("quality_check", {"position_index": task.position_index})
                qc_result = await self.quality_check_agent.run(
                    question, tracer=tracer, position_index=task.position_index
                )
                if not qc_result.passed:
                    reasons = "; ".join(qc_result.rejection_reasons)
                    logger.info(f"质检不通过 pos={task.position_index}: {reasons}")
                    if retry_count >= max_retry:
                        # 超过最大重试次数，强制放行（降级）进入难度评估
                        logger.warning(
                            f"质检达到重试上限，强制放行 pos={task.position_index}"
                        )
                        self._emit(
                            "quality_check_failed",
                            {
                                "position_index": task.position_index,
                                "reasons": qc_result.rejection_reasons,
                                "retry_count": retry_count,
                                "force_pass": True,
                            },
                        )
                    else:
                        task.retry_feedback = f"质检失败：{reasons}"
                        task.retry_count += 1
                        retry_count += 1
                        self._emit(
                            "quality_check_failed",
                            {
                                "position_index": task.position_index,
                                "reasons": qc_result.rejection_reasons,
                                "retry_count": retry_count,
                            },
                        )
                        continue

                # ---- 3. K 组并行 SolveAgent + GradeAgent ----
                self._emit(
                    "solving",
                    {
                        "position_index": task.position_index,
                        "solve_count": solve_count,
                    },
                )

                async def _solve_and_grade(attempt_idx: int):
                    agent = self.solve_agents[attempt_idx % len(self.solve_agents)]
                    attempt = await agent.run(
                        question,
                        attempt_idx,
                        tracer=tracer,
                        position_index=task.position_index,
                    )
                    grade = await self.grade_agent.run(
                        question,
                        attempt,
                        tracer=tracer,
                        position_index=task.position_index,
                    )
                    return grade

                grade_results = await asyncio.gather(
                    *[_solve_and_grade(i) for i in range(solve_count)],
                    return_exceptions=False,
                )

                # ---- 4. 难度评估 ----
                diff_result = self.difficulty_agent.run(
                    question=question,
                    grade_results=list(grade_results),
                    retry_count=retry_count,
                    max_retry=max_retry,
                )

                self._emit(
                    "difficulty_result",
                    {
                        "position_index": task.position_index,
                        "coefficient": diff_result.difficulty_coefficient,
                        "decision": diff_result.decision,
                        "pass_count": diff_result.pass_count,
                        "total_attempts": diff_result.total_attempts,
                    },
                )

                if diff_result.decision == "approve":
                    if diff_result.difficulty_warning:
                        warnings.append(
                            f"第{task.position_index}题难度系数 {diff_result.difficulty_coefficient:.2f}"
                            f" 超出目标区间（已降级放行）"
                        )
                    self._emit(
                        "question_approved",
                        {
                            "position_index": task.position_index,
                            "difficulty_coefficient": diff_result.difficulty_coefficient,
                            "difficulty_warning": diff_result.difficulty_warning,
                        },
                    )
                    return question, diff_result, warnings
                else:
                    task.retry_feedback = (
                        diff_result.feedback or "难度不达标，请重新出题"
                    )
                    task.retry_count += 1
                    retry_count += 1
                    self._emit(
                        "difficulty_retry",
                        {
                            "position_index": task.position_index,
                            "feedback": diff_result.feedback,
                            "retry_count": retry_count,
                        },
                    )

        # 超过最大重试次数，跳过此题
        warnings.append(
            f"第{task.position_index}题超过最大重试次数 {max_retry}，已跳过"
        )
        self._emit("question_skipped", {"position_index": task.position_index})
        return None, None, warnings

    async def generate(
        self,
        requirement: PaperRequirement,
        already_done_positions: set[int] | None = None,
        existing_questions: dict[int, str]
        | None = None,  # {position_index: serialized question JSON}
        quota_exhausted: asyncio.Event | None = None,
    ) -> dict:
        """
        执行完整组卷流程。

        Returns:
            {
                "json_content": str,          # 完整试卷 JSON 字符串
                "title": str,
                "warnings": list[str],
                "completed_questions": dict,  # {position_index: serialized question JSON}
                "trace_spans": list[dict],    # LLM 调用追踪数据
            }
        """
        quota_exhausted = quota_exhausted or asyncio.Event()
        solve_count = get_config_int("exam_agent_solve_count")
        max_retry = get_config_int("exam_agent_max_retry")
        concurrency = get_config_int("exam_agent_concurrency")
        semaphore = asyncio.Semaphore(concurrency)

        # 创建追踪收集器
        tracer = TraceCollector(self._emit)

        # ---- Step 1: HotspotAgent（可选）----
        hotspot_result: HotspotResult | None = None
        if requirement.use_hotspot:
            self._emit("hotspot_start", {"subject": requirement.subject})
            try:
                hotspot_agent = HotspotAgent()
                hotspot_result = await hotspot_agent.run(
                    subjects=[requirement.subject],
                    threshold_days=requirement.hotspot_time_range_days,
                    tracer=tracer,
                )
                self._emit("hotspot_done", {"count": len(hotspot_result.items)})
            except Exception as e:
                logger.warning(f"HotspotAgent 失败，继续不使用热点: {e}")
                self._emit("hotspot_failed", {"error": str(e)})

        # ---- Step 2: DispatchAgent ----
        self._emit("dispatch_start", {"total_questions": requirement.total_questions})
        dispatch_agent = DispatchAgent(self.session)
        tasks = await dispatch_agent.dispatch(
            requirement=requirement,
            hotspot_result=hotspot_result,
            already_done_positions=already_done_positions,
            tracer=tracer,
        )
        self._emit("dispatch_done", {"task_count": len(tasks)})

        # ---- Step 3: 并发处理每道题 ----
        all_warnings: list[str] = []
        approved_questions: list[GeneratedQuestion] = []
        difficulty_results: list[DifficultyResult] = []
        completed_questions: dict[int, str] = dict(existing_questions or {})

        coroutines = [
            self._process_single_question(
                task, semaphore, quota_exhausted, solve_count, max_retry, tracer=tracer
            )
            for task in tasks
        ]

        results = await asyncio.gather(*coroutines, return_exceptions=True)

        for task, result in zip(tasks, results):
            if isinstance(result, Exception):
                logger.error(f"处理题目异常 pos={task.position_index}: {result}")
                all_warnings.append(
                    f"第{task.position_index}题处理异常，已跳过: {result}"
                )
                continue
            question, diff_result, warns = result
            all_warnings.extend(warns)
            if question is not None:
                approved_questions.append(question)
                if diff_result:
                    difficulty_results.append(diff_result)
                # 序列化单题 JSON（供 resume 时恢复用）
                completed_questions[task.position_index] = json.dumps(
                    {
                        "type": question.question_type,
                        "content": question.question_text,
                        "options": (
                            [{"key": k, "value": v} for k, v in question.options.items()]
                            if question.options
                            else None
                        ),
                        "answer": question.correct_answer,
                        "explanation": question.explanation,
                        "scoring_points": question.scoring_points,
                    },
                    ensure_ascii=False,
                )

        # 合并已存在题目（续做）：将 existing_questions 反序列化，按位置合并排序
        if existing_questions:
            logger.info(f"续做：从已完成 {len(existing_questions)} 题继续")
            # position → 新生成题目
            new_q_by_pos: dict[int, GeneratedQuestion] = {
                task.position_index: q
                for task, result in zip(tasks, results)
                if not isinstance(result, Exception)
                for q, _, _ in [result]
                if q is not None
            }
            # position → 所有题目（新题优先，否则复原旧题）
            merged: dict[int, GeneratedQuestion] = {}
            for pos, q_json_str in existing_questions.items():
                if pos in new_q_by_pos:
                    merged[pos] = new_q_by_pos[pos]
                    continue
                try:
                    q_data = json.loads(q_json_str)
                    opts = q_data.get("options")
                    options_dict: dict[str, str] | None = None
                    if opts and isinstance(opts, list):
                        options_dict = {
                            item["key"]: item["value"]
                            for item in opts
                            if "key" in item
                        }
                    elif opts and isinstance(opts, dict):
                        options_dict = opts
                    merged[pos] = GeneratedQuestion(
                        task_id=f"resume_{pos}",
                        question_type=q_data.get("type", "short_answer"),
                        question_text=q_data.get("content", ""),
                        options=options_dict,
                        correct_answer=q_data.get("answer", ""),
                        explanation=q_data.get("explanation", ""),
                        scoring_points=q_data.get("scoring_points"),
                        knowledge_point="",
                        target_difficulty_level="",
                    )
                except Exception as e:
                    logger.warning(f"续做：恢复题目 pos={pos} 失败: {e}")
            # 追加本次新增的非续做位置的题目
            for task, result in zip(tasks, results):
                if task.position_index not in merged and not isinstance(result, Exception):
                    q, _, _ = result
                    if q is not None:
                        merged[task.position_index] = q
            approved_questions = [q for _, q in sorted(merged.items())]

        if not approved_questions:
            raise RuntimeError("所有题目均未通过审核，组卷失败")

        # ---- Step 4: AssembleAgent ----
        self._emit("assemble_start", {"question_count": len(approved_questions)})

        assemble_input = AssembleInput(
            requirement=requirement,
            approved_questions=approved_questions,
            difficulty_results=difficulty_results,
        )
        assemble_result = self.assemble_agent.run(assemble_input)
        all_warnings.extend(assemble_result.warnings)

        self._emit(
            "assemble_done",
            {
                "title": assemble_result.title,
                "total": len(approved_questions),
            },
        )

        return {
            "json_content": assemble_result.json_content,
            "title": assemble_result.title,
            "warnings": all_warnings,
            "completed_questions": completed_questions,
            "trace_spans": tracer.to_json_list(),
        }
