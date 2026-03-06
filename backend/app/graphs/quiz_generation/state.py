"""
QuizGenState — typed state for the quiz generation LangGraph.
"""

from __future__ import annotations

from typing import Any, TypedDict


class QuizGenState(TypedDict, total=False):
    """State flowing through the quiz generation graph."""

    # Input
    session_id: str
    user_id: int
    knowledge_scope: dict        # {kb_ids: [], folder_ids: [], doc_ids: []}
    quiz_config: dict             # {question_types: [], count: int, difficulty: str}
    generation_mode: str          # "standard" | "pro"

    # Internal pipeline state
    resolved_doc_ids: list[int]
    resolved_kb_ids: list[int]
    rag_chunks: list[dict]        # retrieved chunks
    user_profile: dict | None     # solver profile snapshot
    question_specs: list[dict]    # designed question specs from question_designer
    questions: list[dict]         # generated questions
    validated_questions: list[dict]  # after quality check

    # Observability / SSE
    current_node: str
    progress: float               # 0.0 - 1.0
    status_message: str
    errors: list[str]

    # Output
    is_complete: bool
    retry_count: int
