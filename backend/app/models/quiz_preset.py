"""QuizPreset model — saved quiz configuration presets."""

from datetime import datetime
from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class QuizPreset(SQLModel, table=True):
    __tablename__ = "quiz_presets"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    name: str = Field(max_length=50)
    title: str | None = Field(default=None)
    difficulty: str = Field(default="medium")
    question_counts: dict = Field(sa_column=Column(JSON), default_factory=dict)
    subject: str | None = Field(default=None)
    custom_prompt: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
