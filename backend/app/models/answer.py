"""答案模型"""

from datetime import UTC, datetime
from enum import Enum
from typing import TYPE_CHECKING, Any, Literal

from sqlalchemy import JSON, Column, String
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from backend.app.models.course import Course
    from backend.app.models.question_set import QuestionSet
    from backend.app.models.student import Student


class AnswerStatus(str, Enum):
    """答案状态枚举"""

    DRAFT = "draft"  # 草稿
    SUBMITTED = "submitted"  # 已提交批改中
    COMPLETED = "completed"  # 批改完成
    FAILED = "failed"  # 批改失败


# 状态字符串类型（用于数据库列）
AnswerStatusType = Literal["draft", "submitted", "completed", "failed"]


def utc_now_naive() -> datetime:
    """获取当前 UTC 时间（naive，无时区信息）"""
    return datetime.now(UTC).replace(tzinfo=None)


class Answer(SQLModel, table=True):
    """答案模型"""

    __tablename__ = "answers"

    id: int | None = Field(default=None, primary_key=True)
    question_set_id: int = Field(foreign_key="question_sets.id", index=True)
    student_id: int = Field(foreign_key="students.id", index=True)
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

    # 关系
    question_set: "QuestionSet" = Relationship(back_populates="answers")
    student: "Student" = Relationship(back_populates="answers")
    course: "Course" = Relationship()
