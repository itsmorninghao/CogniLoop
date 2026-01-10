"""文档服务"""

import shutil
from pathlib import Path

import aiofiles
from fastapi import UploadFile
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.models.document import Document, DocumentStatus, FileType
from backend.app.models.knowledge_chunk import KnowledgeChunk


class DocumentService:
    """文档服务类"""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _get_file_type(self, filename: str) -> FileType | None:
        """根据文件名获取文件类型"""
        ext = Path(filename).suffix.lower()
        type_mapping = {
            ".pdf": FileType.PDF,
            ".doc": FileType.WORD,
            ".docx": FileType.WORD,
            ".md": FileType.MARKDOWN,
            ".markdown": FileType.MARKDOWN,
            ".ppt": FileType.PPT,
            ".pptx": FileType.PPT,
        }
        return type_mapping.get(ext)

    async def _generate_unique_filename(
        self, course_id: int, original_filename: str
    ) -> str:
        """生成唯一文件名（处理重名）"""
        base_name = Path(original_filename).stem
        ext = Path(original_filename).suffix

        # 检查是否已存在同名文件
        stmt = select(Document).where(
            Document.course_id == course_id,
            Document.original_filename == original_filename,
        )
        result = await self.session.execute(stmt)
        if not result.scalar_one_or_none():
            return original_filename

        # 查找同前缀的文件
        stmt = select(Document.original_filename).where(
            Document.course_id == course_id,
        )
        result = await self.session.execute(stmt)
        existing_names = {row[0] for row in result.all()}

        # 生成新文件名
        counter = 1
        while True:
            new_name = f"{base_name}_{counter}{ext}"
            if new_name not in existing_names:
                return new_name
            counter += 1

    async def upload_document(
        self,
        file: UploadFile,
        course_id: int,
        subject: str | None = None,
        chapter_id: int | None = None,
    ) -> Document:
        """上传文档"""
        if not file.filename:
            raise ValueError("文件名不能为空")

        # 检查文件类型
        file_type = self._get_file_type(file.filename)
        if not file_type:
            raise ValueError("不支持的文件类型")

        # 检查文件大小
        file.file.seek(0, 2)  # 移到文件末尾
        file_size = file.file.tell()
        file.file.seek(0)  # 重置到开头
        if file_size > settings.max_upload_size:
            raise ValueError(
                f"文件大小超过限制（最大 {settings.max_upload_size // 1024 // 1024}MB）"
            )

        # 生成唯一文件名
        unique_filename = await self._generate_unique_filename(course_id, file.filename)

        # 创建文档记录
        document = Document(
            filename=unique_filename,
            original_filename=file.filename,
            file_type=file_type,
            file_path="",  # 稍后更新
            course_id=course_id,
            subject=subject,
            chapter_id=chapter_id,
            status=DocumentStatus.PROCESSING,
        )
        self.session.add(document)
        await self.session.flush()
        await self.session.refresh(document)

        # 创建存储目录
        storage_dir = settings.upload_dir / f"course_{course_id}" / f"doc_{document.id}"
        storage_dir.mkdir(parents=True, exist_ok=True)

        # 保存文件
        file_path = storage_dir / unique_filename
        async with aiofiles.open(file_path, "wb") as f:
            content = await file.read()
            await f.write(content)

        # 更新文件路径
        document.file_path = str(file_path)
        await self.session.flush()

        return document

    async def get_document_by_id(self, document_id: int) -> Document | None:
        """根据 ID 获取文档"""
        stmt = select(Document).where(Document.id == document_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_course_documents(self, course_id: int) -> list[Document]:
        """获取课程的所有文档"""
        stmt = (
            select(Document)
            .where(Document.course_id == course_id)
            .order_by(Document.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def delete_document(self, document_id: int) -> bool:
        """删除文档及其知识块"""
        document = await self.get_document_by_id(document_id)
        if not document:
            return False

        # 删除知识块
        stmt = delete(KnowledgeChunk).where(KnowledgeChunk.document_id == document_id)
        await self.session.execute(stmt)

        # 删除文件
        file_path = Path(document.file_path)
        if file_path.exists():
            file_path.unlink()
            # 尝试删除空目录
            doc_dir = file_path.parent
            if doc_dir.exists() and not any(doc_dir.iterdir()):
                shutil.rmtree(doc_dir)

        # 删除文档记录
        await self.session.delete(document)
        return True

    async def get_document_chunks(self, document_id: int) -> list[KnowledgeChunk]:
        """获取文档的知识块"""
        stmt = (
            select(KnowledgeChunk)
            .where(KnowledgeChunk.document_id == document_id)
            .order_by(KnowledgeChunk.chunk_index)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def update_document_status(
        self,
        document_id: int,
        status: DocumentStatus,
        error_message: str | None = None,
        chunk_count: int = 0,
    ) -> None:
        """更新文档处理状态"""
        document = await self.get_document_by_id(document_id)
        if document:
            document.status = status
            document.error_message = error_message
            document.chunk_count = chunk_count
            await self.session.flush()

    async def verify_teacher_owns_document(
        self, document_id: int, teacher_id: int
    ) -> Document | None:
        """验证教师拥有该文档（通过课程）"""
        stmt = (
            select(Document)
            .join(Document.course)
            .where(
                Document.id == document_id,
                Document.course.has(teacher_id=teacher_id),
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
