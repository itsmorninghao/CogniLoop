"""答案相关的请求/响应模型"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from backend.app.models.answer import AnswerStatus


class AnswerSaveDraft(BaseModel):
    """保存草稿请求"""

    question_set_id: int
    student_answers: dict[str, Any] = Field(default_factory=dict)


class AnswerCreate(BaseModel):
    """提交答案请求"""

    question_set_id: int
    student_answers: dict[str, Any] = Field(default_factory=dict)


class GradingResult(BaseModel):
    """单题批改结果"""

    question_id: str
    question_type: str
    score: float
    max_score: float
    feedback: str
    correct_answer: str | None = None


class AnswerResponse(BaseModel):
    """答案响应"""

    id: int
    question_set_id: int
    student_id: int
    course_id: int
    status: AnswerStatus
    total_score: float | None
    saved_at: datetime
    submitted_at: datetime | None

    model_config = {"from_attributes": True}


class AnswerDetail(AnswerResponse):
    """答案详情响应"""

    student_answers: dict[str, Any] | None
    grading_results: dict[str, Any] | None
    error_message: str | None


class StudentInfo(BaseModel):
    """学生基本信息"""

    id: int
    username: str
    full_name: str
    email: str


class TeacherAnswerDetail(BaseModel):
    """教师查看的答案详情"""

    id: int
    question_set_id: int
    student_id: int | None = None
    course_id: int
    status: str
    total_score: float | None
    saved_at: datetime
    submitted_at: datetime | None
    student_answers: dict[str, Any] | None
    grading_results: dict[str, Any] | None
    error_message: str | None
    student: StudentInfo

    model_config = {"from_attributes": True}


class TeacherScoreUpdate(BaseModel):
    """教师修改分数请求"""

    total_score: float = Field(..., ge=0, le=100)
    question_scores: dict[str, float] | None = None  # 可选，单题分数
