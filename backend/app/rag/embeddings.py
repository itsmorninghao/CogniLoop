"""
Embeddings — vectorize text chunks and store in pgvector.

Enhanced:
- Uses chunk.content_for_embedding which includes section context prefix
- Batch processing with progress tracking
- Idempotent: clears old chunks before re-embedding
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
    Embed a list of Chunk objects and insert them into kb_chunks.

    This is idempotent: existing chunks for the document are deleted first,
    so re-processing a document is safe.

    Args:
        document_id: FK to kb_documents.
        knowledge_base_id: FK to knowledge_bases.
        chunks: list of Chunk objects from the chunker.
        session: DB session.

    Returns:
        Number of chunks inserted.
    """
    # Delete existing chunks for this document (idempotent re-processing)
    await session.execute(delete(KBChunk).where(KBChunk.document_id == document_id))
    await session.flush()

    if not chunks:
        return 0

    embeddings_model = await get_embeddings_model(session)
    total_inserted = 0

    for batch_start in range(0, len(chunks), EMBED_BATCH_SIZE):
        batch = chunks[batch_start : batch_start + EMBED_BATCH_SIZE]

        # Use content_for_embedding which includes section context
        texts = [c.content_for_embedding for c in batch]

        try:
            vectors = await embeddings_model.aembed_documents(texts)
        except Exception as e:
            logger.error(
                "Embedding failed for doc %d batch %d: %s",
                document_id,
                batch_start,
                e,
            )
            raise

        for chunk, vector in zip(batch, vectors):
            db_chunk = KBChunk(
                document_id=document_id,
                knowledge_base_id=knowledge_base_id,
                chunk_index=chunk.index,
                content=chunk.content,
                embedding=vector,
                metadata_extra={
                    "section_path": chunk.section_path,
                    "heading": chunk.heading,
                    "context_prefix": chunk.context_prefix,
                    **({"page": chunk.page_number} if chunk.page_number else {}),
                    **chunk.metadata,
                },
            )
            session.add(db_chunk)
            total_inserted += 1

        await session.flush()
        logger.info(
            "Embedded doc %d batch %d–%d (%d chunks)",
            document_id,
            batch_start,
            batch_start + len(batch),
            len(batch),
        )

    return total_inserted
