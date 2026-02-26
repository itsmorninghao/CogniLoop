"""仿高考组卷 API 端点"""

import asyncio
import json
import logging
import shutil
import tempfile
import uuid
from collections.abc import AsyncGenerator
from pathlib import Path as _Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select

from backend.app.api.v1.deps import CurrentAdmin, CurrentTeacher, SessionDep, SSETeacher
from backend.app.graph.exam_agents.schemas import PaperRequirement, QuestionTypeConfig
from backend.app.models.exam_paper import ExamQuestion, TeacherExamPermission
from backend.app.models.teacher import Teacher
from backend.app.rag.exam_retriever import ExamRetriever
from backend.app.services.exam_paper_service import (
    ExamJobService,
    ExamPermissionService,
    estimate_tokens,
)
from backend.app.services.exam_paper_task import (
    run_exam_generation_in_background,
    subscribe_job_progress,
    unsubscribe_job_progress,
)
from backend.app.services.gaokao_import_task import (
    get_import_status,
    run_github_import_in_background,
    run_import_in_background,
)

logger = logging.getLogger(__name__)

router = APIRouter()  # 教师路由（挂载在 /exam-paper）
admin_router = APIRouter()  # 管理员路由（挂载在 /admin/exam-paper）


# ---------------------------------------------------------------------------
# Pydantic Request / Response Schemas
# ---------------------------------------------------------------------------


class QuestionTypeConfigInput(BaseModel):
    question_type: str
    count: int
    score_per_question: float = 6.0


class GenerateRequest(BaseModel):
    course_id: int
    subject: str
    target_region: str = "全国甲卷"
    question_distribution: list[QuestionTypeConfigInput]
    target_difficulty: str = "medium"
    use_hotspot: bool = False
    extra_note: str | None = None


class EstimateRequest(BaseModel):
    total_questions: int
    solve_count: int = 5


class GrantPermissionRequest(BaseModel):
    monthly_quota: int | None = None
    note: str | None = None


class SingleRegenerateRequest(BaseModel):
    extra_instructions: str = ""


# ---------------------------------------------------------------------------
# 教师 API
# ---------------------------------------------------------------------------


@router.get("/subjects")
async def list_subjects(session: SessionDep):
    """返回历年真题数据库中有记录的科目列表"""
    retriever = ExamRetriever(session)
    subjects = await retriever.get_available_subjects()
    return {"subjects": subjects}


@router.get("/regions")
async def list_regions(
    session: SessionDep,
    subject: str = Query(..., description="科目名称"),
):
    """返回指定科目下有历年真题的卷型列表（含题目数量）"""
    retriever = ExamRetriever(session)
    regions = await retriever.get_available_regions(subject)
    return {"regions": regions}


@router.get("/estimate")
async def estimate_quota(
    session: SessionDep,
    teacher: CurrentTeacher,
    total_questions: int = Query(..., ge=1, le=150),
    solve_count: int = Query(default=5, ge=1, le=10),
):
    """预估本次组卷的 Token 消耗，并检查配额是否充足"""
    perm_service = ExamPermissionService(session)
    estimated = estimate_tokens(total_questions, solve_count)

    perm = await perm_service.get_permission(teacher.id)
    if not perm or not perm.is_enabled:
        return {
            "estimated_tokens": estimated,
            "authorized": False,
            "sufficient": False,
            "message": "未获得仿高考组卷授权，请联系管理员",
        }

    if perm.monthly_quota is None:
        return {
            "estimated_tokens": estimated,
            "authorized": True,
            "sufficient": True,
            "monthly_quota": None,
            "token_used": perm.token_used,
            "remaining": None,
            "message": "配额无限制",
        }

    remaining = perm.monthly_quota - perm.token_used
    sufficient = remaining >= estimated
    return {
        "estimated_tokens": estimated,
        "authorized": True,
        "sufficient": sufficient,
        "monthly_quota": perm.monthly_quota,
        "token_used": perm.token_used,
        "remaining": remaining,
        "message": "配额充足"
        if sufficient
        else f"配额不足（剩余 {remaining:,}，需 {estimated:,}）",
    }


