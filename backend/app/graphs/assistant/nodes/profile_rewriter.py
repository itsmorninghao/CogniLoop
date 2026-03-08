"""
profile_rewriter node — runs full_recalculate to rebuild the user's profile from scratch,
then merges in LLM analysis results (weakness_analysis, insight_summary) and prunes
knowledge points to the active window.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from backend.app.core.database import async_session_factory
from backend.app.graphs.assistant.state import AssistantState

logger = logging.getLogger(__name__)


async def profile_rewriter(state: AssistantState) -> dict:
    """Trigger full profile recalculation, then merge LLM analysis results."""
    user_id = state["user_id"]
    updated_wa: dict = state.get("updated_weakness_analysis", {})
    insight: str = state.get("insight_summary", "")
    active_kps: set = state.get("active_knowledge_points", set())

    new_profile: dict = {}
    try:
        from backend.app.services import profile_service

        async with async_session_factory() as db:
            await profile_service.full_recalculate(user_id, db)

            from sqlmodel import select

            from backend.app.models.profile import UserProfile

            result = await db.execute(
                select(UserProfile).where(UserProfile.user_id == user_id)
            )
            profile = result.scalar_one_or_none()

            if profile and profile.profile_data:
                data = dict(profile.profile_data)

                existing_wa = data.get("weakness_analysis", {})
                existing_wa.update(updated_wa)

                # Prune to active knowledge points window
                if active_kps:
                    existing_wa = {k: v for k, v in existing_wa.items() if k in active_kps}
                    data["knowledge_point_profiles"] = {
                        k: v
                        for k, v in data.get("knowledge_point_profiles", {}).items()
                        if k in active_kps
                    }

                data["weakness_analysis"] = existing_wa

                if insight:
                    data["insight_summary"] = insight

                if state.get("session_id"):
                    data["last_analysis_session_id"] = state["session_id"]

                profile.profile_data = data
                profile.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                db.add(profile)
                await db.commit()
                await db.refresh(profile)
                new_profile = profile.profile_data or {}

        logger.info(
            "AssistantGraph: profile rewritten for user %d, wa=%d, insight=%s",
            user_id,
            len(updated_wa),
            bool(insight),
        )
    except Exception as e:
        logger.warning(
            "AssistantGraph: profile_rewriter failed for user %d: %s", user_id, e
        )
        new_profile = state.get("current_profile", {})

    return {
        "new_profile": new_profile,
        "current_node": "profile_rewriter",
        "progress": 0.7,
        "status_message": "画像重新计算完成",
    }
