"""Course generation flow endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_session
from backend.app.core.deps import get_current_user
from backend.app.models.user import User
from backend.app.schemas.course import (
    NodeEditRequest,
    OutlineConfirmRequest,
    OutlineDraftResponse,
    OutlineGenerateRequest,
)
from backend.app.services import course_generation_service

router = APIRouter(prefix="/course-generation", tags=["Course Generation"])


@router.post("/outline", response_model=OutlineDraftResponse, status_code=201)
async def generate_outline(
    req: OutlineGenerateRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Phase 1: Submit KB + config, generate outline draft (synchronous, seconds)."""
    return await course_generation_service.generate_outline(req, user, session)


@router.patch("/outline/{draft_id}/nodes", response_model=OutlineDraftResponse)
async def edit_outline_draft(
    draft_id: str,
    req: NodeEditRequest,
    user: User = Depends(get_current_user),
):
    """Edit outline nodes (title, type, structure) before confirming."""
    return await course_generation_service.edit_outline_draft(draft_id, req, user)


@router.post("/outline/{draft_id}/confirm", status_code=201)
async def confirm_outline(
    draft_id: str,
    req: OutlineConfirmRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """User confirms outline — creates Course + nodes, triggers Phase 2 async generation."""
    return await course_generation_service.confirm_outline(draft_id, req, user, session)


@router.post("/nodes/{node_id}/retry")
async def retry_node(
    node_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Retry generation for a single failed leaf node."""
    return await course_generation_service.retry_node(node_id, user, session)
