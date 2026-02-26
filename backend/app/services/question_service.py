"""试题集服务"""

from datetime import datetime
from pathlib import Path

import aiofiles
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.models.question_set import QuestionSet, QuestionSetStatus
from backend.app.models.student_course import StudentCourse
from backend.app.models.student_question_set import StudentQuestionSet
from backend.app.schemas.question import AssignRequest


class QuestionService:
    """试题集服务类"""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_question_set(
        self,
        title: str,
        course_id: int,
        teacher_id: int,
        json_content: str,
        description: str | None = None,
    ) -> QuestionSet:
        """创建试题集（内容为 JSON 字符串）"""
        question_set = QuestionSet(
            title=title,
            description=description,
            markdown_path="",  # 稍后更新（字段名保留但存 .json 文件）
            course_id=course_id,
            teacher_id=teacher_id,
        )
        self.session.add(question_set)
        await self.session.flush()
        await self.session.refresh(question_set)

        storage_dir = settings.question_sets_dir / f"course_{course_id}"
        storage_dir.mkdir(parents=True, exist_ok=True)
        file_path = storage_dir / f"question_set_{question_set.id}.json"

        async with aiofiles.open(file_path, "w", encoding="utf-8") as f:
            await f.write(json_content)

        question_set.markdown_path = str(file_path)
        await self.session.flush()

        return question_set

    async def get_question_set_by_id(self, question_set_id: int) -> QuestionSet | None:
        """根据 ID 获取试题集"""
        stmt = select(QuestionSet).where(QuestionSet.id == question_set_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_course_question_sets(self, course_id: int) -> list[QuestionSet]:
        """获取课程的所有试题集"""
        stmt = (
            select(QuestionSet)
            .where(QuestionSet.course_id == course_id)
            .order_by(QuestionSet.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_all_teacher_question_sets(self, teacher_id: int) -> list[dict]:
        """获取教师的全部试题集（含课程名称）"""
        from backend.app.models.course import Course

        stmt = (
            select(QuestionSet, Course.name.label("course_name"))
            .join(Course, QuestionSet.course_id == Course.id)
            .where(QuestionSet.teacher_id == teacher_id)
            .order_by(QuestionSet.created_at.desc())
        )
        result = await self.session.execute(stmt)
        rows = result.all()
        output = []
        for qs, course_name in rows:
            d = {
                "id": qs.id,
                "title": qs.title,
                "description": qs.description,
                "course_id": qs.course_id,
                "course_name": course_name,
                "teacher_id": qs.teacher_id,
                "is_public": qs.is_public,
                "status": qs.status,
                "shared_to_plaza_at": qs.shared_to_plaza_at,
                "created_at": qs.created_at,
                "updated_at": qs.updated_at,
            }
            output.append(d)
        return output

    async def get_question_set_content(self, question_set_id: int) -> str | None:
        """获取试题集内容（JSON 字符串）"""
        question_set = await self.get_question_set_by_id(question_set_id)
        if not question_set:
            return None

        file_path = Path(question_set.markdown_path)
        if not file_path.exists():
            return None

        async with aiofiles.open(file_path, encoding="utf-8") as f:
            return await f.read()

    async def update_question_set_content(
        self, question_set_id: int, json_content: str
    ) -> bool:
        """更新试题集内容（JSON 字符串）"""
        question_set = await self.get_question_set_by_id(question_set_id)
        if not question_set:
            return False

        file_path = Path(question_set.markdown_path)
        async with aiofiles.open(file_path, "w", encoding="utf-8") as f:
            await f.write(json_content)

        return True

    async def publish_question_set(self, question_set_id: int) -> bool:
        """发布试题集"""
        question_set = await self.get_question_set_by_id(question_set_id)
        if not question_set:
            return False

        question_set.status = QuestionSetStatus.PUBLISHED
        question_set.is_public = True
        await self.session.flush()
        return True

    async def assign_question_set(
        self,
        question_set_id: int,
        course_id: int,
        teacher_id: int,
        data: AssignRequest,
    ) -> list[StudentQuestionSet]:
        """分配试题集给学生"""
        assignments: list[StudentQuestionSet] = []

        if data.assign_to_all:
            # 获取课程所有学生
            stmt = select(StudentCourse.student_id).where(
                StudentCourse.course_id == course_id,
                StudentCourse.is_active,
            )
            result = await self.session.execute(stmt)
            student_ids = [row[0] for row in result.all()]
        else:
            student_ids = data.student_ids or []

        for student_id in student_ids:
            # 检查是否已分配
            stmt = select(StudentQuestionSet).where(
                StudentQuestionSet.student_id == student_id,
                StudentQuestionSet.question_set_id == question_set_id,
            )
            result = await self.session.execute(stmt)
            if result.scalar_one_or_none():
                continue

            assignment = StudentQuestionSet(
                student_id=student_id,
                question_set_id=question_set_id,
                course_id=course_id,
                assigned_by_teacher_id=teacher_id,
                deadline=data.deadline,
            )
            self.session.add(assignment)
            assignments.append(assignment)

        await self.session.flush()
        return assignments

    async def get_student_question_sets(
        self, student_id: int, course_id: int | None = None
    ) -> list[dict]:
        """获取学生可访问的试题集列表"""
        from backend.app.models.answer import Answer, AnswerStatus
        from backend.app.models.course import Course

        # 构建基础查询
        base_conditions = []
        if course_id:
            base_conditions.append(QuestionSet.course_id == course_id)

        # 已分配的试题集
        stmt = (
            select(
                QuestionSet,
                StudentQuestionSet,
                Course.name.label("course_name"),
            )
            .join(
                StudentQuestionSet, StudentQuestionSet.question_set_id == QuestionSet.id
            )
            .join(Course, Course.id == QuestionSet.course_id)
            .where(
                StudentQuestionSet.student_id == student_id,
                *base_conditions,
            )
        )
        result = await self.session.execute(stmt)
        assigned_sets = result.all()

        # 公开的试题集（学生所在课程）
        stmt = (
            select(QuestionSet, Course.name.label("course_name"))
            .join(Course, Course.id == QuestionSet.course_id)
            .join(StudentCourse, StudentCourse.course_id == Course.id)
            .where(
                StudentCourse.student_id == student_id,
                StudentCourse.is_active,
                QuestionSet.is_public,
                *base_conditions,
            )
        )
        result = await self.session.execute(stmt)
        public_sets = result.all()

        # 整合结果
        result_list = []
        seen_ids = set()

        for row in assigned_sets:
            qs = row[0]
            sqs = row[1]
            course_name = row[2]
            if qs.id in seen_ids:
                continue
            seen_ids.add(qs.id)

            # 检查是否有草稿
            draft_stmt = select(Answer).where(
                Answer.question_set_id == qs.id,
                Answer.student_id == student_id,
                Answer.status == AnswerStatus.DRAFT.value,
            )
            draft_result = await self.session.execute(draft_stmt)
            has_draft = draft_result.scalar_one_or_none() is not None

            result_list.append(
                {
                    "id": qs.id,
                    "title": qs.title,
                    "description": qs.description,
                    "is_assigned": True,
                    "is_completed": sqs.is_completed,
                    "deadline": sqs.deadline,
                    "completed_at": sqs.completed_at,
                    "has_draft": has_draft,
                    "course_name": course_name,
                }
            )

        for row in public_sets:
            qs = row[0]
            course_name = row[1]
            if qs.id in seen_ids:
                continue
            seen_ids.add(qs.id)

            # 检查是否有草稿
            draft_stmt = select(Answer).where(
                Answer.question_set_id == qs.id,
                Answer.student_id == student_id,
                Answer.status == AnswerStatus.DRAFT.value,
            )
            draft_result = await self.session.execute(draft_stmt)
            has_draft = draft_result.scalar_one_or_none() is not None

            # 检查是否已完成
            completed_stmt = select(Answer).where(
                Answer.question_set_id == qs.id,
                Answer.student_id == student_id,
                Answer.status == AnswerStatus.COMPLETED.value,
            )
            completed_result = await self.session.execute(completed_stmt)
            is_completed = completed_result.scalar_one_or_none() is not None

            result_list.append(
                {
                    "id": qs.id,
                    "title": qs.title,
                    "description": qs.description,
                    "is_assigned": False,
                    "is_completed": is_completed,
                    "deadline": None,
                    "completed_at": None,
                    "has_draft": has_draft,
                    "course_name": course_name,
                }
            )

        return result_list

    async def verify_teacher_owns_question_set(
        self, question_set_id: int, teacher_id: int
    ) -> QuestionSet | None:
        """验证教师拥有该试题集（通过课程）"""
        stmt = (
            select(QuestionSet)
            .join(QuestionSet.course)
            .where(
                QuestionSet.id == question_set_id,
                QuestionSet.course.has(teacher_id=teacher_id),
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def verify_student_has_access(
        self, question_set_id: int, student_id: int
    ) -> bool:
        """验证学生可访问该试题集"""
        # 检查是否已分配
        stmt = select(StudentQuestionSet).where(
            StudentQuestionSet.question_set_id == question_set_id,
            StudentQuestionSet.student_id == student_id,
        )
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none():
            return True

        # 获取试题集
        question_set = await self.get_question_set_by_id(question_set_id)
        if not question_set:
            return False

        # 广场分支：已分享到广场的试题集，任意已登录学生可访问
        if question_set.shared_to_plaza_at is not None:
            return True

        # 公开试题集：检查学生是否在对应课程中
        if not question_set.is_public:
            return False

        stmt = select(StudentCourse).where(
            StudentCourse.course_id == question_set.course_id,
            StudentCourse.student_id == student_id,
            StudentCourse.is_active,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def mark_completed(self, question_set_id: int, student_id: int) -> None:
        """标记试题集为已完成"""
        stmt = select(StudentQuestionSet).where(
            StudentQuestionSet.question_set_id == question_set_id,
            StudentQuestionSet.student_id == student_id,
        )
        result = await self.session.execute(stmt)
        sqs = result.scalar_one_or_none()
        if sqs:
            sqs.is_completed = True
            from datetime import UTC

            sqs.completed_at = datetime.now(UTC).replace(tzinfo=None)
            await self.session.flush()

    async def delete_question_set(self, question_set_id: int) -> bool:
        """删除试题集（包括相关的分配记录和答案）"""
        from pathlib import Path

        from sqlalchemy import update

        from backend.app.models.answer import Answer
        from backend.app.models.exam_paper import ExamPaperGenerationJob

        # 1. 删除相关的答案记录
        delete_answers_stmt = Answer.__table__.delete().where(
            Answer.question_set_id == question_set_id
        )
        await self.session.execute(delete_answers_stmt)

        # 2. 删除分配记录
        delete_sqs_stmt = StudentQuestionSet.__table__.delete().where(
            StudentQuestionSet.question_set_id == question_set_id
        )
        await self.session.execute(delete_sqs_stmt)

        # 3. 解除高考组卷任务对该 QS 的外键引用（避免 FK 冲突）
        await self.session.execute(
            update(ExamPaperGenerationJob)
            .where(ExamPaperGenerationJob.question_set_id == question_set_id)
            .values(question_set_id=None)
        )

        # 4. 获取并删除试题集
        question_set = await self.get_question_set_by_id(question_set_id)
        if not question_set:
            return False

        # 5. 删除内容文件（.json）
        if question_set.markdown_path:
            file_path = Path(question_set.markdown_path)
            if file_path.exists():
                file_path.unlink()

        # 6. 删除数据库记录
        await self.session.delete(question_set)
        await self.session.flush()
        return True
