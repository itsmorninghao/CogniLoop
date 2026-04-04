"""Course schemas — request and response models."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class OutlineGenerateRequest(BaseModel):
    kb_ids: list[int] = Field(..., min_length=1, description="Knowledge base IDs to generate from")
    level: str = Field(default="beginner", pattern="^(beginner|advanced)$")
    voice_id: str | None = None
    theme: str = Field(default="tech-dark", pattern="^(tech-dark|clean-bright)$")


class OutlineNodeDraft(BaseModel):
    """A single node in the outline draft — used both in response and edits."""
    temp_id: str  # client-side temp ID for editing before course is created
    parent_temp_id: str | None = None
    title: str
    depth: int
    order: int
    is_leaf: bool
    content_type: str | None = None  # video / text
    key_points: list[str] | None = None  # core topics this node should cover
    scope_note: str | None = None  # boundary: what to cover vs. skip


class OutlineDraftResponse(BaseModel):
    draft_id: str  # temporary draft identifier stored in Redis
    course_title: str
    nodes: list[OutlineNodeDraft]


class OutlineConfirmRequest(BaseModel):
    """User confirms outline (possibly with edits) and triggers phase 2."""
    course_title: str
    nodes: list[OutlineNodeDraft]


class NodeEditRequest(BaseModel):
    nodes: list[OutlineNodeDraft]


class CourseUpdateRequest(BaseModel):
    title: str | None = None
    visibility: str | None = Field(default=None, pattern="^(private|public)$")


class NodeContentResponse(BaseModel):
    node_id: int
    content_type: str  # video / text
    gen_status: str
    video_url: str | None = None
    text_content: str | None = None
    script_json: Any | None = None
    error_msg: str | None = None
    retry_count: int
    quiz_session_id: str | None = None


class NodeProgressUpdate(BaseModel):
    status: str = Field(..., pattern="^(not_started|in_progress|completed)$")


class NodeProgressResponse(BaseModel):
    node_id: int
    status: str
    completed_at: datetime | None = None


class CourseNodeResponse(BaseModel):
    id: int
    parent_id: int | None
    title: str
    order: int
    depth: int
    is_leaf: bool
    content_type: str | None
    gen_status: str | None = None  # populated for leaf nodes
    progress_status: str | None = None  # populated when user is logged in


class CourseResponse(BaseModel):
    id: int
    title: str
    creator_id: int
    kb_ids: list[int]
    level: str
    voice_id: str | None
    theme: str
    cover_url: str | None
    visibility: str
    status: str
    created_at: datetime
    updated_at: datetime
    nodes: list[CourseNodeResponse] = []
    # computed
    total_leaf_nodes: int = 0
    completed_leaf_nodes: int = 0
    progress_pct: float = 0.0


class CourseListItem(BaseModel):
    id: int
    title: str
    level: str
    cover_url: str | None
    visibility: str
    status: str
    created_at: datetime
    total_leaf_nodes: int = 0
    completed_leaf_nodes: int = 0
    progress_pct: float = 0.0


class CoursePlazaItem(BaseModel):
    id: int
    title: str
    level: str
    cover_url: str | None
    creator_id: int
    creator_name: str
    status: str
    created_at: datetime
    total_leaf_nodes: int = 0


class GenerationStatusResponse(BaseModel):
    course_id: int
    status: str
    total_nodes: int
    done_nodes: int
    failed_nodes: int
    node_statuses: list[dict]  # [{node_id, title, gen_status, error_msg}]