@router.post("/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate_paper(
    data: GenerateRequest,
    session: SessionDep,
    teacher: CurrentTeacher,
    background_tasks: BackgroundTasks,
):
    """发起组卷任务（异步，立即返回 job_id）"""
    perm_service = ExamPermissionService(session)

    # 权限检查
    ok, msg = await perm_service.check_quota(
        teacher.id,
        estimate_tokens(
            sum(c.count for c in data.question_distribution),
            5,
        ),
    )
    if not ok:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=msg)

    total_questions = sum(c.count for c in data.question_distribution)
    requirement = PaperRequirement(
        subject=data.subject,
        course_id=data.course_id,
        target_region=data.target_region,
        total_questions=total_questions,
        question_distribution=[
            QuestionTypeConfig(**c.model_dump()) for c in data.question_distribution
        ],
        target_difficulty=data.target_difficulty,
        use_hotspot=data.use_hotspot,
        extra_note=data.extra_note,
    )

    job_id = str(uuid.uuid4())
    job_service = ExamJobService(session)
    await job_service.create_job(
        job_id=job_id,
        teacher_id=teacher.id,
        course_id=data.course_id,
        requirement_json=requirement.model_dump_json(),
    )
    await session.commit()

    background_tasks.add_task(run_exam_generation_in_background, job_id)

    return {"job_id": job_id, "status": "pending", "message": "组卷任务已创建"}


@router.get("/jobs")
async def list_jobs(
    session: SessionDep,
    teacher: CurrentTeacher,
    course_id: int | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
):
    """获取我的组卷任务列表"""
    job_service = ExamJobService(session)
    jobs = await job_service.list_jobs_for_teacher(
        teacher_id=teacher.id,
        course_id=course_id,
        limit=limit,
    )

    def _parse_requirement(raw: str) -> dict:
        try:
            return json.loads(raw)
        except Exception:
            return {}

    return {
        "jobs": [
            {
                "job_id": j.id,
                "status": j.status,
                "question_set_id": j.question_set_id,
                "token_consumed": j.token_consumed,
                "warnings": json.loads(j.warnings) if j.warnings else [],
                "created_at": j.created_at.isoformat(),
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                "requirement": _parse_requirement(j.requirement),
                "course_id": j.course_id,
            }
            for j in jobs
        ]
    }


@router.get("/jobs/{job_id}")
async def get_job(
    job_id: str,
    session: SessionDep,
    teacher: CurrentTeacher,
):
    """获取单个 Job 详情"""
    job_service = ExamJobService(session)
    job = await job_service.get_job(job_id)
    if not job or job.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="任务不存在")

    from backend.app.services.exam_paper_task import _job_completed_counts

    requirement = json.loads(job.requirement)
    db_completed = (
        len(json.loads(job.completed_questions)) if job.completed_questions else 0
    )
    live_completed = _job_completed_counts.get(job.id, 0)
    return {
        "job_id": job.id,
        "status": job.status,
        "requirement": requirement,
        "progress": json.loads(job.progress) if job.progress else {},
        "warnings": json.loads(job.warnings) if job.warnings else [],
        "completed_questions_count": max(db_completed, live_completed),
        "question_set_id": job.question_set_id,
        "token_consumed": job.token_consumed,
        "error_message": job.error_message,
        "resume_count": job.resume_count,
        "created_at": job.created_at.isoformat(),
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }


@router.get("/jobs/{job_id}/content")
async def get_job_paper_content(
    job_id: str,
    session: SessionDep,
    teacher: CurrentTeacher,
):
    """获取已完成任务的试卷 JSON 内容"""
    from backend.app.services.question_service import QuestionService

    job_service = ExamJobService(session)
    job = await job_service.get_job(job_id)
    if not job or job.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="任务不存在")
    if job.status != "completed" or not job.question_set_id:
        raise HTTPException(status_code=400, detail="试卷尚未完成")

    qs_service = QuestionService(session)
    content = await qs_service.get_question_set_content(job.question_set_id)
    if not content:
        raise HTTPException(status_code=404, detail="试卷内容文件不存在")

    return {
        "job_id": job_id,
        "question_set_id": job.question_set_id,
        "content": content,  # JSON 字符串
    }


