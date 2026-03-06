"""Profile API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_session
from backend.app.core.deps import get_current_user
from backend.app.models.user import User
from backend.app.services import profile_service

router = APIRouter(prefix="/profiles", tags=["Profiles"])


class ProfileResponse(BaseModel):
    user_id: int
    overall_level: str
    total_questions_answered: int
    overall_accuracy: float
    question_type_profiles: dict
    domain_profiles: dict
    learning_trajectory: list
    profile_version: int
    last_calculated_at: str | None


class ProfileShareRequest(BaseModel):
    share_type: str = "link"  # "link" or "public"


class ProfileShareResponse(BaseModel):
    id: int
    share_type: str
    share_token: str | None
    created_at: str

    model_config = {"from_attributes": True}


def _build_profile_response(profile, user_id: int) -> ProfileResponse:
    data = profile.profile_data or {}
    return ProfileResponse(
        user_id=user_id,
        overall_level=data.get("overall_level", "beginner"),
        total_questions_answered=data.get("total_questions_answered", 0),
        overall_accuracy=data.get("overall_accuracy", 0.0),
        question_type_profiles=data.get("question_type_profiles", {}),
        domain_profiles=data.get("domain_profiles", {}),
        learning_trajectory=data.get("learning_trajectory", []),
        profile_version=profile.profile_version or 0,
        last_calculated_at=str(profile.last_calculated_at)
        if profile.last_calculated_at
        else None,
    )


@router.get("/me", response_model=ProfileResponse)
async def get_my_profile(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get current user's profile."""
    profile = await profile_service.get_or_create_profile(user.id, session)
    return _build_profile_response(profile, user.id)


@router.get("/me/share", response_model=ProfileShareResponse | None)
async def get_my_share(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get current user's active profile share, or null if none."""
    share = await profile_service.get_profile_share(user.id, session)
    if not share:
        return None
    return ProfileShareResponse(
        id=share.id,
        share_type=share.share_type,
        share_token=share.share_token,
        created_at=str(share.created_at),
    )


@router.get("/{user_id}", response_model=ProfileResponse)
async def get_user_profile(
    user_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get another user's profile (if shared/public)."""
    if user_id == user.id:
        profile = await profile_service.get_or_create_profile(user_id, session)
    else:
        share = await profile_service.get_profile_share(user_id, session)
        if not share:
            raise HTTPException(status_code=403, detail="Profile is not shared")
        profile = await profile_service.get_or_create_profile(user_id, session)

    return _build_profile_response(profile, user_id)


@router.post("/me/recalculate", response_model=ProfileResponse)
async def recalculate_profile(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Trigger a full profile recalculation."""
    profile = await profile_service.full_recalculate(user.id, session)
    return _build_profile_response(profile, user.id)


@router.post("/me/share", response_model=ProfileShareResponse)
async def share_profile(
    req: ProfileShareRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create or update a profile share link."""
    share = await profile_service.create_profile_share(user.id, req.share_type, session)
    return ProfileShareResponse(
        id=share.id,
        share_type=share.share_type,
        share_token=share.share_token,
        created_at=str(share.created_at),
    )


@router.delete("/me/share", status_code=204)
async def revoke_profile_share(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Revoke (delete) the current user's profile share."""
    await profile_service.revoke_profile_share(user.id, session)
