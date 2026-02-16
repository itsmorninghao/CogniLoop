"""题目广场相关的请求/响应模型"""

from datetime import datetime

from pydantic import BaseModel


class PlazaQuestionSetItem(BaseModel):
    """广场试题集列表项"""

    id: int
    title: str
    description: str | None = None
    teacher_name: str
    course_name: str
    shared_to_plaza_at: datetime
    attempt_count: int = 0
    average_score: float | None = None
    my_status: str | None = None  # null / "draft" / "completed"
    my_score: float | None = None


class PlazaQuestionSetListResponse(BaseModel):
    """广场试题集列表响应"""

    items: list[PlazaQuestionSetItem]
    total: int
    skip: int
    limit: int


class LeaderboardEntry(BaseModel):
    """排行榜条目"""

    rank: int
    user_name: str
    user_type: str  # "student" / "teacher"
    score: float
    submitted_at: datetime


class PlazaQuestionSetDetail(BaseModel):
    """广场试题集详情"""

    id: int
    title: str
    description: str | None = None
    teacher_name: str
    course_name: str
    shared_to_plaza_at: datetime
    attempt_count: int = 0
    completion_count: int = 0
    average_score: float | None = None
    my_status: str | None = None
    my_score: float | None = None
    my_rank: int | None = None
    created_at: datetime
    leaderboard: list[LeaderboardEntry] = []


class LeaderboardResponse(BaseModel):
    """排行榜响应"""

    question_set_id: int
    leaderboard: list[LeaderboardEntry]
    my_rank: int | None = None
    my_score: float | None = None


class PlazaAttemptItem(BaseModel):
    """我的广场练习列表项"""

    answer_id: int
    question_set_id: int
    question_set_title: str
    teacher_name: str
    status: str
    total_score: float | None = None
    submitted_at: datetime | None = None


class PlazaAttemptListResponse(BaseModel):
    """我的广场练习列表响应"""

    items: list[PlazaAttemptItem]
    total: int
    skip: int
    limit: int


class PlazaSharedStatItem(BaseModel):
    """教师分享到广场的试题集统计"""

    question_set_id: int
    title: str
    shared_to_plaza_at: datetime
    attempt_count: int = 0
    completion_count: int = 0
    average_score: float | None = None
    highest_score: float | None = None
    lowest_score: float | None = None


class PlazaSharedStatsResponse(BaseModel):
    """教师分享统计响应"""

    total_shared: int
    total_attempts: int
    items: list[PlazaSharedStatItem]


class SharePlazaResponse(BaseModel):
    """分享到广场响应"""

    message: str
    shared_to_plaza_at: datetime
    share_url: str


class UnsharePlazaResponse(BaseModel):
    """从广场撤回响应"""

    message: str


class PlazaAnswerSaveDraft(BaseModel):
    """教师做广场题保存草稿"""

    question_set_id: int
    student_answers: dict


class PlazaAnswerSubmit(BaseModel):
    """教师做广场题提交答案"""

    question_set_id: int
    student_answers: dict
