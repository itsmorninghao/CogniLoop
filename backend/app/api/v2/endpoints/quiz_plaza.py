"""Quiz Plaza endpoints — browse public quiz sessions."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_session
from backend.app.schemas.quiz import QuizPlazaItem
from backend.app.services import quiz_service

router = APIRouter(prefix="/quiz-plaza", tags=["Quiz Plaza"])


@router.get("/", response_model=list[QuizPlazaItem])
async def list_plaza_quizzes(
    session: AsyncSession = Depends(get_session),
):
    """List all publicly shared quiz sessions."""
    return await quiz_service.list_quiz_plaza(session)
