"""统计相关的请求/响应模型"""

from datetime import datetime

from pydantic import BaseModel


class CourseOverview(BaseModel):
    """课程概览"""

    course_id: int
    course_name: str
    student_count: int
    document_count: int
    question_set_count: int


class QuestionSetStatistics(BaseModel):
    """试题集统计"""

    question_set_id: int
    title: str
    total_assigned: int
    completed_count: int
    completion_rate: float
    average_score: float | None
    failed_count: int
    failed_reasons: list[str]


class StudentInfo(BaseModel):
    """学生信息"""

    id: int
    username: str
    full_name: str
    email: str
    joined_at: datetime
    is_active: bool


class StudentListResponse(BaseModel):
    """学生列表响应"""

    students: list[StudentInfo]
    total: int


class StudentStatistics(BaseModel):
    """学生个人统计"""

    total_courses: int
    total_question_sets: int
    completed_count: int
    average_score: float | None


class DailySubmission(BaseModel):
    """每日提交统计"""

    date: str
    count: int


class SubmissionTrend(BaseModel):
    """答题提交趋势"""

    data: list[DailySubmission]
    total: int


class QuestionSetCompletion(BaseModel):
    """试题集完成情况"""

    id: int
    title: str
    total_assigned: int
    completed_count: int
    completion_rate: float
    average_score: float | None


class QuestionSetCompletionList(BaseModel):
    """试题集完成情况列表"""

    items: list[QuestionSetCompletion]


class DailyScore(BaseModel):
    """每日平均分"""

    date: str
    score: float | None
    count: int


class ScoreTrend(BaseModel):
    """平均分趋势"""

    data: list[DailyScore]
