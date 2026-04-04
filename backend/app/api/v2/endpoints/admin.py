"""Admin endpoints — system config, user management, stats, broadcasts, content moderation."""

import base64
import json
import logging
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import Response
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.app.core.database import get_session
from backend.app.core.deps import get_admin_user
from backend.app.models.circle import StudyCircle
from backend.app.models.knowledge_base import KBDocument, KnowledgeBase
from backend.app.models.notification import Notification
from backend.app.models.quiz import QuizQuestion, QuizSession
from backend.app.models.user import User
from backend.app.services import config_service, notification_service
from backend.app.services.exam_template_service import OCR_STRUCTURING_SYSTEM_PROMPT

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
    return [ConfigResponse(**c) for c in configs]


@router.post("/system-configs", response_model=ConfigResponse)
async def set_config(
    req: ConfigSetRequest,
    session: AsyncSession = Depends(get_session),
):
    if config_service.is_masked(req.value):
        from backend.app.models.system_config import SystemConfig as SC

        result = await session.execute(select(SC).where(SC.key == req.key))
        existing = result.scalar_one_or_none()
        if existing:
            return ConfigResponse.model_validate(existing)
    cfg = await config_service.set_config(req.key, req.value, req.description, session)
    return ConfigResponse.model_validate(cfg)


@router.delete("/system-configs/{key}", status_code=204)
async def delete_config(
    key: str,
    session: AsyncSession = Depends(get_session),
):
    await config_service.delete_config(key, session)


