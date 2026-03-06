"""Notification service — CRUD + unread count + WebSocket push."""

from datetime import datetime, timezone

from sqlalchemy import func, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.app.core.ws_manager import ws_manager
from backend.app.models.notification import Notification


async def create_notification(
    user_id: int,
    type: str,
    title: str,
    content: str | None = None,
    category: str = "info",
    action_url: str | None = None,
    sender_id: int | None = None,
    metadata: dict | None = None,
    *,
    db: AsyncSession,
) -> Notification:
    """Create a notification for a user and push an unread-count update via WebSocket."""
    notif = Notification(
        user_id=user_id,
        type=type,
        title=title,
        content=content,
        category=category,
        action_url=action_url,
        sender_id=sender_id,
        metadata_extra=metadata or {},
    )
    db.add(notif)
    await db.commit()
    await db.refresh(notif)

    count = await get_unread_count(user_id, db)
    await ws_manager.push_unread_count(user_id, count)

    return notif


async def list_notifications(
    user_id: int,
    db: AsyncSession,
    *,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[Notification]:
    """List notifications for a user."""
    stmt = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    stmt = stmt.order_by(Notification.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_unread_count(user_id: int, db: AsyncSession) -> int:
    """Get the number of unread notifications."""
    result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.is_read.is_(False),
        )
    )
    return result.scalar_one()


async def mark_read(notification_id: int, user_id: int, db: AsyncSession) -> bool:
    """Mark a single notification as read."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        return False
    notif.is_read = True
    db.add(notif)
    await db.commit()
    return True


async def mark_all_read(user_id: int, db: AsyncSession) -> int:
    """Mark all notifications as read. Returns count updated."""
    result = await db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    await db.commit()
    return result.rowcount


async def send_system_broadcast(
    title: str,
    content: str | None,
    user_ids: list[int],
    *,
    db: AsyncSession,
) -> int:
    """Send a system notification to multiple users. Returns count created."""
    now = datetime.now(timezone.utc).replace(
        tzinfo=None
    )  # shared timestamp for this broadcast batch
    notifications = [
        Notification(
            user_id=uid,
            type="system",
            title=title,
            content=content,
            category="info",
            created_at=now,
        )
        for uid in user_ids
    ]
    db.add_all(notifications)
    await db.commit()

    # Push WS updates for all recipients (best-effort)
    for uid in user_ids:
        unread = await get_unread_count(uid, db)
        await ws_manager.push_unread_count(uid, unread)

    return len(notifications)
