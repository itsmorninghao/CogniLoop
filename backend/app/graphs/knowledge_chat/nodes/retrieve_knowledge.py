"""Retrieve scoped knowledge chunks for the current chat turn."""

from __future__ import annotations

from backend.app.core.database import async_session_factory
from backend.app.core.sse import SSEManager, emit_node_complete, emit_node_start
from backend.app.graphs.knowledge_chat.state import KnowledgeChatState
from backend.app.graphs.knowledge_chat.trace import (
    set_retrieval_details,
    set_rerank_details,
    set_step_state,
)
from backend.app.rag.retriever import retrieve_chunks_with_debug


def _build_citations(chunks: list[dict], limit: int = 5) -> list[dict]:
    citations: list[dict] = []
    for chunk in chunks[:limit]:
        snippet = chunk.get("content", "").strip().replace("\n", " ")
        citations.append(
            {
                "chunk_id": chunk["id"],
                "document_id": chunk["document_id"],
                "document_name": chunk.get("original_filename")
                or chunk.get("document_title")
                or f"文档 {chunk['document_id']}",
                "heading": chunk.get("heading"),
                "section_path": chunk.get("section_path"),
                "snippet": snippet[:240],
                "similarity": round(float(chunk.get("similarity", 0.0)), 4),
            }
        )
    return citations


async def retrieve_knowledge(state: KnowledgeChatState) -> dict:
    session_id = state["session_id"]
    query = state.get("retrieval_query", "").strip()
    knowledge_base_id = state["knowledge_base_id"]
    scope_doc_ids = state.get("scope_doc_ids", [])
    assistant_message_id = state["assistant_message_id"]
    execution_trace = set_step_state(
        state.get("execution_trace"),
        assistant_message_id,
        "retrieve_knowledge",
        status="active",
        message="正在检索相关知识片段...",
    )

    await emit_node_start(
        session_id,
        "retrieve_knowledge",
        "正在检索相关知识片段...",
        assistant_message_id=assistant_message_id,
    )

    async with async_session_factory() as session:
        chunks, debug = await retrieve_chunks_with_debug(
            query,
            session,
            knowledge_base_ids=[knowledge_base_id],
            document_ids=scope_doc_ids,
            top_k=6,
            use_hybrid=True,
            use_rerank=state.get("mode") != "fast",
        )

    citations = _build_citations(chunks)
    execution_trace = set_retrieval_details(
        execution_trace,
        assistant_message_id,
        retrieval_query=query,
        vector_result_count=debug.get("vector_result_count", 0),
        keyword_result_count=debug.get("keyword_result_count", 0),
        hybrid_result_count=debug.get("hybrid_result_count", 0),
        expanded_candidate_count=debug.get("expanded_candidate_count", 0),
        retrieval_results=debug.get("retrieval_preview", []),
    )
    await SSEManager.get_instance().send_event(
        session_id,
        "retrieval_results",
        {
            "assistant_message_id": assistant_message_id,
            "retrieval_query": query,
            "vector_result_count": debug.get("vector_result_count", 0),
            "keyword_result_count": debug.get("keyword_result_count", 0),
            "hybrid_result_count": debug.get("hybrid_result_count", 0),
            "expanded_candidate_count": debug.get("expanded_candidate_count", 0),
            "results": debug.get("retrieval_preview", []),
        },
    )
    if debug.get("rerank_applied"):
        execution_trace = set_rerank_details(
            execution_trace,
            assistant_message_id,
            rerank_results=debug.get("rerank_preview", []),
        )
        await SSEManager.get_instance().send_event(
            session_id,
            "rerank_results",
            {
                "assistant_message_id": assistant_message_id,
                "retrieval_query": query,
                "results": debug.get("rerank_preview", []),
            },
        )
    await SSEManager.get_instance().send_event(
        session_id,
        "citations",
        {"citations": citations, "assistant_message_id": assistant_message_id},
    )
    execution_trace = set_step_state(
        execution_trace,
        assistant_message_id,
        "retrieve_knowledge",
        status="complete",
        message=f"已检索到 {len(chunks)} 个相关知识片段",
    )

    top_previews = [
        {
            "document_name": item["document_name"],
            "heading": item["heading"],
            "snippet": item["snippet"],
            "similarity": item["similarity"],
        }
        for item in citations[:3]
    ]
    await emit_node_complete(
        session_id,
        "retrieve_knowledge",
        f"已检索到 {len(chunks)} 个相关知识片段",
        assistant_message_id=assistant_message_id,
        input_summary={
            "retrieval_query": query,
            "knowledge_base_id": knowledge_base_id,
            "scope_doc_ids": scope_doc_ids,
        },
        output_summary={
            "chunk_count": len(chunks),
            "top_chunks": top_previews,
            "vector_result_count": debug.get("vector_result_count", 0),
            "keyword_result_count": debug.get("keyword_result_count", 0),
            "expanded_candidate_count": debug.get("expanded_candidate_count", 0),
            "rerank_applied": debug.get("rerank_applied", False),
            "rerank_top_chunks": debug.get("rerank_preview", [])[:3],
        },
        progress=0.35,
    )

    return {
        "retrieved_chunks": chunks,
        "citations": citations,
        "execution_trace": execution_trace,
        "current_node": "retrieve_knowledge",
        "progress": 0.35,
        "status_message": f"已检索到 {len(chunks)} 个相关知识片段",
    }
