"""题目广场 API"""

import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status

from backend.app.api.v1.deps import (
    CurrentTeacher,
    CurrentUser,
    OptionalUser,
    SessionDep,
)
from backend.app.models.teacher import Teacher
from backend.app.schemas.plaza import (
    LeaderboardEntry,
    LeaderboardResponse,
    PlazaAnswerSaveDraft,
    PlazaAnswerSubmit,
    PlazaAttemptItem,
    PlazaAttemptListResponse,
    PlazaQuestionSetDetail,
    PlazaQuestionSetItem,
    PlazaQuestionSetListResponse,
    PlazaSharedStatItem,
    PlazaSharedStatsResponse,
)
from backend.app.services.grading_task import run_grading_in_background
from backend.app.services.plaza_service import PlazaService

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/question-sets", response_model=PlazaQuestionSetListResponse)
async def list_plaza_question_sets(
    session: SessionDep,
    user: OptionalUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    keyword: str | None = None,
    sort: str = Query("newest", pattern="^(newest|popular|oldest)$"),
) -> PlazaQuestionSetListResponse:
    """广场试题集列表（支持游客访问）"""
    service = PlazaService(session)
    items, total = await service.get_plaza_question_sets(
        skip=skip,
        limit=limit,
        keyword=keyword,
        sort=sort,
        current_user=user,
    )
    return PlazaQuestionSetListResponse(
        items=[PlazaQuestionSetItem(**item) for item in items],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/question-sets/{question_set_id}", response_model=PlazaQuestionSetDetail)
async def get_plaza_question_set_detail(
    question_set_id: int,
    session: SessionDep,
    user: OptionalUser,
) -> PlazaQuestionSetDetail:
    """广场试题集详情（支持游客访问）"""
    service = PlazaService(session)
    detail = await service.get_plaza_question_set_detail(
        question_set_id,
        current_user=user,
    )
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="试题集不存在或未在广场上"
        )

    detail["leaderboard"] = [LeaderboardEntry(**e) for e in detail["leaderboard"]]
    return PlazaQuestionSetDetail(**detail)


@router.get(
    "/question-sets/{question_set_id}/leaderboard",
    response_model=LeaderboardResponse,
)
async def get_leaderboard(
    question_set_id: int,
    session: SessionDep,
    user: OptionalUser,
    limit: int = Query(10, ge=1, le=50),
) -> LeaderboardResponse:
    """获取试题集排行榜"""
    from backend.app.services.question_service import QuestionService

    qs_service = QuestionService(session)
    qs = await qs_service.get_question_set_by_id(question_set_id)
    if not qs or qs.shared_to_plaza_at is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="试题集不存在或未在广场上"
        )

    service = PlazaService(session)
    entries = await service.get_leaderboard(question_set_id, limit=limit)

    my_rank = None
    my_score = None
    if user:
        my_rank = await service.get_my_rank(question_set_id, user)
        status_info = await service.get_my_status(question_set_id, user)
        my_score = status_info.get("my_score")

    return LeaderboardResponse(
        question_set_id=question_set_id,
        leaderboard=[LeaderboardEntry(**e) for e in entries],
        my_rank=my_rank,
        my_score=my_score,
    )


@router.get("/my-attempts", response_model=PlazaAttemptListResponse)
async def get_my_attempts(
    session: SessionDep,
    user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status_filter: str = Query("all", alias="status"),
) -> PlazaAttemptListResponse:
    """获取我的广场练习记录"""
    service = PlazaService(session)
    items, total = await service.get_my_attempts(
        current_user=user,
        skip=skip,
        limit=limit,
        status_filter=status_filter,
    )
    return PlazaAttemptListResponse(
        items=[PlazaAttemptItem(**item) for item in items],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/my-shared-stats", response_model=PlazaSharedStatsResponse)
async def get_my_shared_stats(
    session: SessionDep,
    teacher: CurrentTeacher,
) -> PlazaSharedStatsResponse:
    """教师获取自己分享到广场的试题集统计"""
    service = PlazaService(session)
    data = await service.get_my_shared_stats(teacher.id)
    return PlazaSharedStatsResponse(
        total_shared=data["total_shared"],
        total_attempts=data["total_attempts"],
        items=[PlazaSharedStatItem(**item) for item in data["items"]],
    )


def _strip_answers(json_content: str) -> str:
    """从 JSON 题目内容中移除答案、解析、评分要点，防止泄露。"""
    import json as _json

    try:
        data = _json.loads(json_content)
        questions = data.get("questions", [])
        for q in questions:
            q.pop("answer", None)
            q.pop("explanation", None)
            q.pop("scoring_points", None)
        return _json.dumps(data, ensure_ascii=False)
    except Exception:
        return json_content


@router.get("/question-sets/{question_set_id}/content")
async def get_plaza_question_set_content(
    question_set_id: int,
    session: SessionDep,
    _user: OptionalUser,
) -> dict:
    """获取广场试题集的题目内容（游客可访问，仅限已分享到广场的题集）"""
    from backend.app.services.question_service import QuestionService

    qs_service = QuestionService(session)
    question_set = await qs_service.get_question_set_by_id(question_set_id)
    if not question_set or question_set.shared_to_plaza_at is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="试题集不存在或未在广场上"
        )

    content = await qs_service.get_question_set_content(question_set_id)
    if content is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="试题集内容不存在"
        )

    return {
        "id": question_set.id,
        "title": question_set.title,
        "json_content": _strip_answers(content),
    }


