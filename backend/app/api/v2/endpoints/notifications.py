"""Notification API endpoints."""

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.app.core.database import async_session_factory, get_session
from backend.app.core.deps import get_current_user
from backend.app.core.security import decode_access_token
from backend.app.core.ws_manager import ws_manager
from backend.app.models.user import User
from backend.app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    content: str | None
    category: str
    is_read: bool
    action_url: str | None
    sender_id: int | None
    created_at: str

    model_config = {"from_attributes": True}


class UnreadCountResponse(BaseModel):
    count: int


@router.get("/", response_model=list[NotificationResponse])
async def list_notifications(
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List notifications for the current user."""
    notifs = await notification_service.list_notifications(
        user.id, session, unread_only=unread_only, limit=limit, offset=offset
    )
    return [
        NotificationResponse(
            id=n.id,
            type=n.type,
            title=n.title,
            content=n.content,
            category=n.category,
            is_read=n.is_read,
            action_url=n.action_url,
            sender_id=n.sender_id,
            created_at=str(n.created_at),
        )
        for n in notifs
    ]


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get the number of unread notifications."""
    count = await notification_service.get_unread_count(user.id, session)
    return UnreadCountResponse(count=count)


@router.patch("/{notification_id}/read", status_code=204)
async def mark_notification_read(
    notification_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Mark a notification as read."""
    success = await notification_service.mark_read(notification_id, user.id, session)
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")


@router.post("/read-all", status_code=204)
async def mark_all_read(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Mark all notifications as read."""
    await notification_service.mark_all_read(user.id, session)


@router.post("/sse-ticket")
async def get_sse_ticket(current_user: User = Depends(get_current_user)):
    """Issue a one-time SSE ticket for the current user.

    Browser EventSource cannot send Authorization headers, so callers must
    first POST here to receive a short-lived ticket, then pass it as
    ?ticket=<value> to the SSE stream endpoint.
    """
    from backend.app.core.sse_ticket import issue_ticket

    return {"ticket": issue_ticket(current_user.id)}


@router.websocket("/ws")
async def notifications_ws(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token"),
):
    """WebSocket endpoint for real-time notification count updates.
    Connect with: ws://host/api/v2/notifications/ws?token=<jwt>
    Messages: {"type": "unread_count", "count": N}
    """
    payload = decode_access_token(token)
    if payload is None:
        await websocket.close(code=1008, reason="Invalid token")
        return

    user_id: int | None = payload.get("sub")
    if user_id is None:
        await websocket.close(code=1008, reason="Invalid token")
        return

    # Auth + initial unread count in a short-lived DB session
    async with async_session_factory() as session:
        result = await session.execute(select(User).where(User.id == int(user_id)))
        user = result.scalar_one_or_none()
        if user is None or not user.is_active:
            await websocket.close(code=1008, reason="User not found")
            return
        uid = user.id
        initial_count = await notification_service.get_unread_count(uid, session)

    await ws_manager.connect(uid, websocket)
    try:
        await ws_manager.push_unread_count(uid, initial_count)
        # Keep connection alive — client messages are ignored (server-push only)
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(uid, websocket)
