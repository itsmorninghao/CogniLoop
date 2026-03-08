"""Auth endpoints — register, login, setup."""

import secrets
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.app.core.captcha import issue_captcha
from backend.app.core.database import get_session
from backend.app.core.deps import get_current_user
from backend.app.core.exceptions import AlreadyExistsError, BadRequestError, ForbiddenError
from backend.app.core.ip_block import get_client_ip
from backend.app.core.redis_pubsub import get_redis
from backend.app.core.security import create_access_token, hash_password
from backend.app.models.user import User
from backend.app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from backend.app.services import auth_service, config_service

router = APIRouter(prefix="/auth", tags=["Auth"])

LINUX_DO_AUTHORIZE_URL = "https://connect.linux.do/oauth2/authorize"
LINUX_DO_TOKEN_URL = "https://connect.linux.do/oauth2/token"
LINUX_DO_USER_URL = "https://connect.linux.do/api/user"
OAUTH_STATE_TTL = 300  # 5 minutes


@router.get("/captcha")
async def get_captcha():
    """Issue a fresh CAPTCHA (captcha_id + SVG image)."""
    captcha_id, svg = await issue_captcha()
    return {"captcha_id": captcha_id, "svg": svg}


@router.get("/setup-check")
async def setup_check(session: AsyncSession = Depends(get_session)):
    """Check if the system needs initial admin setup (public endpoint)."""
    needs_setup = await auth_service.check_needs_setup(session)
    return {"needs_setup": needs_setup}


@router.get("/registration-enabled")
async def registration_enabled(session: AsyncSession = Depends(get_session)):
    """Return whether public registration (form-based) is allowed."""
    val = await config_service.get_config("ALLOW_REGISTRATION", session)
    return {"enabled": val != "false"}  # absent → True (backward-compatible)


@router.post("/setup", response_model=UserResponse, status_code=201)
async def setup_admin(
    req: RegisterRequest,
    session: AsyncSession = Depends(get_session),
):
    """Create the first admin user. Only works when no admin exists."""
    return await auth_service.setup_admin(req, session)


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(
    req: RegisterRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    return await auth_service.register_user(req, session, get_client_ip(request))


@router.post("/login", response_model=TokenResponse)
async def login(
    req: LoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    return await auth_service.login_user(req, session, get_client_ip(request))


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
):
    return UserResponse.model_validate(current_user)


@router.get("/linux-do/enabled")
async def linux_do_enabled(session: AsyncSession = Depends(get_session)):
    """Return whether Linux DO login is configured."""
    client_id = await config_service.get_config("LINUX_DO_CLIENT_ID", session)
    return {"enabled": bool(client_id)}


@router.get("/linux-do/authorize")
async def linux_do_authorize(session: AsyncSession = Depends(get_session)):
    """Return the Linux DO OAuth2 authorization URL (login flow)."""
    client_id = await config_service.get_config("LINUX_DO_CLIENT_ID", session)
    redirect_uri = await config_service.get_config("LINUX_DO_REDIRECT_URI", session)
    if not client_id or not redirect_uri:
        raise BadRequestError("Linux DO OAuth 未配置，请联系管理员")

    state = str(uuid4())
    redis = get_redis()
    await redis.set(f"oauth_state:{state}", "login", ex=OAUTH_STATE_TTL)

    url = (
        f"{LINUX_DO_AUTHORIZE_URL}"
        f"?client_id={client_id}"
        f"&response_type=code"
        f"&redirect_uri={redirect_uri}"
        f"&state={state}"
    )
    return {"url": url}


async def _exchange_linux_do_token(code: str, session: AsyncSession) -> dict:
    """Exchange auth code for Linux DO access token and return user info dict."""
    client_id = await config_service.get_config("LINUX_DO_CLIENT_ID", session)
    client_secret = await config_service.get_config("LINUX_DO_CLIENT_SECRET", session)
    redirect_uri = await config_service.get_config("LINUX_DO_REDIRECT_URI", session)
    if not client_id or not client_secret or not redirect_uri:
        raise BadRequestError("Linux DO OAuth 未配置，请联系管理员")

    async with httpx.AsyncClient(timeout=15) as client:
        token_resp = await client.post(
            LINUX_DO_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
            },
            auth=(client_id, client_secret),
            headers={"Accept": "application/json"},
        )
        if token_resp.status_code != 200:
            raise BadRequestError("无法从 Linux DO 获取 access token")
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise BadRequestError("Linux DO 未返回 access token")

        user_resp = await client.get(
            LINUX_DO_USER_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_resp.status_code != 200:
            raise BadRequestError("无法从 Linux DO 获取用户信息")
        return user_resp.json()


@router.post("/linux-do/exchange", response_model=TokenResponse)
async def linux_do_exchange(
    body: dict,
    session: AsyncSession = Depends(get_session),
):
    """Exchange OAuth code for a local JWT (login flow)."""
    code = body.get("code", "")
    state = body.get("state", "")
    if not code or not state:
        raise BadRequestError("缺少 code 或 state 参数")

    redis = get_redis()
    state_key = f"oauth_state:{state}"
    stored = await redis.get(state_key)
    if stored != "login":
        raise BadRequestError("无效或已过期的 state，请重新发起登录")
    await redis.delete(state_key)

    ld_user = await _exchange_linux_do_token(code, session)

    if not ld_user.get("active", False):
        raise ForbiddenError("该 Linux DO 账号已被停用")

    min_trust_raw = await config_service.get_config("LINUX_DO_MIN_TRUST_LEVEL", session) or "1"
    try:
        min_trust = int(min_trust_raw)
    except ValueError:
        min_trust = 1
    if int(ld_user.get("trust_level", 0)) < min_trust:
        raise ForbiddenError(
            f"您的 Linux DO 信任等级不足（需要 {min_trust} 级或以上）"
        )

    linux_do_id = str(ld_user["id"])
    result = await session.execute(select(User).where(User.linux_do_id == linux_do_id))
    user = result.scalar_one_or_none()

    if user is None:
        base_username = ld_user.get("username") or f"ld_{linux_do_id}"
        username = base_username[:50]
        existing = await session.execute(select(User).where(User.username == username))
        if existing.scalar_one_or_none():
            suffix = secrets.token_hex(2)
            username = f"{base_username[:43]}_ld{suffix}"

        avatar_template = ld_user.get("avatar_template", "")
        avatar_url = avatar_template.replace("{size}", "120") if avatar_template else None

        user = User(
            username=username,
            email=f"ld_{linux_do_id}@linux.do",
            hashed_password=hash_password(secrets.token_hex(32)),
            full_name=ld_user.get("name") or ld_user.get("username") or username,
            avatar_url=avatar_url,
            linux_do_id=linux_do_id,
        )
        session.add(user)
        await session.flush()
        await session.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token)


