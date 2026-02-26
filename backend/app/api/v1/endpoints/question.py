"""试题集相关 API"""

import logging

from fastapi import APIRouter, HTTPException, status

from backend.app.api.v1.deps import CurrentTeacher, SessionDep
from backend.app.graph.question_generator import QuestionGenerator
from backend.app.schemas.plaza import SharePlazaResponse, UnsharePlazaResponse
from backend.app.schemas.question import (
    AssignRequest,
    QuestionGenerateRequest,
    QuestionModifyRequest,
    QuestionSetContentResponse,
    QuestionSetListResponse,
    QuestionSetResponse,
)
from backend.app.services.course_service import CourseService
from backend.app.services.plaza_service import PlazaService
from backend.app.services.question_service import QuestionService

router = APIRouter()

logger = logging.getLogger(__name__)


@router.post("/generate", response_model=QuestionSetResponse)
async def generate_question_set(
    data: QuestionGenerateRequest,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> QuestionSetResponse:
    """生成试题集（自然语言输入）"""
    # 验证课程权限
    course_service = CourseService(session)
    course = await course_service.verify_teacher_owns_course(data.course_id, teacher.id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="课程不存在或无权访问",
        )

    try:
        generator = QuestionGenerator(session)
        question_set = await generator.generate(
            request=data.natural_language_request,
            course_id=data.course_id,
            teacher_id=teacher.id,
            subject=data.subject,
            chapter_id=data.chapter_id,
            difficulty=data.difficulty,
        )
        return QuestionSetResponse.model_validate(question_set)
    except Exception:
        logger.error("生成试题集失败", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="生成试题集失败，请稍后重试",
        )


@router.post("/{question_set_id}/modify", response_model=QuestionSetResponse)
async def modify_question_set(
    question_set_id: int,
    data: QuestionModifyRequest,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> QuestionSetResponse:
    """修改试题集（自然语言输入）"""
    question_service = QuestionService(session)

    # 验证权限
    question_set = await question_service.verify_teacher_owns_question_set(
        question_set_id, teacher.id
    )
    if not question_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="试题集不存在或无权访问",
        )

    try:
        generator = QuestionGenerator(session)
        await generator.modify(
            question_set_id=question_set_id,
            request=data.natural_language_request,
        )

        await session.refresh(question_set)
        return QuestionSetResponse.model_validate(question_set)
    except Exception:
        logger.error("修改试题集失败", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="修改试题集失败，请稍后重试",
        )


@router.get("/{question_set_id}/content", response_model=QuestionSetContentResponse)
async def get_question_set_content(
    question_set_id: int,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> QuestionSetContentResponse:
    """获取试题集 Markdown 内容"""
    question_service = QuestionService(session)

    # 验证权限
    question_set = await question_service.verify_teacher_owns_question_set(
        question_set_id, teacher.id
    )
    if not question_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="试题集不存在或无权访问",
        )

    content = await question_service.get_question_set_content(question_set_id)
    if content is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="试题集内容不存在",
        )

    return QuestionSetContentResponse(
        id=question_set.id,
        title=question_set.title,
        markdown_content=content,
    )


@router.post("/{question_set_id}/assign")
async def assign_question_set(
    question_set_id: int,
    data: AssignRequest,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> dict:
    """分配试题集给学生"""
    question_service = QuestionService(session)

    # 验证权限
    question_set = await question_service.verify_teacher_owns_question_set(
        question_set_id, teacher.id
    )
    if not question_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="试题集不存在或无权访问",
        )

    assignments = await question_service.assign_question_set(
        question_set_id=question_set_id,
        course_id=question_set.course_id,
        teacher_id=teacher.id,
        data=data,
    )

    return {"message": f"已分配给 {len(assignments)} 名学生"}


@router.get("/list-all")
async def list_all_question_sets(
    session: SessionDep,
    teacher: CurrentTeacher,
) -> dict:
    """获取当前教师的全部试题集（跨课程，含课程名称）"""
    question_service = QuestionService(session)
    items = await question_service.get_all_teacher_question_sets(teacher.id)
    return {"question_sets": items, "total": len(items)}


@router.get("/list", response_model=QuestionSetListResponse)
async def list_question_sets(
    course_id: int,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> QuestionSetListResponse:
    """获取课程下的试题集列表"""
    # 验证课程权限
    course_service = CourseService(session)
    course = await course_service.verify_teacher_owns_course(course_id, teacher.id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="课程不存在或无权访问",
        )

    question_service = QuestionService(session)
    question_sets = await question_service.get_course_question_sets(course_id)
    return QuestionSetListResponse(
        question_sets=[QuestionSetResponse.model_validate(qs) for qs in question_sets],
        total=len(question_sets),
    )


@router.post("/{question_set_id}/publish")
async def publish_question_set(
    question_set_id: int,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> dict:
    """发布试题集"""
    question_service = QuestionService(session)

    # 验证权限
    question_set = await question_service.verify_teacher_owns_question_set(
        question_set_id, teacher.id
    )
    if not question_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="试题集不存在或无权访问",
        )

    success = await question_service.publish_question_set(question_set_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="发布失败",
        )

    return {"message": "发布成功"}


@router.post("/{question_set_id}/share-plaza", response_model=SharePlazaResponse)
async def share_to_plaza(
    question_set_id: int,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> SharePlazaResponse:
    """分享试题集到广场"""
    try:
        plaza_service = PlazaService(session)
        qs = await plaza_service.share_to_plaza(question_set_id, teacher.id)
        return SharePlazaResponse(
            message="已分享到广场",
            shared_to_plaza_at=qs.shared_to_plaza_at,
            share_url=f"/plaza/question-sets/{qs.id}",
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/{question_set_id}/unshare-plaza", response_model=UnsharePlazaResponse)
async def unshare_from_plaza(
    question_set_id: int,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> UnsharePlazaResponse:
    """从广场撤回试题集"""
    try:
        plaza_service = PlazaService(session)
        await plaza_service.unshare_from_plaza(question_set_id, teacher.id)
        return UnsharePlazaResponse(message="已从广场撤回")
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete("/{question_set_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question_set(
    question_set_id: int,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> None:
    """删除试题集"""
    question_service = QuestionService(session)

    # 验证权限
    question_set = await question_service.verify_teacher_owns_question_set(
        question_set_id, teacher.id
    )
    if not question_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="试题集不存在或无权访问",
        )

    success = await question_service.delete_question_set(question_set_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="删除失败",
        )
