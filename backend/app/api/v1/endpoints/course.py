"""课程管理相关 API"""

from fastapi import APIRouter, HTTPException, status

from backend.app.api.v1.deps import CurrentTeacher, SessionDep
from backend.app.schemas.course import (
    CourseCreate,
    CourseDetail,
    CourseListResponse,
    CourseResponse,
)
from backend.app.services.course_service import CourseService

router = APIRouter()


@router.post("/create", response_model=CourseResponse)
async def create_course(
    data: CourseCreate,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> CourseResponse:
    """创建课程"""
    course_service = CourseService(session)
    try:
        course = await course_service.create_course(data, teacher.id)
        return CourseResponse.model_validate(course)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/list", response_model=CourseListResponse)
async def list_courses(
    session: SessionDep,
    teacher: CurrentTeacher,
) -> CourseListResponse:
    """获取教师的课程列表"""
    course_service = CourseService(session)
    courses = await course_service.get_teacher_courses(teacher.id)
    return CourseListResponse(
        courses=[CourseResponse.model_validate(c) for c in courses],
        total=len(courses),
    )


@router.get("/{course_id}", response_model=CourseDetail)
async def get_course(
    course_id: int,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> CourseDetail:
    """获取课程详情"""
    course_service = CourseService(session)

    # 验证权限
    course = await course_service.verify_teacher_owns_course(course_id, teacher.id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="课程不存在或无权访问",
        )

    detail = await course_service.get_course_detail(course_id)
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="课程不存在",
        )
    return detail


@router.delete("/{course_id}")
async def delete_course(
    course_id: int,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> dict:
    """删除课程（同时退出所有学生）"""
    course_service = CourseService(session)

    # 验证权限
    course = await course_service.verify_teacher_owns_course(course_id, teacher.id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="课程不存在或无权访问",
        )

    success = await course_service.delete_course(course_id, teacher.id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="删除失败",
        )

    return {"message": "课程已删除，所有学生已退出该课程"}
