"""试题集模型"""

from datetime import UTC, datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Enum as SQLAEnum
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from backend.app.models.answer import Answer
    from backend.app.models.course import Course
    from backend.app.models.student_question_set import StudentQuestionSet
    from backend.app.models.teacher import Teacher


class QuestionSetStatus(str, Enum):
    """试题集状态枚举"""

    DRAFT = "draft"
    PUBLISHED = "published"


def utc_now_naive() -> datetime:
    """获取当前 UTC 时间（naive，无时区信息）"""
    return datetime.now(UTC).replace(tzinfo=None)


class QuestionSet(SQLModel, table=True):
    """试题集模型"""

    __tablename__ = "question_sets"

    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(max_length=200)
    description: str | None = Field(default=None)
    markdown_path: str = Field(max_length=500)
    course_id: int = Field(foreign_key="courses.id", index=True)
    teacher_id: int = Field(foreign_key="teachers.id", index=True)
    is_public: bool = Field(default=False)
    status: QuestionSetStatus = Field(
        default=QuestionSetStatus.DRAFT,
        sa_type=SQLAEnum(
            QuestionSetStatus,
            values_callable=lambda obj: [e.value for e in obj],
            native_enum=False,
        ),
    )
    created_at: datetime = Field(default_factory=utc_now_naive)
    updated_at: datetime = Field(default_factory=utc_now_naive)

    # 关系
    course: "Course" = Relationship(back_populates="question_sets")
    teacher: "Teacher" = Relationship(back_populates="question_sets")
    student_question_sets: list["StudentQuestionSet"] = Relationship(
        back_populates="question_set"
    )
    answers: list["Answer"] = Relationship(back_populates="question_set")
