"""Auth endpoints — register, login, setup."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_session
from backend.app.core.deps import get_current_user
from backend.app.models.user import User
from backend.app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from backend.app.services import auth_service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.get("/setup-check")
async def setup_check(session: AsyncSession = Depends(get_session)):
    """Check if the system needs initial admin setup (public endpoint)."""
    needs_setup = await auth_service.check_needs_setup(session)
    return {"needs_setup": needs_setup}


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
    session: AsyncSession = Depends(get_session),
):
    return await auth_service.register_user(req, session)


@router.post("/login", response_model=TokenResponse)
async def login(
    req: LoginRequest,
    session: AsyncSession = Depends(get_session),
):
    return await auth_service.login_user(req, session)


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
):
    return UserResponse.model_validate(current_user)

