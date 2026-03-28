"""Course and course generation models."""

from datetime import datetime, timezone
from typing import Any

import sqlalchemy as sa
from sqlalchemy import JSON, Column, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlmodel import Field, SQLModel


class Course(SQLModel, table=True):
    __tablename__ = "courses"

    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(max_length=200)
    creator_id: int = Field(foreign_key="users.id", index=True)
    kb_ids: Any = Field(default=[], sa_column=Column(JSON, server_default="[]"))
    level: str = Field(default="beginner", max_length=20)  # beginner / advanced
    voice_id: str | None = Field(default=None, max_length=100)
    cover_url: str | None = Field(default=None, max_length=500)
    visibility: str = Field(default="private", max_length=20)  # private / public
    status: str = Field(default="draft", max_length=30)  # draft / generating / ready / partial_failed
    shared_to_plaza_at: datetime | None = Field(default=None)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )


class CourseNode(SQLModel, table=True):
    __tablename__ = "course_nodes"

    id: int | None = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="courses.id", index=True)
    parent_id: int | None = Field(default=None, foreign_key="course_nodes.id")
    title: str = Field(max_length=200)
    order: int = Field(default=0)
    depth: int = Field(default=1)  # 1 / 2 / 3
    is_leaf: bool = Field(default=False)
    content_type: str | None = Field(default=None, max_length=20)  # video / text


class CourseNodeContent(SQLModel, table=True):
    __tablename__ = "course_node_content"

    id: int | None = Field(default=None, primary_key=True)
    node_id: int = Field(foreign_key="course_nodes.id", unique=True, index=True)
    video_url: str | None = Field(default=None, max_length=500)
    text_content: str | None = Field(default=None, sa_column=Column(Text))
    script_json: Any = Field(default=None, sa_column=Column(JSON))  # slides JSON for video nodes
    gen_status: str = Field(default="pending", max_length=20)  # pending / generating / done / failed
    error_msg: str | None = Field(default=None, sa_column=Column(Text))
    retry_count: int = Field(default=0)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )


class CourseProgress(SQLModel, table=True):
    __tablename__ = "course_progress"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    node_id: int = Field(foreign_key="course_nodes.id", index=True)
    course_id: int = Field(foreign_key="courses.id", index=True)
    status: str = Field(default="not_started", max_length=20)  # not_started / in_progress / completed
    completed_at: datetime | None = Field(default=None)


class CourseQuiz(SQLModel, table=True):
    __tablename__ = "course_quizzes"

    id: int | None = Field(default=None, primary_key=True)
    node_id: int = Field(foreign_key="course_nodes.id", index=True)
    quiz_session_id: str = Field(
        sa_column=sa.Column(
            UUID(as_uuid=False),
            sa.ForeignKey("quiz_sessions.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
