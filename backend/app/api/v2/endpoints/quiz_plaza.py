"""Quiz Plaza endpoints — browse public quiz sessions."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_session
from backend.app.schemas.quiz import QuizPlazaPage
from backend.app.services import quiz_service

router = APIRouter(prefix="/quiz-plaza", tags=["Quiz Plaza"])


@router.get("/", response_model=QuizPlazaPage)
async def list_plaza_quizzes(
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    """List all publicly shared quiz sessions."""
    return await quiz_service.list_quiz_plaza(session, q=q, limit=limit, offset=offset)
