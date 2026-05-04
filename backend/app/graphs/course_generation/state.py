"""
State definitions for course generation LangGraphs.
"""

from __future__ import annotations

from typing import TypedDict


class OutlineGenState(TypedDict, total=False):
    """State for the outline generation graph (Phase 1)."""

    kb_ids: list[int]
    level: str
    voice_id: str | None
    user_id: int

    kb_summary: str

    course_title: str
    nodes: list[dict]

    current_node: str
    errors: list[str]


class NodeGenState(TypedDict, total=False):
    """State for the per-node content generation graph (Phase 2)."""

    node_id: int
    course_id: int
    node_title: str
    content_type: str
    level: str
    kb_ids: list[int]
    voice_id: str | None
    theme: str
    user_id: int

    course_outline: str
    node_key_points: list[str]
    node_position: str
    node_scope_note: str

    rag_content: str

    script_json: dict | None
    text_content: str | None
    narration_text: str

    storyboard_json: dict | None
    render_scene_json: dict | None
    asset_manifest_json: dict | None

    video_url: str | None

    quiz_session_id: str | None

    current_node: str
    gen_status: str
    error_msg: str | None
