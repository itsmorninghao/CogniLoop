"""数据模型模块"""

from backend.app.models.admin import Admin
from backend.app.models.answer import Answer, AnswerStatus
from backend.app.models.course import Course
from backend.app.models.document import Document, DocumentStatus, FileType
from backend.app.models.knowledge_chunk import KnowledgeChunk
from backend.app.models.question_set import QuestionSet, QuestionSetStatus
from backend.app.models.student import Student
from backend.app.models.student_course import StudentCourse
from backend.app.models.student_question_set import StudentQuestionSet
from backend.app.models.system_config import ConfigAuditLog, SystemConfig
from backend.app.models.teacher import Teacher

__all__ = [
    "Admin",
    "Answer",
    "AnswerStatus",
    "ConfigAuditLog",
    "Course",
    "Document",
    "DocumentStatus",
    "FileType",
    "KnowledgeChunk",
    "QuestionSet",
    "QuestionSetStatus",
    "Student",
    "StudentCourse",
    "StudentQuestionSet",
    "SystemConfig",
    "Teacher",
]
