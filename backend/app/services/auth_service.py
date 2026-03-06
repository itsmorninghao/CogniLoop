"""Authentication service."""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import func, select

from backend.app.core.captcha import verify_captcha
from backend.app.core.exceptions import AlreadyExistsError, BadRequestError
from backend.app.core.ip_block import (
    is_ip_blocked,
    record_login_failure,
    record_login_success,
)
from backend.app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from backend.app.models.user import User
from backend.app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)


async def check_needs_setup(session: AsyncSession) -> bool:
    """Check if the system needs initial admin setup."""
    result = await session.execute(
        select(func.count(User.id)).where(User.is_admin.is_(True))
    )
    admin_count = result.scalar() or 0
    return admin_count == 0


async def setup_admin(req: RegisterRequest, session: AsyncSession) -> UserResponse:
    """Create the first admin user. Only works when no admin exists."""
    if not await check_needs_setup(session):
        raise BadRequestError("System is already set up — admin exists")

    # Check uniqueness
    existing = await session.execute(
        select(User).where((User.username == req.username) | (User.email == req.email))
    )
    if existing.scalar_one_or_none():
        raise AlreadyExistsError("Username or email")

    user = User(
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
        full_name=req.full_name,
        is_admin=True,
        is_superadmin=True,
    )
    session.add(user)
    await session.flush()
    await session.refresh(user)
    return UserResponse.model_validate(user)


async def register_user(
    req: RegisterRequest, session: AsyncSession, client_ip: str
) -> UserResponse:
    # Step 1: IP blocked?
    if await is_ip_blocked(client_ip):
        raise BadRequestError("您的 IP 已被临时封锁，请稍后再试或联系管理员")

    # Step 2: Captcha valid?
    if not await verify_captcha(req.captcha_id, req.captcha_answer):
        raise BadRequestError("验证码错误或已过期")

    # Step 3: Check username / email uniqueness
    existing = await session.execute(
        select(User).where((User.username == req.username) | (User.email == req.email))
    )
    if existing.scalar_one_or_none():
        raise AlreadyExistsError("Username or email")

    user = User(
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
        full_name=req.full_name,
    )
    session.add(user)
    await session.flush()
    await session.refresh(user)
    return UserResponse.model_validate(user)


async def login_user(
    req: LoginRequest, session: AsyncSession, client_ip: str
) -> TokenResponse:
    # Step 1: IP blocked?
    if await is_ip_blocked(client_ip):
        raise BadRequestError("您的 IP 已被临时封锁，请稍后再试或联系管理员")

    # Step 2: Captcha valid?
    if not await verify_captcha(req.captcha_id, req.captcha_answer):
        raise BadRequestError("验证码错误或已过期")

    # Step 3: Credentials
    result = await session.execute(select(User).where(User.username == req.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.hashed_password):
        await record_login_failure(client_ip, req.username)
        raise BadRequestError("Invalid username or password")
    if not user.is_active:
        raise BadRequestError("Account is disabled")

    # Step 4: Success — reset failure counter + record history
    await record_login_success(client_ip, req.username)
    token = create_access_token(data={"sub": str(user.id)})
    return TokenResponse(access_token=token)
