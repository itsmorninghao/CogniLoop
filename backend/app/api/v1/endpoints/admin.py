"""管理员相关 API"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from backend.app.api.v1.deps import (
    CurrentAdmin,
    CurrentSuperAdmin,
    SessionDep,
)
from backend.app.services.admin_service import AdminService
from backend.app.services.captcha_service import CaptchaService

router = APIRouter()


# ==================== 请求/响应模型 ====================


class AdminLoginRequest(BaseModel):
    """管理员登录请求"""

    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)
    captcha_id: str = Field(..., description="验证码 ID")
    captcha_value: str = Field(..., description="用户输入的验证码")


class AdminCreateRequest(BaseModel):
    """创建管理员请求"""

    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=100)
    full_name: str = Field(..., min_length=1, max_length=100)
    is_super_admin: bool = False


class UserResponse(BaseModel):
    """用户响应"""

    id: int
    username: str
    email: str
    full_name: str
    is_active: bool
    created_at: str

    model_config = {"from_attributes": True}


class AdminResponse(UserResponse):
    """管理员响应"""

    is_super_admin: bool


class CourseResponse(BaseModel):
    """课程响应"""

    id: int
    name: str
    code: str
    invite_code: str
    teacher_id: int
    teacher_name: str
    is_active: bool
    student_count: int
    created_at: str


class SystemStatsResponse(BaseModel):
    """系统统计响应"""

    teacher_count: int
    student_count: int
    course_count: int
    document_count: int
    question_set_count: int
    answer_count: int


class PaginatedResponse(BaseModel):
    """分页响应"""

    items: list
    total: int
    skip: int
    limit: int


# ==================== 认证 ====================


@router.post("/login")
async def admin_login(data: AdminLoginRequest, session: SessionDep) -> dict:
    """管理员登录"""
    # 校验验证码
    captcha_service = CaptchaService(session)
    try:
        await captcha_service.verify(data.captcha_id, data.captcha_value)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    admin_service = AdminService(session)
    try:
        return await admin_service.login(data.username, data.password)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        )


# ==================== 统计数据 ====================


@router.get("/stats", response_model=SystemStatsResponse)
async def get_system_stats(
    session: SessionDep,
    admin: CurrentAdmin,
) -> SystemStatsResponse:
    """获取系统统计数据"""
    admin_service = AdminService(session)
    stats = await admin_service.get_system_stats()
    return SystemStatsResponse(**stats)


# ==================== 教师管理 ====================


@router.get("/teachers")
async def list_teachers(
    session: SessionDep,
    admin: CurrentAdmin,
    skip: int = 0,
    limit: int = 50,
) -> dict:
    """获取教师列表"""
    admin_service = AdminService(session)
    teachers, total = await admin_service.list_teachers(skip, limit)
    return {
        "items": [
            {
                "id": t.id,
                "username": t.username,
                "email": t.email,
                "full_name": t.full_name,
                "is_active": t.is_active,
                "created_at": t.created_at.isoformat(),
            }
            for t in teachers
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.patch("/teachers/{teacher_id}/toggle-status")
async def toggle_teacher_status(
    teacher_id: int,
    session: SessionDep,
    admin: CurrentAdmin,
) -> dict:
    """切换教师状态"""
    admin_service = AdminService(session)
    teacher = await admin_service.toggle_teacher_status(teacher_id)
    if not teacher:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="教师不存在",
        )
    return {"message": "状态已更新", "is_active": teacher.is_active}


@router.delete("/teachers/{teacher_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_teacher(
    teacher_id: int,
    session: SessionDep,
    admin: CurrentSuperAdmin,
) -> None:
    """删除教师（仅超级管理员）"""
    admin_service = AdminService(session)
    success = await admin_service.delete_teacher(teacher_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="教师不存在",
        )


# ==================== 学生管理 ====================


@router.get("/students")
async def list_students(
    session: SessionDep,
    admin: CurrentAdmin,
    skip: int = 0,
    limit: int = 50,
) -> dict:
    """获取学生列表"""
    admin_service = AdminService(session)
    students, total = await admin_service.list_students(skip, limit)
    return {
        "items": [
            {
                "id": s.id,
                "username": s.username,
                "email": s.email,
                "full_name": s.full_name,
                "is_active": s.is_active,
                "created_at": s.created_at.isoformat(),
            }
            for s in students
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.patch("/students/{student_id}/toggle-status")
async def toggle_student_status(
    student_id: int,
    session: SessionDep,
    admin: CurrentAdmin,
) -> dict:
    """切换学生状态"""
    admin_service = AdminService(session)
    student = await admin_service.toggle_student_status(student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="学生不存在",
        )
    return {"message": "状态已更新", "is_active": student.is_active}


@router.delete("/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student(
    student_id: int,
    session: SessionDep,
    admin: CurrentSuperAdmin,
) -> None:
    """删除学生（仅超级管理员）"""
    admin_service = AdminService(session)
    success = await admin_service.delete_student(student_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="学生不存在",
        )


# ==================== 课程管理 ====================


@router.get("/courses")
async def list_courses(
    session: SessionDep,
    admin: CurrentAdmin,
    skip: int = 0,
    limit: int = 50,
    include_inactive: bool = True,
) -> dict:
    """获取课程列表"""
    admin_service = AdminService(session)
    courses, total = await admin_service.list_courses(skip, limit, include_inactive)
    return {
        "items": courses,
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.patch("/courses/{course_id}/toggle-status")
async def toggle_course_status(
    course_id: int,
    session: SessionDep,
    admin: CurrentAdmin,
) -> dict:
    """切换课程状态"""
    admin_service = AdminService(session)
    course = await admin_service.toggle_course_status(course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="课程不存在",
        )
    return {"message": "状态已更新", "is_active": course.is_active}


@router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(
    course_id: int,
    session: SessionDep,
    admin: CurrentSuperAdmin,
) -> None:
    """删除课程（仅超级管理员）"""
    admin_service = AdminService(session)
    success = await admin_service.delete_course(course_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="课程不存在",
        )


# ==================== 管理员管理（仅超级管理员） ====================


@router.get("/admins", response_model=list[AdminResponse])
async def list_admins(
    session: SessionDep,
    admin: CurrentSuperAdmin,
) -> list[AdminResponse]:
    """获取管理员列表（仅超级管理员）"""
    admin_service = AdminService(session)
    admins = await admin_service.list_admins()
    return [
        AdminResponse(
            id=a.id,
            username=a.username,
            email=a.email,
            full_name=a.full_name,
            is_active=a.is_active,
            is_super_admin=a.is_super_admin,
            created_at=a.created_at.isoformat(),
        )
        for a in admins
    ]


@router.post(
    "/admins", response_model=AdminResponse, status_code=status.HTTP_201_CREATED
)
async def create_admin(
    data: AdminCreateRequest,
    session: SessionDep,
    admin: CurrentSuperAdmin,
) -> AdminResponse:
    """创建管理员（仅超级管理员）"""
    admin_service = AdminService(session)
    try:
        new_admin = await admin_service.create_admin(
            username=data.username,
            email=data.email,
            password=data.password,
            full_name=data.full_name,
            is_super_admin=data.is_super_admin,
        )
        return AdminResponse(
            id=new_admin.id,
            username=new_admin.username,
            email=new_admin.email,
            full_name=new_admin.full_name,
            is_active=new_admin.is_active,
            is_super_admin=new_admin.is_super_admin,
            created_at=new_admin.created_at.isoformat(),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.patch("/admins/{admin_id}/toggle-status")
async def toggle_admin_status(
    admin_id: int,
    session: SessionDep,
    admin: CurrentSuperAdmin,
) -> dict:
    """切换管理员状态（仅超级管理员）"""
    admin_service = AdminService(session)
    try:
        target_admin = await admin_service.toggle_admin_status(admin_id, admin.id)
        if not target_admin:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="管理员不存在",
            )
        return {"message": "状态已更新", "is_active": target_admin.is_active}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete("/admins/{admin_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin(
    admin_id: int,
    session: SessionDep,
    admin: CurrentSuperAdmin,
) -> None:
    """删除管理员（仅超级管理员）"""
    admin_service = AdminService(session)
    try:
        success = await admin_service.delete_admin(admin_id, admin.id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="管理员不存在",
            )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
