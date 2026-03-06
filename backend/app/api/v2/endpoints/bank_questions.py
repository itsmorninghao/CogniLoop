from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_session
from backend.app.core.deps import get_current_user
from backend.app.models.bank_question import BankQuestion
from backend.app.models.user import User
from backend.app.services import kb_service

router = APIRouter(
    prefix="/knowledge-bases/{kb_id}/bank-questions", tags=["Bank Questions"]
)


@router.get("", response_model=dict[str, Any])
async def list_bank_questions(
    kb_id: int,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List questions in a question bank knowledge base."""
    # reuse service access check (handles owner / plaza / acquired)
    try:
        await kb_service.get_kb(kb_id, current_user, session)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="知识库不存在或无权限"
        )

    # count
    count_stmt = select(func.count(BankQuestion.id)).where(
        BankQuestion.knowledge_base_id == kb_id
    )
    total = (await session.execute(count_stmt)).scalar_one()

    # details
    stmt = (
        select(BankQuestion)
        .where(BankQuestion.knowledge_base_id == kb_id)
        .order_by(BankQuestion.id.desc())
        .offset(offset)
        .limit(limit)
    )

    questions = (await session.execute(stmt)).scalars().all()

    return {
        "total": total,
        "items": [
            {
                "id": q.id,
                "question_type": q.question_type,
                "subject": q.subject,
                "difficulty": q.difficulty,
                "content": q.content[:100] + "..."
                if len(q.content) > 100
                else q.content,
                "answer": q.answer[:50] + "..." if len(q.answer) > 50 else q.answer,
                "source_info": q.source_info,
                "created_at": q.created_at.isoformat(),
            }
            for q in questions
        ],
    }
