"""学生课程关联模型"""

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from backend.app.models.course import Course
    from backend.app.models.student import Student


def utc_now_naive() -> datetime:
    """获取当前 UTC 时间（naive，无时区信息）"""
    return datetime.now(UTC).replace(tzinfo=None)


class StudentCourse(SQLModel, table=True):
    """学生课程关联模型"""

    __tablename__ = "student_courses"

    id: int | None = Field(default=None, primary_key=True)
    student_id: int = Field(foreign_key="students.id", index=True)
    course_id: int = Field(foreign_key="courses.id", index=True)
    joined_at: datetime = Field(default_factory=utc_now_naive)
    is_active: bool = Field(default=True)

    # 关系
    student: "Student" = Relationship(back_populates="student_courses")
    course: "Course" = Relationship(back_populates="student_courses")
