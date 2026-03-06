"""
FastAPI dependency for extracting the current user from JWT.
"""

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.app.core.database import get_session
from backend.app.core.exceptions import ForbiddenError, UnauthorizedError
from backend.app.core.security import decode_access_token
from backend.app.models.user import User


async def get_current_user(
    authorization: str = Header(..., description="Bearer <token>"),
    session: AsyncSession = Depends(get_session),
) -> User:
    """Extract and validate current user from Authorization header."""
    if not authorization.startswith("Bearer "):
        raise UnauthorizedError("Invalid authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    payload = decode_access_token(token)
    if payload is None:
        raise UnauthorizedError("Invalid or expired token")

    user_id: int | None = payload.get("sub")
    if user_id is None:
        raise UnauthorizedError("Invalid token payload")

    result = await session.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise UnauthorizedError("User not found or inactive")

    return user


async def get_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Require admin privileges."""
    if not current_user.is_admin:
        raise ForbiddenError("Admin access required")
    return current_user
