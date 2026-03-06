"""
GradingState — typed state for the grading LangGraph.
"""

from __future__ import annotations

from typing import TypedDict


class GradingState(TypedDict, total=False):
    session_id: str
    user_id: int

    # Input
    questions: list[dict]  # [{id, content, type, options, correct_answer, score}]
    responses: list[dict]  # [{question_id, user_answer}]

    # Pipeline
    parsed_responses: list[dict]  # after answer parsing
    graded_results: list[dict]  # individual grades

    # Output
    total_score: float
    max_score: float
    accuracy: float
    feedback_summary: str

    # Observability
    current_node: str
    progress: float
    status_message: str
