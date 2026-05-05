"""State for the knowledge-chat LangGraph."""

from __future__ import annotations

from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class KnowledgeChatState(TypedDict, total=False):
    session_id: str
    user_id: int
    knowledge_base_id: int
    scope_doc_ids: list[int]
    user_message_id: int
    assistant_message_id: int
    # "accurate" (default) or "fast" — fast skips LLM query rewrite and LLM rerank.
    mode: str

    latest_user_message: str
    messages: Annotated[list[BaseMessage], add_messages]

    retrieval_query: str
    query_source: str
    retrieved_chunks: list[dict]
    citations: list[dict]
    answer: str
    execution_trace: dict

    current_node: str
    progress: float
    status_message: str
    errors: list[str]
