"""学生试题相关 API"""

from fastapi import APIRouter, HTTPException, status

from backend.app.api.v1.deps import CurrentStudent, SessionDep
from backend.app.schemas.question import (
    QuestionSetContentResponse,
    StudentQuestionSetResponse,
)
from backend.app.services.course_service import CourseService
from backend.app.services.question_service import QuestionService

router = APIRouter()


@router.get("/list", response_model=list[StudentQuestionSetResponse])
async def list_student_question_sets(
    session: SessionDep,
    student: CurrentStudent,
    course_id: int | None = None,
) -> list[StudentQuestionSetResponse]:
    """获取学生可访问的试题集列表"""
    # 如果指定了课程，验证学生是否在课程中
    if course_id:
        course_service = CourseService(session)
        if not await course_service.verify_student_in_course(student.id, course_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="未加入该课程",
            )

    question_service = QuestionService(session)
    question_sets = await question_service.get_student_question_sets(
        student.id, course_id
    )
    return [StudentQuestionSetResponse(**qs) for qs in question_sets]


@router.get("/{question_set_id}/content", response_model=QuestionSetContentResponse)
async def get_question_content(
    question_set_id: int,
    session: SessionDep,
    student: CurrentStudent,
) -> QuestionSetContentResponse:
    """获取试题集内容（学生端）"""
    question_service = QuestionService(session)

    # 验证访问权限
    has_access = await question_service.verify_student_has_access(
        question_set_id, student.id
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问该试题集",
        )

    question_set = await question_service.get_question_set_by_id(question_set_id)
    if not question_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="试题集不存在",
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
        json_content=content,
    )
