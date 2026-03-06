"""Admin endpoints — system config, user management, stats, broadcasts, content moderation."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.app.core.database import get_session
from backend.app.core.deps import get_admin_user
from backend.app.models.circle import StudyCircle
from backend.app.models.knowledge_base import KnowledgeBase
from backend.app.models.notification import Notification
from backend.app.models.quiz import QuizQuestion, QuizSession
from backend.app.models.user import User
from backend.app.services import config_service, notification_service

router = APIRouter(
    prefix="/admin", tags=["Admin"], dependencies=[Depends(get_admin_user)]
)


class ConfigSetRequest(BaseModel):
    key: str
    value: str
    description: str | None = None


class ConfigResponse(BaseModel):
    id: int
    key: str
    value: str | None
    description: str | None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


@router.get("/system-configs", response_model=list[ConfigResponse])
async def list_configs(
    session: AsyncSession = Depends(get_session),
):
    configs = await config_service.list_configs(session)
    return [ConfigResponse.model_validate(c) for c in configs]


@router.post("/system-configs", response_model=ConfigResponse)
async def set_config(
    req: ConfigSetRequest,
    session: AsyncSession = Depends(get_session),
):
    cfg = await config_service.set_config(req.key, req.value, req.description, session)
    return ConfigResponse.model_validate(cfg)


@router.delete("/system-configs/{key}", status_code=204)
async def delete_config(
    key: str,
    session: AsyncSession = Depends(get_session),
):
    await config_service.delete_config(key, session)


class PlatformStatsResponse(BaseModel):
    total_users: int
    active_users: int
    total_knowledge_bases: int
    total_quiz_sessions: int
    total_questions_generated: int
    completed_sessions: int


@router.get("/stats", response_model=PlatformStatsResponse)
async def get_platform_stats(
    session: AsyncSession = Depends(get_session),
):
    """Global platform statistics."""
    total_users = (
        await session.execute(select(func.count()).select_from(User))
    ).scalar_one()
    active_users = (
        await session.execute(
            select(func.count()).select_from(User).where(User.is_active.is_(True))
        )
    ).scalar_one()
    total_kbs = (
        await session.execute(select(func.count()).select_from(KnowledgeBase))
    ).scalar_one()
    total_sessions = (
        await session.execute(select(func.count()).select_from(QuizSession))
    ).scalar_one()
    completed = (
        await session.execute(
            select(func.count())
            .select_from(QuizSession)
            .where(QuizSession.status == "graded")
        )
    ).scalar_one()

    # total questions: count quiz_questions via sessions
    total_questions = (
        await session.execute(select(func.count()).select_from(QuizQuestion))
    ).scalar_one()

    return PlatformStatsResponse(
        total_users=total_users,
        active_users=active_users,
        total_knowledge_bases=total_kbs,
        total_quiz_sessions=total_sessions,
        total_questions_generated=total_questions,
        completed_sessions=completed,
    )


class UserListItem(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    is_active: bool
    is_admin: bool
    is_superadmin: bool = False
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class UserUpdateRequest(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None
    is_superadmin: bool | None = None


@router.get("/users", response_model=list[UserListItem])
async def list_users(
    search: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
):
    """List all users with optional search."""
    stmt = select(User).order_by(User.created_at.desc()).offset(offset).limit(limit)
    if search:
        stmt = stmt.where(
            User.username.icontains(search)
            | User.email.icontains(search)
            | User.full_name.icontains(search)
        )
    result = await session.execute(stmt)
    return [UserListItem.model_validate(u) for u in result.scalars().all()]


@router.patch("/users/{user_id}", response_model=UserListItem)
async def update_user(
    user_id: int,
    req: UserUpdateRequest,
    current_admin: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Update user status or admin role. Super admin required for role changes."""
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Admin role changes require super admin
    if req.is_admin is not None or req.is_superadmin is not None:
        if not current_admin.is_superadmin:
            raise HTTPException(
                status_code=403, detail="Only super admins can change admin roles"
            )
        # Cannot remove own admin status
        if user_id == current_admin.id and req.is_admin is False:
            raise HTTPException(
                status_code=400, detail="Cannot remove your own admin status"
            )
        if user_id == current_admin.id and req.is_superadmin is False:
            raise HTTPException(
                status_code=400, detail="Cannot remove your own super admin status"
            )

    if req.is_active is not None:
        user.is_active = req.is_active
    if req.is_admin is not None:
        user.is_admin = req.is_admin
    if req.is_superadmin is not None:
        user.is_superadmin = req.is_superadmin
        # Super admin implies admin
        if req.is_superadmin:
            user.is_admin = True
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return UserListItem.model_validate(user)


