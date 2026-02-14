"""认证相关 API"""

from fastapi import APIRouter, HTTPException, status

from backend.app.api.v1.deps import SessionDep
from backend.app.schemas.auth import LoginRequest, LoginResponse, RegisterRequest
from backend.app.services.auth_service import AuthService
from backend.app.services.captcha_service import CaptchaService

router = APIRouter()


@router.get("/captcha")
async def get_captcha(session: SessionDep) -> dict:
    """获取图形验证码"""
    captcha_service = CaptchaService(session)
    return await captcha_service.generate()


async def _verify_captcha(session, captcha_id: str, captcha_value: str) -> None:
    """校验验证码的公共辅助函数"""
    captcha_service = CaptchaService(session)
    try:
        await captcha_service.verify(captcha_id, captcha_value)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/register/teacher", response_model=LoginResponse)
async def register_teacher(
    data: RegisterRequest,
    session: SessionDep,
) -> LoginResponse:
    """教师注册"""
    # 校验验证码
    await _verify_captcha(session, data.captcha_id, data.captcha_value)

    auth_service = AuthService(session)
    try:
        await auth_service.register_teacher(data)
        # 自动登录
        login_data = LoginRequest.model_construct(
            username=data.username,
            password=data.password,
            captcha_id="",
            captcha_value="",
        )
        return await auth_service.login_teacher(login_data)
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
    # 校验验证码
    await _verify_captcha(session, data.captcha_id, data.captcha_value)

    auth_service = AuthService(session)
    try:
        await auth_service.register_student(data)
        # 自动登录
        login_data = LoginRequest.model_construct(
            username=data.username,
            password=data.password,
            captcha_id="",
            captcha_value="",
        )
        return await auth_service.login_student(login_data)
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
    # 校验验证码
    await _verify_captcha(session, data.captcha_id, data.captcha_value)

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
    # 校验验证码
    await _verify_captcha(session, data.captcha_id, data.captcha_value)

    auth_service = AuthService(session)
    try:
        return await auth_service.login_student(data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        )
