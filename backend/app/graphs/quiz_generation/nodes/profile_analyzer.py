"""
Node 3: Profile Analyzer — reads the solver's learning profile for adaptive generation.
"""

from __future__ import annotations

import logging

from backend.app.core.database import async_session_factory
from backend.app.graphs.quiz_generation.state import QuizGenState

logger = logging.getLogger(__name__)


async def profile_analyzer(state: QuizGenState) -> dict:
    """
    Load the solver's user profile for adaptive question generation.

    If no solver profile exists, the question_designer will use default difficulty.
    """
    from backend.app.core.sse import emit_node_complete, emit_node_start

    session_id = state.get("session_id", "")
    user_id = state.get("user_id")
    await emit_node_start(session_id, "profile_analyzer", "正在分析答题人学习画像...")

    user_profile = None

    if user_id:
        try:
            from sqlmodel import select

            from backend.app.models.profile import UserProfile

            async with async_session_factory() as session:
                result = await session.execute(
                    select(UserProfile).where(UserProfile.user_id == user_id)
                )
                profile = result.scalar_one_or_none()
                if profile and profile.profile_data:
                    # profile_data is a JSON field containing all learning stats
                    data: dict = (
                        profile.profile_data
                        if isinstance(profile.profile_data, dict)
                        else {}
                    )
                    qt_profiles: dict = data.get("question_type_profiles", {})

                    # Derive weak/strong topics from question_type_profiles
                    weak_topics = [
                        qt
                        for qt, stats in qt_profiles.items()
                        if stats.get("accuracy", 1.0) < 0.6
                    ]
                    strong_topics = [
                        qt
                        for qt, stats in qt_profiles.items()
                        if stats.get("accuracy", 0.0) >= 0.8
                    ]

                    user_profile = {
                        "weak_topics": weak_topics,
                        "strong_topics": strong_topics,
                        "avg_accuracy": data.get("overall_accuracy"),
                        "total_questions": data.get("total_questions_answered", 0),
                        "overall_level": data.get("overall_level", "beginner"),
                    }
                    logger.info("Loaded profile for user %d: %s", user_id, user_profile)
        except Exception as e:
            logger.warning("Could not load user profile: %s (continuing without)", e)

    msg = "已分析答题人画像" if user_profile else "跳过画像分析（新用户）"
    output_sum: dict = {"has_profile": user_profile is not None}
    if user_profile:
        output_sum.update(
            {
                "overall_level": user_profile.get("overall_level"),
                "avg_accuracy": user_profile.get("avg_accuracy"),
                "total_questions": user_profile.get("total_questions", 0),
                "weak_topics": user_profile.get("weak_topics", []),
                "strong_topics": user_profile.get("strong_topics", []),
            }
        )
    await emit_node_complete(
        session_id,
        "profile_analyzer",
        msg,
        input_summary={"user_id": user_id},
        output_summary=output_sum,
        progress=0.4,
    )

    return {
        "user_profile": user_profile,
        "current_node": "profile_analyzer",
        "progress": 0.4,
        "status_message": msg,
    }
