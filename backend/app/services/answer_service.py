"""答案服务"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.answer import Answer, AnswerStatus
from backend.app.schemas.answer import AnswerSaveDraft


def utc_now_naive() -> datetime:
    """获取当前 UTC 时间（naive，无时区信息）"""
    return datetime.now(UTC).replace(tzinfo=None)


class AnswerService:
    """答案服务类"""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def save_draft(
        self,
        student_id: int,
        course_id: int,
        data: AnswerSaveDraft,
    ) -> Answer:
        """保存答题草稿"""
        # 检查是否已有完成的答案
        stmt = select(Answer).where(
            Answer.question_set_id == data.question_set_id,
            Answer.student_id == student_id,
            Answer.status == AnswerStatus.COMPLETED.value,
        )
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none():
            raise ValueError("已完成的试题集不能再次作答")

        # 查找或创建草稿
        stmt = select(Answer).where(
            Answer.question_set_id == data.question_set_id,
            Answer.student_id == student_id,
            Answer.status == AnswerStatus.DRAFT.value,
        )
        result = await self.session.execute(stmt)
        answer = result.scalar_one_or_none()

        if answer:
            # 更新草稿
            answer.student_answers = data.student_answers
            answer.saved_at = utc_now_naive()
        else:
            # 创建新草稿
            answer = Answer(
                question_set_id=data.question_set_id,
                student_id=student_id,
                course_id=course_id,
                student_answers=data.student_answers,
                status=AnswerStatus.DRAFT.value,
            )
            self.session.add(answer)

        await self.session.flush()
        await self.session.refresh(answer)
        return answer

    async def submit_answer(
        self,
        student_id: int,
        course_id: int,
        question_set_id: int,
        student_answers: dict[str, Any],
    ) -> Answer:
        """提交答案"""
        # 检查是否已有完成的答案
        stmt = select(Answer).where(
            Answer.question_set_id == question_set_id,
            Answer.student_id == student_id,
            Answer.status == AnswerStatus.COMPLETED.value,
        )
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none():
            raise ValueError("该试题集已提交，不允许重新提交")

        # 查找草稿或创建新答案
        stmt = select(Answer).where(
            Answer.question_set_id == question_set_id,
            Answer.student_id == student_id,
            Answer.status == AnswerStatus.DRAFT.value,
        )
        result = await self.session.execute(stmt)
        answer = result.scalar_one_or_none()

        if answer:
            answer.student_answers = student_answers
            answer.status = AnswerStatus.SUBMITTED.value
            answer.submitted_at = utc_now_naive()
        else:
            answer = Answer(
                question_set_id=question_set_id,
                student_id=student_id,
                course_id=course_id,
                student_answers=student_answers,
                status=AnswerStatus.SUBMITTED.value,
                submitted_at=utc_now_naive(),
            )
            self.session.add(answer)

        await self.session.flush()
        await self.session.refresh(answer)
        return answer

    async def get_answer_by_id(self, answer_id: int) -> Answer | None:
        """根据 ID 获取答案"""
        stmt = select(Answer).where(Answer.id == answer_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_student_answer(
        self, question_set_id: int, student_id: int
    ) -> Answer | None:
        """获取学生对某试题集的答案"""
        stmt = (
            select(Answer)
            .where(
                Answer.question_set_id == question_set_id,
                Answer.student_id == student_id,
            )
            .order_by(Answer.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def update_grading_result(
        self,
        answer_id: int,
        grading_results: dict[str, Any],
        total_score: float,
    ) -> None:
        """更新批改结果"""
        answer = await self.get_answer_by_id(answer_id)
        if answer:
            answer.grading_results = grading_results
            answer.total_score = total_score
            answer.status = AnswerStatus.COMPLETED.value
            await self.session.flush()

    async def mark_grading_failed(self, answer_id: int, error_message: str) -> None:
        """标记批改失败"""
        answer = await self.get_answer_by_id(answer_id)
        if answer:
            answer.status = AnswerStatus.FAILED.value
            answer.error_message = error_message
            await self.session.flush()

    async def get_question_set_answers(self, question_set_id: int) -> list[Answer]:
        """获取试题集的所有答案"""
        stmt = (
            select(Answer)
            .where(Answer.question_set_id == question_set_id)
            .order_by(Answer.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_question_set_answers_with_students(
        self, question_set_id: int
    ) -> list[dict]:
        """获取试题集的所有答案（包含学生信息）"""
        from backend.app.models.student import Student

        stmt = (
            select(Answer, Student)
            .join(Student, Student.id == Answer.student_id)
            .where(Answer.question_set_id == question_set_id)
            .order_by(Answer.submitted_at.desc().nullsfirst())
        )
        result = await self.session.execute(stmt)
        rows = result.all()

        return [
            {
                "id": answer.id,
                "question_set_id": answer.question_set_id,
                "student_id": answer.student_id,
                "course_id": answer.course_id,
                "status": answer.status,
                "total_score": answer.total_score,
                "saved_at": answer.saved_at,
                "submitted_at": answer.submitted_at,
                "student_answers": answer.student_answers,
                "grading_results": answer.grading_results,
                "error_message": answer.error_message,
                "student": {
                    "id": student.id,
                    "username": student.username,
                    "full_name": student.full_name,
                    "email": student.email,
                },
            }
            for answer, student in rows
        ]

    async def get_answer_with_student(self, answer_id: int) -> dict | None:
        """获取单份答案（包含学生信息）"""
        from backend.app.models.student import Student

        stmt = (
            select(Answer, Student)
            .join(Student, Student.id == Answer.student_id)
            .where(Answer.id == answer_id)
        )
        result = await self.session.execute(stmt)
        row = result.first()

        if not row:
            return None

        answer, student = row
        return {
            "id": answer.id,
            "question_set_id": answer.question_set_id,
            "student_id": answer.student_id,
            "course_id": answer.course_id,
            "status": answer.status,
            "total_score": answer.total_score,
            "saved_at": answer.saved_at,
            "submitted_at": answer.submitted_at,
            "student_answers": answer.student_answers,
            "grading_results": answer.grading_results,
            "error_message": answer.error_message,
            "student": {
                "id": student.id,
                "username": student.username,
                "full_name": student.full_name,
                "email": student.email,
            },
        }

    async def teacher_update_score(
        self,
        answer_id: int,
        total_score: float,
        question_scores: dict[str, float] | None = None,
    ) -> None:
        """教师手动更新分数"""
        answer = await self.get_answer_by_id(answer_id)
        if not answer:
            return

        answer.total_score = total_score

        # 如果提供了单题分数，更新 grading_results
        if question_scores and answer.grading_results:
            results = answer.grading_results.copy()
            for q_id, score in question_scores.items():
                if q_id in results:
                    results[q_id]["score"] = score
                    results[q_id]["feedback"] = (
                        results[q_id].get("feedback", "") + " (教师已修改分数)"
                    )
            answer.grading_results = results

        # 确保状态为 completed
        answer.status = AnswerStatus.COMPLETED.value
        await self.session.flush()
