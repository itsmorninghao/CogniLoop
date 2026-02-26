"""AssembleAgent —— 将所有通过的题目按位置排序，生成最终 JSON 试卷"""

import json
import logging

from backend.app.graph.exam_agents.prompts import (
    ASSEMBLE_TITLE_TEMPLATE,
    DIFFICULTY_LABELS,
)
from backend.app.graph.exam_agents.schemas import (
    AssembleInput,
    AssembleResult,
    DifficultyResult,
    GeneratedQuestion,
)

logger = logging.getLogger(__name__)


def _question_to_dict(
    q: GeneratedQuestion,
    position: int,
    diff_result: DifficultyResult | None,
) -> dict:
    options = None
    if q.options:
        options = [{"key": k, "value": v} for k, v in sorted(q.options.items())]
    return {
        "number": position,
        "type": q.question_type,
        "content": q.question_text,
        "options": options,
        "answer": q.correct_answer,
        "explanation": q.explanation,
        "scoring_points": q.scoring_points,
        "difficulty_coefficient": diff_result.difficulty_coefficient if diff_result else None,
    }


class AssembleAgent:
    def run(self, data: AssembleInput) -> AssembleResult:
        req = data.requirement
        questions = data.approved_questions
        diff_map: dict[str, DifficultyResult] = {d.task_id: d for d in data.difficulty_results}

        warnings: list[str] = []

        # 统计难度降级
        downgrade_positions = []
        for i, q in enumerate(questions, 1):
            d = diff_map.get(q.task_id)
            if d and d.difficulty_warning:
                downgrade_positions.append(str(i))

        if downgrade_positions:
            warnings.append(
                f"以下题目难度系数未达目标（已降级放行）：第 {', '.join(downgrade_positions)} 题"
            )

        # 平均难度系数
        coefficients = [
            diff_map[q.task_id].difficulty_coefficient
            for q in questions
            if q.task_id in diff_map
        ]
        avg_coefficient = (
            round(sum(coefficients) / len(coefficients), 3) if coefficients else 0.5
        )

        title = ASSEMBLE_TITLE_TEMPLATE.format(subject=req.subject)
        difficulty_label = DIFFICULTY_LABELS.get(req.target_difficulty, "中等")

        assembled_questions = [
            _question_to_dict(q, idx, diff_map.get(q.task_id))
            for idx, q in enumerate(questions, 1)
        ]

        paper = {
            "title": title,
            "subject": req.subject,
            "target_region": req.target_region,
            "target_difficulty": req.target_difficulty,
            "difficulty_label": difficulty_label,
            "avg_difficulty_coefficient": avg_coefficient,
            "total": len(assembled_questions),
            "questions": assembled_questions,
        }
        json_content = json.dumps(paper, ensure_ascii=False)

        logger.info(
            f"AssembleAgent: 完成组卷 {len(questions)} 题，平均难度系数={avg_coefficient}"
        )
        return AssembleResult(
            json_content=json_content,
            title=title,
            warnings=warnings,
        )
