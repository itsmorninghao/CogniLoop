"""Notification model."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class Notification(SQLModel, table=True):
    __tablename__ = "notifications"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    type: str = Field(max_length=30)
    title: str = Field(max_length=200)
    content: str | None = Field(default=None)
    category: str = Field(default="info", max_length=20)
    is_read: bool = Field(default=False)
    action_url: str | None = Field(default=None, max_length=500)
    sender_id: int | None = Field(default=None, foreign_key="users.id")
    metadata_extra: Any = Field(default={}, sa_column=Column("metadata", JSON, server_default="{}"))
    created_at: datetime = Field(default_factory=datetime.utcnow)
