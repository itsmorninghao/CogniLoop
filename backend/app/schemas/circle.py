"""Study circle schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class CircleCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    max_members: int = Field(default=50, ge=2, le=500)
    is_public: bool = False


class CircleUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    avatar_url: str | None = None
    max_members: int | None = None
    is_public: bool | None = None


class CircleResponse(BaseModel):
    id: int
    name: str
    description: str | None = None
    avatar_url: str | None = None
    creator_id: int
    invite_code: str
    max_members: int
    is_active: bool
    is_public: bool
    member_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class CircleMemberResponse(BaseModel):
    id: int
    user_id: int
    username: str
    full_name: str
    avatar_url: str | None = None
    role: str
    joined_at: datetime

    model_config = {"from_attributes": True}


class JoinCircleRequest(BaseModel):
    invite_code: str = Field(min_length=1, max_length=12)


class DomainStat(BaseModel):
    domain: str
    avg_accuracy: float
    member_count: int


class LeaderboardEntry(BaseModel):
    user_id: int
    username: str
    full_name: str
    avatar_url: str | None = None
    role: str
    total_questions: int
    overall_accuracy: float


class CircleStatsResponse(BaseModel):
    circle_id: int
    member_count: int
    domain_stats: list[DomainStat]
    leaderboard: list[LeaderboardEntry]


class CircleSessionParticipantItem(BaseModel):
    user_id: int
    username: str
    full_name: str
    status: str
    accuracy: float | None = None
    total_score: float | None = None
    completed_at: datetime | None = None


class CircleQuizSessionItem(BaseModel):
    id: str
    creator_id: int
    creator_username: str
    creator_full_name: str
    title: str | None = None
    mode: str
    status: str
    total_score: float | None = None
    accuracy: float | None = None
    created_at: datetime
    participant_count: int = 0
    current_user_status: str | None = None


class KnowledgePointProfile(BaseModel):
    avg_accuracy: float
    total_attempts: int
    member_coverage: int


class DomainProfileItem(BaseModel):
    avg_accuracy: float
    total_questions: int
    member_coverage: int


class CircleProfileResponse(BaseModel):
    circle_id: int
    overall_accuracy: float = 0.0
    total_questions: int = 0
    member_count: int = 0
    knowledge_point_profiles: dict[str, KnowledgePointProfile] = {}
    domain_profiles: dict[str, DomainProfileItem] = {}
    last_calculated_at: datetime | None = None
