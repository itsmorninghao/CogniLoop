"""
AssistantState — typed state for the AI assistant LangGraph.
"""

from __future__ import annotations

from typing import TypedDict


class AssistantState(TypedDict, total=False):
    user_id: int
    session_id: str | None  # Triggering quiz session (event-driven)
    trigger_type: str  # "event" | "manual"

    # Collected data
    recent_sessions: list[dict]  # Recent graded quiz sessions with responses
    current_profile: dict  # Current profile_data from DB
    active_knowledge_points: set  # Knowledge points from last 30 sessions (for pruning)

    # Analysis results
    patterns_found: list[dict]  # [{domain, issue, detail, severity}]
    updated_weakness_analysis: dict  # {知识点: 原因描述} from LLM
    insight_summary: str  # LLM-generated overall summary

    # Output
    new_profile: dict  # Updated profile (after full_recalculate)
    recommendations: list[dict]  # [{title, content, action_url}]

    # Observability
    current_node: str
    progress: float
    status_message: str
