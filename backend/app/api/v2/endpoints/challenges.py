"""Challenge API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_session
from backend.app.core.deps import get_current_user
from backend.app.models.user import User
from backend.app.schemas.quiz import QuizSessionListItem
from backend.app.services import challenge_service

router = APIRouter(prefix="/challenges", tags=["Challenges"])


@router.get("/received", response_model=list[QuizSessionListItem])
async def get_received_challenges(
    status: str | None = Query(default=None, description="Filter by status"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """List challenges sent to the current user."""
    sessions = await challenge_service.list_received_challenges(
        user.id,
        db,
        status_filter=status,
        limit=limit,
        offset=offset,
    )
    return [QuizSessionListItem.model_validate(s) for s in sessions]


@router.get("/sent", response_model=list[QuizSessionListItem])
async def get_sent_challenges(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """List challenges created by the current user for others."""
    sessions = await challenge_service.list_sent_challenges(
        user.id,
        db,
        limit=limit,
        offset=offset,
    )
    return [QuizSessionListItem.model_validate(s) for s in sessions]


@router.get("/{session_id}", response_model=QuizSessionListItem)
async def get_challenge_detail(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Get details of a specific challenge."""
    session = await challenge_service.get_challenge_detail(session_id, user, db)
    return QuizSessionListItem.model_validate(session)
