"""文档模型"""

from datetime import UTC, datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Enum as SQLAEnum
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from backend.app.models.course import Course
    from backend.app.models.knowledge_chunk import KnowledgeChunk


class FileType(str, Enum):
    """文件类型枚举"""

    PDF = "PDF"
    WORD = "WORD"
    MARKDOWN = "MARKDOWN"
    PPT = "PPT"


class DocumentStatus(str, Enum):
    """文档处理状态枚举"""

    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


def utc_now_naive() -> datetime:
    """获取当前 UTC 时间（naive，无时区信息）"""
    return datetime.now(UTC).replace(tzinfo=None)


class Document(SQLModel, table=True):
    """文档模型"""

    __tablename__ = "documents"

    id: int | None = Field(default=None, primary_key=True)
    filename: str = Field(max_length=255)
    original_filename: str = Field(max_length=255)
    file_type: FileType = Field(
        sa_type=SQLAEnum(
            FileType,
            values_callable=lambda obj: [e.value for e in obj],
            native_enum=False,
        )
    )
    file_path: str = Field(max_length=500)
    course_id: int = Field(foreign_key="courses.id", index=True)
    subject: str | None = Field(default=None, max_length=100)
    chapter_id: int | None = Field(default=None, index=True)
    status: DocumentStatus = Field(
        default=DocumentStatus.PROCESSING,
        sa_type=SQLAEnum(
            DocumentStatus,
            values_callable=lambda obj: [e.value for e in obj],
            native_enum=False,
        ),
    )
    error_message: str | None = Field(default=None)
    chunk_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=utc_now_naive)
    updated_at: datetime = Field(default_factory=utc_now_naive)

    # 关系
    course: "Course" = Relationship(back_populates="documents")
    chunks: list["KnowledgeChunk"] = Relationship(back_populates="document")
