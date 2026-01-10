"""课程相关的请求/响应模型"""

from datetime import datetime

from pydantic import BaseModel, Field


class CourseCreate(BaseModel):
    """创建课程请求"""

    name: str = Field(..., min_length=1, max_length=200)
    code: str = Field(..., min_length=1, max_length=50)


class CourseResponse(BaseModel):
    """课程响应"""

    id: int
    name: str
    code: str
    invite_code: str
    teacher_id: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CourseDetail(CourseResponse):
    """课程详情响应"""

    teacher_name: str
    student_count: int
    document_count: int
    question_set_count: int


class CourseListResponse(BaseModel):
    """课程列表响应"""

    courses: list[CourseResponse]
    total: int


class JoinCourseRequest(BaseModel):
    """加入课程请求"""

    invite_code: str = Field(..., min_length=6, max_length=6)
