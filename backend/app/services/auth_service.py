"""认证服务"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.security import (
    create_access_token,
    get_password_hash,
    verify_password,
)
from backend.app.models.student import Student
from backend.app.models.teacher import Teacher
from backend.app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    UserInfo,
)


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def register_teacher(self, data: RegisterRequest) -> Teacher:
        stmt = select(Teacher).where(Teacher.username == data.username)
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none():
            raise ValueError("用户名已存在")

        stmt = select(Teacher).where(Teacher.email == data.email)
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none():
            raise ValueError("邮箱已存在")

        teacher = Teacher(
            username=data.username,
            email=data.email,
            hashed_password=get_password_hash(data.password),
            full_name=data.full_name,
        )
        self.session.add(teacher)
        await self.session.flush()
        await self.session.refresh(teacher)
        return teacher

    async def register_student(self, data: RegisterRequest) -> Student:
        stmt = select(Student).where(Student.username == data.username)
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none():
            raise ValueError("用户名已存在")

        stmt = select(Student).where(Student.email == data.email)
        result = await self.session.execute(stmt)
        if result.scalar_one_or_none():
            raise ValueError("邮箱已存在")

        student = Student(
            username=data.username,
            email=data.email,
            hashed_password=get_password_hash(data.password),
            full_name=data.full_name,
        )
        self.session.add(student)
        await self.session.flush()
        await self.session.refresh(student)
        return student

    async def login_teacher(self, data: LoginRequest) -> LoginResponse:
        stmt = select(Teacher).where(Teacher.username == data.username)
        result = await self.session.execute(stmt)
        teacher = result.scalar_one_or_none()

        if not teacher or not verify_password(data.password, teacher.hashed_password):
            raise ValueError("用户名或密码错误")
        if not teacher.is_active:
            raise ValueError("账户已被禁用")

        access_token = create_access_token(
            data={"sub": str(teacher.id), "type": "teacher"}
        )
        return LoginResponse(
            access_token=access_token,
            user_type="teacher",
            user=UserInfo(
                id=teacher.id,
                username=teacher.username,
                email=teacher.email,
                full_name=teacher.full_name,
                is_active=teacher.is_active,
            ),
        )

    async def login_student(self, data: LoginRequest) -> LoginResponse:
        stmt = select(Student).where(Student.username == data.username)
        result = await self.session.execute(stmt)
        student = result.scalar_one_or_none()

        if not student or not verify_password(data.password, student.hashed_password):
            raise ValueError("用户名或密码错误")
        if not student.is_active:
            raise ValueError("账户已被禁用")

        access_token = create_access_token(
            data={"sub": str(student.id), "type": "student"}
        )
        return LoginResponse(
            access_token=access_token,
            user_type="student",
            user=UserInfo(
                id=student.id,
                username=student.username,
                email=student.email,
                full_name=student.full_name,
                is_active=student.is_active,
            ),
        )

    async def get_teacher_by_id(self, teacher_id: int) -> Teacher | None:
        stmt = select(Teacher).where(Teacher.id == teacher_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_student_by_id(self, student_id: int) -> Student | None:
        stmt = select(Student).where(Student.id == student_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
