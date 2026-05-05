"""Knowledge-chat schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class KnowledgeChatSessionCreateRequest(BaseModel):
    knowledge_base_id: int
    doc_ids: list[int] = Field(default_factory=list)


class KnowledgeChatMessageCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=8000)


class KnowledgeChatScopeDocument(BaseModel):
    id: int
    original_filename: str
    file_type: str


class KnowledgeChatCitation(BaseModel):
    chunk_id: int
    document_id: int
    document_name: str
    heading: str | None = None
    section_path: str | None = None
    snippet: str
    similarity: float | None = None


class KnowledgeChatMessageResponse(BaseModel):
    id: int
    session_id: str
    role: str
    content: str
    status: str
    citations: list[KnowledgeChatCitation] = Field(default_factory=list)
    trace: dict | None = None
    retrieval_query: str | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class KnowledgeChatSessionListItem(BaseModel):
    id: str
    title: str
    knowledge_base_id: int
    knowledge_base_name: str
    status: str
    message_count: int
    selected_doc_count: int
    last_message_at: datetime
    created_at: datetime
    updated_at: datetime


class KnowledgeChatSessionResponse(BaseModel):
    id: str
    user_id: int
    title: str
    knowledge_base_id: int
    knowledge_base_name: str
    status: str
    scope_doc_ids: list[int] = Field(default_factory=list)
    selected_documents: list[KnowledgeChatScopeDocument] = Field(default_factory=list)
    message_count: int = 0
    last_message_at: datetime
    created_at: datetime
    updated_at: datetime
    messages: list[KnowledgeChatMessageResponse] | None = None


class KnowledgeChatSendMessageResponse(BaseModel):
    session: KnowledgeChatSessionResponse
    user_message: KnowledgeChatMessageResponse
    assistant_message: KnowledgeChatMessageResponse