@router.get("/linux-do/bind-url")
async def linux_do_bind_url(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return authorization URL for binding Linux DO to an existing account."""
    client_id = await config_service.get_config("LINUX_DO_CLIENT_ID", session)
    redirect_uri = await config_service.get_config("LINUX_DO_REDIRECT_URI", session)
    if not client_id or not redirect_uri:
        raise BadRequestError("Linux DO OAuth 未配置，请联系管理员")

    state = str(uuid4())
    redis = get_redis()
    await redis.set(f"oauth_state:{state}", f"bind:{current_user.id}", ex=OAUTH_STATE_TTL)

    url = (
        f"{LINUX_DO_AUTHORIZE_URL}"
        f"?client_id={client_id}"
        f"&response_type=code"
        f"&redirect_uri={redirect_uri}"
        f"&state={state}"
    )
    return {"url": url}


@router.post("/linux-do/bind")
async def linux_do_bind(
    body: dict,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Bind a Linux DO account to the currently logged-in user."""
    code = body.get("code", "")
    state = body.get("state", "")
    if not code or not state:
        raise BadRequestError("缺少 code 或 state 参数")

    redis = get_redis()
    state_key = f"oauth_state:{state}"
    stored = await redis.get(state_key)
    expected = f"bind:{current_user.id}"
    if stored != expected:
        raise BadRequestError("无效或已过期的 state，请重新发起绑定")
    await redis.delete(state_key)

    ld_user = await _exchange_linux_do_token(code, session)
    linux_do_id = str(ld_user["id"])

    existing = await session.execute(select(User).where(User.linux_do_id == linux_do_id))
    if existing.scalar_one_or_none():
        raise AlreadyExistsError("该 Linux DO 账号已绑定到其他用户")

    current_user.linux_do_id = linux_do_id
    session.add(current_user)
    await session.flush()
    return {"message": "绑定成功"}


@router.delete("/linux-do/bind")
async def linux_do_unbind(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Remove Linux DO binding from the current user."""
    current_user.linux_do_id = None
    session.add(current_user)
    await session.flush()
    return {"message": "解绑成功"}
