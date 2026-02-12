"""API 依赖注入"""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_session
from backend.app.core.security import decode_access_token
from backend.app.models.admin import Admin
from backend.app.models.student import Student
from backend.app.models.teacher import Teacher
from backend.app.services.admin_service import AdminService
from backend.app.services.auth_service import AuthService

security = HTTPBearer()
SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


async def get_current_teacher(
    session: SessionDep,
    payload: dict = Depends(get_current_user_token),
) -> Teacher:
    if payload.get("type") != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="需要教师权限"
        )

    auth_service = AuthService(session)
    teacher = await auth_service.get_teacher_by_id(int(payload["sub"]))
    if not teacher:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在"
        )
    if not teacher.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="账户已被禁用"
        )
    return teacher


async def get_current_student(
    session: SessionDep,
    payload: dict = Depends(get_current_user_token),
) -> Student:
    if payload.get("type") != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="需要学生权限"
        )

    auth_service = AuthService(session)
    student = await auth_service.get_student_by_id(int(payload["sub"]))
    if not student:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在"
        )
    if not student.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="账户已被禁用"
        )
    return student


async def get_current_admin(
    session: SessionDep,
    payload: dict = Depends(get_current_user_token),
) -> Admin:
    if payload.get("type") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限"
        )

    admin_service = AdminService(session)
    admin = await admin_service.get_admin_by_id(int(payload["sub"]))
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在"
        )
    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="账户已被禁用"
        )
    return admin


async def get_current_super_admin(
    admin: Admin = Depends(get_current_admin),
) -> Admin:
    if not admin.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="需要超级管理员权限"
        )
    return admin


CurrentTeacher = Annotated[Teacher, Depends(get_current_teacher)]
CurrentStudent = Annotated[Student, Depends(get_current_student)]
CurrentAdmin = Annotated[Admin, Depends(get_current_admin)]
CurrentSuperAdmin = Annotated[Admin, Depends(get_current_super_admin)]
