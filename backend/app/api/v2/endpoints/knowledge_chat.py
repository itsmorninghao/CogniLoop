"""Knowledge-chat endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from backend.app.core.database import async_session_factory, get_session
from backend.app.core.deps import get_current_user
from backend.app.core.sse import SSEManager
from backend.app.core.sse_ticket import consume_ticket
from backend.app.models.user import User
from backend.app.schemas.knowledge_chat import (
    KnowledgeChatSendMessageResponse,
    KnowledgeChatMessageCreateRequest,
    KnowledgeChatSessionCreateRequest,
    KnowledgeChatSessionListItem,
    KnowledgeChatSessionResponse,
)
from backend.app.services import knowledge_chat_service

router = APIRouter(prefix="/knowledge-chat", tags=["Knowledge Chat"])


@router.post("/sessions", response_model=KnowledgeChatSessionResponse, status_code=201)
async def create_chat_session(
    req: KnowledgeChatSessionCreateRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await knowledge_chat_service.create_chat_session(req, user, session)


@router.get("/sessions", response_model=list[KnowledgeChatSessionListItem])
async def list_chat_sessions(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await knowledge_chat_service.list_chat_sessions(
        user, session, limit=limit, offset=offset
    )


@router.get("/sessions/{session_id}", response_model=KnowledgeChatSessionResponse)
async def get_chat_session(
    session_id: str,
    messages_limit: int = Query(
        default=50,
        ge=1,
        le=500,
        description="Return only the most recent N messages. Use ?messages_limit=500 for full history.",
    ),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await knowledge_chat_service.get_chat_session(
        session_id, user, session, messages_limit=messages_limit
    )


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_chat_session(
    session_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await knowledge_chat_service.delete_chat_session(session_id, user, session)


@router.post(
    "/sessions/{session_id}/messages",
    response_model=KnowledgeChatSendMessageResponse,
)
async def send_chat_message(
    session_id: str,
    req: KnowledgeChatMessageCreateRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await knowledge_chat_service.send_chat_message(session_id, req, user, session)


@router.get("/sessions/{session_id}/stream")
async def knowledge_chat_stream(
    session_id: str,
    ticket: str = Query(
        ..., description="One-time SSE ticket from POST /notifications/sse-ticket"
    ),
):
    user_id = consume_ticket(ticket)
    if user_id is None:
        raise HTTPException(status_code=403, detail="Invalid or expired SSE ticket")

    async with async_session_factory() as session:
        await knowledge_chat_service.assert_stream_access(
            session_id,
            user_id=user_id,
            session=session,
        )

    sse_manager = SSEManager.get_instance()
    queue = await sse_manager.create_subscriber(session_id)

    async def event_generator():
        async for event_str in sse_manager.consume(session_id, queue):
            yield event_str

    return EventSourceResponse(event_generator())
