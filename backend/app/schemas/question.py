"""试题集相关的请求/响应模型"""

from datetime import datetime

from pydantic import BaseModel, Field

from backend.app.models.question_set import QuestionSetStatus


class QuestionGenerateRequest(BaseModel):
    """生成试题集请求"""

    natural_language_request: str = Field(..., min_length=10, max_length=2000)
    course_id: int
    subject: str | None = None
    chapter_id: int | None = None
    difficulty: str | None = Field(default=None, pattern="^(easy|medium|hard)$")


class QuestionModifyRequest(BaseModel):
    """修改试题集请求"""

    natural_language_request: str = Field(..., min_length=5, max_length=2000)


class QuestionSetResponse(BaseModel):
    """试题集响应"""

    id: int
    title: str
    description: str | None
    course_id: int
    teacher_id: int
    is_public: bool
    status: QuestionSetStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class QuestionSetListResponse(BaseModel):
    """试题集列表响应"""

    question_sets: list[QuestionSetResponse]
    total: int


class AssignRequest(BaseModel):
    """分配试题集请求"""

    assign_to_all: bool = False
    student_ids: list[int] | None = None
    deadline: datetime | None = None


class StudentQuestionSetResponse(BaseModel):
    """学生试题集响应"""

    id: int
    title: str
    description: str | None
    is_assigned: bool
    is_completed: bool
    deadline: datetime | None
    completed_at: datetime | None
    has_draft: bool
    course_name: str

    model_config = {"from_attributes": True}


class QuestionSetContentResponse(BaseModel):
    """试题集内容响应"""

    id: int
    title: str
    markdown_content: str
