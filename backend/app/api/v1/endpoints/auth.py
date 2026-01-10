"""认证相关 API"""

from fastapi import APIRouter, HTTPException, status

from backend.app.api.v1.deps import SessionDep
from backend.app.schemas.auth import LoginRequest, LoginResponse, RegisterRequest
from backend.app.services.auth_service import AuthService

router = APIRouter()


@router.post("/register/teacher", response_model=LoginResponse)
async def register_teacher(
    data: RegisterRequest,
    session: SessionDep,
) -> LoginResponse:
    """教师注册"""
    auth_service = AuthService(session)
    try:
        await auth_service.register_teacher(data)
        # 自动登录
        return await auth_service.login_teacher(
            LoginRequest(username=data.username, password=data.password)
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/register/student", response_model=LoginResponse)
async def register_student(
    data: RegisterRequest,
    session: SessionDep,
) -> LoginResponse:
    """学生注册"""
    auth_service = AuthService(session)
    try:
        await auth_service.register_student(data)
        # 自动登录
        return await auth_service.login_student(
            LoginRequest(username=data.username, password=data.password)
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/login/teacher", response_model=LoginResponse)
async def login_teacher(
    data: LoginRequest,
    session: SessionDep,
) -> LoginResponse:
    """教师登录"""
    auth_service = AuthService(session)
    try:
        return await auth_service.login_teacher(data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        )


@router.post("/login/student", response_model=LoginResponse)
async def login_student(
    data: LoginRequest,
    session: SessionDep,
) -> LoginResponse:
    """学生登录"""
    auth_service = AuthService(session)
    try:
        return await auth_service.login_student(data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        )