@router.get("/jobs/{job_id}/trace")
async def get_job_trace(
    job_id: str,
    session: SessionDep,
    teacher: CurrentTeacher,
):
    """获取已完成任务的 LLM 调用追踪日志（类 LangSmith 可视化数据源）"""
    job_service = ExamJobService(session)
    job = await job_service.get_job(job_id)
    if not job or job.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="任务不存在")

    if not job.trace_log:
        return {"job_id": job_id, "spans": []}

    try:
        spans = json.loads(job.trace_log)
    except Exception:
        spans = []

    return {"job_id": job_id, "spans": spans}


@router.get("/jobs/{job_id}/stream")
async def stream_job_progress(
    job_id: str,
    session: SessionDep,
    teacher: SSETeacher,
):
    """SSE 实时推送组卷进度"""
    job_service = ExamJobService(session)
    job = await job_service.get_job(job_id)
    if not job or job.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="任务不存在")

    # 若任务已完成/失败，直接推送最终状态
    if job.status in ("completed", "failed"):

        async def final_stream():
            event = "job_completed" if job.status == "completed" else "job_failed"
            data = {"job_id": job_id, "status": job.status}
            yield f"event: {event}\ndata: {json.dumps(data)}\n\n"
            yield "event: close\ndata: {}\n\n"

        return StreamingResponse(final_stream(), media_type="text/event-stream")

    queue = await subscribe_job_progress(job_id)

    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            while True:
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=30)
                    event = msg["event"]
                    data = json.dumps(msg["data"], ensure_ascii=False)
                    yield f"event: {event}\ndata: {data}\n\n"
                    if event in ("job_completed", "job_failed"):
                        break
                except TimeoutError:
                    # 心跳
                    yield ": heartbeat\n\n"
        finally:
            await unsubscribe_job_progress(job_id)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/jobs/{job_id}/resume", status_code=status.HTTP_202_ACCEPTED)
async def resume_job(
    job_id: str,
    session: SessionDep,
    teacher: CurrentTeacher,
    background_tasks: BackgroundTasks,
):
    """续做：从已完成题目的位置继续"""
    job_service = ExamJobService(session)
    job = await job_service.get_job(job_id)
    if not job or job.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="任务不存在")
    if job.status not in ("failed",):
        raise HTTPException(status_code=400, detail=f"当前状态 {job.status} 不可续做")

    job.status = "resuming"
    job.resume_count = (job.resume_count or 0) + 1
    job.error_message = None
    await session.commit()

    background_tasks.add_task(run_exam_generation_in_background, job_id)
    return {"job_id": job_id, "status": "resuming"}


