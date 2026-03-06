"""
APScheduler — in-process scheduled tasks.

Integrated into the FastAPI lifespan; no external broker needed.
"""

from __future__ import annotations

import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)


async def _daily_assistant_run() -> None:
    """Run AssistantGraph for every active user (full recompute + recommendations)."""
    from sqlmodel import select

    from backend.app.core.database import async_session_factory
    from backend.app.graphs.assistant.graph import assistant_graph
    from backend.app.models.user import User

    async with async_session_factory() as session:
        result = await session.execute(
            select(User.id).where(User.is_active.is_(True))
        )
        user_ids: list[int] = [row[0] for row in result.all()]

    logger.info("Daily assistant run: processing %d users", len(user_ids))
    for uid in user_ids:
        try:
            await assistant_graph.ainvoke({
                "user_id": uid,
                "session_id": None,
                "trigger_type": "scheduled",
            })
        except Exception:
            logger.exception("Assistant graph failed for user %d", uid)


def create_scheduler() -> AsyncIOScheduler:
    """Build and return a configured AsyncIOScheduler (not yet started)."""
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        _daily_assistant_run,
        trigger=CronTrigger(hour=0, minute=0),  # every day at 00:00 UTC
        id="daily_assistant",
        name="Daily full profile recompute",
        replace_existing=True,
    )
    return scheduler
