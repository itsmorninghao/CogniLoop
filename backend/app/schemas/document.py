"""文档相关的请求/响应模型"""

from datetime import datetime

from pydantic import BaseModel, Field

from backend.app.models.document import DocumentStatus, FileType


class DocumentUploadRequest(BaseModel):
    """文档上传请求（表单字段）"""

    course_id: int
    subject: str | None = None
    chapter_id: int | None = None


class DocumentResponse(BaseModel):
    """文档响应"""

    id: int
    filename: str
    original_filename: str
    file_type: FileType
    course_id: int
    subject: str | None
    chapter_id: int | None
    status: DocumentStatus
    error_message: str | None
    chunk_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    """文档列表响应"""

    documents: list[DocumentResponse]
    total: int


class ChunkResponse(BaseModel):
    """知识块响应"""

    id: int
    content: str
    chunk_index: int
    subject: str | None
    chapter_id: int | None

    model_config = {"from_attributes": True}


class ChunkListResponse(BaseModel):
    """知识块列表响应"""

    chunks: list[ChunkResponse]
    total: int


class RetrievalRequest(BaseModel):
    """检索请求"""

    query: str = Field(..., min_length=1)
    course_id: int
    subject: str | None = None
    chapter_id: int | None = None
    top_k: int = Field(default=10, ge=1, le=50)
