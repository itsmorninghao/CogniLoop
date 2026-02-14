"""课程服务"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models.course import Course
from backend.app.models.document import Document
from backend.app.models.question_set import QuestionSet
from backend.app.models.student import Student
from backend.app.models.student_course import StudentCourse
from backend.app.schemas.course import CourseCreate, CourseDetail


class CourseService:
    """课程服务类"""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_course(self, data: CourseCreate, teacher_id: int) -> Course:
        """创建课程"""
        course = Course(
            name=data.name,
            description=data.description,
            teacher_id=teacher_id,
        )
        self.session.add(course)
        await self.session.flush()
        await self.session.refresh(course)
        return course

    async def get_course_by_id(self, course_id: int) -> Course | None:
        """根据 ID 获取课程"""
        stmt = select(Course).where(Course.id == course_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_course_by_invite_code(self, invite_code: str) -> Course | None:
        """根据邀请码获取课程"""
        stmt = select(Course).where(Course.invite_code == invite_code.upper())
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_teacher_courses(self, teacher_id: int) -> list[Course]:
        """获取教师的所有活跃课程"""
        stmt = (
            select(Course)
            .where(Course.teacher_id == teacher_id, Course.is_active)
            .order_by(Course.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_course_detail(self, course_id: int) -> CourseDetail | None:
        """获取课程详情"""
        stmt = (
            select(Course)
            .options(selectinload(Course.teacher))
            .where(Course.id == course_id)
        )
        result = await self.session.execute(stmt)
        course = result.scalar_one_or_none()
        if not course:
            return None

        # 统计数量
        student_count = await self._count_students(course_id)
        document_count = await self._count_documents(course_id)
        question_set_count = await self._count_question_sets(course_id)

        return CourseDetail(
            id=course.id,
            name=course.name,
            code=course.code,
            description=course.description,
            invite_code=course.invite_code,
            teacher_id=course.teacher_id,
            is_active=course.is_active,
            created_at=course.created_at,
            teacher_name=course.teacher.full_name,
            student_count=student_count,
            document_count=document_count,
            question_set_count=question_set_count,
        )

    async def _count_students(self, course_id: int) -> int:
        """统计课程学生数量"""
        stmt = (
            select(func.count())
            .select_from(StudentCourse)
            .where(
                StudentCourse.course_id == course_id,
                StudentCourse.is_active,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar() or 0

    async def _count_documents(self, course_id: int) -> int:
        """统计课程文档数量"""
        stmt = (
            select(func.count())
            .select_from(Document)
            .where(Document.course_id == course_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar() or 0

    async def _count_question_sets(self, course_id: int) -> int:
        """统计课程试题集数量"""
        stmt = (
            select(func.count())
            .select_from(QuestionSet)
            .where(QuestionSet.course_id == course_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar() or 0

    async def verify_teacher_owns_course(
        self, course_id: int, teacher_id: int
    ) -> Course | None:
        """验证教师拥有该课程"""
        stmt = select(Course).where(
            Course.id == course_id,
            Course.teacher_id == teacher_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def join_course(self, student_id: int, invite_code: str) -> StudentCourse:
        """学生加入课程"""
        course = await self.get_course_by_invite_code(invite_code)
        if not course:
            raise ValueError("邀请码无效")

        if not course.is_active:
            raise ValueError("课程已关闭")

        # 检查是否已加入
        stmt = select(StudentCourse).where(
            StudentCourse.student_id == student_id,
            StudentCourse.course_id == course.id,
        )
        result = await self.session.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            if existing.is_active:
                raise ValueError("已加入该课程")
            existing.is_active = True
            await self.session.flush()
            return existing

        student_course = StudentCourse(
            student_id=student_id,
            course_id=course.id,
        )
        self.session.add(student_course)
        await self.session.flush()
        await self.session.refresh(student_course)
        return student_course

    async def get_student_courses(self, student_id: int) -> list[Course]:
        """获取学生加入的所有课程"""
        stmt = (
            select(Course)
            .join(StudentCourse, StudentCourse.course_id == Course.id)
            .where(
                StudentCourse.student_id == student_id,
                StudentCourse.is_active,
            )
            .order_by(StudentCourse.joined_at.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def verify_student_in_course(self, student_id: int, course_id: int) -> bool:
        """验证学生是否在课程中"""
        stmt = select(StudentCourse).where(
            StudentCourse.student_id == student_id,
            StudentCourse.course_id == course_id,
            StudentCourse.is_active,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def get_course_students(self, course_id: int) -> list[Student]:
        """获取课程所有学生"""
        stmt = (
            select(Student)
            .join(StudentCourse, StudentCourse.student_id == Student.id)
            .where(
                StudentCourse.course_id == course_id,
                StudentCourse.is_active,
            )
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def delete_course(self, course_id: int, teacher_id: int) -> bool:
        """删除课程（同时退出所有学生）"""
        # 验证权限
        course = await self.verify_teacher_owns_course(course_id, teacher_id)
        if not course:
            return False

        # 将所有学生的 is_active 设置为 false
        stmt = select(StudentCourse).where(
            StudentCourse.course_id == course_id, StudentCourse.is_active
        )
        result = await self.session.execute(stmt)
        student_courses = result.scalars().all()
        for sc in student_courses:
            sc.is_active = False

        # 删除课程（设置 is_active = False，软删除）
        course.is_active = False
        await self.session.flush()
        return True

    async def leave_course(self, student_id: int, course_id: int) -> bool:
        """学生主动退出课程"""
        stmt = select(StudentCourse).where(
            StudentCourse.student_id == student_id,
            StudentCourse.course_id == course_id,
            StudentCourse.is_active,
        )
        result = await self.session.execute(stmt)
        student_course = result.scalar_one_or_none()
        if not student_course:
            return False

        student_course.is_active = False
        await self.session.flush()
        return True