@router.post("/system-configs/export")
async def export_configs(
    current_admin: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Export all configs with plaintext secrets for migration. Superadmin only."""
    if not current_admin.is_superadmin:
        raise HTTPException(status_code=403, detail="仅超级管理员可导出配置")
    configs = await config_service.export_configs(session)
    content = json.dumps(configs, ensure_ascii=False, indent=2)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=cogniloop-configs.json"},
    )


class ConfigImportItem(BaseModel):
    key: str
    value: str | None = None
    description: str | None = None


@router.post("/system-configs/import")
async def import_configs(
    items: list[ConfigImportItem],
    current_admin: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Import configs from exported JSON. Superadmin only."""
    if not current_admin.is_superadmin:
        raise HTTPException(status_code=403, detail="仅超级管理员可导入配置")
    count = 0
    for item in items:
        if item.key and item.value is not None:
            await config_service.set_config(
                item.key, item.value, item.description, session
            )
            count += 1
    await session.commit()
    return {"imported": count}


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


class PaginatedUsers(BaseModel):
    items: list[UserListItem]
    total: int


@router.get("/users", response_model=PaginatedUsers)
async def list_users(
    search: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
):
    """List all users with optional search."""
    base = select(User)
    if search:
        base = base.where(
            User.username.icontains(search)
            | User.email.icontains(search)
            | User.full_name.icontains(search)
        )
    total = (
        await session.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()
    items_result = await session.execute(
        base.order_by(User.created_at.desc()).offset(offset).limit(limit)
    )
    return PaginatedUsers(
        items=[UserListItem.model_validate(u) for u in items_result.scalars().all()],
        total=total,
    )


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

    if req.is_admin is not None or req.is_superadmin is not None:
        if not current_admin.is_superadmin:
            raise HTTPException(
                status_code=403, detail="Only super admins can change admin roles"
            )
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
    api_key: str | None = None
    base_url: str | None = None
    model: str
    use_stored: bool = False


class TestEmbeddingRequest(BaseModel):
    api_key: str | None = None
    base_url: str | None = None
    model: str
    dimensions: int | None = None
    use_stored: bool = False


@router.post("/system-configs/test-llm")
async def test_llm_config(
    req: TestLLMRequest,
    session: AsyncSession = Depends(get_session),
):
    """Test LLM connection."""
    api_key = req.api_key
    if not api_key or config_service.is_masked(api_key) or req.use_stored:
        api_key = await config_service.get_config("OPENAI_API_KEY", session)
    try:
        chat = ChatOpenAI(
            api_key=api_key or "empty",
            base_url=req.base_url if req.base_url else None,
            model=req.model,
            max_retries=1,
            timeout=10,
        )
        res = await chat.ainvoke(
            [HumanMessage(content="Hello world! Reply with 'OK'.")]
        )
        return {
            "ok": True,
            "message": str(res.content),
            "prompt": "Hello world! Reply with 'OK'.",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/system-configs/test-embedding")
async def test_embedding_config(
    req: TestEmbeddingRequest,
    session: AsyncSession = Depends(get_session),
):
    """Test Embedding connection."""
    api_key = req.api_key
    if not api_key or config_service.is_masked(api_key) or req.use_stored:
        api_key = await config_service.get_config("EMBEDDING_API_KEY", session)
    try:
        embeddings = OpenAIEmbeddings(
            api_key=api_key or "empty",
            base_url=req.base_url if req.base_url else None,
            model=req.model,
            dimensions=req.dimensions
            if req.dimensions and req.dimensions > 0
            else None,
            max_retries=1,
            timeout=10,
            check_embedding_ctx_length=False,
        )
        test_text = "Hello world!"
        res = await embeddings.aembed_query(test_text)
        return {"ok": True, "dimensions_returned": len(res), "test_text": test_text}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


_OCR_TEST_IMAGE = (
    Path(__file__).parent.parent.parent.parent / "assets" / "ocr_test_sample.png"
)


@router.post("/system-configs/test-ocr")
async def test_ocr_config(
    session: AsyncSession = Depends(get_session),
):
    """Test OCR connection using the built-in test sample image."""
    from openai import AsyncOpenAI

    api_key = await config_service.get_config(
        "OCR_API_KEY", session
    ) or await config_service.get_config("OPENAI_API_KEY", session)
    base_url = await config_service.get_config(
        "OCR_API_URL", session
    ) or await config_service.get_config("OPENAI_BASE_URL", session)
    model = await config_service.get_config("OCR_MODEL", session) or "gpt-4o"

    ocr_mode = await config_service.get_config("OCR_MODE", session) or "multimodal"
    ocr_llm_model = await config_service.get_config(
        "OCR_LLM_MODEL", session
    ) or await config_service.get_config("OPENAI_MODEL", session)
    llm_key = await config_service.get_config("OPENAI_API_KEY", session)
    llm_base_url = await config_service.get_config("OPENAI_BASE_URL", session)

    if not api_key:
        raise HTTPException(status_code=400, detail="未配置 OCR 或 LLM API Key")

    if not _OCR_TEST_IMAGE.exists():
        raise HTTPException(status_code=500, detail="测试图片不存在，请联系管理员")

    img_bytes = _OCR_TEST_IMAGE.read_bytes()
    b64 = base64.b64encode(img_bytes).decode()

    try:
        client = AsyncOpenAI(api_key=api_key, base_url=base_url or None)

        if ocr_mode == "ocr_plus_llm":
            if not llm_key:
                raise HTTPException(
                    status_code=400, detail="未配置全局 LLM API Key（OCR+LLM 模式需要）"
                )

            step1_res = await client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/png;base64,{b64}"},
                            },
                            {
                                "type": "text",
                                "text": "<|grounding|>OCR this image.",
                            },
                        ],
                    }
                ],
                max_tokens=512,
                timeout=20,
            )
            raw_ocr_text = step1_res.choices[0].message.content or ""

            llm_client = AsyncOpenAI(api_key=llm_key, base_url=llm_base_url or None)
            step2_res = await llm_client.chat.completions.create(
                model=ocr_llm_model,
                messages=[
                    {"role": "system", "content": OCR_STRUCTURING_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": f"以下是 OCR 识别文字，请提取所有题目并以 JSON 数组输出：\n\n{raw_ocr_text}",
                    },
                ],
                temperature=0.1,
                max_tokens=512,
                timeout=20,
            )
            structured = step2_res.choices[0].message.content or ""
            return {
                "ok": True,
                "message": structured,
                "image_base64": b64,
                "raw_ocr_text": raw_ocr_text,
                "mode": "ocr_plus_llm",
            }
        else:
            res = await client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/png;base64,{b64}"},
                            },
                        ],
                    }
                ],
                max_tokens=512,
                timeout=20,
            )
            text = res.choices[0].message.content or ""
            return {"ok": True, "message": text, "image_base64": b64}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class TestTTSRequest(BaseModel):
    api_key: str | None = None
    base_url: str | None = None
    voices_json: str | None = None


