"""仿高考组卷相关数据模型"""

from datetime import UTC, datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, Text
from sqlalchemy import Enum as SQLAEnum
from sqlmodel import Field, SQLModel


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


# ---------------------------------------------------------------------------
# TeacherExamPermission —— 教师仿高考组卷授权
# ---------------------------------------------------------------------------


class TeacherExamPermission(SQLModel, table=True):
    __tablename__ = "teacher_exam_permissions"

    id: int | None = Field(default=None, primary_key=True)
    teacher_id: int = Field(foreign_key="teachers.id", unique=True, index=True)
    is_enabled: bool = Field(default=False)
    granted_by: int | None = Field(default=None, foreign_key="admins.id")
    granted_at: datetime | None = Field(default=None)
    revoked_at: datetime | None = Field(default=None)
    note: str | None = Field(default=None, max_length=500)
    token_used: int = Field(default=0)
    monthly_quota: int | None = Field(default=None)  # None = 不限制
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)


# ---------------------------------------------------------------------------
# ExamPaper —— 历年试卷（元数据）
# ---------------------------------------------------------------------------


class ExamPaper(SQLModel, table=True):
    __tablename__ = "exam_papers"

    id: int | None = Field(default=None, primary_key=True)
    subject: str = Field(max_length=50, index=True)
    year: int = Field(index=True)
    region: str = Field(max_length=100, index=True)  # 如 "全国甲卷" / "全国乙卷"
    title: str = Field(max_length=200)
    total_score: float | None = Field(default=None)
    question_count: int = Field(default=0)
    source: str = Field(default="gaokao_bench", max_length=50)  # 数据来源
    created_at: datetime = Field(default_factory=_utc_now)


# ---------------------------------------------------------------------------
# ExamQuestion —— 历年试题（每题一条）
# ---------------------------------------------------------------------------


class ExamQuestion(SQLModel, table=True):
    __tablename__ = "exam_questions"

    id: int | None = Field(default=None, primary_key=True)
    exam_paper_id: int | None = Field(
        default=None, foreign_key="exam_papers.id", index=True
    )
    subject: str = Field(max_length=50, index=True)
    year: int = Field(index=True)
    region: str = Field(max_length=100, index=True)
    question_type: str = Field(
        max_length=50, index=True
    )  # single_choice / short_answer ...
    position_index: int = Field(index=True)  # 题目在试卷中的序号（1-based）
    position_label: str = Field(max_length=100)  # 如 "第3题"
    knowledge_points: str | None = Field(
        default=None, sa_column=Column(Text)
    )  # JSON list
    difficulty_level: str = Field(default="medium", max_length=20)
    content: str = Field(sa_column=Column(Text))  # 题目正文（Markdown）
    answer: str = Field(sa_column=Column(Text))  # 参考答案
    analysis: str | None = Field(default=None, sa_column=Column(Text))  # 解析
    score: float | None = Field(default=None)
    embedding: Any = Field(default=None, sa_column=Column(Vector()))
    created_at: datetime = Field(default_factory=_utc_now)


# ---------------------------------------------------------------------------
# ExamPaperGenerationJob —— 组卷任务
# ---------------------------------------------------------------------------


class ExamPaperGenerationJob(SQLModel, table=True):
    __tablename__ = "exam_paper_generation_jobs"

    id: str = Field(primary_key=True, max_length=36)  # UUID
    teacher_id: int = Field(foreign_key="teachers.id", index=True)
    course_id: int = Field(foreign_key="courses.id", index=True)
    status: str = Field(
        default="pending", max_length=20
    )  # pending/running/completed/failed/resuming
    requirement: str = Field(sa_column=Column(Text))  # JSON: PaperRequirement 序列化
    progress: str = Field(default="{}", sa_column=Column(Text))  # JSON 进度
    warnings: str = Field(default="[]", sa_column=Column(Text))  # JSON 警告列表
    completed_questions: str = Field(
        default="{}", sa_column=Column(Text)
    )  # JSON {position_index: markdown}
    question_set_id: int | None = Field(default=None, foreign_key="question_sets.id")
    token_consumed: int = Field(default=0)
    error_message: str | None = Field(default=None, sa_column=Column(Text))
    resume_count: int = Field(default=0)
    trace_log: str | None = Field(
        default=None, sa_column=Column(Text)
    )  # JSON list of TraceSpan
    created_at: datetime = Field(default_factory=_utc_now)
    completed_at: datetime | None = Field(default=None)


# ---------------------------------------------------------------------------
# ExamQuestionDraftLog —— 单题生成过程日志（必做）
# ---------------------------------------------------------------------------


class ExamQuestionDraftLog(SQLModel, table=True):
    __tablename__ = "exam_question_draft_logs"

    id: int | None = Field(default=None, primary_key=True)
    job_id: str = Field(
        foreign_key="exam_paper_generation_jobs.id", index=True, max_length=36
    )
    position_index: int
    question_type: str = Field(max_length=50)
    knowledge_point: str | None = Field(default=None, max_length=200)
    final_content: str | None = Field(
        default=None, sa_column=Column(Text)
    )  # 最终题目 Markdown
    difficulty_coefficient: float | None = Field(default=None)
    retry_count: int = Field(default=0)
    retry_history: str = Field(
        default="[]", sa_column=Column(Text)
    )  # JSON 重试原因列表
    status: str = Field(
        default="pending", max_length=20
    )  # approved / warning / failed / skipped
    skipped: bool = Field(default=False)
    created_at: datetime = Field(default_factory=_utc_now)
    finalized_at: datetime | None = Field(default=None)
