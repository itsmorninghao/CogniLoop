"""Course service — CRUD and learning progress."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.app.core.config import settings
from backend.app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from backend.app.models.course import (
    Course,
    CourseNode,
    CourseNodeContent,
    CourseProgress,
    CourseQuiz,
)
from backend.app.models.user import User
from backend.app.schemas.course import (
    CoursePlazaItem,
    CourseListItem,
    CourseNodeResponse,
    CourseResponse,
    CourseUpdateRequest,
    GenerationStatusResponse,
    NodeContentResponse,
    NodeProgressResponse,
    NodeProgressUpdate,
)

logger = logging.getLogger(__name__)

_MAX_COVER_SIZE = 10 * 1024 * 1024  # 10 MB


async def _get_course_or_404(course_id: int, session: AsyncSession) -> Course:
    result = await session.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise NotFoundError("课程不存在")
    return course


async def _build_course_response(
    course: Course,
    session: AsyncSession,
    user_id: int | None = None,
) -> CourseResponse:
    """Build full CourseResponse with nodes and progress."""
    nodes_result = await session.execute(
        select(CourseNode).where(CourseNode.course_id == course.id).order_by(CourseNode.order)
    )
    nodes = nodes_result.scalars().all()

    # Fetch gen_status for leaf nodes
    leaf_ids = [n.id for n in nodes if n.is_leaf and n.id is not None]
    content_map: dict[int, str] = {}
    if leaf_ids:
        content_result = await session.execute(
            select(CourseNodeContent.node_id, CourseNodeContent.gen_status).where(
                CourseNodeContent.node_id.in_(leaf_ids)
            )
        )
        content_map = {row[0]: row[1] for row in content_result}

    # Fetch user progress
    progress_map: dict[int, str] = {}
    if user_id and leaf_ids:
        progress_result = await session.execute(
            select(CourseProgress.node_id, CourseProgress.status).where(
                CourseProgress.user_id == user_id,
                CourseProgress.course_id == course.id,
            )
        )
        progress_map = {row[0]: row[1] for row in progress_result}

    node_responses = [
        CourseNodeResponse(
            id=n.id,  # type: ignore[arg-type]
            parent_id=n.parent_id,
            title=n.title,
            order=n.order,
            depth=n.depth,
            is_leaf=n.is_leaf,
            content_type=n.content_type,
            gen_status=content_map.get(n.id) if n.is_leaf else None,  # type: ignore[arg-type]
            progress_status=progress_map.get(n.id, "not_started") if n.is_leaf else None,  # type: ignore[arg-type]
        )
        for n in nodes
    ]

    total_leaf = len(leaf_ids)
    completed_leaf = sum(1 for v in progress_map.values() if v == "completed")
    progress_pct = (completed_leaf / total_leaf * 100) if total_leaf > 0 else 0.0

    return CourseResponse(
        id=course.id,  # type: ignore[arg-type]
        title=course.title,
        creator_id=course.creator_id,
        kb_ids=course.kb_ids or [],
        level=course.level,
        voice_id=course.voice_id,
        theme=course.theme,
        cover_url=course.cover_url,
        visibility=course.visibility,
        status=course.status,
        created_at=course.created_at,
        updated_at=course.updated_at,
        nodes=node_responses,
        total_leaf_nodes=total_leaf,
        completed_leaf_nodes=completed_leaf,
        progress_pct=round(progress_pct, 1),
    )


async def list_my_courses(
    user: User,
    session: AsyncSession,
    limit: int = 100,
    offset: int = 0,
) -> list[CourseListItem]:
    result = await session.execute(
        select(Course)
        .where(Course.creator_id == user.id)
        .order_by(Course.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    courses = result.scalars().all()

    items = []
    for c in courses:
        leaf_result = await session.execute(
            select(func.count()).select_from(CourseNode).where(
                CourseNode.course_id == c.id,
                CourseNode.is_leaf == True,  # noqa: E712
            )
        )
        total_leaf = leaf_result.scalar() or 0

        completed_result = await session.execute(
            select(func.count()).select_from(CourseProgress).where(
                CourseProgress.course_id == c.id,
                CourseProgress.user_id == user.id,
                CourseProgress.status == "completed",
            )
        )
        completed_leaf = completed_result.scalar() or 0
        progress_pct = (completed_leaf / total_leaf * 100) if total_leaf > 0 else 0.0

        items.append(
            CourseListItem(
                id=c.id,  # type: ignore[arg-type]
                title=c.title,
                level=c.level,
                cover_url=c.cover_url,
                visibility=c.visibility,
                status=c.status,
                created_at=c.created_at,
                total_leaf_nodes=total_leaf,
                completed_leaf_nodes=completed_leaf,
                progress_pct=round(progress_pct, 1),
            )
        )
    return items


async def get_course_detail(
    course_id: int,
    user: User,
    session: AsyncSession,
) -> CourseResponse:
    course = await _get_course_or_404(course_id, session)
    # Public courses visible to all; private only to creator
    if course.visibility == "private" and course.creator_id != user.id:
        raise ForbiddenError("无权访问此课程")
    return await _build_course_response(course, session, user_id=user.id)


async def update_course(
    course_id: int,
    req: CourseUpdateRequest,
    user: User,
    session: AsyncSession,
) -> CourseResponse:
    course = await _get_course_or_404(course_id, session)
    if course.creator_id != user.id:
        raise ForbiddenError("无权修改此课程")
    if req.title is not None:
        course.title = req.title
    if req.visibility is not None:
        course.visibility = req.visibility
    course.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(course)
    await session.flush()
    await session.refresh(course)
    return await _build_course_response(course, session, user_id=user.id)


async def delete_course(course_id: int, user: User, session: AsyncSession) -> None:
    course = await _get_course_or_404(course_id, session)
    if course.creator_id != user.id:
        raise ForbiddenError("无权删除此课程")
    await session.delete(course)
    await session.flush()


async def upload_cover(
    course_id: int,
    file: UploadFile,
    user: User,
    session: AsyncSession,
) -> CourseResponse:
    course = await _get_course_or_404(course_id, session)
    if course.creator_id != user.id:
        raise ForbiddenError("无权修改此课程")

    data = await file.read()
    if len(data) > _MAX_COVER_SIZE:
        raise BadRequestError("封面图片不能超过 10 MB")

    ext = Path(file.filename or "cover.jpg").suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise BadRequestError("仅支持 JPG / PNG / WebP 格式")

    covers_dir = settings.upload_path / "course_covers"
    covers_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{ext}"
    dest = covers_dir / filename
    dest.write_bytes(data)

    course.cover_url = f"/uploads/course_covers/{filename}"
    course.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(course)
    await session.flush()
    await session.refresh(course)
    return await _build_course_response(course, session, user_id=user.id)


async def toggle_publish(
    course_id: int,
    user: User,
    session: AsyncSession,
) -> CourseResponse:
    course = await _get_course_or_404(course_id, session)
    if course.creator_id != user.id:
        raise ForbiddenError("无权操作此课程")
    if course.status not in ("ready", "partial_failed"):
        raise BadRequestError("课程尚未生成完成，无法发布")

    if course.visibility == "private":
        course.visibility = "public"
        course.shared_to_plaza_at = datetime.now(timezone.utc).replace(tzinfo=None)
    else:
        course.visibility = "private"
        course.shared_to_plaza_at = None

    course.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(course)
    await session.flush()
    await session.refresh(course)
    return await _build_course_response(course, session, user_id=user.id)


async def get_node_content(
    course_id: int,
    node_id: int,
    user: User,
    session: AsyncSession,
) -> NodeContentResponse:
    course = await _get_course_or_404(course_id, session)
    if course.visibility == "private" and course.creator_id != user.id:
        raise ForbiddenError("无权访问此课程")

    node_result = await session.execute(
        select(CourseNode).where(CourseNode.id == node_id, CourseNode.course_id == course_id)
    )
    node = node_result.scalar_one_or_none()
    if not node:
        raise NotFoundError("节点不存在")
    if not node.is_leaf:
        raise BadRequestError("非叶节点无内容")

    content_result = await session.execute(
        select(CourseNodeContent).where(CourseNodeContent.node_id == node_id)
    )
    content = content_result.scalar_one_or_none()

    # Quiz for this node
    quiz_result = await session.execute(
        select(CourseQuiz.quiz_session_id).where(CourseQuiz.node_id == node_id)
    )
    quiz_row = quiz_result.first()

    return NodeContentResponse(
        node_id=node_id,
        content_type=node.content_type or "text",
        gen_status=content.gen_status if content else "pending",
        video_url=content.video_url if content else None,
        text_content=content.text_content if content else None,
        script_json=content.script_json if content else None,
        error_msg=content.error_msg if content else None,
        retry_count=content.retry_count if content else 0,
        quiz_session_id=quiz_row[0] if quiz_row else None,
    )


async def update_node_progress(
    course_id: int,
    node_id: int,
    req: NodeProgressUpdate,
    user: User,
    session: AsyncSession,
) -> NodeProgressResponse:
    # Verify access
    course = await _get_course_or_404(course_id, session)
    if course.visibility == "private" and course.creator_id != user.id:
        raise ForbiddenError("无权访问此课程")

    # Verify node belongs to course
    node_result = await session.execute(
        select(CourseNode).where(CourseNode.id == node_id, CourseNode.course_id == course_id)
    )
    node = node_result.scalar_one_or_none()
    if not node or not node.is_leaf:
        raise NotFoundError("叶节点不存在")

    progress_result = await session.execute(
        select(CourseProgress).where(
            CourseProgress.user_id == user.id,
            CourseProgress.node_id == node_id,
        )
    )
    progress = progress_result.scalar_one_or_none()

    completed_at = None
    if req.status == "completed":
        completed_at = datetime.now(timezone.utc).replace(tzinfo=None)

    if progress:
        progress.status = req.status
        progress.completed_at = completed_at
    else:
        progress = CourseProgress(
            user_id=user.id,
            node_id=node_id,
            course_id=course_id,
            status=req.status,
            completed_at=completed_at,
        )

    session.add(progress)
    await session.flush()

    return NodeProgressResponse(
        node_id=node_id,
        status=progress.status,
        completed_at=progress.completed_at,
    )


async def list_plaza_courses(
    session: AsyncSession,
    limit: int = 20,
    offset: int = 0,
) -> list[CoursePlazaItem]:
    from sqlalchemy import text as sa_text
    result = await session.execute(
        select(Course, User.username.label("creator_name"))
        .join(User, User.id == Course.creator_id)
        .where(Course.visibility == "public", Course.status.in_(["ready", "partial_failed"]))
        .order_by(Course.shared_to_plaza_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = result.all()

    items = []
    for row in rows:
        c = row[0]
        creator_name = row[1]
        leaf_result = await session.execute(
            select(func.count()).select_from(CourseNode).where(
                CourseNode.course_id == c.id,
                CourseNode.is_leaf == True,  # noqa: E712
            )
        )
        total_leaf = leaf_result.scalar() or 0
        items.append(
            CoursePlazaItem(
                id=c.id,  # type: ignore[arg-type]
                title=c.title,
                level=c.level,
                cover_url=c.cover_url,
                creator_id=c.creator_id,
                creator_name=creator_name,
                status=c.status,
                created_at=c.created_at,
                total_leaf_nodes=total_leaf,
            )
        )
    return items


async def get_generation_status(
    course_id: int,
    user: User,
    session: AsyncSession,
) -> GenerationStatusResponse:
    course = await _get_course_or_404(course_id, session)
    if course.creator_id != user.id:
        raise ForbiddenError("无权查看此课程")

    nodes_result = await session.execute(
        select(CourseNode).where(CourseNode.course_id == course_id, CourseNode.is_leaf == True)  # noqa: E712
    )
    nodes = nodes_result.scalars().all()
    node_ids = [n.id for n in nodes]

    content_result = await session.execute(
        select(CourseNodeContent).where(CourseNodeContent.node_id.in_(node_ids))
    )
    contents = {c.node_id: c for c in content_result.scalars().all()}

    node_statuses = []
    done = 0
    failed = 0
    for n in nodes:
        c = contents.get(n.id)  # type: ignore[arg-type]
        status = c.gen_status if c else "pending"
        if status == "done":
            done += 1
        elif status == "failed":
            failed += 1
        node_statuses.append({
            "node_id": n.id,
            "title": n.title,
            "gen_status": status,
            "error_msg": c.error_msg if c else None,
        })

    return GenerationStatusResponse(
        course_id=course_id,
        status=course.status,
        total_nodes=len(nodes),
        done_nodes=done,
        failed_nodes=failed,
        node_statuses=node_statuses,
    )
