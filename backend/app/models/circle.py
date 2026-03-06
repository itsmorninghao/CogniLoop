"""Study circle models."""

from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import UUID
from sqlmodel import Field, SQLModel, UniqueConstraint


class StudyCircle(SQLModel, table=True):
    __tablename__ = "study_circles"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=200)
    description: str | None = Field(default=None)
    avatar_url: str | None = Field(default=None, max_length=500)
    creator_id: int = Field(foreign_key="users.id", index=True)
    invite_code: str = Field(max_length=12, unique=True)
    max_members: int = Field(default=50)
    is_public: bool = Field(default=False)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CircleMember(SQLModel, table=True):
    __tablename__ = "circle_members"
    __table_args__ = (UniqueConstraint("circle_id", "user_id"),)

    id: int | None = Field(default=None, primary_key=True)
    circle_id: int = Field(foreign_key="study_circles.id", index=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    role: str = Field(default="member", max_length=10)  # owner / member
    joined_at: datetime = Field(default_factory=datetime.utcnow)


class CircleSessionParticipant(SQLModel, table=True):
    __tablename__ = "circle_session_participants"
    __table_args__ = (UniqueConstraint("session_id", "user_id"),)

    id: int | None = Field(default=None, primary_key=True)
    session_id: str = Field(
        sa_column=Column(UUID(as_uuid=False), sa.ForeignKey("quiz_sessions.id"), index=True),
    )
    user_id: int = Field(foreign_key="users.id", index=True)
    status: str = Field(default="in_progress", max_length=20)  # in_progress | grading | completed
    accuracy: float | None = Field(default=None)
    total_score: float | None = Field(default=None)
    started_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    completed_at: datetime | None = Field(default=None)
