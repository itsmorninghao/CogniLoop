"""知识块模型"""

from typing import TYPE_CHECKING, Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column
from sqlmodel import Field, Relationship, SQLModel

from backend.app.core.config import settings

if TYPE_CHECKING:
    from backend.app.models.document import Document


class KnowledgeChunk(SQLModel, table=True):
    """知识块模型"""

    __tablename__ = "knowledge_chunks"

    id: int | None = Field(default=None, primary_key=True)
    content: str = Field(sa_column_kwargs={"nullable": False})
    embedding: Any = Field(
        default=None,
        sa_column=Column(Vector(settings.embedding_dims)),
    )
    document_id: int = Field(foreign_key="documents.id", index=True)
    course_id: int = Field(index=True)  # 冗余字段，便于过滤
    chunk_index: int = Field(default=0)
    subject: str | None = Field(default=None, max_length=100)
    chapter_id: int | None = Field(default=None, index=True)

    # 关系
    document: "Document" = Relationship(back_populates="chunks")
