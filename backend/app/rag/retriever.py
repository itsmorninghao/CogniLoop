"""知识检索器：基于 pgvector 的向量相似度检索"""

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.knowledge_chunk import KnowledgeChunk
from backend.app.rag.embeddings import EmbeddingService
from backend.app.services.config_service import get_config_int


class KnowledgeRetriever:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.embedding_service = EmbeddingService()

    async def retrieve(
        self,
        query: str,
        course_id: int,
        subject: str | None = None,
        chapter_id: int | None = None,
        top_k: int | None = None,
    ) -> list[KnowledgeChunk]:
        top_k = top_k or get_config_int("retrieval_top_k")
        query_embedding = await self.embedding_service.embed_text(query)

        conditions = [KnowledgeChunk.course_id == course_id]
        if subject:
            conditions.append(KnowledgeChunk.subject == subject)
        if chapter_id:
            conditions.append(KnowledgeChunk.chapter_id == chapter_id)

        stmt = (
            select(KnowledgeChunk)
            .where(*conditions)
            .order_by(KnowledgeChunk.embedding.cosine_distance(query_embedding))
            .limit(top_k)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def retrieve_with_scores(
        self,
        query: str,
        course_id: int,
        subject: str | None = None,
        chapter_id: int | None = None,
        top_k: int | None = None,
    ) -> list[tuple[KnowledgeChunk, float]]:
        top_k = top_k or get_config_int("retrieval_top_k")
        query_embedding = await self.embedding_service.embed_text(query)
        embedding_str = f"[{','.join(map(str, query_embedding))}]"

        sql = """
            SELECT kc.*, 1 - (kc.embedding <=> :embedding::vector) as similarity
            FROM knowledge_chunks kc
            WHERE kc.course_id = :course_id
        """
        params: dict = {"course_id": course_id, "embedding": embedding_str}

        if subject:
            sql += " AND kc.subject = :subject"
            params["subject"] = subject
        if chapter_id:
            sql += " AND kc.chapter_id = :chapter_id"
            params["chapter_id"] = chapter_id

        sql += " ORDER BY kc.embedding <=> :embedding::vector LIMIT :top_k"
        params["top_k"] = top_k

        result = await self.session.execute(text(sql), params)
        return [
            (
                KnowledgeChunk(
                    id=row.id,
                    content=row.content,
                    document_id=row.document_id,
                    course_id=row.course_id,
                    chunk_index=row.chunk_index,
                    subject=row.subject,
                    chapter_id=row.chapter_id,
                ),
                row.similarity,
            )
            for row in result.fetchall()
        ]
