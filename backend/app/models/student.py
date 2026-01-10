"""学生模型"""

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from backend.app.models.answer import Answer
    from backend.app.models.student_course import StudentCourse
    from backend.app.models.student_question_set import StudentQuestionSet


def utc_now_naive() -> datetime:
    """获取当前 UTC 时间（naive，无时区信息）"""
    return datetime.now(UTC).replace(tzinfo=None)


class Student(SQLModel, table=True):
    """学生模型"""

    __tablename__ = "students"

    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True, max_length=50)
    email: str = Field(unique=True, index=True, max_length=100)
    hashed_password: str = Field(max_length=255)
    full_name: str = Field(max_length=100)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utc_now_naive)
    updated_at: datetime = Field(default_factory=utc_now_naive)

    # 关系
    student_courses: list["StudentCourse"] = Relationship(back_populates="student")
    student_question_sets: list["StudentQuestionSet"] = Relationship(
        back_populates="student"
    )
    answers: list["Answer"] = Relationship(back_populates="student")
