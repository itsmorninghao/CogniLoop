"""Circle profile model — aggregated learning profile for a study circle."""

from datetime import datetime, timezone

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class CircleProfile(SQLModel, table=True):
    __tablename__ = "circle_profiles"

    id: int | None = Field(default=None, primary_key=True)
    circle_id: int = Field(foreign_key="study_circles.id", unique=True, index=True)
    profile_data: dict = Field(default_factory=dict, sa_column=Column(JSONB, nullable=False, server_default="{}"))
    member_count: int = Field(default=0)
    last_calculated_at: datetime | None = Field(default=None)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
