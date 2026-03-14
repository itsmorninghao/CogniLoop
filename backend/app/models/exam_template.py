"""Exam template models — structured exam paper templates for Pro mode."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, Column, Text, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


class ExamTemplate(SQLModel, table=True):
    __tablename__ = "exam_templates"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    name: str = Field(max_length=200)
    description: str | None = Field(default=None, sa_column=Column(Text))
    subject: str | None = Field(default=None, max_length=100)
    is_public: bool = Field(default=False)
    source_template_id: int | None = Field(default=None, foreign_key="exam_templates.id")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )

    slots: list["ExamTemplateSlot"] = Relationship(back_populates="template")


class ExamTemplateSlot(SQLModel, table=True):
    __tablename__ = "exam_template_slots"
    __table_args__ = (UniqueConstraint("template_id", "position"),)

    id: int | None = Field(default=None, primary_key=True)
    template_id: int = Field(foreign_key="exam_templates.id", index=True)
    position: int
    question_type: str = Field(max_length=30)
    label: str | None = Field(default=None, max_length=200)
    difficulty_hint: str | None = Field(default=None, max_length=20)

    template: ExamTemplate = Relationship(back_populates="slots")
    questions: list["ExamTemplateSlotQuestion"] = Relationship(back_populates="slot")


class ExamTemplateSlotQuestion(SQLModel, table=True):
    __tablename__ = "exam_template_slot_questions"

    id: int | None = Field(default=None, primary_key=True)
    slot_id: int = Field(foreign_key="exam_template_slots.id", index=True)
    content: str = Field(sa_column=Column(Text))
    answer: str | None = Field(default=None, sa_column=Column(Text))
    analysis: str | None = Field(default=None, sa_column=Column(Text))
    difficulty: str | None = Field(default=None, max_length=20)
    knowledge_points: Any = Field(default=None, sa_column=Column(JSON))
    source_label: str | None = Field(default=None, max_length=200)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )

    slot: ExamTemplateSlot = Relationship(back_populates="questions")
