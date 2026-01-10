"""统计服务"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import cast, func, select
from sqlalchemy.dialects.postgresql import DATE
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.answer import Answer, AnswerStatus
from backend.app.models.course import Course
from backend.app.models.document import Document
from backend.app.models.question_set import QuestionSet
from backend.app.models.student import Student
from backend.app.models.student_course import StudentCourse
from backend.app.models.student_question_set import StudentQuestionSet
from backend.app.schemas.statistics import (
    CourseOverview,
    DailyScore,
    DailySubmission,
    QuestionSetCompletion,
    QuestionSetCompletionList,
    QuestionSetStatistics,
    ScoreTrend,
    StudentInfo,
    StudentStatistics,
    SubmissionTrend,
)


class StatisticsService:
    """统计服务类"""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_course_overview(self, course_id: int) -> CourseOverview | None:
        """获取课程概览"""
        # 获取课程信息
        stmt = select(Course).where(Course.id == course_id)
        result = await self.session.execute(stmt)
        course = result.scalar_one_or_none()
        if not course:
            return None

        # 统计学生数量
        stmt = (
            select(func.count())
            .select_from(StudentCourse)
            .where(
                StudentCourse.course_id == course_id,
                StudentCourse.is_active,
            )
        )
        result = await self.session.execute(stmt)
        student_count = result.scalar() or 0

        # 统计文档数量
        stmt = (
            select(func.count())
            .select_from(Document)
            .where(Document.course_id == course_id)
        )
        result = await self.session.execute(stmt)
        document_count = result.scalar() or 0

        # 统计试题集数量
        stmt = (
            select(func.count())
            .select_from(QuestionSet)
            .where(QuestionSet.course_id == course_id)
        )
        result = await self.session.execute(stmt)
        question_set_count = result.scalar() or 0

        return CourseOverview(
            course_id=course_id,
            course_name=course.name,
            student_count=student_count,
            document_count=document_count,
            question_set_count=question_set_count,
        )

    async def get_question_set_statistics(
        self, question_set_id: int
    ) -> QuestionSetStatistics | None:
        """获取试题集统计"""
        # 获取试题集信息
        stmt = select(QuestionSet).where(QuestionSet.id == question_set_id)
        result = await self.session.execute(stmt)
        question_set = result.scalar_one_or_none()
        if not question_set:
            return None

        # 统计分配数量
        stmt = (
            select(func.count())
            .select_from(StudentQuestionSet)
            .where(StudentQuestionSet.question_set_id == question_set_id)
        )
        result = await self.session.execute(stmt)
        total_assigned = result.scalar() or 0

        # 统计完成数量
        stmt = (
            select(func.count())
            .select_from(StudentQuestionSet)
            .where(
                StudentQuestionSet.question_set_id == question_set_id,
                StudentQuestionSet.is_completed,
            )
        )
        result = await self.session.execute(stmt)
        completed_count = result.scalar() or 0

        # 计算完成率
        completion_rate = (
            (completed_count / total_assigned * 100) if total_assigned > 0 else 0.0
        )

        # 计算平均分
        stmt = select(func.avg(Answer.total_score)).where(
            Answer.question_set_id == question_set_id,
            Answer.status == AnswerStatus.COMPLETED.value,
            Answer.total_score.isnot(None),
        )
        result = await self.session.execute(stmt)
        average_score = result.scalar()

        # 统计失败数量和原因
        stmt = select(Answer.error_message).where(
            Answer.question_set_id == question_set_id,
            Answer.status == AnswerStatus.FAILED.value,
        )
        result = await self.session.execute(stmt)
        failed_answers = result.all()
        failed_count = len(failed_answers)
        failed_reasons = [row[0] for row in failed_answers if row[0]]

        return QuestionSetStatistics(
            question_set_id=question_set_id,
            title=question_set.title,
            total_assigned=total_assigned,
            completed_count=completed_count,
            completion_rate=round(completion_rate, 2),
            average_score=round(average_score, 2) if average_score else None,
            failed_count=failed_count,
            failed_reasons=failed_reasons,
        )

    async def get_course_students(self, course_id: int) -> list[StudentInfo]:
        """获取课程学生列表"""
        stmt = (
            select(Student, StudentCourse.joined_at, StudentCourse.is_active)
            .join(StudentCourse, StudentCourse.student_id == Student.id)
            .where(StudentCourse.course_id == course_id)
            .order_by(StudentCourse.joined_at.desc())
        )
        result = await self.session.execute(stmt)
        rows = result.all()

        return [
            StudentInfo(
                id=row[0].id,
                username=row[0].username,
                full_name=row[0].full_name,
                email=row[0].email,
                joined_at=row[1],
                is_active=row[2],
            )
            for row in rows
        ]

    async def get_student_statistics(self, student_id: int) -> StudentStatistics:
        """获取学生个人统计"""
        # 统计课程数量
        stmt = (
            select(func.count())
            .select_from(StudentCourse)
            .where(
                StudentCourse.student_id == student_id,
                StudentCourse.is_active,
            )
        )
        result = await self.session.execute(stmt)
        total_courses = result.scalar() or 0

        # 统计试题集数量（已分配）
        stmt = (
            select(func.count())
            .select_from(StudentQuestionSet)
            .where(StudentQuestionSet.student_id == student_id)
        )
        result = await self.session.execute(stmt)
        total_question_sets = result.scalar() or 0

        # 统计完成数量
        stmt = (
            select(func.count())
            .select_from(Answer)
            .where(
                Answer.student_id == student_id,
                Answer.status == AnswerStatus.COMPLETED.value,
            )
        )
        result = await self.session.execute(stmt)
        completed_count = result.scalar() or 0

        # 计算平均分
        stmt = select(func.avg(Answer.total_score)).where(
            Answer.student_id == student_id,
            Answer.status == AnswerStatus.COMPLETED.value,
            Answer.total_score.isnot(None),
        )
        result = await self.session.execute(stmt)
        average_score = result.scalar()

        return StudentStatistics(
            total_courses=total_courses,
            total_question_sets=total_question_sets,
            completed_count=completed_count,
            average_score=round(average_score, 2) if average_score else None,
        )

    async def get_submission_trend(
        self, course_id: int, days: int = 7
    ) -> SubmissionTrend:
        """获取答题提交趋势（最近 N 天）"""
        end_date = datetime.now(UTC).replace(tzinfo=None)
        start_date = end_date - timedelta(days=days - 1)

        # 按日期分组统计提交数量
        stmt = (
            select(
                cast(Answer.submitted_at, DATE).label("date"),
                func.count(Answer.id).label("count"),
            )
            .join(QuestionSet, Answer.question_set_id == QuestionSet.id)
            .where(
                QuestionSet.course_id == course_id,
                Answer.submitted_at.isnot(None),
                Answer.submitted_at >= start_date,
            )
            .group_by(cast(Answer.submitted_at, DATE))
            .order_by(cast(Answer.submitted_at, DATE))
        )
        result = await self.session.execute(stmt)
        rows = result.all()

        # 创建日期到数量的映射
        date_counts = {row[0]: row[1] for row in rows}

        # 生成完整的日期序列
        data = []
        total = 0
        current_date = start_date.date()
        while current_date <= end_date.date():
            count = date_counts.get(current_date, 0)
            data.append(
                DailySubmission(
                    date=current_date.strftime("%m-%d"),
                    count=count,
                )
            )
            total += count
            current_date += timedelta(days=1)

        return SubmissionTrend(data=data, total=total)

    async def get_question_set_completion(
        self, course_id: int
    ) -> QuestionSetCompletionList:
        """获取课程下所有试题集的完成情况"""
        # 获取课程下的所有试题集
        stmt = (
            select(QuestionSet)
            .where(QuestionSet.course_id == course_id)
            .order_by(QuestionSet.created_at.desc())
        )
        result = await self.session.execute(stmt)
        question_sets = result.scalars().all()

        items = []
        for qs in question_sets:
            # 统计分配数量
            assigned_stmt = (
                select(func.count())
                .select_from(StudentQuestionSet)
                .where(StudentQuestionSet.question_set_id == qs.id)
            )
            assigned_result = await self.session.execute(assigned_stmt)
            total_assigned = assigned_result.scalar() or 0

            # 统计完成数量
            completed_stmt = (
                select(func.count())
                .select_from(StudentQuestionSet)
                .where(
                    StudentQuestionSet.question_set_id == qs.id,
                    StudentQuestionSet.is_completed,
                )
            )
            completed_result = await self.session.execute(completed_stmt)
            completed_count = completed_result.scalar() or 0

            # 计算完成率
            completion_rate = (
                (completed_count / total_assigned * 100) if total_assigned > 0 else 0.0
            )

            # 计算平均分
            score_stmt = select(func.avg(Answer.total_score)).where(
                Answer.question_set_id == qs.id,
                Answer.status == AnswerStatus.COMPLETED.value,
                Answer.total_score.isnot(None),
            )
            score_result = await self.session.execute(score_stmt)
            average_score = score_result.scalar()

            items.append(
                QuestionSetCompletion(
                    id=qs.id,
                    title=qs.title[:20] + "..." if len(qs.title) > 20 else qs.title,
                    total_assigned=total_assigned,
                    completed_count=completed_count,
                    completion_rate=round(completion_rate, 1),
                    average_score=round(average_score, 1) if average_score else None,
                )
            )

        return QuestionSetCompletionList(items=items[:10])  # 最多返回 10 个

    async def get_score_trend(self, course_id: int, days: int = 7) -> ScoreTrend:
        """获取平均分趋势（最近 N 天）"""
        end_date = datetime.now(UTC).replace(tzinfo=None)
        start_date = end_date - timedelta(days=days - 1)

        # 按日期分组统计平均分
        stmt = (
            select(
                cast(Answer.submitted_at, DATE).label("date"),
                func.avg(Answer.total_score).label("score"),
                func.count(Answer.id).label("count"),
            )
            .join(QuestionSet, Answer.question_set_id == QuestionSet.id)
            .where(
                QuestionSet.course_id == course_id,
                Answer.submitted_at.isnot(None),
                Answer.submitted_at >= start_date,
                Answer.status == AnswerStatus.COMPLETED.value,
                Answer.total_score.isnot(None),
            )
            .group_by(cast(Answer.submitted_at, DATE))
            .order_by(cast(Answer.submitted_at, DATE))
        )
        result = await self.session.execute(stmt)
        rows = result.all()

        # 创建日期到分数的映射
        date_scores = {row[0]: (row[1], row[2]) for row in rows}

        # 生成完整的日期序列
        data = []
        current_date = start_date.date()
        while current_date <= end_date.date():
            score_data = date_scores.get(current_date)
            if score_data:
                score, count = score_data
                data.append(
                    DailyScore(
                        date=current_date.strftime("%m-%d"),
                        score=round(float(score), 1) if score else None,
                        count=count,
                    )
                )
            else:
                data.append(
                    DailyScore(
                        date=current_date.strftime("%m-%d"),
                        score=None,
                        count=0,
                    )
                )
            current_date += timedelta(days=1)

        return ScoreTrend(data=data)
