"""
Node 2: RAG Retriever — retrieves relevant document chunks using the enhanced RAG pipeline.
"""

from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import async_session_factory
from backend.app.graphs.quiz_generation.state import QuizGenState
from backend.app.rag.retriever import retrieve_chunks

logger = logging.getLogger(__name__)


async def _build_rag_query(
    context_parts: list[str], fallback: str, session: AsyncSession
) -> tuple[str, str]:
    """Use LLM to generate a retrieval query from context. Returns (query, prompt_used); fallback on any error."""
    from backend.app.core.llm import get_chat_model

    prompt = (
        "根据以下出题意图，生成一段用于知识库向量检索的查询语句。\n"
        "要求：30字以内，包含核心知识关键词，直接输出查询语句，不要有任何解释。\n\n"
        + "\n".join(context_parts)
    )
    try:
        llm = await get_chat_model(session, temperature=0)
        resp = await llm.ainvoke([HumanMessage(content=prompt)])
        query = str(resp.content).strip()[:200]
        return (query if query else fallback), prompt
    except Exception as e:
        logger.debug("_build_rag_query failed: %s", e)
        return fallback, ""


async def rag_retriever(state: QuizGenState) -> dict:
    """
    Retrieve relevant document chunks for quiz generation.

    Uses hybrid search (vector + keyword) with optional LLM reranking.
    Builds a query from the quiz config to find the most relevant content.
    """
    from backend.app.core.sse import emit_node_complete, emit_node_start

    session_id = state.get("session_id", "")
    await emit_node_start(session_id, "rag_retriever", "正在检索相关知识片段...")

    quiz_config = state.get("quiz_config", {})
    resolved_kb_ids = state.get("resolved_kb_ids", [])
    resolved_doc_ids = state.get("resolved_doc_ids", [])

    # Build retrieval query based on quiz config
    topics = quiz_config.get("topics", [])
    difficulty = quiz_config.get("difficulty", "medium")
    question_count = quiz_config.get("count", 5)
    title = quiz_config.get("title") or ""
    custom_prompt = quiz_config.get("custom_prompt") or ""
    subject = quiz_config.get("subject") or difficulty

    # More chunks for more questions, with some headroom
    top_k = max(question_count * 3, 10)

    if topics:
        # Original topics-based logic — unchanged
        query = " ".join(topics)
        query_prompt = ""
        query_source = "topics"
    else:
        context_parts: list[str] = []
        if title:
            context_parts.append(f"测验主题：{title}")
        if subject and subject != difficulty:
            context_parts.append(f"学科：{subject}")
        if custom_prompt:
            context_parts.append(f"出题要求：{custom_prompt}")

        fallback = f"核心知识点 重要概念 关键内容 {difficulty}难度"

        if context_parts:
            async with async_session_factory() as session:
                query, query_prompt = await _build_rag_query(context_parts, fallback, session)
            query_source = "llm"
        else:
            query = fallback
            query_prompt = ""
            query_source = "fallback"

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

    logger.info("Retrieved %d chunks for quiz generation (query_source=%s)", len(chunks), query_source)

    # Build top chunk previews for traceability
    top_previews = [
        {
            "content": c["content"][:120] + "..."
            if len(c["content"]) > 120
            else c["content"],
            "similarity": round(c.get("similarity", 0), 3),
        }
        for c in chunks[:5]
    ]

    msg = f"已检索到 {len(chunks)} 个相关知识片段"
    input_sum: dict = {
        "query": query[:200],
        "query_source": query_source,
        "kb_ids": resolved_kb_ids,
        "top_k": top_k,
    }
    if query_prompt:
        input_sum["query_prompt"] = query_prompt[:2000]
    await emit_node_complete(
        session_id,
        "rag_retriever",
        msg,
        input_summary=input_sum,
        output_summary={"chunk_count": len(chunks), "top_chunks": top_previews},
        progress=0.3,
    )

    return {
        "rag_chunks": chunks,
        "current_node": "rag_retriever",
        "progress": 0.3,
        "status_message": msg,
    }
