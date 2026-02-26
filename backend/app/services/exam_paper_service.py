"""仿高考组卷服务层

职责：
- 教师授权的 CRUD
- 组卷 Job 的创建、查询、状态更新
- Token 配额预估与消耗统计
- 单题重生成（包含配额检查）
"""

import asyncio
import json
import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.exam_paper import (
    ExamPaperGenerationJob,
    ExamQuestionDraftLog,
    TeacherExamPermission,
)
from backend.app.services.config_service import get_config_int

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 配额工具函数
# ---------------------------------------------------------------------------


def estimate_tokens(total_questions: int, solve_count: int) -> int:
    """粗估单次组卷总 Token 消耗"""
    avg = get_config_int("exam_agent_avg_tokens_per_question")
    # 每题 = 生成(1x) + 质检(0.5x) + K×试做(0.3x each) + K×评分(0.3x each) + 重试余量(1.2x)
    multiplier = 1 + 0.5 + solve_count * 0.3 + solve_count * 0.3
    return int(total_questions * avg * multiplier * 1.2)


# ---------------------------------------------------------------------------
# ExamPermissionService
# ---------------------------------------------------------------------------


class ExamPermissionService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_permission(self, teacher_id: int) -> TeacherExamPermission | None:
        stmt = select(TeacherExamPermission).where(
            TeacherExamPermission.teacher_id == teacher_id
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def is_authorized(self, teacher_id: int) -> bool:
        perm = await self.get_permission(teacher_id)
        return perm is not None and perm.is_enabled

    async def grant(
        self,
        teacher_id: int,
        admin_id: int,
        monthly_quota: int | None = None,
        note: str | None = None,
    ) -> TeacherExamPermission:
        perm = await self.get_permission(teacher_id)
        now = datetime.now(UTC).replace(tzinfo=None)
        if perm:
            perm.is_enabled = True
            perm.granted_by = admin_id
            perm.granted_at = now
            perm.revoked_at = None
            perm.monthly_quota = monthly_quota
            perm.note = note
            perm.updated_at = now
        else:
            perm = TeacherExamPermission(
                teacher_id=teacher_id,
                is_enabled=True,
                granted_by=admin_id,
                granted_at=now,
                monthly_quota=monthly_quota,
                note=note,
            )
            self.session.add(perm)
        await self.session.flush()
        return perm

    async def revoke(self, teacher_id: int) -> bool:
        perm = await self.get_permission(teacher_id)
        if not perm:
            return False
        perm.is_enabled = False
        perm.revoked_at = datetime.now(UTC).replace(tzinfo=None)
        perm.updated_at = datetime.now(UTC).replace(tzinfo=None)
        await self.session.flush()
        return True

    async def check_quota(
        self,
        teacher_id: int,
        estimated_tokens: int,
    ) -> tuple[bool, str]:
        """
        检查配额是否足够。
        返回 (ok, message)
        """
        perm = await self.get_permission(teacher_id)
        if not perm or not perm.is_enabled:
            return False, "未获得仿高考组卷授权，请联系管理员"
        if perm.monthly_quota is None:
            return True, "配额充足"
        remaining = perm.monthly_quota - perm.token_used
        if remaining < estimated_tokens:
            return False, (
                f"本月 Token 配额不足（剩余 {remaining:,}，本次预估需 {estimated_tokens:,}）"
            )
        return True, "配额充足"

    async def consume_tokens(self, teacher_id: int, tokens: int) -> None:
        """增加已用 Token 计数"""
        perm = await self.get_permission(teacher_id)
        if perm:
            perm.token_used = (perm.token_used or 0) + tokens
            perm.updated_at = datetime.now(UTC).replace(tzinfo=None)
            await self.session.flush()


# ---------------------------------------------------------------------------
# ExamJobService
# ---------------------------------------------------------------------------


class ExamJobService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_job(self, job_id: str) -> ExamPaperGenerationJob | None:
        return await self.session.get(ExamPaperGenerationJob, job_id)

    async def create_job(
        self,
        job_id: str,
        teacher_id: int,
        course_id: int,
        requirement_json: str,
    ) -> ExamPaperGenerationJob:
        job = ExamPaperGenerationJob(
            id=job_id,
            teacher_id=teacher_id,
            course_id=course_id,
            status="pending",
            requirement=requirement_json,
        )
        self.session.add(job)
        await self.session.flush()
        return job

    async def update_status(
        self,
        job_id: str,
        status: str,
        error_message: str | None = None,
        completed_questions: dict | None = None,
        warnings: list | None = None,
    ) -> None:
        job = await self.get_job(job_id)
        if not job:
            return
        job.status = status
        if error_message is not None:
            job.error_message = error_message
        if completed_questions is not None:
            job.completed_questions = json.dumps(
                completed_questions, ensure_ascii=False
            )
        if warnings is not None:
            job.warnings = json.dumps(warnings, ensure_ascii=False)
        if status == "completed":
            job.completed_at = datetime.now(UTC).replace(tzinfo=None)
        await self.session.flush()

    async def update_progress(
        self,
        job_id: str,
        progress: dict,
    ) -> None:
        job = await self.get_job(job_id)
        if job:
            job.progress = json.dumps(progress, ensure_ascii=False)
            await self.session.flush()

    async def add_token_usage(self, job_id: str, tokens: int) -> None:
        job = await self.get_job(job_id)
        if job:
            job.token_consumed = (job.token_consumed or 0) + tokens
            await self.session.flush()

    async def list_jobs_for_teacher(
        self,
        teacher_id: int,
        course_id: int | None = None,
        limit: int = 20,
    ) -> list[ExamPaperGenerationJob]:
        conditions = [ExamPaperGenerationJob.teacher_id == teacher_id]
        if course_id:
            conditions.append(ExamPaperGenerationJob.course_id == course_id)
        stmt = (
            select(ExamPaperGenerationJob)
            .where(*conditions)
            .order_by(ExamPaperGenerationJob.created_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def upsert_draft_log(
        self,
        job_id: str,
        position_index: int,
        question_type: str,
        knowledge_point: str | None,
        status: str,
        final_content: str | None = None,
        difficulty_coefficient: float | None = None,
        retry_history: list | None = None,
    ) -> None:
        # 检查是否已存在
        stmt = select(ExamQuestionDraftLog).where(
            ExamQuestionDraftLog.job_id == job_id,
            ExamQuestionDraftLog.position_index == position_index,
        )
        result = await self.session.execute(stmt)
        log = result.scalar_one_or_none()

        now = datetime.now(UTC).replace(tzinfo=None)
        if log:
            log.status = status
            if final_content is not None:
                log.final_content = final_content
            if difficulty_coefficient is not None:
                log.difficulty_coefficient = difficulty_coefficient
            if retry_history is not None:
                log.retry_history = json.dumps(retry_history, ensure_ascii=False)
                log.retry_count = len(retry_history)
            if status in ("approved", "warning", "failed", "skipped"):
                log.finalized_at = now
        else:
            log = ExamQuestionDraftLog(
                job_id=job_id,
                position_index=position_index,
                question_type=question_type,
                knowledge_point=knowledge_point,
                status=status,
                final_content=final_content,
                difficulty_coefficient=difficulty_coefficient,
                retry_count=len(retry_history) if retry_history else 0,
                retry_history=json.dumps(retry_history or [], ensure_ascii=False),
                finalized_at=now
                if status in ("approved", "warning", "failed", "skipped")
                else None,
            )
            self.session.add(log)
        await self.session.flush()
