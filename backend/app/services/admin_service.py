"""管理员服务"""

import shutil
from pathlib import Path

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.security import (
    create_access_token,
    get_password_hash,
    verify_password,
)
from backend.app.models.admin import Admin
from backend.app.models.answer import Answer
from backend.app.models.course import Course
from backend.app.models.document import Document
from backend.app.models.knowledge_chunk import KnowledgeChunk
from backend.app.models.question_set import QuestionSet
from backend.app.models.student import Student
from backend.app.models.student_course import StudentCourse
from backend.app.models.student_question_set import StudentQuestionSet
from backend.app.models.teacher import Teacher


class AdminService:
    """管理员服务类"""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_admin(
        self,
        username: str,
        email: str,
        password: str,
        full_name: str,
        is_super_admin: bool = False,
    ) -> Admin:
        """创建管理员"""
        # 检查用户名是否已存在
        stmt = select(Admin).where(Admin.username == username)
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none():
            raise ValueError("用户名已存在")

        # 检查邮箱是否已存在
        stmt = select(Admin).where(Admin.email == email)
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none():
            raise ValueError("邮箱已存在")

        admin = Admin(
            username=username,
            email=email,
            hashed_password=get_password_hash(password),
            full_name=full_name,
            is_super_admin=is_super_admin,
        )
        self.session.add(admin)
        await self.session.flush()
        await self.session.refresh(admin)
        return admin

    async def login(self, username: str, password: str) -> dict:
        """管理员登录"""
        stmt = select(Admin).where(Admin.username == username)
        result = await self.session.execute(stmt)
        admin = result.scalar_one_or_none()

        if not admin or not verify_password(password, admin.hashed_password):
            raise ValueError("用户名或密码错误")

        if not admin.is_active:
            raise ValueError("账户已被禁用")

        access_token = create_access_token(data={"sub": str(admin.id), "type": "admin"})

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user_type": "admin",
            "user": {
                "id": admin.id,
                "username": admin.username,
                "email": admin.email,
                "full_name": admin.full_name,
                "is_active": admin.is_active,
                "is_super_admin": admin.is_super_admin,
            },
        }

    async def get_admin_by_id(self, admin_id: int) -> Admin | None:
        """根据 ID 获取管理员"""
        stmt = select(Admin).where(Admin.id == admin_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    # ==================== 统计数据 ====================

    async def get_system_stats(self) -> dict:
        """获取系统统计数据"""
        # 教师数量
        teacher_stmt = select(func.count(Teacher.id))
        teacher_result = await self.session.execute(teacher_stmt)
        teacher_count = teacher_result.scalar() or 0

        # 学生数量
        student_stmt = select(func.count(Student.id))
        student_result = await self.session.execute(student_stmt)
        student_count = student_result.scalar() or 0

        # 课程数量
        course_stmt = select(func.count(Course.id)).where(Course.is_active)
        course_result = await self.session.execute(course_stmt)
        course_count = course_result.scalar() or 0

        # 文档数量
        document_stmt = select(func.count(Document.id))
        document_result = await self.session.execute(document_stmt)
        document_count = document_result.scalar() or 0

        # 试题集数量
        question_set_stmt = select(func.count(QuestionSet.id))
        question_set_result = await self.session.execute(question_set_stmt)
        question_set_count = question_set_result.scalar() or 0

        # 答案数量
        answer_stmt = select(func.count(Answer.id))
        answer_result = await self.session.execute(answer_stmt)
        answer_count = answer_result.scalar() or 0

        return {
            "teacher_count": teacher_count,
            "student_count": student_count,
            "course_count": course_count,
            "document_count": document_count,
            "question_set_count": question_set_count,
            "answer_count": answer_count,
        }

    # ==================== 用户管理 ====================

    async def list_teachers(
        self, skip: int = 0, limit: int = 50
    ) -> tuple[list[Teacher], int]:
        """获取教师列表"""
        count_stmt = select(func.count(Teacher.id))
        count_result = await self.session.execute(count_stmt)
        total = count_result.scalar() or 0

        stmt = (
            select(Teacher)
            .order_by(Teacher.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        teachers = list(result.scalars().all())
        return teachers, total

    async def list_students(
        self, skip: int = 0, limit: int = 50
    ) -> tuple[list[Student], int]:
        """获取学生列表"""
        count_stmt = select(func.count(Student.id))
        count_result = await self.session.execute(count_stmt)
        total = count_result.scalar() or 0

        stmt = (
            select(Student)
            .order_by(Student.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        students = list(result.scalars().all())
        return students, total

    async def toggle_teacher_status(self, teacher_id: int) -> Teacher | None:
        """切换教师状态"""
        stmt = select(Teacher).where(Teacher.id == teacher_id)
        result = await self.session.execute(stmt)
        teacher = result.scalar_one_or_none()
        if teacher:
            teacher.is_active = not teacher.is_active
            await self.session.flush()
            await self.session.refresh(teacher)
        return teacher

    async def toggle_student_status(self, student_id: int) -> Student | None:
        """切换学生状态"""
        stmt = select(Student).where(Student.id == student_id)
        result = await self.session.execute(stmt)
        student = result.scalar_one_or_none()
        if student:
            student.is_active = not student.is_active
            await self.session.flush()
            await self.session.refresh(student)
        return student

    async def delete_teacher(self, teacher_id: int) -> bool:
        """删除教师（级联删除课程等）"""
        stmt = select(Teacher).where(Teacher.id == teacher_id)
        result = await self.session.execute(stmt)
        teacher = result.scalar_one_or_none()
        if not teacher:
            return False

        # 获取教师的所有课程
        course_stmt = select(Course).where(Course.teacher_id == teacher_id)
        course_result = await self.session.execute(course_stmt)
        courses = course_result.scalars().all()

        for course in courses:
            # 删除课程相关的学生关联
            await self.session.execute(
                StudentCourse.__table__.delete().where(
                    StudentCourse.course_id == course.id
                )
            )
            # 软删除课程
            course.is_active = False

        await self.session.delete(teacher)
        await self.session.flush()
        return True

    async def delete_student(self, student_id: int) -> bool:
        """删除学生"""
        stmt = select(Student).where(Student.id == student_id)
        result = await self.session.execute(stmt)
        student = result.scalar_one_or_none()
        if not student:
            return False

        # 删除学生的课程关联
        await self.session.execute(
            StudentCourse.__table__.delete().where(
                StudentCourse.student_id == student_id
            )
        )

        await self.session.delete(student)
        await self.session.flush()
        return True

    # ==================== 课程管理 ====================

    async def list_courses(
        self, skip: int = 0, limit: int = 50, include_inactive: bool = True
    ) -> tuple[list[dict], int]:
        """获取课程列表（包含教师信息）"""
        base_conditions = []
        if not include_inactive:
            base_conditions.append(Course.is_active)

        count_stmt = select(func.count(Course.id)).where(*base_conditions)
        count_result = await self.session.execute(count_stmt)
        total = count_result.scalar() or 0

        stmt = (
            select(Course, Teacher.full_name.label("teacher_name"))
            .join(Teacher, Course.teacher_id == Teacher.id)
            .where(*base_conditions)
            .order_by(Course.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        rows = result.all()

        courses = []
        for course, teacher_name in rows:
            # 获取学生数量
            student_count_stmt = select(func.count(StudentCourse.id)).where(
                StudentCourse.course_id == course.id,
                StudentCourse.is_active,
            )
            student_count_result = await self.session.execute(student_count_stmt)
            student_count = student_count_result.scalar() or 0

            courses.append(
                {
                    "id": course.id,
                    "name": course.name,
                    "code": course.code,
                    "invite_code": course.invite_code,
                    "teacher_id": course.teacher_id,
                    "teacher_name": teacher_name,
                    "is_active": course.is_active,
                    "student_count": student_count,
                    "created_at": course.created_at.isoformat(),
                }
            )

        return courses, total

    async def toggle_course_status(self, course_id: int) -> Course | None:
        """切换课程状态"""
        stmt = select(Course).where(Course.id == course_id)
        result = await self.session.execute(stmt)
        course = result.scalar_one_or_none()
        if course:
            course.is_active = not course.is_active
            await self.session.flush()
            await self.session.refresh(course)
        return course

    async def delete_course(self, course_id: int) -> bool:
        """删除课程及其全部关联数据"""
        stmt = select(Course).where(Course.id == course_id)
        result = await self.session.execute(stmt)
        course = result.scalar_one_or_none()
        if not course:
            return False

        # 删除答案
        await self.session.execute(delete(Answer).where(Answer.course_id == course_id))

        # 删除学生试题集分配
        await self.session.execute(
            delete(StudentQuestionSet).where(StudentQuestionSet.course_id == course_id)
        )

        # 删除知识块
        await self.session.execute(
            delete(KnowledgeChunk).where(KnowledgeChunk.course_id == course_id)
        )

        # 删除文档（含磁盘文件）及记录
        doc_stmt = select(Document).where(Document.course_id == course_id)
        doc_result = await self.session.execute(doc_stmt)
        for doc in doc_result.scalars().all():
            file_path = Path(doc.file_path)
            if file_path.exists():
                file_path.unlink()
                doc_dir = file_path.parent
                if doc_dir.exists() and not any(doc_dir.iterdir()):
                    shutil.rmtree(doc_dir)
            await self.session.delete(doc)

        # 删除试题集（含 markdown 文件）及记录
        qs_stmt = select(QuestionSet).where(QuestionSet.course_id == course_id)
        qs_result = await self.session.execute(qs_stmt)
        for qs in qs_result.scalars().all():
            if qs.markdown_path:
                md_path = Path(qs.markdown_path)
                if md_path.exists():
                    md_path.unlink()
            await self.session.delete(qs)

        # 删除学生选课关联
        await self.session.execute(
            delete(StudentCourse).where(StudentCourse.course_id == course_id)
        )

        # 删除课程
        await self.session.delete(course)
        await self.session.flush()
        return True

    # ==================== 管理员管理（仅超级管理员） ====================

    async def list_admins(self) -> list[Admin]:
        """获取管理员列表"""
        stmt = select(Admin).order_by(Admin.created_at.desc())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def toggle_admin_status(
        self, admin_id: int, current_admin_id: int
    ) -> Admin | None:
        """切换管理员状态（不能禁用自己）"""
        if admin_id == current_admin_id:
            raise ValueError("不能禁用自己的账户")

        stmt = select(Admin).where(Admin.id == admin_id)
        result = await self.session.execute(stmt)
        admin = result.scalar_one_or_none()
        if admin:
            admin.is_active = not admin.is_active
            await self.session.flush()
            await self.session.refresh(admin)
        return admin

    async def delete_admin(self, admin_id: int, current_admin_id: int) -> bool:
        """删除管理员（不能删除自己）"""
        if admin_id == current_admin_id:
            raise ValueError("不能删除自己的账户")

        stmt = select(Admin).where(Admin.id == admin_id)
        result = await self.session.execute(stmt)
        admin = result.scalar_one_or_none()
        if not admin:
            return False

        await self.session.delete(admin)
        await self.session.flush()
        return True
