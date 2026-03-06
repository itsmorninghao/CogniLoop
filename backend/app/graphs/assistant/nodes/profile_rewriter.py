"""
profile_rewriter node — runs full_recalculate to rebuild the user's profile from scratch.
"""

from __future__ import annotations

import logging

from backend.app.core.database import async_session_factory
from backend.app.graphs.assistant.state import AssistantState

logger = logging.getLogger(__name__)


async def profile_rewriter(state: AssistantState) -> dict:
    """Trigger full profile recalculation."""
    user_id = state["user_id"]

    new_profile: dict = {}
    try:
        from backend.app.services import profile_service
        async with async_session_factory() as db:
            await profile_service.full_recalculate(user_id, db)
            # Reload the freshly saved profile
            from sqlmodel import select
            from backend.app.models.profile import UserProfile
            result = await db.execute(
                select(UserProfile).where(UserProfile.user_id == user_id)
            )
            profile = result.scalar_one_or_none()
            new_profile = profile.profile_data if profile else {}

        logger.info("AssistantGraph: profile fully recalculated for user %d", user_id)
    except Exception as e:
        logger.warning("AssistantGraph: profile_rewriter failed for user %d: %s", user_id, e)
        new_profile = state.get("current_profile", {})

    return {
        "new_profile": new_profile,
        "current_node": "profile_rewriter",
        "progress": 0.7,
        "status_message": "画像重新计算完成",
    }
