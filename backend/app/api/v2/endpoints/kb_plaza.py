"""KB Plaza endpoints — browse public knowledge bases."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_session
from backend.app.schemas.knowledge_base import KBPlazaPage
from backend.app.services import kb_service

router = APIRouter(prefix="/kb-plaza", tags=["KB Plaza"])


@router.get("/", response_model=KBPlazaPage)
async def list_plaza_kbs(
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    return await kb_service.list_plaza_kbs(session, q=q, limit=limit, offset=offset)
