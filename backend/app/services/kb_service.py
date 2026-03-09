"""Knowledge base service."""

import asyncio
import logging
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import delete as sql_delete
from sqlmodel import func, select

from backend.app.core.config import settings
from backend.app.core.exceptions import (
    BadRequestError,
    ForbiddenError,
    NotFoundError,
)
from backend.app.models.knowledge_base import (
    KBAcquisition,
    KBChunk,
    KBDocument,
    KBFolder,
    KnowledgeBase,
)
from backend.app.models.user import User
from backend.app.schemas.knowledge_base import (
    AcquireByShareCodeRequest,
    DocumentResponse,
    FolderCreateRequest,
    FolderResponse,
    KBCreateRequest,
    KBResponse,
    KBUpdateRequest,
)

logger = logging.getLogger(__name__)

# Keeps strong references to background tasks so GC doesn't cancel them mid-run.
_background_tasks: set = set()

_FILE_EXTENSIONS = {
    ".pdf": "PDF",
    ".docx": "WORD",
    ".doc": "WORD",
    ".pptx": "PPT",
    ".ppt": "PPT",
    ".md": "MARKDOWN",
    ".markdown": "MARKDOWN",
    ".txt": "TXT",
}

_MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


async def create_kb(
    req: KBCreateRequest, user: User, session: AsyncSession
) -> KBResponse:
    kb = KnowledgeBase(
        owner_id=user.id,
        name=req.name,
        description=req.description,
        tags=req.tags,
        kb_type=req.kb_type,
    )
    session.add(kb)
    await session.flush()
    await session.refresh(kb)
    return KBResponse.model_validate(kb)


