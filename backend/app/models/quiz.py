"""Quiz session, question, and response models."""

import uuid
from datetime import datetime, timezone
from typing import Any

import sqlalchemy as sa
from sqlalchemy import JSON, Column, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlmodel import Field, SQLModel


class QuizSession(SQLModel, table=True):
    __tablename__ = "quiz_sessions"

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        sa_column=Column(
            UUID(as_uuid=False),
            primary_key=True,
            server_default=text("gen_random_uuid()"),
        ),
    )
    creator_id: int = Field(foreign_key="users.id", index=True)
    solver_id: int | None = Field(default=None, foreign_key="users.id")
    circle_id: int | None = Field(default=None, foreign_key="study_circles.id")
    mode: str = Field(max_length=20)  # self_test / challenge / circle / plaza
    generation_mode: str = Field(default="standard", max_length=10)  # standard / pro
    title: str | None = Field(default=None, max_length=200)
    knowledge_scope: Any = Field(
        default={}, sa_column=Column(JSON, server_default="{}")
    )
    quiz_config: Any = Field(default={}, sa_column=Column(JSON, server_default="{}"))
    solver_profile_snapshot: Any = Field(default=None, sa_column=Column(JSON))
    status: str = Field(default="generating", max_length=20)
    total_score: float | None = Field(default=None)
    accuracy: float | None = Field(default=None)
    started_at: datetime | None = Field(default=None)
    completed_at: datetime | None = Field(default=None)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    share_code: str | None = Field(default=None, max_length=16, unique=True, index=True)
    shared_to_plaza_at: datetime | None = Field(default=None)


class QuizQuestion(SQLModel, table=True):
    __tablename__ = "quiz_questions"

    id: int | None = Field(default=None, primary_key=True)
    session_id: str = Field(
        sa_column=Column(
            UUID(as_uuid=False), sa.ForeignKey("quiz_sessions.id"), index=True
        ),
    )
    question_index: int = Field(default=0)
    question_type: str = Field(max_length=30)
    content: str = Field(sa_column=Column(Text))
    options: Any = Field(default=None, sa_column=Column(JSON))
    correct_answer: str = Field(sa_column=Column(Text))
    analysis: str | None = Field(default=None, sa_column=Column(Text))
    score: float = Field(default=1.0)
    source_chunks: Any = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )


class QuizResponse(SQLModel, table=True):
    __tablename__ = "quiz_responses"

    id: int | None = Field(default=None, primary_key=True)
    question_id: int = Field(foreign_key="quiz_questions.id", index=True)
    session_id: str = Field(
        sa_column=Column(
            UUID(as_uuid=False), sa.ForeignKey("quiz_sessions.id"), index=True
        ),
    )
    user_id: int = Field(foreign_key="users.id", index=True)
    user_answer: str | None = Field(default=None)
    is_correct: bool | None = Field(default=None)
    score: float | None = Field(default=None)
    ai_feedback: str | None = Field(default=None, sa_column=Column(Text))
    time_spent: int | None = Field(default=None)  # seconds
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )


class QuizAcquisition(SQLModel, table=True):
    __tablename__ = "quiz_acquisitions"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    session_id: str = Field(
        sa_column=Column(
            UUID(as_uuid=False), sa.ForeignKey("quiz_sessions.id"), index=True
        ),
    )
    acquired_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
