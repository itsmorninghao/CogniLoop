"""
Embeddings — vectorize child chunks and store parent+child in pgvector.

Strategy:
- Parent chunks: written to DB with embedding=None (context only, not searchable)
- Child chunks: batch-embedded, written with parent_chunk_id pointing to parent DB row
- Returns count of child chunks stored (== embedded count)
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import delete

from backend.app.core.llm import get_embeddings_model
from backend.app.models.knowledge_base import KBChunk
from backend.app.rag.chunker import Chunk

logger = logging.getLogger(__name__)

EMBED_BATCH_SIZE = 50


async def embed_and_store_chunks(
    document_id: int,
    knowledge_base_id: int,
    chunks: list[Chunk],
    session: AsyncSession,
) -> int:
    """
    Store parent chunks (no embedding) and embed+store child chunks.

    Idempotent: existing chunks for the document are deleted first.

    Returns:
        Number of child chunks embedded and stored.
    """
    await session.execute(delete(KBChunk).where(KBChunk.document_id == document_id))
    await session.flush()

    if not chunks:
        return 0

    parents = [c for c in chunks if c.chunk_level == "parent"]
    children = [c for c in chunks if c.chunk_level == "child"]

    parent_db_objects: list[KBChunk] = []
    for i, p in enumerate(parents):
        obj = KBChunk(
            document_id=document_id,
            knowledge_base_id=knowledge_base_id,
            chunk_index=i,
            chunk_level="parent",
            parent_chunk_id=None,
            content=p.content,
            embedding=None,
            document_title=p.document_title,
            section_path=p.section_path,
            heading=p.heading,
            metadata_extra=p.metadata,
        )
        session.add(obj)
        parent_db_objects.append(obj)

    await session.flush()

    if not children:
        return 0

    embeddings_model = await get_embeddings_model(session)
    child_texts = [c.content_for_embedding for c in children]
    embedded_count = 0

    for batch_start in range(0, len(children), EMBED_BATCH_SIZE):
        batch_chunks = children[batch_start : batch_start + EMBED_BATCH_SIZE]
        batch_texts = child_texts[batch_start : batch_start + EMBED_BATCH_SIZE]

        try:
            batch_vectors = await embeddings_model.aembed_documents(batch_texts)
        except Exception as e:
            logger.error(
                "Embedding failed for doc %d batch %d: %s", document_id, batch_start, e
            )
            raise

        for chunk, vector in zip(batch_chunks, batch_vectors, strict=False):
            parent_db_id: int | None = None
            if chunk.parent_chunk_index is not None and chunk.parent_chunk_index < len(
                parent_db_objects
            ):
                parent_db_id = parent_db_objects[chunk.parent_chunk_index].id

            session.add(
                KBChunk(
                    document_id=document_id,
                    knowledge_base_id=knowledge_base_id,
                    chunk_index=batch_start + batch_chunks.index(chunk),
                    chunk_level="child",
                    parent_chunk_id=parent_db_id,
                    content=chunk.content,
                    embedding=vector,
                    document_title=chunk.document_title,
                    section_path=chunk.section_path,
                    heading=chunk.heading,
                    metadata_extra=chunk.metadata,
                )
            )
            embedded_count += 1

        await session.flush()
        logger.info(
            "Embedded doc %d batch %d–%d (%d child chunks)",
            document_id,
            batch_start,
            batch_start + len(batch_chunks),
            len(batch_chunks),
        )

    return embedded_count
