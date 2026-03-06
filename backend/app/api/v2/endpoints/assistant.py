"""AI assistant API endpoints."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_session
from backend.app.core.deps import get_current_user
from backend.app.models.user import User
from backend.app.services import notification_service, profile_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assistant", tags=["Assistant"])

# Keeps strong references to background tasks
_background_tasks: set = set()


class InsightsResponse(BaseModel):
    patterns_found: list[dict]
    learning_trajectory: list
    overall_accuracy: float
    overall_level: str
    total_questions_answered: int


class RecommendationItem(BaseModel):
    id: int
    title: str
    content: str | None
    action_url: str | None
    created_at: str


class TriggerResponse(BaseModel):
    status: str
    message: str


@router.get("/insights", response_model=InsightsResponse)
async def get_insights(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return the user's latest learning insights derived from their profile."""
    profile = await profile_service.get_or_create_profile(user.id, session)
    data = profile.profile_data or {}

    return InsightsResponse(
        patterns_found=[],  # populated by assistant graph on next trigger
        learning_trajectory=data.get("learning_trajectory", []),
        overall_accuracy=data.get("overall_accuracy", 0.0),
        overall_level=data.get("overall_level", "beginner"),
        total_questions_answered=data.get("total_questions_answered", 0),
    )


@router.get("/recommendations", response_model=list[RecommendationItem])
async def get_recommendations(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return the latest ai_suggestion notifications as recommendations."""
    notifications = await notification_service.list_notifications(
        user.id,
        session,
        limit=10,
    )
    result = []
    for n in notifications:
        if n.type == "ai_suggestion":
            result.append(RecommendationItem(
                id=n.id,
                title=n.title,
                content=n.content,
                action_url=n.action_url,
                created_at=str(n.created_at),
            ))
    return result


@router.post("/trigger", response_model=TriggerResponse)
async def trigger_assistant(
    user: User = Depends(get_current_user),
):
    """Manually trigger the assistant graph for the current user."""
    from backend.app.graphs.assistant.graph import assistant_graph

    task = asyncio.create_task(
        assistant_graph.ainvoke({
            "user_id": user.id,
            "session_id": None,
            "trigger_type": "manual",
        })
    )
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    logger.info("AssistantGraph manually triggered for user %d", user.id)
    return TriggerResponse(
        status="triggered",
        message="助教分析已在后台启动，请稍后查看通知中心",
    )
