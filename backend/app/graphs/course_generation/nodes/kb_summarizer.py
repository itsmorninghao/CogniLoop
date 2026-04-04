"""
Node 1 (outline graph): KB Summarizer — fetch KB content as LLM context.
"""

from __future__ import annotations

import logging

from backend.app.core.database import async_session_factory
from backend.app.graphs.course_generation.state import OutlineGenState
from backend.app.models.knowledge_base import KBChunk, KnowledgeBase
from sqlmodel import select

logger = logging.getLogger(__name__)

# Max chars of KB content to feed into the outline LLM
_MAX_SUMMARY_CHARS = 8000


async def kb_summarizer(state: OutlineGenState) -> dict:
    """
    Fetch representative content from the target knowledge base(s).
    Uses the first N chunks as summary context for outline generation.
    Falls back to KB name + description if no chunks are indexed yet.
    """
    kb_ids: list[int] = state.get("kb_ids", [])

    async with async_session_factory() as session:
        # Try fetching up to 30 chunks across all selected KBs
        chunks_result = await session.execute(
            select(KBChunk.content)
            .where(KBChunk.knowledge_base_id.in_(kb_ids))
            .order_by(KBChunk.id)
            .limit(30)
        )
        chunks = [row[0] for row in chunks_result if row[0]]

        if not chunks:
            # Fallback: use KB metadata
            kbs_result = await session.execute(
                select(KnowledgeBase.name, KnowledgeBase.description)
                .where(KnowledgeBase.id.in_(kb_ids))
            )
            summary = "\n".join(
                f"知识库：{row[0]}。{row[1] or ''}" for row in kbs_result
            )
        else:
            # Truncate each chunk and join, capped at total limit
            parts: list[str] = []
            total = 0
            for chunk in chunks:
                piece = chunk[:500]
                if total + len(piece) > _MAX_SUMMARY_CHARS:
                    break
                parts.append(piece)
                total += len(piece)
            summary = "\n\n".join(parts)

    logger.info("KB summarizer: %d chars from %d chunks for KBs %s", len(summary), len(chunks), kb_ids)

    return {
        "kb_summary": summary,
        "current_node": "kb_summarizer",
    }