@router.get("/my-answer/{question_set_id}")
async def get_my_plaza_answer(
    question_set_id: int,
    session: SessionDep,
    user: CurrentUser,
) -> dict | None:
    """获取当前用户在某广场试题集上的答案"""
    service = PlazaService(session)
    answer = await service.get_my_answer(question_set_id, user)
    if not answer:
        return None
    return {
        "id": answer.id,
        "question_set_id": answer.question_set_id,
        "student_id": answer.student_id,
        "course_id": answer.course_id,
        "student_answers": answer.student_answers,
        "grading_results": answer.grading_results,
        "total_score": answer.total_score,
        "status": answer.status,
        "error_message": answer.error_message,
        "saved_at": str(answer.saved_at),
        "submitted_at": str(answer.submitted_at) if answer.submitted_at else None,
    }


@router.post("/answer/save-draft")
async def plaza_save_draft(
    data: PlazaAnswerSaveDraft,
    session: SessionDep,
    user: CurrentUser,
) -> dict:
    """广场做题 - 保存草稿（教师或学生）"""
    service = PlazaService(session)

    if isinstance(user, Teacher):
        try:
            answer = await service.teacher_save_draft(
                teacher_id=user.id,
                question_set_id=data.question_set_id,
                student_answers=data.student_answers,
            )
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    else:
        # 学生做广场题 - 复用现有 answer_service
        from backend.app.schemas.answer import AnswerSaveDraft
        from backend.app.services.answer_service import AnswerService
        from backend.app.services.question_service import QuestionService

        qs_service = QuestionService(session)
        question_set = await qs_service.get_question_set_by_id(data.question_set_id)
        if not question_set or question_set.shared_to_plaza_at is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="试题集不存在或未在广场上"
            )

        answer_service = AnswerService(session)
        try:
            answer = await answer_service.save_draft(
                student_id=user.id,
                course_id=question_set.course_id,
                data=AnswerSaveDraft(
                    question_set_id=data.question_set_id,
                    student_answers=data.student_answers,
                ),
            )
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return {
        "id": answer.id,
        "status": answer.status,
        "saved_at": str(answer.saved_at),
    }


@router.post("/answer/submit")
async def plaza_submit_answer(
    data: PlazaAnswerSubmit,
    session: SessionDep,
    user: CurrentUser,
    background_tasks: BackgroundTasks,
) -> dict:
    """广场做题 - 提交答案（教师或学生）"""
    service = PlazaService(session)

    if isinstance(user, Teacher):
        try:
            answer = await service.teacher_submit_answer(
                teacher_id=user.id,
                question_set_id=data.question_set_id,
                student_answers=data.student_answers,
            )
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    else:
        from backend.app.services.answer_service import AnswerService
        from backend.app.services.question_service import QuestionService

        qs_service = QuestionService(session)
        question_set = await qs_service.get_question_set_by_id(data.question_set_id)
        if not question_set or question_set.shared_to_plaza_at is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="试题集不存在或未在广场上"
            )

        answer_service = AnswerService(session)
        try:
            answer = await answer_service.submit_answer(
                student_id=user.id,
                course_id=question_set.course_id,
                question_set_id=data.question_set_id,
                student_answers=data.student_answers,
            )
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    background_tasks.add_task(run_grading_in_background, answer.id)

    return {
        "id": answer.id,
        "status": answer.status,
        "submitted_at": str(answer.submitted_at),
        "message": "答案已提交，正在批改中...",
    }
