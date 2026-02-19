"""题目广场服务"""

from collections.abc import Callable
from typing import Any

from sqlalchemy import case, func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.utils import utc_now_naive
from backend.app.models.answer import Answer, AnswerStatus
from backend.app.models.course import Course
from backend.app.models.question_set import QuestionSet
from backend.app.models.student import Student
from backend.app.models.teacher import Teacher

_STATUS_PRIORITY = [
    AnswerStatus.COMPLETED.value,
    AnswerStatus.SUBMITTED.value,
    AnswerStatus.FAILED.value,
    AnswerStatus.DRAFT.value,
]


def _escape_like(keyword: str) -> str:
    """转义 SQL LIKE 通配符，防止用户输入 % 或 _ 干扰查询。"""
    return keyword.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


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
        current_user: Student | Teacher | None = None,
    ) -> tuple[list[dict], int]:
        """获取广场试题集列表"""
        base_cond = [QuestionSet.shared_to_plaza_at.isnot(None)]

        if keyword:
            escaped = _escape_like(keyword)
            base_cond.append(
                or_(
                    QuestionSet.title.ilike(f"%{escaped}%", escape="\\"),
                    QuestionSet.description.ilike(f"%{escaped}%", escape="\\"),
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

        avg_score_sub = (
            select(func.avg(Answer.total_score))
            .where(
                Answer.question_set_id == QuestionSet.id,
                Answer.status == AnswerStatus.COMPLETED.value,
                Answer.total_score.isnot(None),
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
                avg_score_sub.label("average_score"),
            )
            .join(Teacher, Teacher.id == QuestionSet.teacher_id)
            .join(Course, Course.id == QuestionSet.course_id)
            .where(*base_cond)
            .order_by(order)
            .offset(skip)
            .limit(limit)
        )
        rows = (await self.session.execute(stmt)).all()

        # 批量获取当前用户的状态
        qs_ids = [row[0].id for row in rows]
        user_statuses: dict[int, dict] = {}
        if current_user and qs_ids:
            user_statuses = await self._batch_get_my_status(qs_ids, current_user)

        items = []
        for qs, teacher_name, course_name, attempt_count, avg_score in rows:
            is_own = (
                (isinstance(current_user, Teacher) and current_user.id == qs.teacher_id)
                if current_user
                else False
            )

            item: dict[str, Any] = {
                "id": qs.id,
                "title": qs.title,
                "description": qs.description,
                "teacher_name": teacher_name,
                "course_name": course_name,
                "shared_to_plaza_at": qs.shared_to_plaza_at,
                "attempt_count": attempt_count or 0,
                "average_score": round(float(avg_score), 1)
                if avg_score is not None
                else None,
                "my_status": None,
                "my_score": None,
                "is_own": is_own,
            }

            if current_user and qs.id in user_statuses:
                item.update(user_statuses[qs.id])

            items.append(item)

        return items, total

    async def get_plaza_question_set_detail(
        self, question_set_id: int, current_user: Student | Teacher | None = None
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

        is_own = (
            (isinstance(current_user, Teacher) and current_user.id == qs.teacher_id)
            if current_user
            else False
        )

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
            "is_own": is_own,
            "leaderboard": await self.get_leaderboard(qs.id),
        }

        if current_user:
            detail.update(await self.get_my_status(qs.id, current_user))
            detail["my_rank"] = await self.get_my_rank(qs.id, current_user)

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
                literal_column("'student'").label("user_type"),
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
                literal_column("'teacher'").label("user_type"),
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
        current_user: Student | Teacher,
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
        self, question_set_id: int, teacher_id: int, answer_status: str
    ) -> Answer | None:
        stmt = select(Answer).where(
            Answer.question_set_id == question_set_id,
            Answer.teacher_id == teacher_id,
            Answer.status == answer_status,
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_my_answer(
        self, question_set_id: int, user: Student | Teacher
    ) -> Answer | None:
        """获取当前用户在某广场试题集上的最新答案,单次查询,按状态优先级排序"""
        user_cond = (
            Answer.student_id == user.id
            if isinstance(user, Student)
            else Answer.teacher_id == user.id
        )

        status_order = case(
            {s: i for i, s in enumerate(_STATUS_PRIORITY)},
            value=Answer.status,
            else_=len(_STATUS_PRIORITY),
        )

        stmt = (
            select(Answer)
            .where(
                Answer.question_set_id == question_set_id,
                user_cond,
                Answer.status.in_(_STATUS_PRIORITY),
            )
            .order_by(status_order)
            .limit(1)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_my_status(
        self, question_set_id: int, user: Student | Teacher
    ) -> dict:
        """获取当前用户在某试题集上的状态,单次查询"""
        answer = await self.get_my_answer(question_set_id, user)
        if answer:
            return {
                "my_status": answer.status,
                "my_score": (
                    answer.total_score
                    if answer.status == AnswerStatus.COMPLETED.value
                    else None
                ),
            }
        return {"my_status": None, "my_score": None}

    async def _batch_get_my_status(
        self,
        question_set_ids: list[int],
        user: Student | Teacher,
    ) -> dict[int, dict]:
        """批量获取用户在多个试题集上的状态"""
        user_cond = (
            Answer.student_id == user.id
            if isinstance(user, Student)
            else Answer.teacher_id == user.id
        )

        status_order = case(
            {s: i for i, s in enumerate(_STATUS_PRIORITY)},
            value=Answer.status,
            else_=len(_STATUS_PRIORITY),
        )

        stmt = (
            select(Answer)
            .where(
                Answer.question_set_id.in_(question_set_ids),
                user_cond,
                Answer.status.in_(_STATUS_PRIORITY),
            )
            .order_by(Answer.question_set_id, status_order)
        )
        rows = (await self.session.execute(stmt)).scalars().all()

        result: dict[int, dict] = {}
        for answer in rows:
            qs_id = answer.question_set_id
            if qs_id not in result:
                result[qs_id] = {
                    "my_status": answer.status,
                    "my_score": (
                        answer.total_score
                        if answer.status == AnswerStatus.COMPLETED.value
                        else None
                    ),
                }
        return result

    async def get_my_rank(
        self, question_set_id: int, user: Student | Teacher
    ) -> int | None:
        """获取当前用户的排名"""
        user_cond = (
            Answer.student_id == user.id
            if isinstance(user, Student)
            else Answer.teacher_id == user.id
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

    async def _score_stat(
        self, question_set_id: int, agg_func: Callable
    ) -> float | None:
        stmt = select(agg_func(Answer.total_score)).where(
            Answer.question_set_id == question_set_id,
            Answer.status == AnswerStatus.COMPLETED.value,
            Answer.total_score.isnot(None),
        )
        return (await self.session.execute(stmt)).scalar()
