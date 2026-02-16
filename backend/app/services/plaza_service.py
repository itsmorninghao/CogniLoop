"""题目广场服务"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.answer import Answer, AnswerStatus
from backend.app.models.course import Course
from backend.app.models.question_set import QuestionSet
from backend.app.models.student import Student
from backend.app.models.teacher import Teacher


def utc_now_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class PlazaService:
    """题目广场服务类"""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def share_to_plaza(
        self, question_set_id: int, teacher_id: int
    ) -> QuestionSet:
        """分享试题集到广场"""
        stmt = select(QuestionSet).where(
            QuestionSet.id == question_set_id,
            QuestionSet.teacher_id == teacher_id,
        )
        result = await self.session.execute(stmt)
        qs = result.scalar_one_or_none()

        if not qs:
            raise ValueError("试题集不存在或无权操作")
        # 草稿和已发布均可分享到广场
        if qs.shared_to_plaza_at is None:
            qs.shared_to_plaza_at = utc_now_naive()
            await self.session.flush()

        return qs

    async def unshare_from_plaza(self, question_set_id: int, teacher_id: int) -> None:
        """从广场撤回试题集"""
        stmt = select(QuestionSet).where(
            QuestionSet.id == question_set_id,
            QuestionSet.teacher_id == teacher_id,
        )
        result = await self.session.execute(stmt)
        qs = result.scalar_one_or_none()

        if not qs:
            raise ValueError("试题集不存在或无权操作")

        qs.shared_to_plaza_at = None
        await self.session.flush()

    async def get_plaza_question_sets(
        self,
        skip: int = 0,
        limit: int = 20,
        keyword: str | None = None,
        sort: str = "newest",
        current_user: Any = None,
    ) -> tuple[list[dict], int]:
        """获取广场试题集列表"""
        base_cond = [
            QuestionSet.shared_to_plaza_at.isnot(None),
        ]

        if keyword:
            base_cond.append(
                or_(
                    QuestionSet.title.ilike(f"%{keyword}%"),
                    QuestionSet.description.ilike(f"%{keyword}%"),
                )
            )

        # 总数
        count_stmt = select(func.count()).select_from(QuestionSet).where(*base_cond)
        total = (await self.session.execute(count_stmt)).scalar() or 0

        # 作答人次子查询
        attempt_sub = (
            select(func.count())
            .where(
                Answer.question_set_id == QuestionSet.id,
                Answer.status.in_(
                    [AnswerStatus.SUBMITTED.value, AnswerStatus.COMPLETED.value]
                ),
            )
            .correlate(QuestionSet)
            .scalar_subquery()
        )

        # 排序
        if sort == "popular":
            order = attempt_sub.desc()
        elif sort == "oldest":
            order = QuestionSet.shared_to_plaza_at.asc()
        else:
            order = QuestionSet.shared_to_plaza_at.desc()

        stmt = (
            select(
                QuestionSet,
                Teacher.full_name.label("teacher_name"),
                Course.name.label("course_name"),
                attempt_sub.label("attempt_count"),
            )
            .join(Teacher, Teacher.id == QuestionSet.teacher_id)
            .join(Course, Course.id == QuestionSet.course_id)
            .where(*base_cond)
            .order_by(order)
            .offset(skip)
            .limit(limit)
        )
        rows = (await self.session.execute(stmt)).all()

        items = []
        for qs, teacher_name, course_name, attempt_count in rows:
            item: dict[str, Any] = {
                "id": qs.id,
                "title": qs.title,
                "description": qs.description,
                "teacher_name": teacher_name,
                "course_name": course_name,
                "shared_to_plaza_at": qs.shared_to_plaza_at,
                "attempt_count": attempt_count or 0,
                "average_score": None,
                "my_status": None,
                "my_score": None,
            }

            # 平均分
            avg_stmt = select(func.avg(Answer.total_score)).where(
                Answer.question_set_id == qs.id,
                Answer.status == AnswerStatus.COMPLETED.value,
                Answer.total_score.isnot(None),
            )
            avg = (await self.session.execute(avg_stmt)).scalar()
            if avg is not None:
                item["average_score"] = round(float(avg), 1)

            # 当前用户的状态
            if current_user:
                item.update(await self._get_my_status(qs.id, current_user))

            items.append(item)

        return items, total

    async def get_plaza_question_set_detail(
        self, question_set_id: int, current_user: Any = None
    ) -> dict | None:
        """获取广场试题集详情"""
        stmt = (
            select(
                QuestionSet,
                Teacher.full_name.label("teacher_name"),
                Course.name.label("course_name"),
            )
            .join(Teacher, Teacher.id == QuestionSet.teacher_id)
            .join(Course, Course.id == QuestionSet.course_id)
            .where(
                QuestionSet.id == question_set_id,
                QuestionSet.shared_to_plaza_at.isnot(None),
            )
        )
        row = (await self.session.execute(stmt)).first()
        if not row:
            return None

        qs, teacher_name, course_name = row

        # 统计
        attempt_count = await self._count_attempts(qs.id)
        completion_count = await self._count_completions(qs.id)
        avg = await self._avg_score(qs.id)

        detail: dict[str, Any] = {
            "id": qs.id,
            "title": qs.title,
            "description": qs.description,
            "teacher_name": teacher_name,
            "course_name": course_name,
            "shared_to_plaza_at": qs.shared_to_plaza_at,
            "attempt_count": attempt_count,
            "completion_count": completion_count,
            "average_score": round(float(avg), 1) if avg else None,
            "created_at": qs.created_at,
            "my_status": None,
            "my_score": None,
            "my_rank": None,
            "leaderboard": await self.get_leaderboard(qs.id),
        }

        if current_user:
            detail.update(await self._get_my_status(qs.id, current_user))
            detail["my_rank"] = await self._get_my_rank(qs.id, current_user)

        return detail

    async def get_leaderboard(
        self, question_set_id: int, limit: int = 10
    ) -> list[dict]:
        """获取试题集排行榜"""
        # 学生作答
        student_sub = (
            select(
                Answer.total_score.label("score"),
                Answer.submitted_at,
                Student.full_name.label("user_name"),
                func.literal("student").label("user_type"),
            )
            .join(Student, Student.id == Answer.student_id)
            .where(
                Answer.question_set_id == question_set_id,
                Answer.status == AnswerStatus.COMPLETED.value,
                Answer.total_score.isnot(None),
                Answer.student_id.isnot(None),
            )
        )

        # 教师作答
        teacher_sub = (
            select(
                Answer.total_score.label("score"),
                Answer.submitted_at,
                Teacher.full_name.label("user_name"),
                func.literal("teacher").label("user_type"),
            )
            .join(Teacher, Teacher.id == Answer.teacher_id)
            .where(
                Answer.question_set_id == question_set_id,
                Answer.status == AnswerStatus.COMPLETED.value,
                Answer.total_score.isnot(None),
                Answer.teacher_id.isnot(None),
            )
        )

        union_stmt = student_sub.union_all(teacher_sub).subquery()
        stmt = (
            select(union_stmt)
            .order_by(union_stmt.c.score.desc(), union_stmt.c.submitted_at.asc())
            .limit(limit)
        )
        rows = (await self.session.execute(stmt)).all()

        return [
            {
                "rank": idx + 1,
                "user_name": row.user_name,
                "user_type": row.user_type,
                "score": float(row.score),
                "submitted_at": row.submitted_at,
            }
            for idx, row in enumerate(rows)
        ]

    async def get_my_attempts(
        self,
        current_user: Any,
        skip: int = 0,
        limit: int = 20,
        status_filter: str = "all",
    ) -> tuple[list[dict], int]:
        """获取当前用户的广场作答记录"""
        is_student = isinstance(current_user, Student)
        user_cond = (
            Answer.student_id == current_user.id
            if is_student
            else Answer.teacher_id == current_user.id
        )

        base_cond = [
            user_cond,
            QuestionSet.shared_to_plaza_at.isnot(None),
        ]

        if status_filter == "draft":
            base_cond.append(Answer.status == AnswerStatus.DRAFT.value)
        elif status_filter == "completed":
            base_cond.append(Answer.status == AnswerStatus.COMPLETED.value)

        count_stmt = (
            select(func.count())
            .select_from(Answer)
            .join(QuestionSet, QuestionSet.id == Answer.question_set_id)
            .where(*base_cond)
        )
        total = (await self.session.execute(count_stmt)).scalar() or 0

        stmt = (
            select(Answer, QuestionSet.title, Teacher.full_name.label("teacher_name"))
            .join(QuestionSet, QuestionSet.id == Answer.question_set_id)
            .join(Teacher, Teacher.id == QuestionSet.teacher_id)
            .where(*base_cond)
            .order_by(Answer.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        rows = (await self.session.execute(stmt)).all()

        return [
            {
                "answer_id": answer.id,
                "question_set_id": answer.question_set_id,
                "question_set_title": title,
                "teacher_name": teacher_name,
                "status": answer.status,
                "total_score": answer.total_score,
                "submitted_at": answer.submitted_at,
            }
            for answer, title, teacher_name in rows
        ], total

    async def get_my_shared_stats(self, teacher_id: int) -> dict:
        """获取教师分享到广场的试题集统计"""
        stmt = select(QuestionSet).where(
            QuestionSet.teacher_id == teacher_id,
            QuestionSet.shared_to_plaza_at.isnot(None),
        )
        rows = (await self.session.execute(stmt)).scalars().all()

        items = []
        total_attempts = 0
        for qs in rows:
            attempt_count = await self._count_attempts(qs.id)
            completion_count = await self._count_completions(qs.id)
            avg = await self._avg_score(qs.id)
            highest = await self._score_stat(qs.id, func.max)
            lowest = await self._score_stat(qs.id, func.min)
            total_attempts += attempt_count

            items.append(
                {
                    "question_set_id": qs.id,
                    "title": qs.title,
                    "shared_to_plaza_at": qs.shared_to_plaza_at,
                    "attempt_count": attempt_count,
                    "completion_count": completion_count,
                    "average_score": round(float(avg), 1) if avg else None,
                    "highest_score": float(highest) if highest else None,
                    "lowest_score": float(lowest) if lowest else None,
                }
            )

        return {
            "total_shared": len(items),
            "total_attempts": total_attempts,
            "items": items,
        }

    # ======================== 教师做题 ========================

    async def teacher_save_draft(
        self, teacher_id: int, question_set_id: int, student_answers: dict
    ) -> Answer:
        """教师做广场题 - 保存草稿"""
        qs = await self._verify_teacher_can_take(question_set_id, teacher_id)

        # 检查是否已完成
        existing = await self._find_teacher_answer(
            question_set_id, teacher_id, AnswerStatus.COMPLETED.value
        )
        if existing:
            raise ValueError("已完成的试题集不能再次作答")

        # 查找或创建草稿
        draft = await self._find_teacher_answer(
            question_set_id, teacher_id, AnswerStatus.DRAFT.value
        )
        if draft:
            draft.student_answers = student_answers
            draft.saved_at = utc_now_naive()
        else:
            draft = Answer(
                question_set_id=question_set_id,
                teacher_id=teacher_id,
                student_id=None,
                course_id=qs.course_id,
                student_answers=student_answers,
                status=AnswerStatus.DRAFT.value,
            )
            self.session.add(draft)

        await self.session.flush()
        await self.session.refresh(draft)
        return draft

    async def teacher_submit_answer(
        self, teacher_id: int, question_set_id: int, student_answers: dict
    ) -> Answer:
        """教师做广场题 - 提交答案"""
        qs = await self._verify_teacher_can_take(question_set_id, teacher_id)

        existing = await self._find_teacher_answer(
            question_set_id, teacher_id, AnswerStatus.COMPLETED.value
        )
        if existing:
            raise ValueError("该试题集已提交，不允许重新提交")

        draft = await self._find_teacher_answer(
            question_set_id, teacher_id, AnswerStatus.DRAFT.value
        )
        if draft:
            draft.student_answers = student_answers
            draft.status = AnswerStatus.SUBMITTED.value
            draft.submitted_at = utc_now_naive()
            answer = draft
        else:
            answer = Answer(
                question_set_id=question_set_id,
                teacher_id=teacher_id,
                student_id=None,
                course_id=qs.course_id,
                student_answers=student_answers,
                status=AnswerStatus.SUBMITTED.value,
                submitted_at=utc_now_naive(),
            )
            self.session.add(answer)

        await self.session.flush()
        await self.session.refresh(answer)
        return answer

    async def _verify_teacher_can_take(
        self, question_set_id: int, teacher_id: int
    ) -> QuestionSet:
        """验证教师能做这道广场题（不能做自己出的题）"""
        stmt = select(QuestionSet).where(
            QuestionSet.id == question_set_id,
            QuestionSet.shared_to_plaza_at.isnot(None),
        )
        qs = (await self.session.execute(stmt)).scalar_one_or_none()
        if not qs:
            raise ValueError("试题集不存在或未在广场上")
        if qs.teacher_id == teacher_id:
            raise ValueError("不能做自己出的题")
        return qs

    async def _find_teacher_answer(
        self, question_set_id: int, teacher_id: int, status: str
    ) -> Answer | None:
        stmt = select(Answer).where(
            Answer.question_set_id == question_set_id,
            Answer.teacher_id == teacher_id,
            Answer.status == status,
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def _get_my_status(self, question_set_id: int, user: Any) -> dict:
        """获取当前用户在某试题集上的状态"""
        is_student = isinstance(user, Student)
        user_cond = (
            Answer.student_id == user.id if is_student else Answer.teacher_id == user.id
        )

        # 优先检查已完成
        stmt = select(Answer).where(
            Answer.question_set_id == question_set_id,
            user_cond,
            Answer.status == AnswerStatus.COMPLETED.value,
        )
        completed = (await self.session.execute(stmt)).scalar_one_or_none()
        if completed:
            return {"my_status": "completed", "my_score": completed.total_score}

        # 检查草稿
        stmt = select(Answer).where(
            Answer.question_set_id == question_set_id,
            user_cond,
            Answer.status == AnswerStatus.DRAFT.value,
        )
        draft = (await self.session.execute(stmt)).scalar_one_or_none()
        if draft:
            return {"my_status": "draft", "my_score": None}

        return {"my_status": None, "my_score": None}

    async def _get_my_rank(self, question_set_id: int, user: Any) -> int | None:
        """获取当前用户的排名"""
        is_student = isinstance(user, Student)
        user_cond = (
            Answer.student_id == user.id if is_student else Answer.teacher_id == user.id
        )

        my_answer_stmt = select(Answer).where(
            Answer.question_set_id == question_set_id,
            user_cond,
            Answer.status == AnswerStatus.COMPLETED.value,
            Answer.total_score.isnot(None),
        )
        my_answer = (await self.session.execute(my_answer_stmt)).scalar_one_or_none()
        if not my_answer:
            return None

        rank_stmt = (
            select(func.count())
            .select_from(Answer)
            .where(
                Answer.question_set_id == question_set_id,
                Answer.status == AnswerStatus.COMPLETED.value,
                Answer.total_score.isnot(None),
                or_(
                    Answer.total_score > my_answer.total_score,
                    (Answer.total_score == my_answer.total_score)
                    & (Answer.submitted_at < my_answer.submitted_at),
                ),
            )
        )
        higher_count = (await self.session.execute(rank_stmt)).scalar() or 0
        return higher_count + 1

    async def _count_attempts(self, question_set_id: int) -> int:
        stmt = (
            select(func.count())
            .select_from(Answer)
            .where(
                Answer.question_set_id == question_set_id,
                Answer.status.in_(
                    [AnswerStatus.SUBMITTED.value, AnswerStatus.COMPLETED.value]
                ),
            )
        )
        return (await self.session.execute(stmt)).scalar() or 0

    async def _count_completions(self, question_set_id: int) -> int:
        stmt = (
            select(func.count())
            .select_from(Answer)
            .where(
                Answer.question_set_id == question_set_id,
                Answer.status == AnswerStatus.COMPLETED.value,
            )
        )
        return (await self.session.execute(stmt)).scalar() or 0

    async def _avg_score(self, question_set_id: int) -> float | None:
        stmt = select(func.avg(Answer.total_score)).where(
            Answer.question_set_id == question_set_id,
            Answer.status == AnswerStatus.COMPLETED.value,
            Answer.total_score.isnot(None),
        )
        return (await self.session.execute(stmt)).scalar()

    async def _score_stat(self, question_set_id: int, agg_func: Any) -> float | None:
        stmt = select(agg_func(Answer.total_score)).where(
            Answer.question_set_id == question_set_id,
            Answer.status == AnswerStatus.COMPLETED.value,
            Answer.total_score.isnot(None),
        )
        return (await self.session.execute(stmt)).scalar()