@router.post("/jobs/{job_id}/questions/{position_index}/regenerate")
async def regenerate_question(
    job_id: str,
    position_index: int,
    data: SingleRegenerateRequest,
    session: SessionDep,
    teacher: CurrentTeacher,
):
    """单题重新生成（消耗 Token 配额）"""
    from backend.app.graph.exam_agents.quality_check_agent import QualityCheckAgent
    from backend.app.graph.exam_agents.question_agent import QuestionAgent
    from backend.app.graph.exam_agents.schemas import PaperRequirement

    job_service = ExamJobService(session)
    perm_service = ExamPermissionService(session)

    job = await job_service.get_job(job_id)
    if not job or job.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="任务不存在")
    if job.status != "completed":
        raise HTTPException(status_code=400, detail="只能对已完成的试卷重新生成单题")

    # 配额检查（单题，使用固定小估算：只有生成+质检，无 DifficultyAgent）
    ok, msg = await perm_service.check_quota(teacher.id, estimate_tokens(1, 1))
    if not ok:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=msg)

    requirement = PaperRequirement(**json.loads(job.requirement))

    # 找到对应题型配置
    question_type = None
    idx = 0
    for qtype_config in requirement.question_distribution:
        for _ in range(qtype_config.count):
            idx += 1
            if idx == position_index:
                question_type = qtype_config.question_type
                break
        if question_type:
            break

    if not question_type:
        raise HTTPException(status_code=404, detail="位置索引超出范围")

    # 单题重生成：只做生成+质检，不走 DifficultyAgent（避免 solve_count × K 次 LLM 调用导致超时）
    from backend.app.graph.exam_agents.schemas import QuestionTask, SamePositionExample
    from backend.app.rag.exam_retriever import ExamRetriever
    from backend.app.services.config_service import get_config_int as gci

    # 三层检索 few-shot
    retriever = ExamRetriever(session)
    examples_raw = await retriever.get_same_position_examples(
        subject=requirement.subject,
        question_type=question_type,
        position_index=position_index,
        target_region=requirement.target_region,
        top_k=gci("exam_agent_fewshot_count"),
    )
    examples = [
        SamePositionExample(
            year=e.year, region=e.region, content=e.content, answer=e.answer
        )
        for e in examples_raw
    ]

    task = QuestionTask(
        task_id=str(uuid.uuid4()),
        question_type=question_type,
        position_index=position_index,
        position_label=f"第{position_index}题",
        target_difficulty_level=requirement.target_difficulty,
        knowledge_point=f"{requirement.subject}",
        same_position_examples=examples,
        extra_instructions=data.extra_instructions,
    )

    q_agent = QuestionAgent()
    qc_agent = QualityCheckAgent()
    # 单题重生成最多尝试 2 次（生成 + 质检），不做难度评估，避免 N×solve_count 次 LLM 调用
    regen_max_retry = 2

    final_question = None
    for attempt in range(regen_max_retry + 1):
        gen_question = await q_agent.run(task)
        qc = await qc_agent.run(gen_question)
        if qc.passed:
            final_question = gen_question
            break
        if attempt < regen_max_retry:
            task.retry_feedback = "质检失败：" + "; ".join(qc.rejection_reasons)
            task.retry_count += 1
        else:
            # 已达重试上限，强制放行
            final_question = gen_question

    if not final_question:
        raise HTTPException(status_code=500, detail="重生成失败")

    # 序列化新题目 JSON
    new_q_dict = {
        "type": final_question.question_type,
        "content": final_question.question_text,
        "options": (
            [{"key": k, "value": v} for k, v in final_question.options.items()]
            if final_question.options
            else None
        ),
        "answer": final_question.correct_answer,
        "explanation": final_question.explanation,
        "scoring_points": final_question.scoring_points,
    }

    # 更新 completed_questions
    completed_questions = (
        json.loads(job.completed_questions) if job.completed_questions else {}
    )
    completed_questions[str(position_index)] = json.dumps(
        new_q_dict, ensure_ascii=False
    )
    job.completed_questions = json.dumps(completed_questions, ensure_ascii=False)

    # 更新关联 QuestionSet（JSON 替换对应题目）
    if job.question_set_id:
        from backend.app.services.question_service import QuestionService

        qs_service = QuestionService(session)
        existing_content = await qs_service.get_question_set_content(
            job.question_set_id
        )
        if existing_content:
            try:
                paper_data = json.loads(existing_content)
                questions = paper_data.get("questions", [])
                for i, q in enumerate(questions):
                    if q.get("number") == position_index:
                        new_entry = dict(new_q_dict)
                        new_entry["number"] = position_index
                        questions[i] = new_entry
                        break
                paper_data["questions"] = questions
                await qs_service.update_question_set_content(
                    job.question_set_id,
                    json.dumps(paper_data, ensure_ascii=False),
                )
            except Exception as _e:
                logger.error(f"更新 QuestionSet JSON 失败: {_e}")

    # Token 消耗（单题重生成：仅生成+质检，使用固定小估算）
    await perm_service.consume_tokens(teacher.id, estimate_tokens(1, 1))
    await session.commit()

    return {
        "position_index": position_index,
        "question_type": question_type,
        "question_json": new_q_dict,
        "message": "单题重新生成成功",
    }


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: str,
    session: SessionDep,
    teacher: CurrentTeacher,
):
    """删除组卷任务（同时删除关联的 QuestionSet 和草稿日志）"""
    from backend.app.models.exam_paper import ExamQuestionDraftLog
    from backend.app.services.question_service import QuestionService

    job_service = ExamJobService(session)
    job = await job_service.get_job(job_id)
    if not job or job.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="任务不存在")

    # 删除关联 QuestionSet
    if job.question_set_id:
        qs_service = QuestionService(session)
        await qs_service.delete_question_set(job.question_set_id)

    # 删除草稿日志
    from sqlalchemy import delete as sa_delete

    await session.execute(
        sa_delete(ExamQuestionDraftLog).where(ExamQuestionDraftLog.job_id == job_id)
    )

    # 删除 job
    await session.delete(job)
    await session.commit()


