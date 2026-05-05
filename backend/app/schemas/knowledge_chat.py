"""Knowledge-chat schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Server-side cap on the number of documents that can be bound to a single
# chat session. Keeps the WHERE id IN (...) query and the LangGraph state
# reasonably bounded even if the client tries to bind every doc in a huge KB.
MAX_SCOPE_DOC_IDS = 500


class KnowledgeChatSessionCreateRequest(BaseModel):
    knowledge_base_id: int
    doc_ids: list[int] = Field(default_factory=list, max_length=MAX_SCOPE_DOC_IDS)


KnowledgeChatMode = Literal["fast", "accurate"]


class KnowledgeChatMessageCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=8000)
    # "accurate" = full pipeline (LLM query rewrite + LLM rerank).
    # "fast"     = skip both, use raw question for retrieval and skip rerank.
    mode: KnowledgeChatMode = "accurate"


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


# --- Execution trace (typed; was previously `dict`) ---------------------------

TraceStepStatus = Literal["pending", "active", "complete", "error"]
TraceStepKey = Literal["rewrite_query", "retrieve_knowledge", "generate_answer"]


class KnowledgeChatTraceStep(BaseModel):
    status: TraceStepStatus = "pending"
    message: str | None = None


class KnowledgeChatTraceSteps(BaseModel):
    rewrite_query: KnowledgeChatTraceStep = Field(default_factory=KnowledgeChatTraceStep)
    retrieve_knowledge: KnowledgeChatTraceStep = Field(default_factory=KnowledgeChatTraceStep)
    generate_answer: KnowledgeChatTraceStep = Field(default_factory=KnowledgeChatTraceStep)


class KnowledgeChatTraceChunk(BaseModel):
    # Trace previews include heterogeneous fields depending on retrieval stage;
    # accept arbitrary extras so the API stays forward-compatible while still
    # documenting the common shape for the frontend.
    model_config = ConfigDict(extra="allow")

    chunk_id: int | None = None
    document_id: int | None = None
    document_name: str | None = None
    heading: str | None = None
    section_path: str | None = None
    snippet: str | None = None
    similarity: float | None = None
    rerank_score: float | None = None


class KnowledgeChatExecutionTrace(BaseModel):
    model_config = ConfigDict(extra="allow")

    assistant_message_id: int
    current_step: TraceStepKey | None = None
    status_message: str | None = None
    steps: KnowledgeChatTraceSteps = Field(default_factory=KnowledgeChatTraceSteps)
    rewrite_query: str | None = None
    query_source: str | None = None
    history_turns_used: int = 0
    retrieval_query: str | None = None
    vector_result_count: int = 0
    keyword_result_count: int = 0
    hybrid_result_count: int = 0
    expanded_candidate_count: int = 0
    retrieval_results: list[KnowledgeChatTraceChunk] = Field(default_factory=list)
    rerank_results: list[KnowledgeChatTraceChunk] = Field(default_factory=list)


class KnowledgeChatMessageResponse(BaseModel):
    id: int
    session_id: str
    role: str
    content: str
    status: str
    citations: list[KnowledgeChatCitation] = Field(default_factory=list)
    trace: KnowledgeChatExecutionTrace | None = None
    retrieval_query: str | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


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
    has_more_messages: bool = False


class KnowledgeChatSendMessageResponse(BaseModel):
    session: KnowledgeChatSessionResponse
    user_message: KnowledgeChatMessageResponse
    assistant_message: KnowledgeChatMessageResponse
