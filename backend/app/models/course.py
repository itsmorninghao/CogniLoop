"""课程模型"""

import random
import string
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from backend.app.models.document import Document
    from backend.app.models.question_set import QuestionSet
    from backend.app.models.student_course import StudentCourse
    from backend.app.models.teacher import Teacher


def generate_invite_code() -> str:
    """生成 6 位邀请码（A-Z, 0-9）"""
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choices(chars, k=6))


def utc_now_naive() -> datetime:
    """获取当前 UTC 时间（naive，无时区信息）"""
    return datetime.now(UTC).replace(tzinfo=None)


class Course(SQLModel, table=True):
    """课程模型"""

    __tablename__ = "courses"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=200, index=True)
    code: str = Field(unique=True, index=True, max_length=50)
    invite_code: str = Field(
        default_factory=generate_invite_code,
        unique=True,
        index=True,
        max_length=6,
    )
    teacher_id: int = Field(foreign_key="teachers.id", index=True)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utc_now_naive)
    updated_at: datetime = Field(default_factory=utc_now_naive)

    # 关系
    teacher: "Teacher" = Relationship(back_populates="courses")
    documents: list["Document"] = Relationship(back_populates="course")
    question_sets: list["QuestionSet"] = Relationship(back_populates="course")
    student_courses: list["StudentCourse"] = Relationship(back_populates="course")
