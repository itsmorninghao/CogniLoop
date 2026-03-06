"""KB Plaza endpoints — browse public knowledge bases."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_session
from backend.app.schemas.knowledge_base import KBResponse
from backend.app.services import kb_service

router = APIRouter(prefix="/kb-plaza", tags=["KB Plaza"])


@router.get("/", response_model=list[KBResponse])
async def list_plaza_kbs(
    session: AsyncSession = Depends(get_session),
):
    return await kb_service.list_plaza_kbs(session)
