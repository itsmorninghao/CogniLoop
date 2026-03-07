"""Quiz preset CRUD endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_session
from backend.app.core.deps import get_current_user
from backend.app.models.quiz_preset import QuizPreset
from backend.app.models.user import User
from backend.app.schemas.quiz_preset import (
    QuizPresetCreate,
    QuizPresetResponse,
    QuizPresetUpdate,
)

router = APIRouter(prefix="/quiz-presets", tags=["Quiz Presets"])

MAX_PRESETS = 10


@router.get("/", response_model=list[QuizPresetResponse])
async def list_presets(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(QuizPreset)
        .where(QuizPreset.user_id == user.id)
        .order_by(QuizPreset.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=QuizPresetResponse, status_code=201)
async def create_preset(
    req: QuizPresetCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    count_result = await session.execute(
        select(func.count()).select_from(QuizPreset).where(QuizPreset.user_id == user.id)
    )
    count = count_result.scalar_one()
    if count >= MAX_PRESETS:
        raise HTTPException(status_code=400, detail="已达方案上限（最多 10 个）")

    preset = QuizPreset(
        user_id=user.id,
        name=req.name,
        title=req.title,
        difficulty=req.difficulty,
        question_counts=req.question_counts,
        subject=req.subject,
        custom_prompt=req.custom_prompt,
    )
    session.add(preset)
    await session.commit()
    await session.refresh(preset)
    return preset


@router.put("/{preset_id}", response_model=QuizPresetResponse)
async def update_preset(
    preset_id: int,
    req: QuizPresetUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    preset = await session.get(QuizPreset, preset_id)
    if not preset or preset.user_id != user.id:
        raise HTTPException(status_code=404, detail="方案不存在")

    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(preset, field, value)
    preset.updated_at = datetime.utcnow()

    session.add(preset)
    await session.commit()
    await session.refresh(preset)
    return preset


@router.delete("/{preset_id}", status_code=204)
async def delete_preset(
    preset_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    preset = await session.get(QuizPreset, preset_id)
    if not preset or preset.user_id != user.id:
        raise HTTPException(status_code=404, detail="方案不存在")

    await session.delete(preset)
    await session.commit()