@router.post("/system-configs/test-tts")
async def test_tts_config(
    req: TestTTSRequest | None = None,
    session: AsyncSession = Depends(get_session),
):
    """Test TTS connection by synthesizing a short sample sentence.

    Accepts optional form values so users can test before saving.
    """
    import json as _json
    import tempfile

    from openai import AsyncOpenAI

    test_text = "这是一段语音合成测试，如果您能听到这段声音，说明 TTS 配置成功。"

    try:
        # Resolve voice from request body or DB
        voices: list[dict] = []
        if req and req.voices_json:
            try:
                parsed = _json.loads(req.voices_json)
                if isinstance(parsed, list) and parsed:
                    voices = parsed
            except _json.JSONDecodeError:
                pass
        if not voices:
            from backend.app.services import tts_service
            voices = await tts_service.get_available_voices(session)

        first_voice = voices[0] if voices else {}
        model = first_voice.get("model") or "tts-1"
        voice_id = first_voice.get("voice_id", "alloy")

        # Resolve credentials: request body → DB TTS-specific → DB global
        api_key = (
            (req.api_key if req and req.api_key and not config_service.is_masked(req.api_key) else None)
            or await config_service.get_config("TTS_API_KEY", session)
            or await config_service.get_config("OPENAI_API_KEY", session)
        )
        base_url = (
            (req.base_url if req and req.base_url else None)
            or await config_service.get_config("TTS_BASE_URL", session)
            or await config_service.get_config("OPENAI_BASE_URL", session)
        )

        if not api_key:
            raise RuntimeError("TTS API key not configured")

        client = AsyncOpenAI(api_key=api_key, base_url=base_url or None)
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            tmp_path = Path(f.name)

        response = await client.audio.speech.create(
            model=model,
            voice=voice_id,  # type: ignore[arg-type]
            input=test_text,
            response_format="mp3",
        )
        tmp_path.write_bytes(response.content)

        audio_b64 = base64.b64encode(tmp_path.read_bytes()).decode()
        tmp_path.unlink(missing_ok=True)

        return {
            "ok": True,
            "audio_base64": audio_b64,
            "voice_name": first_voice.get("name", "默认声音"),
            "voice_id": voice_id,
            "model": model,
            "base_url": base_url or "https://api.openai.com/v1",
            "test_text": test_text,
        }
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


class ReindexResponse(BaseModel):
    queued: int
    kb_id: int | None = None


