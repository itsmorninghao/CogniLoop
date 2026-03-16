"""Exam template schemas."""

from datetime import datetime

from pydantic import BaseModel, Field

# Request schemas

class QuestionCreate(BaseModel):
    content: str = Field(min_length=1)
    answer: str | None = None
    analysis: str | None = None
    difficulty: str | None = None
    knowledge_points: list[str] | None = None
    source_label: str | None = None


class SlotCreate(BaseModel):
    position: int = Field(ge=1)
    question_type: str = Field(min_length=1, max_length=30)
    label: str | None = None
    difficulty_hint: str | None = None
    questions: list[QuestionCreate] = []


class ExamTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    subject: str | None = None
    slots: list[SlotCreate] = []


class ExamTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    subject: str | None = None


class QuestionUpdate(BaseModel):
    content: str | None = None
    answer: str | None = None
    analysis: str | None = None
    difficulty: str | None = None
    knowledge_points: list[str] | None = None
    source_label: str | None = None


class SlotsReplaceRequest(BaseModel):
    slots: list[SlotCreate]


class ConflictCheckRequest(BaseModel):
    template_ids: list[int] = Field(min_length=1)
    selected_slot_positions: list[int] = []


# Response schemas

class QuestionResponse(BaseModel):
    id: int
    slot_id: int
    content: str
    answer: str | None = None
    analysis: str | None = None
    difficulty: str | None = None
    knowledge_points: list[str] | None = None
    source_label: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SlotResponse(BaseModel):
    id: int
    template_id: int
    position: int
    question_type: str
    label: str | None = None
    difficulty_hint: str | None = None
    questions: list[QuestionResponse] = []

    model_config = {"from_attributes": True}


class ExamTemplateResponse(BaseModel):
    id: int
    user_id: int
    name: str
    description: str | None = None
    subject: str | None = None
    is_public: bool
    source_template_id: int | None = None
    created_at: datetime
    updated_at: datetime
    slots: list[SlotResponse] = []

    model_config = {"from_attributes": True}


class ExamTemplateListItem(BaseModel):
    id: int
    name: str
    description: str | None = None
    subject: str | None = None
    is_public: bool
    slot_count: int = 0
    question_count: int = 0
    created_at: datetime
    updated_at: datetime


class ConflictDetail(BaseModel):
    position: int
    conflicting_types: dict[int, str]  # template_id -> question_type


class ConflictCheckResponse(BaseModel):
    conflicts: list[ConflictDetail]


class PlazaTemplateItem(BaseModel):
    id: int
    name: str
    description: str | None = None
    subject: str | None = None
    slot_count: int = 0
    question_count: int = 0
    creator_username: str
    creator_full_name: str
    creator_avatar_url: str | None = None
    created_at: datetime


class TemplatePlazaPage(BaseModel):
    items: list[PlazaTemplateItem]
    total: int
