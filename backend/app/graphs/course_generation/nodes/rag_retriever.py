"""
Node 1 (node graph): RAG Retriever — fetch relevant chunks for a single course node.
Uses the project's existing hybrid retrieval pipeline.
"""

from __future__ import annotations

import logging

from backend.app.core.database import async_session_factory
from backend.app.graphs.course_generation.state import NodeGenState
from backend.app.rag.retriever import retrieve_chunks

logger = logging.getLogger(__name__)

_TOP_K = 8          # chunks per node
_CHUNK_MAX_CHARS = 600


async def rag_retriever(state: NodeGenState) -> dict:
    """
    Retrieve the most relevant KB chunks for this node's title.
    Falls back to sequential chunks if vector search is unavailable.
    """
    node_title: str = state.get("node_title", "")
    kb_ids: list[int] = state.get("kb_ids", [])

    async with async_session_factory() as session:
        try:
            chunks = await retrieve_chunks(
                query=node_title,
                session=session,
                knowledge_base_ids=kb_ids if kb_ids else None,
                top_k=_TOP_K,
                use_hybrid=True,
                use_rerank=False,   # speed over precision for content gen
            )
            rag_content = "\n\n".join(
                c["content"][:_CHUNK_MAX_CHARS] for c in chunks if c.get("content")
            )
        except Exception as e:
            logger.warning("RAG retrieval failed for node '%s': %s, falling back", node_title, e)
            # Fallback: sequential chunks from KB
            from sqlmodel import select
            from backend.app.models.knowledge_base import KBChunk
            result = await session.execute(
                select(KBChunk.content).where(KBChunk.knowledge_base_id.in_(kb_ids)).limit(_TOP_K)
            )
            rag_content = "\n\n".join(
                row[0][:_CHUNK_MAX_CHARS] for row in result if row[0]
            )

    logger.info("RAG retriever: %d chars for node '%s'", len(rag_content), node_title)

    return {
        "rag_content": rag_content or "（未找到相关知识内容）",
        "current_node": "rag_retriever",
    }