async def list_user_kbs(
    user: User, session: AsyncSession, *, limit: int = 100, offset: int = 0
) -> list[KBResponse]:
    result = await session.execute(
        select(KnowledgeBase)
        .where(KnowledgeBase.owner_id == user.id)
        .order_by(KnowledgeBase.updated_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return [KBResponse.model_validate(kb) for kb in result.scalars().all()]


async def list_acquired_kbs(
    user: User, session: AsyncSession, *, limit: int = 100, offset: int = 0
) -> list[KBResponse]:
    result = await session.execute(
        select(KnowledgeBase)
        .join(KBAcquisition, KBAcquisition.knowledge_base_id == KnowledgeBase.id)
        .where(KBAcquisition.user_id == user.id)
        .order_by(KBAcquisition.acquired_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return [KBResponse.model_validate(kb) for kb in result.scalars().all()]


async def get_kb(kb_id: int, user: User, session: AsyncSession) -> KBResponse:
    kb = await _get_kb_or_404(kb_id, session)
    await _check_kb_access(kb, user, session)
    return KBResponse.model_validate(kb)


async def update_kb(
    kb_id: int, req: KBUpdateRequest, user: User, session: AsyncSession
) -> KBResponse:
    kb = await _get_kb_or_404(kb_id, session)
    _check_kb_owner(kb, user)

    if req.name is not None:
        kb.name = req.name
    if req.description is not None:
        kb.description = req.description
    if req.tags is not None:
        kb.tags = req.tags
    kb.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    session.add(kb)
    await session.flush()
    await session.refresh(kb)
    return KBResponse.model_validate(kb)


async def delete_kb(kb_id: int, user: User, session: AsyncSession) -> None:
    kb = await _get_kb_or_404(kb_id, session)
    _check_kb_owner(kb, user)
    await session.delete(kb)


async def upload_document(
    kb_id: int, file: UploadFile, user: User, session: AsyncSession
) -> DocumentResponse:
    """Upload a document, save to disk, and trigger background RAG processing."""
    kb = await _get_kb_or_404(kb_id, session)
    _check_kb_owner(kb, user)

    original_name = file.filename or "unknown"
    ext = Path(original_name).suffix.lower()
    file_type = _FILE_EXTENSIONS.get(ext)
    if not file_type:
        raise BadRequestError(
            f"Unsupported file type '{ext}'. "
            f"Supported: {', '.join(_FILE_EXTENSIONS.keys())}"
        )

    unique_name = f"{uuid.uuid4().hex}{ext}"
    upload_dir = settings.upload_path / str(kb_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / unique_name

    content = await file.read()
    if len(content) > _MAX_FILE_SIZE:
        raise BadRequestError(
            f"File too large. Maximum: {_MAX_FILE_SIZE // 1024 // 1024} MB"
        )

    with open(file_path, "wb") as f:
        f.write(content)

    doc = KBDocument(
        knowledge_base_id=kb_id,
        filename=unique_name,
        original_filename=original_name,
        file_type=file_type,
        file_path=str(file_path),
        status="processing",
    )
    session.add(doc)
    await session.flush()
    await session.refresh(doc)

    # Atomic increment to avoid race conditions on concurrent uploads
    await session.execute(
        sa_update(KnowledgeBase)
        .where(KnowledgeBase.id == kb.id)
        .values(
            document_count=KnowledgeBase.document_count + 1,
            updated_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
    )
    await session.flush()

    doc_id = doc.id
    task = asyncio.create_task(
        _process_document_background(doc_id, kb_id, str(file_path), file_type)
    )
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return DocumentResponse.model_validate(doc)


async def _process_document_background(
    document_id: int,
    knowledge_base_id: int,
    file_path: str,
    file_type: str,
) -> None:
    """Background task: parse → chunk → embed a document."""
    from backend.app.core.database import async_session_factory
    from backend.app.rag.chunker import chunk_sections
    from backend.app.rag.embeddings import embed_and_store_chunks
    from backend.app.rag.parser import parse_document

    async with async_session_factory() as session:
        try:
            # Step 1: Parse
            logger.info("Processing doc %d: parsing %s", document_id, file_path)
            parse_result = await parse_document(file_path, file_type)

            # Step 2: Chunk
            logger.info(
                "Processing doc %d: chunking %d sections",
                document_id,
                len(parse_result.sections),
            )
            chunks = chunk_sections(
                parse_result.sections,
                strategy="semantic",
                chunk_size=800,
                chunk_overlap=150,
            )

            if not chunks:
                logger.warning("Processing doc %d: no chunks produced", document_id)
                await _update_doc_status(session, document_id, "ready", chunk_count=0)
                return

            # Step 3: Embed
            logger.info(
                "Processing doc %d: embedding %d chunks", document_id, len(chunks)
            )
            count = await embed_and_store_chunks(
                document_id, knowledge_base_id, chunks, session
            )

            # Step 4: Update status
            await _update_doc_status(session, document_id, "ready", chunk_count=count)
            await session.commit()
            logger.info(
                "Processing doc %d: done (%d chunks stored)", document_id, count
            )

        except Exception as e:
            logger.error("Processing doc %d failed: %s", document_id, e, exc_info=True)
            try:
                await _update_doc_status(
                    session, document_id, "error", error_message=str(e)[:500]
                )
                await session.commit()
            except Exception:
                logger.error("Failed to update doc %d error status", document_id)


async def _update_doc_status(
    session: AsyncSession,
    document_id: int,
    status: str,
    *,
    chunk_count: int = 0,
    error_message: str | None = None,
) -> None:
    """Update a document's processing status."""
    result = await session.execute(
        select(KBDocument).where(KBDocument.id == document_id)
    )
    doc = result.scalar_one_or_none()
    if doc:
        doc.status = status
        doc.chunk_count = chunk_count
        doc.error_message = error_message
        doc.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.add(doc)
        await session.flush()


async def list_documents(
    kb_id: int, user: User, session: AsyncSession
) -> list[DocumentResponse]:
    kb = await _get_kb_or_404(kb_id, session)
    await _check_kb_access(kb, user, session)

    result = await session.execute(
        select(KBDocument)
        .where(KBDocument.knowledge_base_id == kb_id)
        .order_by(KBDocument.created_at.desc())
    )
    return [DocumentResponse.model_validate(d) for d in result.scalars().all()]


async def delete_document(
    kb_id: int, doc_id: int, user: User, session: AsyncSession
) -> None:
    kb = await _get_kb_or_404(kb_id, session)
    _check_kb_owner(kb, user)

    result = await session.execute(
        select(KBDocument).where(
            KBDocument.id == doc_id,
            KBDocument.knowledge_base_id == kb_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise NotFoundError("Document")

    await session.execute(sql_delete(KBChunk).where(KBChunk.document_id == doc_id))

    try:
        Path(doc.file_path).unlink(missing_ok=True)
    except Exception:
        pass

    await session.delete(doc)

    # Atomic decrement to avoid race conditions on concurrent deletes
    await session.execute(
        sa_update(KnowledgeBase)
        .where(KnowledgeBase.id == kb.id)
        .values(
            document_count=func.greatest(KnowledgeBase.document_count - 1, 0),
            updated_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
    )


async def create_folder(
    kb_id: int, req: FolderCreateRequest, user: User, session: AsyncSession
) -> FolderResponse:
    kb = await _get_kb_or_404(kb_id, session)
    _check_kb_owner(kb, user)

    folder = KBFolder(
        knowledge_base_id=kb_id,
        parent_folder_id=req.parent_folder_id,
        name=req.name,
    )
    session.add(folder)
    await session.flush()
    await session.refresh(folder)
    return FolderResponse.model_validate(folder)


async def list_folders(
    kb_id: int, user: User, session: AsyncSession
) -> list[FolderResponse]:
    kb = await _get_kb_or_404(kb_id, session)
    await _check_kb_access(kb, user, session)

    result = await session.execute(
        select(KBFolder).where(KBFolder.knowledge_base_id == kb_id)
    )
    return [FolderResponse.model_validate(f) for f in result.scalars().all()]


async def delete_folder(
    kb_id: int, folder_id: int, user: User, session: AsyncSession
) -> None:
    kb = await _get_kb_or_404(kb_id, session)
    _check_kb_owner(kb, user)

    result = await session.execute(
        select(KBFolder).where(
            KBFolder.id == folder_id, KBFolder.knowledge_base_id == kb_id
        )
    )
    folder = result.scalar_one_or_none()
    if not folder:
        raise NotFoundError("Folder")
    await session.delete(folder)


async def generate_share_code(
    kb_id: int, user: User, session: AsyncSession
) -> KBResponse:
    kb = await _get_kb_or_404(kb_id, session)
    _check_kb_owner(kb, user)

    if not kb.share_code:
        kb.share_code = secrets.token_urlsafe(8)[:12]
        kb.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.add(kb)
        await session.flush()
        await session.refresh(kb)
    return KBResponse.model_validate(kb)


async def revoke_share_code(
    kb_id: int, user: User, session: AsyncSession
) -> KBResponse:
    kb = await _get_kb_or_404(kb_id, session)
    _check_kb_owner(kb, user)

    if kb.shared_to_plaza_at is not None:
        raise BadRequestError("请先从广场撤下再吊销分享码")

    kb.share_code = None
    kb.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(kb)
    await session.flush()
    await session.refresh(kb)
    return KBResponse.model_validate(kb)


async def publish_to_plaza(kb_id: int, user: User, session: AsyncSession) -> KBResponse:
    kb = await _get_kb_or_404(kb_id, session)
    _check_kb_owner(kb, user)

    if not kb.share_code:
        raise BadRequestError("请先生成分享码再发布到广场")

    kb.shared_to_plaza_at = datetime.now(timezone.utc).replace(tzinfo=None)
    kb.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(kb)
    await session.flush()
    await session.refresh(kb)
    return KBResponse.model_validate(kb)


async def unpublish_from_plaza(
    kb_id: int, user: User, session: AsyncSession
) -> KBResponse:
    kb = await _get_kb_or_404(kb_id, session)
    _check_kb_owner(kb, user)

    kb.shared_to_plaza_at = None
    kb.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(kb)
    await session.flush()
    await session.refresh(kb)
    return KBResponse.model_validate(kb)


async def acquire_by_share_code(
    req: AcquireByShareCodeRequest, user: User, session: AsyncSession
) -> KBResponse:
    result = await session.execute(
        select(KnowledgeBase).where(KnowledgeBase.share_code == req.share_code)
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise NotFoundError("Knowledge base with this share code")
    if kb.owner_id == user.id:
        raise BadRequestError("Cannot acquire your own knowledge base")

    existing = await session.execute(
        select(KBAcquisition).where(
            KBAcquisition.user_id == user.id,
            KBAcquisition.knowledge_base_id == kb.id,
        )
    )
    if existing.scalar_one_or_none():
        raise BadRequestError("Already acquired")

    acq = KBAcquisition(
        user_id=user.id,
        knowledge_base_id=kb.id,
        acquired_via="share_code",
    )
    session.add(acq)
    await session.flush()
    return KBResponse.model_validate(kb)


async def list_plaza_kbs(session: AsyncSession, *, q: str | None = None) -> list[KBResponse]:
    stmt = (
        select(KnowledgeBase)
        .where(KnowledgeBase.shared_to_plaza_at.isnot(None))
    )
    if q:
        stmt = stmt.where(KnowledgeBase.name.icontains(q))
    stmt = stmt.order_by(KnowledgeBase.shared_to_plaza_at.desc())
    result = await session.execute(stmt)
    return [KBResponse.model_validate(kb) for kb in result.scalars().all()]


async def _get_kb_or_404(kb_id: int, session: AsyncSession) -> KnowledgeBase:
    result = await session.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == kb_id)
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise NotFoundError("Knowledge base")
    return kb


def _check_kb_owner(kb: KnowledgeBase, user: User) -> None:
    if kb.owner_id != user.id and not user.is_admin:
        raise ForbiddenError("Not the owner of this knowledge base")


async def _check_kb_access(
    kb: KnowledgeBase, user: User, session: AsyncSession
) -> None:
    """Owner, admin, acquired user, or plaza-published KB can be accessed."""
    if kb.owner_id == user.id or user.is_admin:
        return
    if kb.shared_to_plaza_at:
        return
    # Check if the user has legitimately acquired this KB via share code or plaza
    acq_result = await session.execute(
        select(KBAcquisition).where(
            KBAcquisition.user_id == user.id,
            KBAcquisition.knowledge_base_id == kb.id,
        )
    )
    if acq_result.scalar_one_or_none():
        return
    raise ForbiddenError("No access to this knowledge base")
