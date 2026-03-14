"""Exam template endpoints."""

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_session
from backend.app.core.deps import get_current_user
from backend.app.models.user import User
from backend.app.schemas.exam_template import (
    ConflictCheckRequest,
    ConflictCheckResponse,
    ConflictDetail,
    ExamTemplateCreate,
    ExamTemplateListItem,
    ExamTemplateResponse,
    ExamTemplateUpdate,
    PlazaTemplateItem,
    QuestionCreate,
    QuestionResponse,
    QuestionUpdate,
    SlotsReplaceRequest,
)
from backend.app.services import exam_template_service

router = APIRouter(prefix="/exam-templates", tags=["exam-templates"])


@router.post("/", response_model=ExamTemplateResponse, status_code=201)
async def create_template(
    data: ExamTemplateCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await exam_template_service.create_template(
        current_user.id, data, session
    )


@router.get("/", response_model=list[ExamTemplateListItem])
async def list_templates(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await exam_template_service.list_user_templates(
        current_user.id, limit, offset, session
    )


@router.get("/plaza", response_model=list[PlazaTemplateItem])
async def list_plaza_templates(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await exam_template_service.list_plaza_templates(limit, offset, session)


@router.post("/check-conflicts", response_model=ConflictCheckResponse)
async def check_conflicts(
    data: ConflictCheckRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    raw = await exam_template_service.detect_cross_template_conflicts(
        data.template_ids, data.selected_slot_positions, session
    )
    return ConflictCheckResponse(
        conflicts=[ConflictDetail(**c) for c in raw]
    )


@router.post("/ocr-scan")
async def ocr_scan(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """OCR scan an exam paper image/PDF, returning SSE stream."""
    if not file.content_type or not (
        file.content_type.startswith("image/")
        or file.content_type == "application/pdf"
    ):
        raise HTTPException(status_code=400, detail="仅支持图片或 PDF 文件")

    file_bytes = await file.read()
    if len(file_bytes) > 20 * 1024 * 1024:  # 20MB limit
        raise HTTPException(status_code=400, detail="文件大小不能超过 20MB")

    session_id = f"ocr_{current_user.id}_{file.filename}"

    from backend.app.services.exam_template_service import ocr_scan_file

    async def event_stream():
        async for event in ocr_scan_file(file_bytes, file.content_type, session_id):
            yield event

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{id}", response_model=ExamTemplateResponse)
async def get_template(
    id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await exam_template_service.get_template_detail(
        id, current_user.id, session
    )


@router.patch("/{id}", response_model=ExamTemplateResponse)
async def update_template(
    id: int,
    data: ExamTemplateUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await exam_template_service.update_template(
        id, current_user.id, data, session
    )


@router.delete("/{id}", status_code=204)
async def delete_template(
    id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await exam_template_service.delete_template(id, current_user.id, session)


@router.put("/{id}/slots", response_model=ExamTemplateResponse)
async def replace_slots(
    id: int,
    data: SlotsReplaceRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await exam_template_service.replace_slots(
        id, current_user.id, data.slots, session
    )


@router.post(
    "/{id}/slots/{slot_id}/questions",
    response_model=QuestionResponse,
    status_code=201,
)
async def add_question(
    id: int,
    slot_id: int,
    data: QuestionCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await exam_template_service.add_question_to_slot(
        id, slot_id, current_user.id, data, session
    )


@router.patch(
    "/{id}/slots/{slot_id}/questions/{qid}",
    response_model=QuestionResponse,
)
async def update_question(
    id: int,
    slot_id: int,
    qid: int,
    data: QuestionUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await exam_template_service.update_question(
        id, slot_id, qid, current_user.id, data, session
    )


@router.delete("/{id}/slots/{slot_id}/questions/{qid}", status_code=204)
async def delete_question(
    id: int,
    slot_id: int,
    qid: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await exam_template_service.delete_question(
        id, slot_id, qid, current_user.id, session
    )


@router.post("/{id}/publish", response_model=ExamTemplateResponse)
async def publish_template(
    id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await exam_template_service.publish_to_plaza(
        id, current_user.id, session
    )


@router.delete("/{id}/publish", response_model=ExamTemplateResponse)
async def unpublish_template(
    id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await exam_template_service.unpublish_from_plaza(
        id, current_user.id, session
    )


@router.post("/{id}/acquire", response_model=ExamTemplateResponse)
async def acquire_template(
    id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await exam_template_service.acquire_template(
        id, current_user.id, session
    )
