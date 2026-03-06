"""Study circle endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_session
from backend.app.core.deps import get_current_user
from backend.app.models.user import User
from backend.app.schemas.circle import (
    CircleCreateRequest,
    CircleMemberResponse,
    CircleQuizSessionItem,
    CircleResponse,
    CircleSessionParticipantItem,
    CircleStatsResponse,
    CircleUpdateRequest,
    JoinCircleRequest,
)
from backend.app.services import circle_service

router = APIRouter(prefix="/circles", tags=["Study Circles"])


@router.post("/", response_model=CircleResponse, status_code=201)
async def create_circle(
    req: CircleCreateRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await circle_service.create_circle(req, user, session)


@router.get("/", response_model=list[CircleResponse])
async def list_circles(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await circle_service.list_user_circles(user, session)


@router.get("/{circle_id}", response_model=CircleResponse)
async def get_circle(
    circle_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await circle_service.get_circle(circle_id, session)


@router.patch("/{circle_id}", response_model=CircleResponse)
async def update_circle(
    circle_id: int,
    req: CircleUpdateRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await circle_service.update_circle(circle_id, req, user, session)


@router.delete("/{circle_id}", status_code=204)
async def delete_circle(
    circle_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await circle_service.delete_circle(circle_id, user, session)


@router.post("/join", response_model=CircleResponse)
async def join_circle(
    req: JoinCircleRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await circle_service.join_circle(req, user, session)


@router.get("/{circle_id}/members", response_model=list[CircleMemberResponse])
async def list_members(
    circle_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await circle_service.list_members(circle_id, session)


@router.delete("/{circle_id}/members/{user_id}", status_code=204)
async def remove_member(
    circle_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await circle_service.remove_member(circle_id, user_id, current_user, session)


@router.get("/{circle_id}/stats", response_model=CircleStatsResponse)
async def get_circle_stats(
    circle_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await circle_service.get_circle_stats(circle_id, session)


@router.get("/{circle_id}/quiz-sessions", response_model=list[CircleQuizSessionItem])
async def get_circle_quiz_sessions(
    circle_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await circle_service.get_circle_quiz_sessions(
        circle_id, session, limit, user
    )


@router.get(
    "/{circle_id}/sessions/{session_id}/participants",
    response_model=list[CircleSessionParticipantItem],
)
async def get_session_participants(
    circle_id: int,
    session_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await circle_service.get_session_participants(circle_id, session_id, session)
