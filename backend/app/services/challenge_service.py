"""
Challenge service — query and manage challenge quiz sessions (mode="challenge").

Challenge creation and submission reuse the existing quiz_service endpoints.
This service only handles listing and detail retrieval for the challenges UI.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.app.core.exceptions import ForbiddenError, NotFoundError
from backend.app.models.quiz import QuizSession
from backend.app.models.user import User


async def list_received_challenges(
    user_id: int,
    db: AsyncSession,
    *,
    status_filter: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[QuizSession]:
    """Return challenge sessions where the current user is the solver."""
    stmt = (
        select(QuizSession)
        .where(
            QuizSession.solver_id == user_id,
            QuizSession.mode == "challenge",
        )
        .order_by(QuizSession.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if status_filter:
        stmt = stmt.where(QuizSession.status == status_filter)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def list_sent_challenges(
    user_id: int,
    db: AsyncSession,
    *,
    limit: int = 20,
    offset: int = 0,
) -> list[QuizSession]:
    """Return challenge sessions created by the current user for others."""
    result = await db.execute(
        select(QuizSession)
        .where(
            QuizSession.creator_id == user_id,
            QuizSession.mode == "challenge",
            QuizSession.solver_id != user_id,  # exclude self-challenges
        )
        .order_by(QuizSession.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_challenge_detail(
    session_id: str,
    user: User,
    db: AsyncSession,
) -> QuizSession:
    """Return a challenge session if the user is creator or solver."""
    result = await db.execute(
        select(QuizSession).where(
            QuizSession.id == session_id,
            QuizSession.mode == "challenge",
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundError("Challenge not found")
    if session.creator_id != user.id and session.solver_id != user.id and not user.is_admin:
        raise ForbiddenError("No access to this challenge")
    return session
