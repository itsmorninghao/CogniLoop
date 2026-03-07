"""Pydantic schemas for QuizPreset CRUD."""

from datetime import datetime
from pydantic import BaseModel, Field


class QuizPresetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    title: str | None = None
    difficulty: str = "medium"
    question_counts: dict[str, int] = {}
    subject: str | None = None
    custom_prompt: str | None = None


class QuizPresetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    title: str | None = None
    difficulty: str | None = None
    question_counts: dict[str, int] | None = None
    subject: str | None = None
    custom_prompt: str | None = None


class QuizPresetResponse(BaseModel):
    id: int
    name: str
    title: str | None
    difficulty: str
    question_counts: dict[str, int]
    subject: str | None
    custom_prompt: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
