"""Quiz session endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from backend.app.core.database import get_session
from backend.app.core.deps import get_current_user
from backend.app.core.sse import SSEManager
from backend.app.core.sse_ticket import consume_ticket
from backend.app.models.user import User
from backend.app.schemas.quiz import (
    AcquireQuizRequest,
    QuizCreateRequest,
    QuizResponseResult,
    QuizSessionListItem,
    QuizSessionResponse,
    QuizSubmitAllRequest,
)
from backend.app.services import quiz_service

router = APIRouter(prefix="/quiz-sessions", tags=["Quiz Sessions"])


@router.post("/", response_model=QuizSessionResponse, status_code=201)
async def create_quiz(
    req: QuizCreateRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a new quiz session. Triggers background AI generation."""
    return await quiz_service.create_quiz_session(req, user, session)


@router.get("/my-quizzes", response_model=list[QuizSessionListItem])
async def list_my_quizzes(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List quizzes created by the current user."""
    return await quiz_service.list_my_quizzes(user, session, limit=limit, offset=offset)


@router.get("/acquired", response_model=list[QuizSessionListItem])
async def list_acquired_quizzes(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List quizzes acquired by the current user."""
    return await quiz_service.list_acquired(user, session)


@router.post("/acquire", response_model=dict)
async def acquire_quiz(
    req: AcquireQuizRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Acquire a quiz by share code."""
    return await quiz_service.acquire_quiz(req, user, session)


@router.get("/", response_model=list[QuizSessionListItem])
async def list_quizzes(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List quiz sessions for the current user."""
    return await quiz_service.list_quiz_sessions(
        user, session, limit=limit, offset=offset
    )


@router.get("/{session_id}", response_model=QuizSessionResponse)
async def get_quiz(
    session_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get quiz session details with questions."""
    return await quiz_service.get_quiz_session(session_id, user, session)


@router.post("/{session_id}/responses", response_model=list[QuizResponseResult])
async def submit_responses(
    session_id: str,
    req: QuizSubmitAllRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Submit answers to quiz questions."""
    return await quiz_service.submit_response(session_id, req.responses, user, session)


@router.post("/{session_id}/submit", response_model=QuizSessionResponse)
async def submit_quiz(
    session_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Finalize quiz and trigger AI grading."""
    return await quiz_service.submit_quiz(session_id, user, session)


@router.delete("/{session_id}", status_code=204)
async def delete_quiz(
    session_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete a quiz session (creator only, non-circle, status in graded/error/ready)."""
    await quiz_service.delete_quiz_session(session_id, user, session)


@router.post("/{session_id}/share", response_model=QuizSessionResponse)
async def generate_share_code(
    session_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Generate a share code for a quiz session."""
    return await quiz_service.generate_share_code(session_id, user, session)


@router.delete("/{session_id}/share", response_model=QuizSessionResponse)
async def revoke_share_code(
    session_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Revoke the share code for a quiz session."""
    return await quiz_service.revoke_share_code(session_id, user, session)


@router.post("/{session_id}/publish", response_model=QuizSessionResponse)
async def publish_to_plaza(
    session_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Publish a quiz to the public plaza (must be graded)."""
    return await quiz_service.publish_to_plaza(session_id, user, session)


@router.delete("/{session_id}/publish", response_model=QuizSessionResponse)
async def unpublish_from_plaza(
    session_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Remove a quiz from the public plaza."""
    return await quiz_service.unpublish_from_plaza(session_id, user, session)


@router.get("/{session_id}/stream")
async def quiz_stream(
    session_id: str,
    ticket: str = Query(
        ..., description="One-time SSE ticket from POST /notifications/sse-ticket"
    ),
):
    """SSE endpoint for real-time quiz generation / grading progress.

    Authentication uses a one-time ticket (obtained via POST /notifications/sse-ticket)
    because the browser EventSource API does not support custom request headers.

    The subscriber queue is registered EAGERLY (before the EventSourceResponse
    is returned) to avoid the race condition where background tasks emit events
    before the generator starts iterating.
    """
    user_id = consume_ticket(ticket)
    if user_id is None:
        raise HTTPException(status_code=403, detail="Invalid or expired SSE ticket")

    sse_manager = SSEManager.get_instance()

    # Register the queue synchronously NOW — before EventSourceResponse starts streaming
    queue = sse_manager.create_subscriber(session_id)

    async def event_generator():
        async for event_str in sse_manager.consume(session_id, queue):
            yield event_str

    return EventSourceResponse(event_generator())
