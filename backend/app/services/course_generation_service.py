"""Course generation service — orchestrates LangGraph pipelines for AI Course Studio.

Phase 1 (synchronous):  generate_outline()   → outline_generation_graph
Phase 2 (background):   confirm_outline()    → node_generation_graph (per leaf node)
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.app.core.database import async_session_factory
from backend.app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from backend.app.core.ws_manager import ws_manager
from backend.app.graphs.course_generation.node_graph import node_generation_graph
from backend.app.graphs.course_generation.outline_graph import outline_generation_graph
from backend.app.models.course import (
    Course,
    CourseNode,
    CourseNodeContent,
)
from backend.app.models.user import User
from backend.app.schemas.course import (
    NodeEditRequest,
    OutlineConfirmRequest,
    OutlineDraftResponse,
    OutlineGenerateRequest,
    OutlineNodeDraft,
)

logger = logging.getLogger(__name__)

# Strong references to background tasks so they aren't GC'd
_background_tasks: set = set()

# Redis draft TTL: 30 minutes
_DRAFT_TTL = 1800

# Max concurrent leaf-node generations
_GEN_CONCURRENCY = 3


# Redis helpers

async def _save_draft(draft_id: str, data: dict) -> None:
    try:
        import redis.asyncio as aioredis
        from backend.app.core.config import settings

        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            await r.setex(f"outline_draft:{draft_id}", _DRAFT_TTL, json.dumps(data))
        finally:
            await r.aclose()
    except Exception as e:
        logger.warning("Failed to save draft to Redis: %s", e)


async def _load_draft(draft_id: str) -> dict | None:
    try:
        import redis.asyncio as aioredis
        from backend.app.core.config import settings

        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            raw = await r.get(f"outline_draft:{draft_id}")
        finally:
            await r.aclose()
        if raw:
            return json.loads(raw)
    except Exception as e:
        logger.warning("Failed to load draft from Redis: %s", e)
    return None


async def _delete_draft(draft_id: str) -> None:
    try:
        import redis.asyncio as aioredis
        from backend.app.core.config import settings

        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            await r.delete(f"outline_draft:{draft_id}")
        finally:
            await r.aclose()
    except Exception as e:
        logger.warning("Failed to delete draft from Redis: %s", e)


# Phase 1: Outline Generation

async def generate_outline(
    req: OutlineGenerateRequest,
    user: User,
    session: AsyncSession,
) -> OutlineDraftResponse:
    """Phase 1: Generate outline draft from KB(s) via outline_generation_graph."""
    result = await outline_generation_graph.ainvoke({
        "kb_ids": req.kb_ids,
        "level": req.level,
        "voice_id": req.voice_id,
        "user_id": user.id,
    })

    course_title: str = result.get("course_title", "未命名课程")
    raw_nodes: list[dict] = result.get("nodes", [])

    nodes = [
        OutlineNodeDraft(
            temp_id=n.get("temp_id", str(i)),
            parent_temp_id=n.get("parent_temp_id"),
            title=n.get("title", ""),
            depth=n.get("depth", 1),
            order=n.get("order", i),
            is_leaf=n.get("is_leaf", True),
            content_type=n.get("content_type"),
        )
        for i, n in enumerate(raw_nodes)
    ]

    draft_id = uuid.uuid4().hex
    draft_data = {
        "draft_id": draft_id,
        "user_id": user.id,
        "kb_ids": req.kb_ids,
        "level": req.level,
        "voice_id": req.voice_id,
        "course_title": course_title,
        "nodes": [n.model_dump() for n in nodes],
    }
    await _save_draft(draft_id, draft_data)

    return OutlineDraftResponse(
        draft_id=draft_id,
        course_title=course_title,
        nodes=nodes,
    )


async def edit_outline_draft(
    draft_id: str,
    req: NodeEditRequest,
    user: User,
) -> OutlineDraftResponse:
    """Update the outline draft nodes (user edits titles, types, structure)."""
    draft = await _load_draft(draft_id)
    if not draft:
        raise NotFoundError("大纲草稿不存在或已过期")
    if draft["user_id"] != user.id:
        raise ForbiddenError("无权修改此草稿")

    draft["nodes"] = [n.model_dump() for n in req.nodes]
    await _save_draft(draft_id, draft)

    return OutlineDraftResponse(
        draft_id=draft_id,
        course_title=draft["course_title"],
        nodes=req.nodes,
    )


async def confirm_outline(
    draft_id: str,
    req: OutlineConfirmRequest,
    user: User,
    session: AsyncSession,
) -> dict:
    """Confirm outline: create Course + CourseNodes in DB, then trigger Phase 2."""
    draft = await _load_draft(draft_id)
    if not draft:
        raise NotFoundError("大纲草稿不存在或已过期，请重新生成")
    if draft["user_id"] != user.id:
        raise ForbiddenError("无权操作此草稿")

    # Create Course record
    course = Course(
        title=req.course_title,
        creator_id=user.id,
        kb_ids=draft["kb_ids"],
        level=draft["level"],
        voice_id=draft.get("voice_id"),
        status="generating",
    )
    session.add(course)
    await session.flush()
    await session.refresh(course)

    # Create CourseNodes preserving parent relationships via temp_id mapping
    temp_id_to_db_id: dict[str, int] = {}
    for node_data in req.nodes:
        parent_db_id = (
            temp_id_to_db_id.get(node_data.parent_temp_id)
            if node_data.parent_temp_id
            else None
        )
        node = CourseNode(
            course_id=course.id,
            parent_id=parent_db_id,
            title=node_data.title,
            order=node_data.order,
            depth=node_data.depth,
            is_leaf=node_data.is_leaf,
            content_type=node_data.content_type if node_data.is_leaf else None,
        )
        session.add(node)
        await session.flush()
        await session.refresh(node)
        temp_id_to_db_id[node_data.temp_id] = node.id  # type: ignore[assignment]

        if node_data.is_leaf:
            session.add(CourseNodeContent(node_id=node.id, gen_status="pending"))

    await session.flush()
    # draft_id is passed to the background task so deletion happens after
    # this request's DB session commits (background tasks run after response is sent)

    # Launch Phase 2 in background (also cleans up the Redis draft)
    task = asyncio.create_task(_run_generation_pipeline(course.id, user.id, draft_id))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return {"course_id": course.id, "status": "generating"}


async def retry_node(node_id: int, user: User, session: AsyncSession) -> dict:
    """Retry generation for a single failed leaf node."""
    node = (await session.execute(
        select(CourseNode).where(CourseNode.id == node_id)
    )).scalar_one_or_none()
    if not node:
        raise NotFoundError("节点不存在")

    course = (await session.execute(
        select(Course).where(Course.id == node.course_id)
    )).scalar_one_or_none()
    if not course or course.creator_id != user.id:
        raise ForbiddenError("无权操作此节点")

    content = (await session.execute(
        select(CourseNodeContent).where(CourseNodeContent.node_id == node_id)
    )).scalar_one_or_none()
    if not content:
        raise NotFoundError("节点内容记录不存在")

    if content.retry_count >= 3:
        raise BadRequestError("已达最大重试次数（3次）")

    content.gen_status = "pending"
    content.error_msg = None
    session.add(content)
    await session.flush()

    task = asyncio.create_task(
        _generate_single_node(course.id, node.id, course.level, list(course.kb_ids),
                               course.voice_id, user.id)
    )
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return {"node_id": node_id, "status": "retrying"}


# Phase 2: Generation Pipeline

async def _run_generation_pipeline(course_id: int, user_id: int, draft_id: str | None = None) -> None:
    """Background: run node_generation_graph for every leaf node (with concurrency limit)."""
    # Delete Redis draft now that the DB transaction has committed
    if draft_id:
        await _delete_draft(draft_id)
    async with async_session_factory() as session:
        course = (await session.execute(
            select(Course).where(Course.id == course_id)
        )).scalar_one_or_none()
        if not course:
            return

        leaf_nodes = (await session.execute(
            select(CourseNode).where(
                CourseNode.course_id == course_id,
                CourseNode.is_leaf == True,  # noqa: E712
            )
        )).scalars().all()

        kb_ids: list[int] = list(course.kb_ids or [])
        voice_id: str | None = course.voice_id
        level: str = course.level

    if not leaf_nodes:
        async with async_session_factory() as session:
            await _mark_course_status(course_id, "ready", session)
            await session.commit()
        return

    semaphore = asyncio.Semaphore(_GEN_CONCURRENCY)

    async def run_with_semaphore(node: CourseNode) -> None:
        async with semaphore:
            await _generate_single_node(
                course_id=course_id,
                node_id=node.id,
                level=level,
                kb_ids=kb_ids,
                voice_id=voice_id,
                user_id=user_id,
            )

    await asyncio.gather(*[run_with_semaphore(n) for n in leaf_nodes], return_exceptions=True)

    # Determine final course status
    async with async_session_factory() as session:
        node_ids = [n.id for n in leaf_nodes]
        contents = (await session.execute(
            select(CourseNodeContent).where(CourseNodeContent.node_id.in_(node_ids))
        )).scalars().all()

        all_done = all(c.gen_status == "done" for c in contents)
        any_failed = any(c.gen_status == "failed" for c in contents)
        final_status = "ready" if all_done else ("partial_failed" if any_failed else "generating")
        await _mark_course_status(course_id, final_status, session)
        await session.commit()

    await ws_manager.push(user_id, {
        "type": "course_generation_complete",
        "course_id": course_id,
        "status": final_status,
    })


async def _generate_single_node(
    course_id: int,
    node_id: int,
    level: str,
    kb_ids: list[int],
    voice_id: str | None,
    user_id: int,
) -> None:
    """Run node_generation_graph for one leaf node and persist results to DB."""
    node_title: str = ""
    node_content_type: str = "text"
    async with async_session_factory() as session:
        node = (await session.execute(
            select(CourseNode).where(CourseNode.id == node_id)
        )).scalar_one_or_none()
        if not node:
            return

        content = (await session.execute(
            select(CourseNodeContent).where(CourseNodeContent.node_id == node_id)
        )).scalar_one_or_none()
        if not content:
            return

        # Read scalar attributes before session closes to avoid DetachedInstanceError
        node_title = node.title
        node_content_type = node.content_type or "text"

        # Mark as generating
        content.gen_status = "generating"
        content.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.add(content)
        await session.flush()
        await session.commit()

    try:
        result = await node_generation_graph.ainvoke({
            "node_id": node_id,
            "course_id": course_id,
            "node_title": node_title,
            "content_type": node_content_type,
            "level": level,
            "kb_ids": kb_ids,
            "voice_id": voice_id,
            "user_id": user_id,
        })

        async with async_session_factory() as session:
            content = (await session.execute(
                select(CourseNodeContent).where(CourseNodeContent.node_id == node_id)
            )).scalar_one_or_none()
            if not content:
                return

            content.video_url = result.get("video_url")
            content.text_content = result.get("text_content")
            content.script_json = result.get("script_json")
            content.gen_status = "done"
            content.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            session.add(content)
            await session.flush()
            await session.commit()

            done_count = await _count_done_nodes(course_id, session)
            total_count = await _count_leaf_nodes(course_id, session)

        await ws_manager.push(user_id, {
            "type": "course_node_done",
            "course_id": course_id,
            "node_id": node_id,
            "node_title": node_title,
            "done": done_count,
            "total": total_count,
        })

    except Exception as e:
        logger.error("Node %d generation failed: %s", node_id, e, exc_info=True)

        async with async_session_factory() as session:
            content = (await session.execute(
                select(CourseNodeContent).where(CourseNodeContent.node_id == node_id)
            )).scalar_one_or_none()
            if content:
                content.gen_status = "failed"
                content.error_msg = str(e)[:1000]
                content.retry_count += 1
                content.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                session.add(content)
                await session.flush()
                await session.commit()

                if content.retry_count >= 3:
                    await ws_manager.push(user_id, {
                        "type": "course_node_failed",
                        "course_id": course_id,
                        "node_id": node_id,
                        "node_title": node_title,
                        "message": "节点生成连续失败3次，请检查配置",
                    })


# DB helpers

async def _mark_course_status(course_id: int, status: str, session: AsyncSession) -> None:
    course = (await session.execute(
        select(Course).where(Course.id == course_id)
    )).scalar_one_or_none()
    if course:
        course.status = status
        course.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.add(course)
        await session.flush()


async def _count_done_nodes(course_id: int, session: AsyncSession) -> int:
    from sqlalchemy import func
    result = await session.execute(
        select(func.count()).select_from(CourseNodeContent)
        .join(CourseNode, CourseNode.id == CourseNodeContent.node_id)
        .where(
            CourseNode.course_id == course_id,
            CourseNodeContent.gen_status == "done",
        )
    )
    return result.scalar() or 0


async def _count_leaf_nodes(course_id: int, session: AsyncSession) -> int:
    from sqlalchemy import func
    result = await session.execute(
        select(func.count()).select_from(CourseNode).where(
            CourseNode.course_id == course_id,
            CourseNode.is_leaf == True,  # noqa: E712
        )
    )
    return result.scalar() or 0
