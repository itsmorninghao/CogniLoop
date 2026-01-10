"""Pydantic 请求/响应模型"""

from backend.app.schemas.answer import (
    AnswerCreate,
    AnswerDetail,
    AnswerResponse,
    AnswerSaveDraft,
    GradingResult,
)
from backend.app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    TokenPayload,
)
from backend.app.schemas.course import (
    CourseCreate,
    CourseDetail,
    CourseListResponse,
    CourseResponse,
    JoinCourseRequest,
)
from backend.app.schemas.document import (
    ChunkResponse,
    DocumentListResponse,
    DocumentResponse,
    DocumentUploadRequest,
)
from backend.app.schemas.question import (
    AssignRequest,
    QuestionGenerateRequest,
    QuestionModifyRequest,
    QuestionSetListResponse,
    QuestionSetResponse,
    StudentQuestionSetResponse,
)
from backend.app.schemas.statistics import (
    CourseOverview,
    QuestionSetStatistics,
    StudentInfo,
    StudentStatistics,
)

__all__ = [
    # Answer
    "AnswerCreate",
    "AnswerDetail",
    "AnswerResponse",
    "AnswerSaveDraft",
    "GradingResult",
    # Auth
    "LoginRequest",
    "LoginResponse",
    "RegisterRequest",
    "TokenPayload",
    # Course
    "CourseCreate",
    "CourseDetail",
    "CourseListResponse",
    "CourseResponse",
    "JoinCourseRequest",
    # Document
    "ChunkResponse",
    "DocumentListResponse",
    "DocumentResponse",
    "DocumentUploadRequest",
    # Question
    "AssignRequest",
    "QuestionGenerateRequest",
    "QuestionModifyRequest",
    "QuestionSetListResponse",
    "QuestionSetResponse",
    "StudentQuestionSetResponse",
    # Statistics
    "CourseOverview",
    "QuestionSetStatistics",
    "StudentInfo",
    "StudentStatistics",
]
