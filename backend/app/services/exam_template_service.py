"""Exam template service — CRUD + plaza + conflict detection + OCR."""

from __future__ import annotations

import logging
from collections import defaultdict
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import delete as sql_delete
from sqlmodel import func, select

from backend.app.core.exceptions import (
    BadRequestError,
    ForbiddenError,
    NotFoundError,
)
from backend.app.models.exam_template import (
    ExamTemplate,
    ExamTemplateSlot,
    ExamTemplateSlotQuestion,
)
from backend.app.models.user import User
from backend.app.schemas.exam_template import (
    ExamTemplateCreate,
    ExamTemplateUpdate,
    PlazaTemplateItem,
    QuestionCreate,
    QuestionUpdate,
    SlotCreate,
    TemplatePlazaPage,
)

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _get_template_or_404(
    template_id: int, session: AsyncSession
) -> ExamTemplate:
    result = await session.execute(
        select(ExamTemplate).where(ExamTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise NotFoundError("Exam template")
    return template


def _check_owner(template: ExamTemplate, user_id: int) -> None:
    if template.user_id != user_id:
        raise ForbiddenError("Not the owner of this exam template")


async def _load_relationships(
    template: ExamTemplate, session: AsyncSession
) -> ExamTemplate:
    """Reload the template with slots and questions eagerly loaded."""
    result = await session.execute(
        select(ExamTemplate)
        .where(ExamTemplate.id == template.id)
        .options(
            selectinload(ExamTemplate.slots).selectinload(
                ExamTemplateSlot.questions
            )
        )
    )
    return result.scalar_one()


async def create_template(
    user_id: int, data: ExamTemplateCreate, session: AsyncSession
) -> ExamTemplate:
    template = ExamTemplate(
        user_id=user_id,
        name=data.name,
        description=data.description,
        subject=data.subject,
    )
    session.add(template)
    await session.flush()

    for slot_data in data.slots:
        slot = ExamTemplateSlot(
            template_id=template.id,
            position=slot_data.position,
            question_type=slot_data.question_type,
            label=slot_data.label,
            difficulty_hint=slot_data.difficulty_hint,
        )
        session.add(slot)
        await session.flush()

        for q_data in slot_data.questions:
            question = ExamTemplateSlotQuestion(
                slot_id=slot.id,
                content=q_data.content,
                answer=q_data.answer,
                analysis=q_data.analysis,
                difficulty=q_data.difficulty,
                knowledge_points=q_data.knowledge_points,
                source_label=q_data.source_label,
            )
            session.add(question)

    await session.flush()
    return await _load_relationships(template, session)


async def list_user_templates(
    user_id: int, limit: int, offset: int, session: AsyncSession
) -> list[dict]:
    # Subqueries for counts
    slot_count_sub = (
        select(func.count(ExamTemplateSlot.id))
        .where(ExamTemplateSlot.template_id == ExamTemplate.id)
        .correlate(ExamTemplate)
        .scalar_subquery()
    )
    question_count_sub = (
        select(func.count(ExamTemplateSlotQuestion.id))
        .join(ExamTemplateSlot, ExamTemplateSlotQuestion.slot_id == ExamTemplateSlot.id)
        .where(ExamTemplateSlot.template_id == ExamTemplate.id)
        .correlate(ExamTemplate)
        .scalar_subquery()
    )

    stmt = (
        select(
            ExamTemplate,
            slot_count_sub.label("slot_count"),
            question_count_sub.label("question_count"),
        )
        .where(ExamTemplate.user_id == user_id)
        .order_by(ExamTemplate.created_at.desc())
        .offset(offset)
        .limit(limit)
    )

    result = await session.execute(stmt)
    rows = result.all()

    return [
        {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "subject": t.subject,
            "is_public": t.is_public,
            "slot_count": sc or 0,
            "question_count": qc or 0,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        }
        for t, sc, qc in rows
    ]


async def get_template_detail(
    template_id: int, user_id: int, session: AsyncSession
) -> ExamTemplate:
    template = await _get_template_or_404(template_id, session)
    if template.user_id != user_id and not template.is_public:
        raise ForbiddenError("Not the owner of this exam template")
    return await _load_relationships(template, session)


async def update_template(
    template_id: int, user_id: int, data: ExamTemplateUpdate, session: AsyncSession
) -> ExamTemplate:
    template = await _get_template_or_404(template_id, session)
    _check_owner(template, user_id)

    if data.name is not None:
        template.name = data.name
    if data.description is not None:
        template.description = data.description
    if data.subject is not None:
        template.subject = data.subject
    template.updated_at = _now()

    session.add(template)
    await session.flush()
    return await _load_relationships(template, session)


async def delete_template(
    template_id: int, user_id: int, session: AsyncSession
) -> None:
    template = await _get_template_or_404(template_id, session)
    _check_owner(template, user_id)
    await session.delete(template)
    await session.flush()


async def replace_slots(
    template_id: int,
    user_id: int,
    slots_data: list[SlotCreate],
    session: AsyncSession,
) -> ExamTemplate:
    template = await _get_template_or_404(template_id, session)
    _check_owner(template, user_id)

    # Delete existing slots (cascade deletes questions)
    await session.execute(
        sql_delete(ExamTemplateSlot).where(
            ExamTemplateSlot.template_id == template_id
        )
    )

    for slot_data in slots_data:
        slot = ExamTemplateSlot(
            template_id=template_id,
            position=slot_data.position,
            question_type=slot_data.question_type,
            label=slot_data.label,
            difficulty_hint=slot_data.difficulty_hint,
        )
        session.add(slot)
        await session.flush()

        for q_data in slot_data.questions:
            question = ExamTemplateSlotQuestion(
                slot_id=slot.id,
                content=q_data.content,
                answer=q_data.answer,
                analysis=q_data.analysis,
                difficulty=q_data.difficulty,
                knowledge_points=q_data.knowledge_points,
                source_label=q_data.source_label,
            )
            session.add(question)

    template.updated_at = _now()
    session.add(template)
    await session.flush()
    return await _load_relationships(template, session)


async def add_question_to_slot(
    template_id: int,
    slot_id: int,
    user_id: int,
    data: QuestionCreate,
    session: AsyncSession,
) -> ExamTemplateSlotQuestion:
    template = await _get_template_or_404(template_id, session)
    _check_owner(template, user_id)

    result = await session.execute(
        select(ExamTemplateSlot).where(
            ExamTemplateSlot.id == slot_id,
            ExamTemplateSlot.template_id == template_id,
        )
    )
    slot = result.scalar_one_or_none()
    if not slot:
        raise NotFoundError("Slot")

    question = ExamTemplateSlotQuestion(
        slot_id=slot_id,
        content=data.content,
        answer=data.answer,
        analysis=data.analysis,
        difficulty=data.difficulty,
        knowledge_points=data.knowledge_points,
        source_label=data.source_label,
    )
    session.add(question)
    await session.flush()
    await session.refresh(question)
    return question


async def update_question(
    template_id: int,
    slot_id: int,
    question_id: int,
    user_id: int,
    data: QuestionUpdate,
    session: AsyncSession,
) -> ExamTemplateSlotQuestion:
    template = await _get_template_or_404(template_id, session)
    _check_owner(template, user_id)

    # Verify slot belongs to template
    result = await session.execute(
        select(ExamTemplateSlot).where(
            ExamTemplateSlot.id == slot_id,
            ExamTemplateSlot.template_id == template_id,
        )
    )
    if not result.scalar_one_or_none():
        raise NotFoundError("Slot")

    # Verify question belongs to slot
    result = await session.execute(
        select(ExamTemplateSlotQuestion).where(
            ExamTemplateSlotQuestion.id == question_id,
            ExamTemplateSlotQuestion.slot_id == slot_id,
        )
    )
    question = result.scalar_one_or_none()
    if not question:
        raise NotFoundError("Question")

    if data.content is not None:
        question.content = data.content
    if data.answer is not None:
        question.answer = data.answer
    if data.analysis is not None:
        question.analysis = data.analysis
    if data.difficulty is not None:
        question.difficulty = data.difficulty
    if data.knowledge_points is not None:
        question.knowledge_points = data.knowledge_points
    if data.source_label is not None:
        question.source_label = data.source_label

    session.add(question)
    await session.flush()
    await session.refresh(question)
    return question


async def delete_question(
    template_id: int,
    slot_id: int,
    question_id: int,
    user_id: int,
    session: AsyncSession,
) -> None:
    template = await _get_template_or_404(template_id, session)
    _check_owner(template, user_id)

    result = await session.execute(
        select(ExamTemplateSlot).where(
            ExamTemplateSlot.id == slot_id,
            ExamTemplateSlot.template_id == template_id,
        )
    )
    if not result.scalar_one_or_none():
        raise NotFoundError("Slot")

    result = await session.execute(
        select(ExamTemplateSlotQuestion).where(
            ExamTemplateSlotQuestion.id == question_id,
            ExamTemplateSlotQuestion.slot_id == slot_id,
        )
    )
    question = result.scalar_one_or_none()
    if not question:
        raise NotFoundError("Question")

    await session.delete(question)
    await session.flush()


async def detect_cross_template_conflicts(
    template_ids: list[int],
    selected_positions: list[int],
    session: AsyncSession,
) -> list[dict]:
    result = await session.execute(
        select(ExamTemplateSlot).where(
            ExamTemplateSlot.template_id.in_(template_ids)
        )
    )
    slots = result.scalars().all()

    # Group by position: {position: {template_id: question_type}}
    position_map: dict[int, dict[int, str]] = defaultdict(dict)
    for slot in slots:
        position_map[slot.position][slot.template_id] = slot.question_type

    conflicts: list[dict] = []
    positions_to_check = selected_positions if selected_positions else list(position_map.keys())

    for pos in positions_to_check:
        types_by_template = position_map.get(pos, {})
        unique_types = set(types_by_template.values())
        if len(unique_types) > 1:
            conflicts.append(
                {
                    "position": pos,
                    "conflicting_types": types_by_template,
                }
            )

    return conflicts


async def publish_to_plaza(
    template_id: int, user_id: int, session: AsyncSession
) -> ExamTemplate:
    template = await _get_template_or_404(template_id, session)
    _check_owner(template, user_id)
    template.is_public = True
    template.updated_at = _now()
    session.add(template)
    await session.flush()
    return await _load_relationships(template, session)


async def unpublish_from_plaza(
    template_id: int, user_id: int, session: AsyncSession
) -> ExamTemplate:
    template = await _get_template_or_404(template_id, session)
    _check_owner(template, user_id)
    template.is_public = False
    template.updated_at = _now()
    session.add(template)
    await session.flush()
    return await _load_relationships(template, session)


async def list_plaza_templates(
    limit: int, offset: int, session: AsyncSession
) -> TemplatePlazaPage:
    slot_count_sub = (
        select(func.count(ExamTemplateSlot.id))
        .where(ExamTemplateSlot.template_id == ExamTemplate.id)
        .correlate(ExamTemplate)
        .scalar_subquery()
    )
    question_count_sub = (
        select(func.count(ExamTemplateSlotQuestion.id))
        .join(ExamTemplateSlot, ExamTemplateSlotQuestion.slot_id == ExamTemplateSlot.id)
        .where(ExamTemplateSlot.template_id == ExamTemplate.id)
        .correlate(ExamTemplate)
        .scalar_subquery()
    )

    conditions = [ExamTemplate.is_public == True]  # noqa: E712

    # Total count — include User JOIN to match main query's INNER JOIN
    count_stmt = (
        select(func.count(ExamTemplate.id))
        .join(User, ExamTemplate.user_id == User.id)
        .where(*conditions)
    )
    total = (await session.execute(count_stmt)).scalar_one()

    stmt = (
        select(
            ExamTemplate,
            slot_count_sub.label("slot_count"),
            question_count_sub.label("question_count"),
            User.username.label("creator_username"),
            User.full_name.label("creator_full_name"),
            User.avatar_url.label("creator_avatar_url"),
        )
        .join(User, ExamTemplate.user_id == User.id)
        .where(*conditions)
        .order_by(ExamTemplate.created_at.desc())
        .offset(offset)
        .limit(limit)
    )

    result = await session.execute(stmt)
    rows = result.all()

    items = [
        PlazaTemplateItem(
            id=t.id,
            name=t.name,
            description=t.description,
            subject=t.subject,
            slot_count=sc or 0,
            question_count=qc or 0,
            creator_username=username or "",
            creator_full_name=full_name or "",
            creator_avatar_url=avatar_url,
            created_at=t.created_at,
        )
        for t, sc, qc, username, full_name, avatar_url in rows
    ]
    return TemplatePlazaPage(items=items, total=total)


async def acquire_template(
    template_id: int, user_id: int, session: AsyncSession
) -> ExamTemplate:
    source = await _get_template_or_404(template_id, session)
    if not source.is_public:
        raise BadRequestError("Cannot acquire a non-public template")
    if source.user_id == user_id:
        raise BadRequestError("Cannot acquire your own template")

    source = await _load_relationships(source, session)

    new_template = ExamTemplate(
        user_id=user_id,
        name=source.name,
        description=source.description,
        subject=source.subject,
        source_template_id=source.id,
        is_public=False,
    )
    session.add(new_template)
    await session.flush()

    for slot in source.slots:
        new_slot = ExamTemplateSlot(
            template_id=new_template.id,
            position=slot.position,
            question_type=slot.question_type,
            label=slot.label,
            difficulty_hint=slot.difficulty_hint,
        )
        session.add(new_slot)
        await session.flush()

        for q in slot.questions:
            new_q = ExamTemplateSlotQuestion(
                slot_id=new_slot.id,
                content=q.content,
                answer=q.answer,
                analysis=q.analysis,
                difficulty=q.difficulty,
                knowledge_points=q.knowledge_points,
                source_label=q.source_label,
            )
            session.add(new_q)

    await session.flush()
    return await _load_relationships(new_template, session)


OCR_STRUCTURING_SYSTEM_PROMPT = """你是一个专业的试卷结构化提取工具。
请从图片中提取所有题目，以 JSON 数组格式输出，每道题包含以下字段：
- position: 题号（整数）
- question_type: 题型，只能是以下之一：single_choice / multi_choice / fill_blank / short_answer
- content: 题目正文（含选项内容，如有）
- answer: 答案（如图片中有明确标注；若无则不输出此字段）

规则：
1. 识别不到的字段直接不输出，不要输出 null 或空字符串
2. 只输出 JSON 数组，不要任何解释文字
3. content 中如有数学公式，尽量用 LaTeX 格式表示（用 $ 包裹）
4. 如果某题无法识别（如纯图形题），content 写"[图形题，需手动填写]"

示例输出：
[
  {"position": 1, "question_type": "single_choice", "content": "设 $f(x)=x^2$，则...", "answer": "B"},
  {"position": 2, "question_type": "fill_blank", "content": "函数 $y=\\\\sin x$ 的最小正周期为____"}
]"""


async def ocr_scan_file(
    file_bytes: bytes,
    content_type: str,
    session_id: str,
) -> AsyncGenerator[str, None]:
    """OCR scan a file (image or PDF), yielding SSE events.

    Events:
    - page_start: {"type": "page_start", "page": N, "total_pages": M}
    - page_complete: {"type": "page_complete", "page": N, "questions": [...]}
    - scan_complete: {"type": "scan_complete", "total_questions": N, "missing_count": M}
    - error: {"type": "error", "message": "..."}
    """
    import base64
    import json

    from openai import AsyncOpenAI

    from backend.app.core.database import async_session_factory
    from backend.app.services.config_service import get_config

    # Get OCR config with LLM fallback
    async with async_session_factory() as db_session:
        ocr_url = await get_config("OCR_API_URL", db_session)
        ocr_key = await get_config("OCR_API_KEY", db_session)
        ocr_model = await get_config("OCR_MODEL", db_session) or "gpt-4o"

        # Fallback to main LLM config
        base_url = (
            ocr_url
            or await get_config("OPENAI_BASE_URL", db_session)
            or "https://api.openai.com/v1"
        )
        api_key = ocr_key or await get_config("OPENAI_API_KEY", db_session)

        ocr_mode = await get_config("OCR_MODE", db_session) or "multimodal"
        ocr_llm_model = await get_config("OCR_LLM_MODEL", db_session) or await get_config("OPENAI_MODEL", db_session)
        llm_key = await get_config("OPENAI_API_KEY", db_session)
        llm_base_url = await get_config("OPENAI_BASE_URL", db_session) or "https://api.openai.com/v1"

    if not api_key:
        yield (
            f"data: {json.dumps({'type': 'error', 'message': '未配置 OCR 或 LLM API Key，请在管理后台 → 系统配置中设置'})}\n\n"
        )
        return

    client = AsyncOpenAI(base_url=base_url, api_key=api_key)

    llm_client = None
    if ocr_mode == "ocr_plus_llm":
        if not llm_key:
            yield f"data: {json.dumps({'type': 'error', 'message': '未配置全局 LLM API Key（OCR+LLM 模式需要）'})}\n\n"
            return
        llm_client = AsyncOpenAI(base_url=llm_base_url, api_key=llm_key)

    # For PDF: extract pages as images; for images: single page
    pages: list[bytes] = []

    if content_type == "application/pdf":
        try:
            import fitz  # PyMuPDF

            doc = fitz.open(stream=file_bytes, filetype="pdf")
            for page in doc:
                pix = page.get_pixmap(dpi=150)
                pages.append(pix.tobytes("jpeg"))
            doc.close()
        except ImportError:
            yield f"data: {json.dumps({'type': 'error', 'message': '服务器缺少 PDF 处理组件，请重新部署或联系管理员'})}\n\n"
            return
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'PDF 解析失败: {e!s}'})}\n\n"
            return
    else:
        pages = [file_bytes]

    total_pages = len(pages)
    all_questions: list[dict] = []
    missing_count = 0

    for page_idx, page_bytes in enumerate(pages):
        page_num = page_idx + 1
        yield f"data: {json.dumps({'type': 'page_start', 'page': page_num, 'total_pages': total_pages})}\n\n"

        # Encode image
        b64 = base64.b64encode(page_bytes).decode("utf-8")
        mime = "image/jpeg" if content_type == "application/pdf" else content_type

        try:
            if ocr_mode == "ocr_plus_llm":
                # Step 1: extract raw text via OCR model
                step1_response = await client.chat.completions.create(
                    model=ocr_model,
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:{mime};base64,{b64}",
                                    },
                                },
                                {
                                    "type": "text",
                                    "text": "<|grounding|>OCR this image.",
                                },
                            ],
                        },
                    ],
                    max_tokens=4096,
                )
                raw_text = step1_response.choices[0].message.content or ""

                # Step 2: structure into JSON
                step2_response = await llm_client.chat.completions.create(
                    model=ocr_llm_model,
                    messages=[
                        {"role": "system", "content": OCR_STRUCTURING_SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": f"以下是第 {page_num} 页的 OCR 识别文字，请提取所有题目并以 JSON 数组输出：\n\n{raw_text}",
                        },
                    ],
                    temperature=0.1,
                    max_tokens=4096,
                )
                raw = step2_response.choices[0].message.content or "[]"
            else:
                response = await client.chat.completions.create(
                    model=ocr_model,
                    messages=[
                        {"role": "system", "content": OCR_STRUCTURING_SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": f"请提取第 {page_num} 页的所有题目。",
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:{mime};base64,{b64}",
                                    },
                                },
                            ],
                        },
                    ],
                    temperature=0.1,
                    max_tokens=4096,
                )
                raw = response.choices[0].message.content or "[]"
            # Strip markdown code fence if present
            if raw.strip().startswith("```"):
                raw = raw.strip().split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]

            questions = json.loads(raw.strip())
            if not isinstance(questions, list):
                questions = []

            # Count missing fields
            for q in questions:
                if not q.get("content") or not q.get("position"):
                    missing_count += 1

            all_questions.extend(questions)
            yield f"data: {json.dumps({'type': 'page_complete', 'page': page_num, 'questions': questions})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'page_complete', 'page': page_num, 'questions': [], 'error': str(e)})}\n\n"

    yield f"data: {json.dumps({'type': 'scan_complete', 'total_questions': len(all_questions), 'missing_count': missing_count})}\n\n"
