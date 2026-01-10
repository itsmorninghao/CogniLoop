"""学生课程相关 API"""

from fastapi import APIRouter, HTTPException, status

from backend.app.api.v1.deps import CurrentStudent, SessionDep
from backend.app.schemas.course import (
    CourseListResponse,
    CourseResponse,
    JoinCourseRequest,
)
from backend.app.services.course_service import CourseService

router = APIRouter()


@router.post("/join", response_model=CourseResponse)
async def join_course(
    data: JoinCourseRequest,
    session: SessionDep,
    student: CurrentStudent,
) -> CourseResponse:
    """学生通过邀请码加入课程"""
    course_service = CourseService(session)
    try:
        student_course = await course_service.join_course(student.id, data.invite_code)
        course = await course_service.get_course_by_id(student_course.course_id)
        return CourseResponse.model_validate(course)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/my-courses", response_model=CourseListResponse)
async def get_my_courses(
    session: SessionDep,
    student: CurrentStudent,
) -> CourseListResponse:
    """获取学生已加入的课程列表"""
    course_service = CourseService(session)
    courses = await course_service.get_student_courses(student.id)
    return CourseListResponse(
        courses=[CourseResponse.model_validate(c) for c in courses],
        total=len(courses),
    )


@router.delete("/{course_id}/leave")
async def leave_course(
    course_id: int,
    session: SessionDep,
    student: CurrentStudent,
) -> dict:
    """学生主动退出课程"""
    course_service = CourseService(session)

    # 验证学生是否在课程中
    if not await course_service.verify_student_in_course(student.id, course_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未加入该课程",
        )

    success = await course_service.leave_course(student.id, course_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="退出失败",
        )

    return {"message": "已退出课程"}
