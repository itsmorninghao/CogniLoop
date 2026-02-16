"""答案相关 API"""

import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from backend.app.api.v1.deps import CurrentStudent, CurrentTeacher, SessionDep
from backend.app.core.config import settings
from backend.app.graph.grader import AnswerGrader
from backend.app.schemas.answer import (
    AnswerCreate,
    AnswerDetail,
    AnswerResponse,
    AnswerSaveDraft,
    TeacherAnswerDetail,
    TeacherScoreUpdate,
)
from backend.app.services.answer_service import AnswerService
from backend.app.services.question_service import QuestionService

router = APIRouter()
logger = logging.getLogger(__name__)


def _run_grading_sync(answer_id: int) -> None:
    """在新事件循环中运行批改任务（同步包装器）"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_run_grading_async(answer_id))
    finally:
        loop.close()


async def _run_grading_async(answer_id: int) -> None:
    """异步批改任务 - 使用独立的数据库连接"""
    # 创建独立的引擎和会话（不与主事件循环共享）
    engine = create_async_engine(
        settings.database_url,
        echo=False,
        pool_pre_ping=True,
    )
    async_session = sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session() as session:
        try:
            grader = AnswerGrader(session)
            success = await grader.grade(answer_id)

            if success:
                # 批改成功后标记完成
                question_service = QuestionService(session)
                answer_service = AnswerService(session)
                answer = await answer_service.get_answer_by_id(answer_id)
                if answer and answer.student_id:
                    await question_service.mark_completed(
                        answer.question_set_id, answer.student_id
                    )
                logger.info(f"批改任务成功: answer_id={answer_id}")
            else:
                # grader 内部已经调用了 mark_grading_failed，这里确保提交
                logger.warning(
                    f"批改任务失败（grader 返回 False）: answer_id={answer_id}"
                )

            # 无论成功或失败都提交（失败时 grader 已设置 failed 状态）
            await session.commit()
        except Exception as e:
            logger.error(
                f"批改任务异常: answer_id={answer_id}, error={e}", exc_info=True
            )
            await session.rollback()
            # 尝试标记为失败
            try:
                answer_service = AnswerService(session)
                await answer_service.mark_grading_failed(answer_id, str(e))
                await session.commit()
            except Exception:
                pass
        finally:
            await engine.dispose()


@router.post("/save-draft", response_model=AnswerResponse)
async def save_draft(
    data: AnswerSaveDraft,
    session: SessionDep,
    student: CurrentStudent,
) -> AnswerResponse:
    """保存答题草稿"""
    # 验证访问权限
    question_service = QuestionService(session)
    has_access = await question_service.verify_student_has_access(
        data.question_set_id, student.id
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问该试题集",
        )

    # 获取课程 ID
    question_set = await question_service.get_question_set_by_id(data.question_set_id)
    if not question_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="试题集不存在",
        )

    answer_service = AnswerService(session)
    try:
        answer = await answer_service.save_draft(
            student_id=student.id,
            course_id=question_set.course_id,
            data=data,
        )
        return AnswerResponse.model_validate(answer)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/submit", response_model=AnswerResponse)
async def submit_answer(
    data: AnswerCreate,
    background_tasks: BackgroundTasks,
    session: SessionDep,
    student: CurrentStudent,
) -> AnswerResponse:
    """提交答案（不允许重新提交），后台异步批改"""
    # 验证访问权限
    question_service = QuestionService(session)
    has_access = await question_service.verify_student_has_access(
        data.question_set_id, student.id
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问该试题集",
        )

    # 获取课程 ID
    question_set = await question_service.get_question_set_by_id(data.question_set_id)
    if not question_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="试题集不存在",
        )

    answer_service = AnswerService(session)
    try:
        # 检查是否已提交（防止重复提交）
        existing = await answer_service.get_student_answer(
            data.question_set_id, student.id
        )
        if existing and existing.status != "draft":
            raise ValueError("该试题集已提交，不允许重新提交")

        # 提交答案（状态变为 submitted）
        answer = await answer_service.submit_answer(
            student_id=student.id,
            course_id=question_set.course_id,
            question_set_id=data.question_set_id,
            student_answers=data.student_answers,
        )

        # 先提交事务，确保 answer 已持久化到数据库
        await session.commit()

        # 异步批改（后台任务，在独立线程中运行）
        background_tasks.add_task(_run_grading_sync, answer.id)

        return AnswerResponse.model_validate(answer)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/{answer_id}", response_model=AnswerDetail)
async def get_answer(
    answer_id: int,
    session: SessionDep,
    student: CurrentStudent,
) -> AnswerDetail:
    """获取答案详情（草稿或已提交）"""
    answer_service = AnswerService(session)
    answer = await answer_service.get_answer_by_id(answer_id)

    if not answer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="答案不存在",
        )

    # 验证是否是本人的答案
    if answer.student_id != student.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问该答案",
        )

    return AnswerDetail(
        id=answer.id,
        question_set_id=answer.question_set_id,
        student_id=answer.student_id,
        course_id=answer.course_id,
        status=answer.status,
        total_score=answer.total_score,
        saved_at=answer.saved_at,
        submitted_at=answer.submitted_at,
        student_answers=answer.student_answers,
        grading_results=answer.grading_results,
        error_message=answer.error_message,
    )


@router.get("/question-set/{question_set_id}", response_model=AnswerDetail | None)
async def get_answer_by_question_set(
    question_set_id: int,
    session: SessionDep,
    student: CurrentStudent,
) -> AnswerDetail | None:
    """获取学生对某试题集的答案"""
    answer_service = AnswerService(session)
    answer = await answer_service.get_student_answer(question_set_id, student.id)

    if not answer:
        return None

    return AnswerDetail(
        id=answer.id,
        question_set_id=answer.question_set_id,
        student_id=answer.student_id,
        course_id=answer.course_id,
        status=answer.status,
        total_score=answer.total_score,
        saved_at=answer.saved_at,
        submitted_at=answer.submitted_at,
        student_answers=answer.student_answers,
        grading_results=answer.grading_results,
        error_message=answer.error_message,
    )


# ============== 教师端 API ==============


@router.get(
    "/teacher/question-set/{question_set_id}", response_model=list[TeacherAnswerDetail]
)
async def get_question_set_answers(
    question_set_id: int,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> list[TeacherAnswerDetail]:
    """教师获取试题集的所有学生答案"""
    # 验证权限
    question_service = QuestionService(session)
    question_set = await question_service.verify_teacher_owns_question_set(
        question_set_id, teacher.id
    )
    if not question_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="试题集不存在或无权访问",
        )

    answer_service = AnswerService(session)
    answers = await answer_service.get_question_set_answers_with_students(
        question_set_id
    )
    return answers


@router.get("/teacher/{answer_id}", response_model=TeacherAnswerDetail)
async def teacher_get_answer(
    answer_id: int,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> TeacherAnswerDetail:
    """教师获取单份答案详情"""
    answer_service = AnswerService(session)
    answer = await answer_service.get_answer_with_student(answer_id)

    if not answer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="答案不存在",
        )

    # 验证权限（教师拥有该试题集）
    question_service = QuestionService(session)
    question_set = await question_service.verify_teacher_owns_question_set(
        answer["question_set_id"], teacher.id
    )
    if not question_set:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问该答案",
        )

    return TeacherAnswerDetail(**answer)


@router.patch("/teacher/{answer_id}/score")
async def teacher_update_score(
    answer_id: int,
    data: TeacherScoreUpdate,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> dict:
    """教师手动修改分数"""
    answer_service = AnswerService(session)
    answer = await answer_service.get_answer_by_id(answer_id)

    if not answer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="答案不存在",
        )

    # 验证权限
    question_service = QuestionService(session)
    question_set = await question_service.verify_teacher_owns_question_set(
        answer.question_set_id, teacher.id
    )
    if not question_set:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权修改该答案",
        )

    # 更新分数
    await answer_service.teacher_update_score(
        answer_id=answer_id,
        total_score=data.total_score,
        question_scores=data.question_scores,
    )

    return {"message": "分数更新成功"}
