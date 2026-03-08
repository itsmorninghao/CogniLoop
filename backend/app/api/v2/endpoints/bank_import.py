"""Bank import endpoint."""

from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_session
from backend.app.core.deps import get_current_user
from backend.app.models.knowledge_base import KnowledgeBase
from backend.app.models.user import User
from backend.app.services.bank_import_service import (
    import_from_scan,
    import_json_files,
    scan_archive,
)

router = APIRouter(prefix="/knowledge-bases/{kb_id}/bank-import", tags=["Bank Import"])


async def _get_question_bank(
    kb_id: int,
    session: AsyncSession,
    current_user: User,
) -> KnowledgeBase:
    """Fetch a question_bank KB owned by current_user, or raise."""
    stmt = select(KnowledgeBase).where(
        KnowledgeBase.id == kb_id, KnowledgeBase.owner_id == current_user.id
    )
    kb = (await session.execute(stmt)).scalar_one_or_none()
    if not kb:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="知识库不存在或无权限"
        )
    if kb.kb_type != "question_bank":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该知识库类型并非题库 (question_bank),无法导入题目JSON",
        )
    return kb


@router.post("", response_model=dict[str, Any])
async def upload_json_question_bank(
    kb_id: int,
    files: list[UploadFile] = File(...),
    subject: str | None = Form(None),
    question_type: str | None = Form(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Import JSON files (standard question bank format) into a question bank.
    """
    kb = await _get_question_bank(kb_id, session, current_user)

    # Validate file extension
    json_files = []
    for f in files:
        if not f.filename.endswith(".json"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"仅支持 JSON 文件导入，发现不支持的文件: {f.filename}",
            )
        json_files.append(f)

    try:
        result = await import_json_files(
            session=session,
            kb_id=kb.id,
            files=json_files,
            override_subject=subject,
            override_question_type=question_type,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return {"message": "导入完成", "result": result}


@router.post("/scan")
async def scan_archive_endpoint(
    kb_id: int,
    url: str | None = Form(None),
    zip_file: UploadFile | None = File(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Scan GitHub URL or ZIP for importable JSON files."""
    await _get_question_bank(kb_id, session, current_user)

    if not url and not zip_file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请提供 GitHub URL 或 ZIP 文件",
        )

    try:
        result = await scan_archive(url=url, zip_file=zip_file)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"扫描失败: {str(e)}",
        )

    return result


class ConfirmImportRequest(BaseModel):
    scan_id: str
    selected_files: list[str]


@router.post("/confirm")
async def confirm_import_endpoint(
    kb_id: int,
    body: ConfirmImportRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Import selected files from a previous scan."""
    await _get_question_bank(kb_id, session, current_user)

    try:
        result = await import_from_scan(
            session, kb_id, body.scan_id, body.selected_files
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return {"message": "导入完成", "result": result}