# ---------------------------------------------------------------------------
# 管理员 API（使用 admin_router，挂载在 /admin/exam-paper）
# ---------------------------------------------------------------------------


@admin_router.get("/permissions", tags=["管理员-组卷权限"])
async def list_exam_permissions(
    session: SessionDep,
    _admin: CurrentAdmin,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    """获取所有教师的仿高考组卷授权状态"""
    offset = (page - 1) * page_size

    count_stmt = select(func.count(Teacher.id))
    total = (await session.execute(count_stmt)).scalar() or 0

    stmt = (
        select(Teacher, TeacherExamPermission)
        .outerjoin(
            TeacherExamPermission,
            TeacherExamPermission.teacher_id == Teacher.id,
        )
        .order_by(Teacher.id)
        .offset(offset)
        .limit(page_size)
    )
    result = await session.execute(stmt)
    rows = result.all()

    items = []
    for teacher, perm in rows:
        items.append(
            {
                "teacher_id": teacher.id,
                "username": teacher.username,
                "full_name": teacher.full_name,
                "email": teacher.email,
                "is_authorized": perm.is_enabled if perm else False,
                "monthly_quota": perm.monthly_quota if perm else None,
                "token_used": perm.token_used if perm else 0,
                "granted_at": perm.granted_at.isoformat()
                if (perm and perm.granted_at)
                else None,
                "note": perm.note if perm else None,
            }
        )

    return {"total": total, "items": items}


@admin_router.post("/permissions/{teacher_id}/grant", tags=["管理员-组卷权限"])
async def grant_exam_permission(
    teacher_id: int,
    data: GrantPermissionRequest,
    session: SessionDep,
    admin: CurrentAdmin,
):
    """授予教师仿高考组卷权限"""
    teacher = await session.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="教师不存在")

    perm_service = ExamPermissionService(session)
    perm = await perm_service.grant(
        teacher_id=teacher_id,
        admin_id=admin.id,
        monthly_quota=data.monthly_quota,
        note=data.note,
    )
    await session.commit()

    return {
        "teacher_id": teacher_id,
        "is_authorized": True,
        "monthly_quota": perm.monthly_quota,
        "message": f"已授权教师 {teacher.full_name or teacher.username}",
    }


@admin_router.delete("/permissions/{teacher_id}/revoke", tags=["管理员-组卷权限"])
async def revoke_exam_permission(
    teacher_id: int,
    session: SessionDep,
    _admin: CurrentAdmin,
):
    """撤销教师的仿高考组卷权限"""
    perm_service = ExamPermissionService(session)
    ok = await perm_service.revoke(teacher_id)
    if not ok:
        raise HTTPException(status_code=404, detail="该教师尚未被授权")
    await session.commit()
    return {"teacher_id": teacher_id, "is_authorized": False, "message": "权限已撤销"}


# ---------------------------------------------------------------------------
# 真题库导入 API
# ---------------------------------------------------------------------------


class ImportFromPathRequest(BaseModel):
    data_dir: str
    skip_embedding: bool = False


class ImportFromGitHubRequest(BaseModel):
    skip_embedding: bool = False


@admin_router.post("/import/from-github", tags=["管理员-真题库导入"])
async def import_from_github(
    data: ImportFromGitHubRequest,
    _admin: CurrentAdmin,
    background_tasks: BackgroundTasks,
):
    """一键从 GitHub 下载 GAOKAO-Bench 并导入（自动尝试国内镜像）"""
    current = get_import_status()
    if current["running"]:
        raise HTTPException(status_code=409, detail="导入任务正在运行中，请等待完成")

    background_tasks.add_task(
        run_github_import_in_background,
        data.skip_embedding,
    )
    return {"message": "一键导入任务已启动，正在从 GitHub 下载数据…"}


