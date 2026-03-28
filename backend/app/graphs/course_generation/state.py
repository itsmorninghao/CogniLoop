"""
State definitions for course generation LangGraphs.

Two separate graphs:
  - outline_generation_graph: Phase 1 — KB → course outline draft
  - node_generation_graph:    Phase 2 — single leaf node → content + quiz
"""

from __future__ import annotations

from typing import TypedDict


class OutlineGenState(TypedDict, total=False):
    """State for the outline generation graph (Phase 1)."""

    # Input (set by service layer)
    kb_ids: list[int]
    level: str           # "beginner" | "advanced"
    voice_id: str | None
    user_id: int

    # kb_summarizer output
    kb_summary: str

    # outline_generator output
    course_title: str
    nodes: list[dict]    # list of OutlineNodeDraft-compatible dicts

    # observability
    current_node: str
    errors: list[str]


class NodeGenState(TypedDict, total=False):
    """State for the per-node content generation graph (Phase 2)."""

    # Input (set by service layer)
    node_id: int
    course_id: int
    node_title: str
    content_type: str    # "video" | "text"
    level: str
    kb_ids: list[int]
    voice_id: str | None
    user_id: int

    # rag_retriever output
    rag_content: str

    # content_generator output
    script_json: dict | None    # slides JSON, video nodes only
    text_content: str | None    # markdown article, text nodes only
    narration_text: str         # full narration for TTS

    # video_pipeline output
    video_url: str | None

    # quiz_generator output
    quiz_session_id: str | None

    # observability / result
    current_node: str
    gen_status: str      # "done" | "failed"
    error_msg: str | None
