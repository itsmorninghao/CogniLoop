"""
AssistantState — typed state for the AI assistant LangGraph.
"""

from __future__ import annotations

from typing import TypedDict


class AssistantState(TypedDict, total=False):
    user_id: int
    session_id: str | None      # Triggering quiz session (event-driven)
    trigger_type: str           # "event" | "manual"

    # Collected data
    recent_sessions: list[dict]  # Recent graded quiz sessions with responses
    current_profile: dict        # Current profile_data from DB

    # Analysis results
    patterns_found: list[dict]   # [{domain, issue, detail, severity}]

    # Output
    new_profile: dict            # Updated profile (after full_recalculate)
    recommendations: list[dict]  # [{title, content, action_url}]

    # Observability
    current_node: str
    progress: float
    status_message: str
