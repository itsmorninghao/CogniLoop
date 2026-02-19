"""答案模型"""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any, Literal

from sqlalchemy import JSON, Column, Integer, String
from sqlalchemy import ForeignKey as SAForeignKey
from sqlmodel import Field, Relationship, SQLModel

from backend.app.core.utils import utc_now_naive

if TYPE_CHECKING:
    from backend.app.models.course import Course
    from backend.app.models.question_set import QuestionSet
    from backend.app.models.student import Student
    from backend.app.models.teacher import Teacher


class AnswerStatus(str, Enum):
    """答案状态枚举"""

    DRAFT = "draft"  # 草稿
    SUBMITTED = "submitted"  # 已提交批改中
    COMPLETED = "completed"  # 批改完成
    FAILED = "failed"  # 批改失败


# 状态字符串类型（用于数据库列）
AnswerStatusType = Literal["draft", "submitted", "completed", "failed"]


class Answer(SQLModel, table=True):
    """答案模型"""

    __tablename__ = "answers"

    id: int | None = Field(default=None, primary_key=True)
    question_set_id: int = Field(foreign_key="question_sets.id", index=True)
    student_id: int | None = Field(default=None, foreign_key="students.id", index=True)
    teacher_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, SAForeignKey("teachers.id"), index=True, nullable=True),
    )
    course_id: int = Field(foreign_key="courses.id", index=True)
    student_answers: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSON),
    )
    grading_results: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSON),
    )
    total_score: float | None = Field(default=None)
    status: str = Field(
        default=AnswerStatus.DRAFT.value,
        sa_column=Column(String, nullable=False, server_default="draft"),
    )
    error_message: str | None = Field(default=None)
    saved_at: datetime = Field(default_factory=utc_now_naive)
    submitted_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now_naive)

    # 便利属性
    @property
    def user_id(self) -> int:
        """做题人 ID"""
        return self.student_id or self.teacher_id  # type: ignore[return-value]

    @property
    def user_type(self) -> str:
        """做题人类型"""
        return "student" if self.student_id else "teacher"

    # 关系
    question_set: "QuestionSet" = Relationship(back_populates="answers")
    student: "Student" = Relationship(back_populates="answers")
    teacher: "Teacher" = Relationship()
    course: "Course" = Relationship()
