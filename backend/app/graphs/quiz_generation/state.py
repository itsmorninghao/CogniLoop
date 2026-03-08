"""
QuizGenState — typed state for the quiz generation LangGraph.
"""

from __future__ import annotations

from typing import TypedDict


class QuizGenState(TypedDict, total=False):
    """State flowing through the quiz generation graph."""

    # 输入（由 API 层写入，不可变）
    session_id: str
    user_id: int             # 出题人（quiz 创建者）
    target_user_id: int | None  # 被出题对象；None = 出题人自己；挑战模式 = 被挑战者
    knowledge_scope: dict    # {kb_ids: [], folder_ids: [], doc_ids: []}
    quiz_config: dict        # {question_counts, difficulty, title, subject, custom_prompt}
    generation_mode: str     # "standard" | "pro"
    circle_id: int | None    # 圈子模式下的圈子 ID

    # scope_resolver 输出
    resolved_doc_ids: list[int]
    resolved_kb_ids: list[int]

    # rag_retriever 输出
    rag_chunks: list[dict]   # [{index, content, similarity}]

    # profile_analyzer 输出
    target_profile: dict | None
    # {user_id, overall_level, avg_accuracy, weak_points, strong_points}

    question_plans: list[dict]
    # [{slot_index, question_type, chunk_indices, core_point, challenge_angle}]

    # question_generator 输出
    questions: list[dict]
    # [{slot_index, question_type, content, options, correct_answer, analysis,
    #   source_chunks, knowledge_points}]

    # quality_checker <→ question_generator 重试通信
    questions_needing_retry: list[dict]
    # [{slot_index, issue}]

    # quality_checker 最终输出
    validated_questions: list[dict]  # 通过质检的题目
    is_complete: bool
    retry_count: int         # 全局重试轮次计数（上限 2）

    # SSE 可观测性
    current_node: str
    progress: float
    status_message: str
    errors: list[str]
