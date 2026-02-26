"""仿高考组卷 Multi-Agent 所有 Pydantic Schema 定义"""

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# 教师输入 —— 组卷需求
# ---------------------------------------------------------------------------


class QuestionTypeConfig(BaseModel):
    question_type: str  # single_choice / fill_blank / short_answer
    count: int
    score_per_question: float


class DifficultyDistribution(BaseModel):
    easy: float = 0.3
    medium: float = 0.5
    hard: float = 0.2


class PaperRequirement(BaseModel):
    subject: str
    course_id: int
    target_region: str = "全国甲卷"
    total_questions: int
    question_distribution: list[QuestionTypeConfig]
    target_difficulty: str = "medium"  # easy / medium / hard
    difficulty_distribution: DifficultyDistribution = Field(
        default_factory=DifficultyDistribution
    )
    use_hotspot: bool = False
    hotspot_time_range_days: int = 30
    extra_note: str | None = None


# ---------------------------------------------------------------------------
# HotspotAgent
# ---------------------------------------------------------------------------


class HotspotItem(BaseModel):
    topic: str
    summary: str
    applicable_subjects: list[str]
    applicable_question_types: list[str]
    applicable_knowledge_points: list[str]


class HotspotResult(BaseModel):
    items: list[HotspotItem] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# DispatchAgent —— 任务分发
# ---------------------------------------------------------------------------


class SamePositionExample(BaseModel):
    year: int
    region: str
    content: str
    answer: str


class QuestionTask(BaseModel):
    task_id: str
    question_type: str
    position_index: int
    position_label: str
    target_difficulty_level: str
    knowledge_point: str
    same_position_examples: list[SamePositionExample] = Field(default_factory=list)
    rag_context: str | None = None
    hotspot_material: str | None = None
    extra_instructions: str = ""
    retry_feedback: str | None = None
    retry_count: int = 0


# ---------------------------------------------------------------------------
# QuestionAgent —— 题目生成
# ---------------------------------------------------------------------------


class GeneratedQuestion(BaseModel):
    task_id: str
    question_type: str
    question_text: str
    options: dict[str, str] | None = None  # 选择题用 {"A": "...", "B": "..."}
    correct_answer: str
    explanation: str
    scoring_points: str | None = None  # 简答题评分要点
    knowledge_point: str
    target_difficulty_level: str


# ---------------------------------------------------------------------------
# QualityCheckAgent —— 质量审核
# ---------------------------------------------------------------------------


class QualityCheckResult(BaseModel):
    task_id: str
    passed: bool
    rejection_reasons: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# SolveAgent —— 模拟作答
# ---------------------------------------------------------------------------


class SolveAttempt(BaseModel):
    task_id: str
    attempt_index: int
    student_answer: str


# ---------------------------------------------------------------------------
# GradeAgent —— 答案评分
# ---------------------------------------------------------------------------


class GradeResult(BaseModel):
    task_id: str
    attempt_index: int
    is_correct: bool | None = None  # 客观题
    partial_score: float | None = None  # 主观题 0-1
    grade_reasoning: str = ""


# ---------------------------------------------------------------------------
# DifficultyAgent —— 难度系数计算
# ---------------------------------------------------------------------------


class DifficultyResult(BaseModel):
    task_id: str
    difficulty_coefficient: float  # 0-1，越小越难
    pass_count: int
    total_attempts: int
    decision: str  # "approve" / "retry"
    feedback: str | None = None
    retry_count: int = 0
    difficulty_warning: bool = False  # 超限降级放行时为 True


# ---------------------------------------------------------------------------
# AssembleAgent —— 组装试卷
# ---------------------------------------------------------------------------


class AssembleInput(BaseModel):
    requirement: PaperRequirement
    approved_questions: list[GeneratedQuestion]
    difficulty_results: list[DifficultyResult]


class AssembledQuestion(BaseModel):
    """组装后试卷中的单道题（含难度系数）"""

    number: int
    type: str
    content: str
    options: list[dict] | None = None  # [{"key": "A", "value": "..."}, ...]
    answer: str
    explanation: str
    scoring_points: str | None = None
    difficulty_coefficient: float | None = None


class AssembleResult(BaseModel):
    json_content: str  # 完整试卷 JSON 字符串
    title: str
    warnings: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# SSE 进度事件
# ---------------------------------------------------------------------------


class SSEEvent(BaseModel):
    event: str
    data: dict
