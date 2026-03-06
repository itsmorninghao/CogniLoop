"""User profile and profile share models."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class UserProfile(SQLModel, table=True):
    __tablename__ = "user_profiles"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", unique=True, index=True)
    profile_data: Any = Field(default={}, sa_column=Column(JSON, server_default="{}"))
    profile_version: int = Field(default=1)
    last_calculated_at: datetime | None = Field(default=None)
    next_recalculate_after: datetime | None = Field(default=None)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )


class ProfileShare(SQLModel, table=True):
    __tablename__ = "profile_shares"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    share_type: str = Field(max_length=20)
    share_token: str | None = Field(default=None, max_length=64, unique=True)
    expires_at: datetime | None = Field(default=None)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
