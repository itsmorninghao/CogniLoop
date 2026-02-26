"""DifficultyAgent —— 根据 K 组 GradeResult 计算难度系数，决定放行或重试"""

import logging

from backend.app.graph.exam_agents.prompts import (
    DIFFICULTY_FEEDBACK_TEMPLATE,
    DIFFICULTY_REASONS,
)
from backend.app.graph.exam_agents.schemas import (
    DifficultyResult,
    GeneratedQuestion,
    GradeResult,
)

logger = logging.getLogger(__name__)

# 难度目标区间
DIFFICULTY_TARGET_RANGES = {
    "easy": (0.65, 1.0),
    "medium": (0.40, 0.75),
    "hard": (0.10, 0.50),
}

# 超限后最大宽容偏差（降级放行）
TOLERANCE = 0.15


class DifficultyAgent:
    def run(
        self,
        question: GeneratedQuestion,
        grade_results: list[GradeResult],
        retry_count: int = 0,
        max_retry: int = 3,
    ) -> DifficultyResult:
        """聚合评分，计算难度系数，决策放行/重试"""
        if not grade_results:
            return DifficultyResult(
                task_id=question.task_id,
                difficulty_coefficient=0.5,
                pass_count=0,
                total_attempts=0,
                decision="approve",
                feedback="无评分数据，默认放行",
                retry_count=retry_count,
            )

        is_objective = question.question_type in {
            "single_choice",
            "multiple_choice",
            "fill_blank",
        }
        total = len(grade_results)

        if is_objective:
            pass_count = sum(1 for g in grade_results if g.is_correct)
            coefficient = pass_count / total
        else:
            total_score = sum(g.partial_score or 0 for g in grade_results)
            coefficient = total_score / total
            pass_count = sum(1 for g in grade_results if (g.partial_score or 0) >= 0.6)

        target_level = question.target_difficulty_level
        target_min, target_max = DIFFICULTY_TARGET_RANGES.get(target_level, (0.4, 0.75))

        in_range = target_min <= coefficient <= target_max
        difficulty_warning = False

        if in_range or retry_count >= max_retry:
            decision = "approve"
            if not in_range:
                difficulty_warning = True  # 超限降级放行
                logger.warning(
                    f"DifficultyAgent: task={question.task_id} 超过最大重试次数"
                    f"，强制放行（coefficient={coefficient:.2f}）"
                )
            feedback = None
        else:
            decision = "retry"
            if coefficient > target_max:
                direction = "偏简单"
                reason_key = "too_easy"
            else:
                direction = "偏困难"
                reason_key = "too_hard"

            reason_info = DIFFICULTY_REASONS[reason_key]
            feedback = DIFFICULTY_FEEDBACK_TEMPLATE.format(
                coefficient=coefficient,
                target_min=target_min,
                target_max=target_max,
                direction=direction,
                reason=reason_info["reason"],
                suggestion=reason_info["suggestion"],
            )

        return DifficultyResult(
            task_id=question.task_id,
            difficulty_coefficient=round(coefficient, 4),
            pass_count=pass_count,
            total_attempts=total,
            decision=decision,
            feedback=feedback,
            retry_count=retry_count,
            difficulty_warning=difficulty_warning,
        )
