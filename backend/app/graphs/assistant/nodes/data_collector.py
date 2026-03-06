"""
data_collector node — loads recent quiz sessions and current profile for the user.
"""

from __future__ import annotations

import logging

from sqlmodel import select

from backend.app.core.database import async_session_factory
from backend.app.graphs.assistant.state import AssistantState
from backend.app.models.profile import UserProfile
from backend.app.models.quiz import QuizQuestion, QuizResponse, QuizSession

logger = logging.getLogger(__name__)

# Number of recent graded sessions to analyze
RECENT_SESSIONS_LIMIT = 10


async def data_collector(state: AssistantState) -> dict:
    """Load recent graded quiz sessions and the user's current profile."""
    user_id = state["user_id"]

    async with async_session_factory() as db:
        result = await db.execute(
            select(QuizSession)
            .where(
                QuizSession.solver_id == user_id,
                QuizSession.status == "graded",
            )
            .order_by(QuizSession.completed_at.desc())
            .limit(RECENT_SESSIONS_LIMIT)
        )
        sessions = result.scalars().all()

        recent_sessions = []
        for s in sessions:
            q_result = await db.execute(
                select(QuizQuestion).where(QuizQuestion.session_id == s.id)
            )
            questions = q_result.scalars().all()

            r_result = await db.execute(
                select(QuizResponse).where(
                    QuizResponse.session_id == s.id,
                    QuizResponse.user_id == user_id,
                )
            )
            responses = r_result.scalars().all()

            r_map = {r.question_id: r for r in responses}
            question_details = []
            for q in questions:
                resp = r_map.get(q.id)
                question_details.append(
                    {
                        "question_type": q.question_type,
                        "content": q.content[:200],  # truncate for context window
                        "is_correct": resp.is_correct if resp else None,
                        "score": resp.score if resp else 0,
                        "max_score": q.score,
                        "time_spent": resp.time_spent if resp else None,
                        "ai_feedback": resp.ai_feedback if resp else None,
                    }
                )

            recent_sessions.append(
                {
                    "session_id": str(s.id),
                    "completed_at": s.completed_at.isoformat()
                    if s.completed_at
                    else None,
                    "accuracy": s.accuracy,
                    "total_score": s.total_score,
                    "quiz_config": s.quiz_config or {},
                    "questions": question_details,
                }
            )

        p_result = await db.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        )
        profile = p_result.scalar_one_or_none()
        current_profile = profile.profile_data if profile else {}

    logger.info(
        "AssistantGraph: collected %d sessions for user %d",
        len(recent_sessions),
        user_id,
    )

    return {
        "recent_sessions": recent_sessions,
        "current_profile": current_profile,
        "current_node": "data_collector",
        "progress": 0.15,
        "status_message": f"已加载 {len(recent_sessions)} 次做题记录",
    }
