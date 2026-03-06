"""
Node 2: RAG Retriever — retrieves relevant document chunks using the enhanced RAG pipeline.
"""

from __future__ import annotations

import logging

from backend.app.core.database import async_session_factory
from backend.app.graphs.quiz_generation.state import QuizGenState
from backend.app.rag.retriever import retrieve_chunks

logger = logging.getLogger(__name__)


async def rag_retriever(state: QuizGenState) -> dict:
    """
    Retrieve relevant document chunks for quiz generation.

    Uses hybrid search (vector + keyword) with optional LLM reranking.
    Builds a query from the quiz config to find the most relevant content.
    """
    from backend.app.core.sse import emit_node_start, emit_node_complete

    session_id = state.get("session_id", "")
    await emit_node_start(session_id, "rag_retriever", "正在检索相关知识片段...")

    quiz_config = state.get("quiz_config", {})
    resolved_kb_ids = state.get("resolved_kb_ids", [])
    resolved_doc_ids = state.get("resolved_doc_ids", [])

    # Build retrieval query based on quiz config
    topics = quiz_config.get("topics", [])
    difficulty = quiz_config.get("difficulty", "medium")
    question_count = quiz_config.get("count", 5)

    # More chunks for more questions, with some headroom
    top_k = max(question_count * 3, 10)

    # Build query: combine topic keywords if provided, otherwise use a general query
    if topics:
        query = " ".join(topics)
    else:
        query = f"核心知识点 重要概念 关键内容 {difficulty}难度"

    async with async_session_factory() as session:
        chunks = await retrieve_chunks(
            query,
            session,
            knowledge_base_ids=resolved_kb_ids if resolved_kb_ids else None,
            document_ids=resolved_doc_ids if resolved_doc_ids else None,
            top_k=top_k,
            use_hybrid=True,
            use_rerank=True,
        )

    logger.info("Retrieved %d chunks for quiz generation", len(chunks))

    # Build top chunk previews for traceability
    top_previews = [
        {
            "content": c["content"][:120] + "..." if len(c["content"]) > 120 else c["content"],
            "similarity": round(c.get("similarity", 0), 3),
        }
        for c in chunks[:5]
    ]

    msg = f"已检索到 {len(chunks)} 个相关知识片段"
    await emit_node_complete(
        session_id, "rag_retriever", msg,
        input_summary={"query": query[:200], "kb_ids": resolved_kb_ids, "top_k": top_k},
        output_summary={"chunk_count": len(chunks), "top_chunks": top_previews},
        progress=0.3,
    )

    return {
        "rag_chunks": chunks,
        "current_node": "rag_retriever",
        "progress": 0.3,
        "status_message": msg,
    }
