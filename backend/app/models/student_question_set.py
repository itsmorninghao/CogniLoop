"""学生试题集分配模型"""

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from backend.app.models.course import Course
    from backend.app.models.question_set import QuestionSet
    from backend.app.models.student import Student
    from backend.app.models.teacher import Teacher


def utc_now_naive() -> datetime:
    """获取当前 UTC 时间（naive，无时区信息）"""
    return datetime.now(UTC).replace(tzinfo=None)


class StudentQuestionSet(SQLModel, table=True):
    """学生试题集分配模型"""

    __tablename__ = "student_question_sets"

    id: int | None = Field(default=None, primary_key=True)
    student_id: int = Field(foreign_key="students.id", index=True)
    question_set_id: int = Field(foreign_key="question_sets.id", index=True)
    course_id: int = Field(foreign_key="courses.id", index=True)
    assigned_by_teacher_id: int = Field(foreign_key="teachers.id")
    assigned_at: datetime = Field(default_factory=utc_now_naive)
    deadline: datetime | None = Field(default=None)
    is_completed: bool = Field(default=False)
    completed_at: datetime | None = Field(default=None)

    # 关系
    student: "Student" = Relationship(back_populates="student_question_sets")
    question_set: "QuestionSet" = Relationship(back_populates="student_question_sets")
    course: "Course" = Relationship()
    assigned_by_teacher: "Teacher" = Relationship()
