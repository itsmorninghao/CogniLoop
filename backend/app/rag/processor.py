"""文档处理器：解析 → 分块 → 向量化 → 存储"""

from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.document import Document, DocumentStatus
from backend.app.models.knowledge_chunk import KnowledgeChunk
from backend.app.rag.chunker import TextChunker
from backend.app.rag.embeddings import get_embedding_service
from backend.app.rag.parser import DocumentParser
from backend.app.services.document_service import DocumentService


class DocumentProcessor:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.parser = DocumentParser()
        self.chunker = TextChunker()
        self.embedding_service = get_embedding_service()
        self.document_service = DocumentService(session)

    async def process_document(self, document_id: int) -> bool:
        document = await self.document_service.get_document_by_id(document_id)
        if not document:
            return False

        try:
            text = await self.parser.parse(document.file_path, document.file_type)
            if not text:
                await self._mark_failed(document, "文档内容为空")
                return False

            chunks = self.chunker.chunk(text)
            if not chunks:
                await self._mark_failed(document, "文档分块失败")
                return False

            embeddings = await self.embedding_service.embed_texts(chunks)

            for i, (chunk_text, embedding) in enumerate(
                zip(chunks, embeddings, strict=True)
            ):
                knowledge_chunk = KnowledgeChunk(
                    content=chunk_text,
                    embedding=embedding,
                    document_id=document_id,
                    course_id=document.course_id,
                    chunk_index=i,
                    subject=document.subject,
                    chapter_id=document.chapter_id,
                )
                self.session.add(knowledge_chunk)

            await self.document_service.update_document_status(
                document_id=document_id,
                status=DocumentStatus.COMPLETED,
                chunk_count=len(chunks),
            )
            await self.session.flush()
            return True

        except Exception as e:
            await self.session.rollback()
            await self._mark_failed(document, str(e))
            return False

    async def _mark_failed(self, document: Document, error_message: str) -> None:
        await self.document_service.update_document_status(
            document_id=document.id,
            status=DocumentStatus.FAILED,
            error_message=error_message,
        )
        await self.session.commit()