class BroadcastRequest(BaseModel):
    title: str
    content: str | None = None


class BroadcastResponse(BaseModel):
    sent_count: int


@router.post("/system-broadcasts", response_model=BroadcastResponse)
async def send_broadcast(
    req: BroadcastRequest,
    session: AsyncSession = Depends(get_session),
):
    """Send a system notification to all active users."""
    result = await session.execute(select(User.id).where(User.is_active.is_(True)))
    user_ids = [row[0] for row in result.all()]

    count = await notification_service.send_system_broadcast(
        title=req.title,
        content=req.content,
        user_ids=user_ids,
        db=session,
    )
    return BroadcastResponse(sent_count=count)


class BroadcastItem(BaseModel):
    id: int
    title: str
    content: str | None
    created_at: datetime
    recipient_count: int


@router.get("/system-broadcasts", response_model=list[BroadcastItem])
async def list_broadcasts(
    limit: int = Query(20, le=100),
    session: AsyncSession = Depends(get_session),
):
    """List recent system broadcasts (grouped by title + created_at)."""
    result = await session.execute(
        select(
            func.min(Notification.id).label("id"),
            Notification.title,
            Notification.content,
            Notification.created_at,
            func.count(Notification.id).label("recipient_count"),
        )
        .where(Notification.type == "system")
        .group_by(Notification.title, Notification.content, Notification.created_at)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    rows = result.all()
    return [
        BroadcastItem(
            id=r.id,
            title=r.title,
            content=r.content,
            created_at=r.created_at,
            recipient_count=r.recipient_count,
        )
        for r in rows
    ]


@router.delete("/system-broadcasts/{broadcast_id}")
async def delete_broadcast(
    broadcast_id: int,
    session: AsyncSession = Depends(get_session),
):
    """Delete a system broadcast and all its notification records."""
    broadcast = await session.get(Notification, broadcast_id)
    if not broadcast or broadcast.type != "system":
        raise HTTPException(status_code=404, detail="Broadcast not found")

    result = await session.execute(
        select(Notification).where(
            Notification.type == "system",
            Notification.title == broadcast.title,
            Notification.created_at == broadcast.created_at,
        )
    )
    for n in result.scalars().all():
        await session.delete(n)
    await session.commit()
    return {"ok": True}


class TestLLMRequest(BaseModel):
    api_key: str
    base_url: str | None = None
    model: str


class TestEmbeddingRequest(BaseModel):
    api_key: str
    base_url: str | None = None
    model: str
    dimensions: int | None = None


@router.post("/system-configs/test-llm")
async def test_llm_config(req: TestLLMRequest):
    """Test LLM connection."""
    try:
        chat = ChatOpenAI(
            api_key=req.api_key or "empty",
            base_url=req.base_url if req.base_url else None,
            model=req.model,
            max_retries=1,
            timeout=10,
        )
        # Simple hello world test
        res = await chat.ainvoke(
            [HumanMessage(content="Hello world! Reply with 'OK'.")]
        )
        return {"ok": True, "message": str(res.content)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/system-configs/test-embedding")
async def test_embedding_config(req: TestEmbeddingRequest):
    """Test Embedding connection."""
    try:
        embeddings = OpenAIEmbeddings(
            api_key=req.api_key or "empty",
            base_url=req.base_url if req.base_url else None,
            model=req.model,
            dimensions=req.dimensions
            if req.dimensions and req.dimensions > 0
            else None,
            max_retries=1,
            timeout=10,
            check_embedding_ctx_length=False,
        )
        # Simple test
        res = await embeddings.aembed_query("Hello world!")
        return {"ok": True, "dimensions_returned": len(res)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class AdminKBItem(BaseModel):
    id: int
    name: str
    description: str | None
    owner_id: int
    owner_username: str
    kb_type: str
    document_count: int
    share_code: str | None
    shared_to_plaza_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/knowledge-bases", response_model=list[AdminKBItem])
async def list_admin_knowledge_bases(
    search: str | None = None,
    plaza_only: bool = False,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
):
    """List all knowledge bases for admin moderation."""
    stmt = (
        select(KnowledgeBase, User.username)
        .join(User, KnowledgeBase.owner_id == User.id)
        .order_by(KnowledgeBase.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if search:
        stmt = stmt.where(KnowledgeBase.name.icontains(search))
    if plaza_only:
        stmt = stmt.where(KnowledgeBase.shared_to_plaza_at.is_not(None))

    result = await session.execute(stmt)
    rows = result.all()
    return [
        AdminKBItem(
            id=kb.id,
            name=kb.name,
            description=kb.description,
            owner_id=kb.owner_id,
            owner_username=username,
            kb_type=kb.kb_type,
            document_count=kb.document_count,
            share_code=kb.share_code,
            shared_to_plaza_at=kb.shared_to_plaza_at,
            created_at=kb.created_at,
        )
        for kb, username in rows
    ]


@router.delete("/knowledge-bases/{kb_id}/unpublish", status_code=204)
async def admin_unpublish_kb(
    kb_id: int,
    session: AsyncSession = Depends(get_session),
):
    """Force-remove a knowledge base from the plaza (clear share_code + plaza timestamp)."""
    kb = await session.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    kb.share_code = None
    kb.shared_to_plaza_at = None
    session.add(kb)
    await session.commit()


class AdminCircleItem(BaseModel):
    id: int
    name: str
    description: str | None
    creator_id: int
    creator_username: str
    invite_code: str
    max_members: int
    member_count: int
    is_active: bool
    is_public: bool
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/circles", response_model=list[AdminCircleItem])
async def list_admin_circles(
    search: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
):
    """List all study circles for admin moderation."""
    from backend.app.models.circle import CircleMember

    stmt = (
        select(
            StudyCircle,
            User.username,
            func.count(CircleMember.id).label("member_count"),
        )
        .join(User, StudyCircle.creator_id == User.id)
        .outerjoin(CircleMember, StudyCircle.id == CircleMember.circle_id)
        .group_by(StudyCircle.id, User.username)
        .order_by(StudyCircle.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if search:
        stmt = stmt.where(StudyCircle.name.icontains(search))

    result = await session.execute(stmt)
    rows = result.all()
    return [
        AdminCircleItem(
            id=circle.id,
            name=circle.name,
            description=circle.description,
            creator_id=circle.creator_id,
            creator_username=username,
            invite_code=circle.invite_code,
            max_members=circle.max_members,
            member_count=member_count,
            is_active=circle.is_active,
            is_public=circle.is_public,
            created_at=circle.created_at,
        )
        for circle, username, member_count in rows
    ]


@router.delete("/circles/{circle_id}", status_code=204)
async def admin_delete_circle(
    circle_id: int,
    session: AsyncSession = Depends(get_session),
):
    """Force-dissolve a study circle (deactivate it)."""
    circle = await session.get(StudyCircle, circle_id)
    if not circle:
        raise HTTPException(status_code=404, detail="Circle not found")
    circle.is_active = False
    session.add(circle)
    await session.commit()


# IP Blocking

from backend.app.core.ip_block import (
    block_ip_manually,
    get_ip_block_enabled,
    get_login_history,
    list_blocked_ips,
    set_ip_block_enabled,
    unblock_ip,
)


class IpBlockConfigRequest(BaseModel):
    enabled: bool


@router.get("/ip-block-config")
async def get_ip_block_config():
    return {"enabled": await get_ip_block_enabled()}


@router.post("/ip-block-config")
async def update_ip_block_config(req: IpBlockConfigRequest):
    await set_ip_block_enabled(req.enabled)
    return {"enabled": req.enabled}


@router.get("/blocked-ips")
async def get_blocked_ips(_: User = Depends(get_admin_user)):
    return await list_blocked_ips()


@router.delete("/blocked-ips/{ip}")
async def delete_blocked_ip(ip: str, _: User = Depends(get_admin_user)):
    await unblock_ip(ip)
    return {"ok": True}


@router.post("/blocked-ips/{ip}")
async def manually_block_ip(ip: str, _: User = Depends(get_admin_user)):
    """Admin manually blocks an IP for LOGIN_BLOCK_MINUTES."""
    await block_ip_manually(ip)
    return {"ok": True}


@router.get("/login-history")
async def get_login_history_endpoint(
    limit: int = 100, _: User = Depends(get_admin_user)
):
    """Recent login attempts (up to 200 records stored in Redis)."""
    return await get_login_history(limit)
