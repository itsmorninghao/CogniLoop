"""RAG Retriever node for Pro generation — retrieves knowledge chunks from document KBs."""

import logging

from backend.app.core.database import async_session_factory
from backend.app.core.sse import emit_node_complete, emit_node_start
from backend.app.graphs.pro_generation.state import ProQuizState
from backend.app.rag.retriever import retrieve_chunks

logger = logging.getLogger(__name__)


async def rag_retriever_node(state: ProQuizState) -> dict:
    """Retrieve relevant document chunks from document-type KBs for knowledge context."""
    session_id = state.get("session_id", "")
    await emit_node_start(session_id, "rag_retriever", "正在检索文档知识...")

    document_kb_ids = state.get("document_kb_ids", [])
    doc_ids = state.get("doc_ids", [])

    if not document_kb_ids and not doc_ids:
        await emit_node_complete(
            session_id,
            "rag_retriever",
            "未选择文档知识库，跳过检索",
            output_summary={"chunk_count": 0},
            progress=0.08,
        )
        return {"rag_chunks": []}

    subject = state.get("subject_scope", "综合")
    quiz_config = state.get("quiz_config", {})
    total_q = sum(state.get("target_count", {}).values())
    top_k = max(total_q * 3, 10)

    query = f"{subject} 核心知识点 重要概念 关键内容"

    async with async_session_factory() as session:
        chunks = await retrieve_chunks(
            query,
            session,
            knowledge_base_ids=document_kb_ids if document_kb_ids else None,
            document_ids=doc_ids if doc_ids else None,
            top_k=top_k,
            use_hybrid=True,
            use_rerank=True,
        )

    logger.info("Pro RAG retrieved %d chunks", len(chunks))

    # Build indexed chunk list for distributor
    rag_chunks = [
        {
            "index": i,
            "content": c["content"],
            "similarity": round(c.get("similarity", 0), 3),
        }
        for i, c in enumerate(chunks)
    ]

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
    await emit_node_complete(
        session_id,
        "rag_retriever",
        msg,
        input_summary={"query": query[:200], "kb_ids": document_kb_ids, "top_k": top_k},
        output_summary={"chunk_count": len(chunks), "top_chunks": top_previews},
        progress=0.08,
    )

    return {"rag_chunks": rag_chunks}
