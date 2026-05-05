"""Knowledge-base chat session and message models."""

import uuid
from datetime import UTC, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import JSON, Column, Index, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlmodel import Field, SQLModel


class KBChatSession(SQLModel, table=True):
    __tablename__ = "kb_chat_sessions"
    __table_args__ = (
        Index(
            "ix_kb_chat_sessions_user_last_message_at",
            "user_id",
            sa.text("last_message_at DESC"),
        ),
    )

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        sa_column=Column(
            UUID(as_uuid=False),
            primary_key=True,
            server_default=text("gen_random_uuid()"),
        ),
    )
    user_id: int = Field(foreign_key="users.id", index=True)
    knowledge_base_id: int = Field(
        sa_column=Column(
            sa.Integer,
            sa.ForeignKey("knowledge_bases.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    title: str = Field(max_length=200)
    scope: Any = Field(default={}, sa_column=Column(JSON, server_default="{}"))
    status: str = Field(default="idle", max_length=20)  # idle / streaming / error
    message_count: int = Field(
        default=0,
        sa_column=Column(sa.Integer, nullable=False, server_default="0"),
    )
    last_message_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC).replace(tzinfo=None)
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC).replace(tzinfo=None)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC).replace(tzinfo=None)
    )


class KBChatMessage(SQLModel, table=True):
    __tablename__ = "kb_chat_messages"

    id: int | None = Field(default=None, primary_key=True)
    session_id: str = Field(
        sa_column=Column(
            UUID(as_uuid=False),
            sa.ForeignKey("kb_chat_sessions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    role: str = Field(max_length=20)  # user / assistant / system
    content: str = Field(default="", sa_column=Column(Text, nullable=False))
    status: str = Field(default="complete", max_length=20)  # complete / streaming / error
    citations: Any = Field(default=[], sa_column=Column(JSON, server_default="[]"))
    trace: Any | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    retrieval_query: str | None = Field(default=None, sa_column=Column(Text))
    error_message: str | None = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC).replace(tzinfo=None)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC).replace(tzinfo=None)
    )
