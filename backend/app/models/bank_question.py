"""Bank question model — structured exam questions for few-shot retrieval."""

from datetime import datetime, timezone
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, Column, Text
from sqlmodel import Field, SQLModel


class BankQuestion(SQLModel, table=True):
    __tablename__ = "bank_questions"

    id: int | None = Field(default=None, primary_key=True)
    knowledge_base_id: int = Field(foreign_key="knowledge_bases.id", index=True)
    question_type: str = Field(max_length=30)
    subject: str | None = Field(default=None, max_length=100)
    difficulty: str | None = Field(default=None, max_length=20)
    knowledge_points: Any = Field(default=None, sa_column=Column(JSON))
    content: str = Field(sa_column=Column(Text))
    answer: str = Field(sa_column=Column(Text))
    analysis: str | None = Field(default=None, sa_column=Column(Text))
    source_info: Any = Field(default=None, sa_column=Column(JSON))
    embedding: Any = Field(default=None, sa_column=Column(Vector()))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
