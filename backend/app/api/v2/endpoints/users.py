"""Users API endpoints — public user search + profile editing."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select, or_

from backend.app.core.config import settings
from backend.app.core.database import get_session
from backend.app.core.deps import get_current_user
from backend.app.models.user import User

router = APIRouter(prefix="/users", tags=["Users"])


class UserPublicInfo(BaseModel):
    id: int
    username: str
    full_name: str
    avatar_url: str | None = None
    bio: str | None = None

    model_config = {"from_attributes": True}


@router.get("/search", response_model=list[UserPublicInfo])
async def search_users(
    q: str = Query(min_length=1, max_length=50, description="Search by username or full name"),
    limit: int = Query(default=10, ge=1, le=30),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Search users by username or full name (excludes the current user)."""
    pattern = f"%{q}%"
    result = await db.execute(
        select(User)
        .where(
            User.is_active.is_(True),
            User.id != current_user.id,
            or_(
                User.username.ilike(pattern),
                User.full_name.ilike(pattern),
            ),
        )
        .limit(limit)
    )
    users = result.scalars().all()
    return [UserPublicInfo.model_validate(u) for u in users]


@router.get("/me", response_model=UserPublicInfo)
async def get_me(
    current_user: User = Depends(get_current_user),
):
    """Return the current user's public info."""
    return UserPublicInfo.model_validate(current_user)


class UserUpdateRequest(BaseModel):
    full_name: str | None = None
    bio: str | None = None


@router.patch("/me", response_model=UserPublicInfo)
async def update_me(
    req: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Update the current user's full_name and/or bio."""
    if req.full_name is not None:
        current_user.full_name = req.full_name.strip()
    if req.bio is not None:
        current_user.bio = req.bio.strip() or None
    current_user.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return UserPublicInfo.model_validate(current_user)


_ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}


@router.post("/me/avatar", response_model=UserPublicInfo)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Upload a new avatar image for the current user."""
    if file.content_type not in _ALLOWED_AVATAR_TYPES:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, GIF, WEBP images are allowed")

    content = await file.read()
    if len(content) > settings.MAX_AVATAR_SIZE_BYTES:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"头像文件不能超过 {settings.MAX_AVATAR_SIZE_BYTES // (1024 * 1024)}MB")

    ext = Path(file.filename or "avatar.jpg").suffix or ".jpg"
    filename = f"avatar_{current_user.id}_{uuid.uuid4().hex}{ext}"
    avatar_dir = settings.upload_path / "avatars"
    avatar_dir.mkdir(parents=True, exist_ok=True)
    dest = avatar_dir / filename

    with dest.open("wb") as f:
        f.write(content)

    current_user.avatar_url = f"/uploads/avatars/{filename}"
    current_user.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return UserPublicInfo.model_validate(current_user)