@admin_router.post("/import/from-path", tags=["管理员-真题库导入"])
async def import_from_server_path(
    data: ImportFromPathRequest,
    _admin: CurrentAdmin,
    background_tasks: BackgroundTasks,
):
    """从服务器本地目录导入 GAOKAO-Bench 数据"""
    current = get_import_status()
    if current["running"]:
        raise HTTPException(status_code=409, detail="导入任务正在运行中，请等待完成")

    data_dir = _Path(data.data_dir)
    if not data_dir.exists() or not data_dir.is_dir():
        raise HTTPException(
            status_code=400, detail=f"目录不存在或不是文件夹: {data.data_dir}"
        )

    background_tasks.add_task(
        run_import_in_background,
        data_dir,
        data.skip_embedding,
        False,
    )
    return {"message": "导入任务已启动", "data_dir": str(data_dir)}


@admin_router.post("/import/from-upload", tags=["管理员-真题库导入"])
async def import_from_upload(
    _admin: CurrentAdmin,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    skip_embedding: bool = Form(default=False),
):
    """上传多个 GAOKAO-Bench JSON 文件并导入

    按照 GAOKAO-Bench 原始文件命名规范上传，支持来自 Objective_Questions/ 和
    Subjective_Questions/ 下的所有 JSON 文件。
    """
    current = get_import_status()
    if current["running"]:
        raise HTTPException(status_code=409, detail="导入任务正在运行中，请等待完成")

    if not files:
        raise HTTPException(status_code=400, detail="请至少上传一个 JSON 文件")

    # 将上传的文件保存到临时目录
    tmp_dir = _Path(tempfile.mkdtemp(prefix="gaokao_import_"))
    saved = 0
    for upload_file in files:
        if not upload_file.filename or not upload_file.filename.endswith(".json"):
            continue
        dest = tmp_dir / upload_file.filename
        content = await upload_file.read()
        dest.write_bytes(content)
        saved += 1

    if saved == 0:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=400, detail="没有有效的 JSON 文件（文件名须以 .json 结尾）"
        )

    background_tasks.add_task(
        run_import_in_background,
        tmp_dir,
        skip_embedding,
        True,  # cleanup_tmp=True，导入完成后自动删除临时目录
    )
    return {"message": f"已接收 {saved} 个文件，导入任务已启动"}


@admin_router.get("/import/check-embedding", tags=["管理员-真题库导入"])
async def check_embedding_api(_admin: CurrentAdmin):
    """测试 Embedding API 是否可用（导入前预检）"""
    try:
        from backend.app.rag.embeddings import get_embedding_service

        svc = get_embedding_service()
        await svc.embed_text("test")
        return {"ok": True, "message": "Embedding API 可用"}
    except Exception as e:
        return {"ok": False, "message": f"Embedding API 不可用：{e}"}


@admin_router.get("/import/status", tags=["管理员-真题库导入"])
async def get_exam_import_status(_admin: CurrentAdmin):
    """查询当前导入任务进度"""
    return get_import_status()


@admin_router.get("/import/stats", tags=["管理员-真题库导入"])
async def get_exam_question_stats(session: SessionDep, _admin: CurrentAdmin):
    """查询数据库中已有的真题统计（按科目/卷型）"""

    # 总题数
    total_stmt = select(func.count(ExamQuestion.id))
    total = (await session.execute(total_stmt)).scalar() or 0

    # 按科目统计
    subject_stmt = (
        select(ExamQuestion.subject, func.count(ExamQuestion.id).label("count"))
        .group_by(ExamQuestion.subject)
        .order_by(func.count(ExamQuestion.id).desc())
    )
    subject_result = await session.execute(subject_stmt)
    by_subject = [
        {"subject": r.subject, "count": r.count} for r in subject_result.all()
    ]

    # 按卷型统计
    region_stmt = (
        select(ExamQuestion.region, func.count(ExamQuestion.id).label("count"))
        .group_by(ExamQuestion.region)
        .order_by(func.count(ExamQuestion.id).desc())
    )
    region_result = await session.execute(region_stmt)
    by_region = [{"region": r.region, "count": r.count} for r in region_result.all()]

    # 年份范围
    year_stmt = select(
        func.min(ExamQuestion.year).label("min_year"),
        func.max(ExamQuestion.year).label("max_year"),
    )
    year_result = (await session.execute(year_stmt)).first()

    return {
        "total": total,
        "by_subject": by_subject,
        "by_region": by_region,
        "year_range": {
            "min": year_result.min_year if year_result else None,
            "max": year_result.max_year if year_result else None,
        },
    }
