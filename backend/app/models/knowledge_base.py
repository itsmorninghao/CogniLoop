"""Knowledge base models — folder hierarchy, documents, chunks, acquisitions."""

from datetime import UTC, datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class KnowledgeBase(SQLModel, table=True):
    __tablename__ = "knowledge_bases"

    id: int | None = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="users.id", index=True)
    name: str = Field(max_length=200)
    description: str | None = Field(default=None)
    tags: Any = Field(default=[], sa_column=Column(JSON, server_default="[]"))
    kb_type: str = Field(default="document", max_length=20)  # document
    share_code: str | None = Field(default=None, max_length=12, unique=True)
    shared_to_plaza_at: datetime | None = Field(default=None)
    document_count: int = Field(default=0)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC).replace(tzinfo=None)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC).replace(tzinfo=None)
    )


class KBFolder(SQLModel, table=True):
    __tablename__ = "kb_folders"

    id: int | None = Field(default=None, primary_key=True)
    knowledge_base_id: int = Field(foreign_key="knowledge_bases.id", index=True)
    parent_folder_id: int | None = Field(default=None, foreign_key="kb_folders.id")
    name: str = Field(max_length=200)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC).replace(tzinfo=None)
    )


class KBDocument(SQLModel, table=True):
    __tablename__ = "kb_documents"

    id: int | None = Field(default=None, primary_key=True)
    knowledge_base_id: int = Field(foreign_key="knowledge_bases.id", index=True)
    folder_id: int | None = Field(default=None, foreign_key="kb_folders.id")
    filename: str = Field(max_length=255)
    original_filename: str = Field(max_length=255)
    file_type: str = Field(max_length=20)  # PDF / WORD / MARKDOWN / PPT
    file_path: str = Field(max_length=500)
    status: str = Field(default="processing", max_length=20)
    error_message: str | None = Field(default=None)
    chunk_count: int = Field(default=0)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC).replace(tzinfo=None)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC).replace(tzinfo=None)
    )


class KBChunk(SQLModel, table=True):
    __tablename__ = "kb_chunks"

    id: int | None = Field(default=None, primary_key=True)
    document_id: int = Field(foreign_key="kb_documents.id", index=True)
    knowledge_base_id: int = Field(foreign_key="knowledge_bases.id", index=True)
    chunk_index: int = Field(default=0)

    parent_chunk_id: int | None = Field(
        default=None, foreign_key="kb_chunks.id", index=True
    )
    chunk_level: str = Field(default="child", max_length=10)  # "parent" | "child"

    content: str

    embedding: Any = Field(default=None, sa_column=Column(Vector()))

    document_title: str | None = Field(default=None, max_length=500)
    section_path: str | None = Field(default=None, max_length=1000, index=True)
    heading: str | None = Field(default=None, max_length=500)

    metadata_extra: Any = Field(
        default={}, sa_column=Column("metadata", JSON, server_default="{}")
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC).replace(tzinfo=None)
    )


class KBAcquisition(SQLModel, table=True):
    __tablename__ = "kb_acquisitions"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    knowledge_base_id: int = Field(foreign_key="knowledge_bases.id", index=True)
    acquired_via: str = Field(max_length=20)  # share_code / plaza
    acquired_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC).replace(tzinfo=None)
    )


class KBDocumentOutline(SQLModel, table=True):
    """LLM-extracted knowledge structure of a document — foundation for course generation."""

    __tablename__ = "kb_document_outlines"

    id: int | None = Field(default=None, primary_key=True)
    document_id: int = Field(foreign_key="kb_documents.id", unique=True, index=True)
    knowledge_base_id: int = Field(foreign_key="knowledge_bases.id", index=True)

    # JSON structure:
    # {
    #   "title": "文档标题",
    #   "chapters": [
    #     {
    #       "title": "第一章 力学基础", "level": 1,
    #       "key_concepts": ["牛顿定律", "动量"],
    #       "summary": "本章介绍...",
    #       "children": [...]
    #     }
    #   ],
    #   "all_concepts": ["..."],       # flat deduped list of all concepts
    #   "subject_tags": ["物理", "力学"],
    #   "difficulty_level": "beginner|intermediate|advanced"
    # }
    outline: Any = Field(default={}, sa_column=Column(JSON, server_default="{}"))

    extracted_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC).replace(tzinfo=None)
    )
    model_used: str | None = Field(default=None, max_length=100)