@router.post("/reindex/knowledge-base/{kb_id}", response_model=ReindexResponse)
async def reindex_knowledge_base(
    kb_id: int,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    """
    Re-run the full document processing pipeline (parse→chunk→embed→outline)
    for all ready documents in a knowledge base.
    """
    from backend.app.services.kb_service import reprocess_document

    stmt = select(KBDocument).where(
        KBDocument.knowledge_base_id == kb_id,
        KBDocument.status == "ready",
    )
    docs = (await session.execute(stmt)).scalars().all()
    for doc in docs:
        background_tasks.add_task(reprocess_document, doc.id)
    return ReindexResponse(queued=len(docs), kb_id=kb_id)


@router.post("/reindex/all", response_model=ReindexResponse)
async def reindex_all(
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    """Re-run processing for all ready documents across all knowledge bases."""
    from backend.app.services.kb_service import reprocess_document

    await session.execute(sa_text("DROP INDEX IF EXISTS ix_kb_chunks_embedding_hnsw"))
    await session.execute(
        sa_text("ALTER TABLE kb_chunks ALTER COLUMN embedding TYPE vector")
    )
    await session.commit()

    stmt = select(KBDocument).where(KBDocument.status == "ready")
    docs = (await session.execute(stmt)).scalars().all()
    for doc in docs:
        background_tasks.add_task(reprocess_document, doc.id)
    return ReindexResponse(queued=len(docs))


logger = logging.getLogger(__name__)


class VectorIndexResponse(BaseModel):
    dimension: int
    previous_dimension: int | None
    model: str
    previous_model: str | None
    dimension_changed: bool
    model_changed: bool
    index_created: bool
    needs_reindex: bool


@router.post("/vector-index", response_model=VectorIndexResponse)
async def create_or_rebuild_vector_index(
    confirm: bool = Query(False),
    session: AsyncSession = Depends(get_session),
):
    """
    Auto-detect embedding dimension, create/rebuild HNSW vector index.

    Call this after saving embedding config in Admin UI.
    If dimension or model changed, returns a warning unless confirm=true.
    """
    from backend.app.core.llm import get_embeddings_model

    try:
        embeddings = await get_embeddings_model(session)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        test_vec = await embeddings.aembed_query("维度检测")
        new_dim = len(test_vec)
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Embedding 测试调用失败: {e}"
        )

    if new_dim <= 0:
        raise HTTPException(status_code=400, detail="Embedding 返回空向量")

    current_model = (
        await config_service.get_config("EMBEDDING_MODEL", session)
        or "unknown"
    )

    prev_dim_str = await config_service.get_config("EMBEDDING_DIMENSIONS", session)
    prev_dim = int(prev_dim_str) if prev_dim_str else None
    prev_model = await config_service.get_config(
        "EMBEDDING_ACTIVE_MODEL", session
    )

    dimension_changed = prev_dim is not None and prev_dim != new_dim
    model_changed = prev_model is not None and prev_model != current_model
    needs_reindex = dimension_changed or model_changed

    base_response = {
        "dimension": new_dim,
        "previous_dimension": prev_dim,
        "model": current_model,
        "previous_model": prev_model,
        "dimension_changed": dimension_changed,
        "model_changed": model_changed,
    }

    if needs_reindex and not confirm:
        return VectorIndexResponse(
            **base_response, index_created=False, needs_reindex=True
        )

    if needs_reindex:
        logger.warning(
            "Embedding config changed (model: %s→%s, dim: %s→%d), "
            "clearing old embeddings",
            prev_model,
            current_model,
            prev_dim,
            new_dim,
        )
        await session.execute(
            sa_text(
                "UPDATE kb_chunks SET embedding = NULL WHERE embedding IS NOT NULL"
            )
        )
        await config_service.set_config(
            "EMBEDDING_DIMENSIONS",
            str(new_dim),
            "Auto-detected embedding dimension",
            session,
        )
        await config_service.set_config(
            "EMBEDDING_ACTIVE_MODEL",
            current_model,
            "Last indexed embedding model",
            session,
        )
        await session.commit()
        return VectorIndexResponse(
            **base_response, index_created=False, needs_reindex=True
        )

    await session.execute(sa_text("DROP INDEX IF EXISTS ix_kb_chunks_embedding_hnsw"))
    await session.execute(
        sa_text(f"ALTER TABLE kb_chunks ALTER COLUMN embedding TYPE vector({new_dim})")
    )
    await session.execute(
        sa_text(
            "CREATE INDEX ix_kb_chunks_embedding_hnsw "
            "ON kb_chunks USING hnsw (embedding vector_cosine_ops) "
            "WITH (m = 16, ef_construction = 64)"
        )
    )
    await config_service.set_config(
        "EMBEDDING_DIMENSIONS",
        str(new_dim),
        "Auto-detected embedding dimension",
        session,
    )
    await config_service.set_config(
        "EMBEDDING_ACTIVE_MODEL",
        current_model,
        "Last indexed embedding model",
        session,
    )
    await session.commit()

    logger.info("Vector index built: dim=%d, model=%s", new_dim, current_model)

    return VectorIndexResponse(
        **base_response, index_created=True, needs_reindex=False
    )


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
