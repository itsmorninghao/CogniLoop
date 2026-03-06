"""Knowledge base endpoints."""

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_session
from backend.app.core.deps import get_current_user
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
from backend.app.services import kb_service

router = APIRouter(prefix="/knowledge-bases", tags=["Knowledge Bases"])



@router.post("/", response_model=KBResponse, status_code=201)
async def create_kb(
    req: KBCreateRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await kb_service.create_kb(req, user, session)


@router.get("/", response_model=list[KBResponse])
async def list_kbs(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await kb_service.list_user_kbs(user, session, limit=limit, offset=offset)


@router.get("/acquired", response_model=list[KBResponse])
async def list_acquired(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await kb_service.list_acquired_kbs(user, session, limit=limit, offset=offset)


@router.get("/{kb_id}", response_model=KBResponse)
async def get_kb(
    kb_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await kb_service.get_kb(kb_id, user, session)


@router.patch("/{kb_id}", response_model=KBResponse)
async def update_kb(
    kb_id: int,
    req: KBUpdateRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await kb_service.update_kb(kb_id, req, user, session)


@router.delete("/{kb_id}", status_code=204)
async def delete_kb(
    kb_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await kb_service.delete_kb(kb_id, user, session)



@router.post("/{kb_id}/documents", response_model=DocumentResponse, status_code=201)
async def upload_document(
    kb_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Upload a document to a knowledge base. Triggers async parsing + vectorization."""
    return await kb_service.upload_document(kb_id, file, user, session)


@router.get("/{kb_id}/documents", response_model=list[DocumentResponse])
async def list_documents(
    kb_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await kb_service.list_documents(kb_id, user, session)


@router.delete("/{kb_id}/documents/{doc_id}", status_code=204)
async def delete_document(
    kb_id: int,
    doc_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await kb_service.delete_document(kb_id, doc_id, user, session)



@router.post("/{kb_id}/folders", response_model=FolderResponse, status_code=201)
async def create_folder(
    kb_id: int,
    req: FolderCreateRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await kb_service.create_folder(kb_id, req, user, session)


@router.get("/{kb_id}/folders", response_model=list[FolderResponse])
async def list_folders(
    kb_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await kb_service.list_folders(kb_id, user, session)


@router.delete("/{kb_id}/folders/{folder_id}", status_code=204)
async def delete_folder(
    kb_id: int,
    folder_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await kb_service.delete_folder(kb_id, folder_id, user, session)



@router.post("/{kb_id}/share", response_model=KBResponse)
async def generate_share_code(
    kb_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await kb_service.generate_share_code(kb_id, user, session)


@router.delete("/{kb_id}/share", response_model=KBResponse)
async def revoke_share_code(
    kb_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await kb_service.revoke_share_code(kb_id, user, session)


@router.post("/{kb_id}/publish", response_model=KBResponse)
async def publish_to_plaza(
    kb_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await kb_service.publish_to_plaza(kb_id, user, session)


@router.delete("/{kb_id}/publish", response_model=KBResponse)
async def unpublish_from_plaza(
    kb_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await kb_service.unpublish_from_plaza(kb_id, user, session)


@router.post("/acquire", response_model=KBResponse)
async def acquire_kb(
    req: AcquireByShareCodeRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await kb_service.acquire_by_share_code(req, user, session)

