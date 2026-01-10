"""教师模型"""

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from backend.app.models.course import Course
    from backend.app.models.question_set import QuestionSet


def utc_now_naive() -> datetime:
    """获取当前 UTC 时间（naive，无时区信息）"""
    return datetime.now(UTC).replace(tzinfo=None)


class Teacher(SQLModel, table=True):
    """教师模型"""

    __tablename__ = "teachers"

    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True, max_length=50)
    email: str = Field(unique=True, index=True, max_length=100)
    hashed_password: str = Field(max_length=255)
    full_name: str = Field(max_length=100)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utc_now_naive)
    updated_at: datetime = Field(default_factory=utc_now_naive)

    # 关系
    courses: list["Course"] = Relationship(back_populates="teacher")
    question_sets: list["QuestionSet"] = Relationship(back_populates="teacher")
