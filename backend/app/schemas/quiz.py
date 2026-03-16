"""Quiz session schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class QuizCreateRequest(BaseModel):
    """Create a new quiz session."""

    mode: str = Field(
        default="self_test", pattern="^(self_test|challenge|circle|plaza)$"
    )
    generation_mode: str = Field(default="standard", pattern="^(standard|pro)$")
    title: str | None = None
    knowledge_scope: dict = Field(default_factory=dict)  # {kb_ids, folder_ids, doc_ids}
    quiz_config: dict = Field(
        default_factory=lambda: {
            "question_types": ["single_choice", "fill_blank", "short_answer"],
            "count": 5,
            "difficulty": "medium",
        }
    )
    solver_id: int | None = None
    circle_id: int | None = None


class QuizResponseSubmit(BaseModel):
    """Submit an answer to a question."""

    question_id: int
    user_answer: str
    time_spent: int | None = None  # seconds


class QuizSubmitAllRequest(BaseModel):
    """Submit all answers at once."""

    responses: list[QuizResponseSubmit]


def _normalize_options(options: Any) -> dict | None:
    """Normalize LLM-generated options to dict format.

    LLMs sometimes return options as a list ["A. foo", "B. bar"] instead of
    the expected dict {"A": "foo", "B": "bar"}. This handles both formats.
    """
    if options is None:
        return None
    if isinstance(options, dict):
        return options
    if isinstance(options, list):
        keys = "ABCDEFGH"
        result: dict[str, str] = {}
        for i, item in enumerate(options):
            if i >= len(keys):
                break
            text = str(item)
            # Handle "A. xxx", "A、xxx", "A）xxx", "A) xxx" formats
            if len(text) >= 3 and text[1] in (".", "、", "）", ")"):
                result[text[0].upper()] = text[2:].strip()
            else:
                result[keys[i]] = text
        return result if result else None
    return None


class QuestionResponse(BaseModel):
    id: int
    question_index: int
    question_type: str
    content: str
    options: dict | None = None
    score: float
    # Correct answer and analysis are hidden during quiz, shown after grading
    correct_answer: str | None = None
    analysis: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("options", mode="before")
    @classmethod
    def coerce_options(cls, v: Any) -> dict | None:
        return _normalize_options(v)


class QuizResponseResult(BaseModel):
    id: int
    question_id: int
    user_answer: str | None = None
    is_correct: bool | None = None
    score: float | None = None
    ai_feedback: str | None = None
    time_spent: int | None = None

    model_config = {"from_attributes": True}


class QuizSessionResponse(BaseModel):
    id: str
    creator_id: int
    solver_id: int | None = None
    circle_id: int | None = None
    mode: str
    generation_mode: str
    title: str | None = None
    knowledge_scope: dict | None = None
    quiz_config: dict | None = None
    status: str
    total_score: float | None = None
    accuracy: float | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    share_code: str | None = None
    shared_to_plaza_at: datetime | None = None
    # Included when fetching full details
    questions: list[QuestionResponse] | None = None
    responses: list[QuizResponseResult] | None = None

    model_config = {"from_attributes": True}


class QuizSessionListItem(BaseModel):
    id: str
    mode: str
    title: str | None = None
    status: str
    total_score: float | None = None
    accuracy: float | None = None
    created_at: datetime
    circle_id: int | None = None
    share_code: str | None = None
    shared_to_plaza_at: datetime | None = None
    question_count: int = 0
    creator_full_name: str | None = None
    creator_username: str | None = None
    acquired_at: datetime | None = None

    model_config = {"from_attributes": True}


class QuizPlazaItem(BaseModel):
    id: str
    title: str | None = None
    mode: str
    question_count: int
    accuracy: float | None = None
    creator_full_name: str
    creator_username: str
    creator_avatar_url: str | None = None
    acquire_count: int
    shared_to_plaza_at: datetime
    share_code: str | None = None


class QuizPlazaPage(BaseModel):
    items: list[QuizPlazaItem]
    total: int


class AcquireQuizRequest(BaseModel):
    share_code: str
