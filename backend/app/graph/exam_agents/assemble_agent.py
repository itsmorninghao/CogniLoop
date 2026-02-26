"""AssembleAgent —— 将所有通过的题目按位置排序，生成最终 Markdown 试卷"""

import logging
from datetime import datetime

from backend.app.graph.exam_agents.prompts import (
    ASSEMBLE_HEADER_TEMPLATE,
    ASSEMBLE_TITLE_TEMPLATE,
    DIFFICULTY_LABELS,
    QUESTION_TYPE_LABELS,
)
from backend.app.graph.exam_agents.schemas import (
    AssembleInput,
    AssembleResult,
    DifficultyResult,
    GeneratedQuestion,
    PaperRequirement,
)

logger = logging.getLogger(__name__)


def _format_choice_question(q: GeneratedQuestion, position: int) -> str:
    lines = [f"## 题目 {position} [{q.question_type}]", ""]
    lines.append(f"**题目内容**：{q.question_text}")
    lines.append("")
    if q.options:
        for letter, text in sorted(q.options.items()):
            lines.append(f"**选项 {letter}**：{text}")
        lines.append("")
    lines.append(f"**正确答案**：{q.correct_answer}")
    lines.append("")
    lines.append(f"**解析**：{q.explanation}")
    return "\n".join(lines)


def _format_short_answer_question(q: GeneratedQuestion, position: int) -> str:
    lines = [f"## 题目 {position} [{q.question_type}]", ""]
    lines.append(f"**题目内容**：{q.question_text}")
    lines.append("")
    lines.append(f"**参考答案**：{q.correct_answer}")
    lines.append("")
    if q.scoring_points:
        lines.append(f"**评分要点**：\n{q.scoring_points}")
        lines.append("")
    lines.append(f"**解析**：{q.explanation}")
    return "\n".join(lines)


class AssembleAgent:
    def run(self, data: AssembleInput) -> AssembleResult:
        req = data.requirement
        questions = data.approved_questions
        diff_results = {d.task_id: d for d in data.difficulty_results}

        # 按 position_index 排序——需要从 QuestionTask 保留位置信息
        # approved_questions 顺序即为 task 分发顺序（position_index 递增），直接使用
        warnings: list[str] = []

        # 统计难度降级的题目
        downgrade_positions = []
        for i, q in enumerate(questions, 1):
            d = diff_results.get(q.task_id)
            if d and d.difficulty_warning:
                downgrade_positions.append(str(i))

        if downgrade_positions:
            warnings.append(
                f"⚠️ 以下题目难度系数未达目标（已降级放行）：第 {', '.join(downgrade_positions)} 题"
            )

        # 平均难度系数
        coefficients = [
            diff_results[q.task_id].difficulty_coefficient
            for q in questions
            if q.task_id in diff_results
        ]
        avg_coefficient = (
            round(sum(coefficients) / len(coefficients), 3) if coefficients else 0.5
        )

        # 构建题目内容
        sections: list[str] = []
        current_type: str | None = None

        for idx, q in enumerate(questions, 1):
            # 题型分组标题
            if q.question_type != current_type:
                current_type = q.question_type
                type_label = QUESTION_TYPE_LABELS.get(q.question_type, q.question_type)
                sections.append(f"\n### {type_label}\n")

            is_choice = q.question_type in {
                "single_choice",
                "multiple_choice",
                "fill_blank",
            }
            if is_choice:
                sections.append(_format_choice_question(q, idx))
            else:
                sections.append(_format_short_answer_question(q, idx))

        # 标题和题头
        title = ASSEMBLE_TITLE_TEMPLATE.format(subject=req.subject)
        difficulty_label = DIFFICULTY_LABELS.get(req.target_difficulty, "中等")
        year = datetime.now().year
        warning_line = ("\n> " + " | ".join(warnings)) if warnings else ""
        header = ASSEMBLE_HEADER_TEMPLATE.format(
            subject=req.subject,
            total=len(questions),
            difficulty_label=difficulty_label,
            region=req.target_region,
            years=year - 2010,
            warning_line=warning_line,
        )

        markdown_content = f"# {title}\n\n{header}\n\n" + "\n\n".join(sections)

        logger.info(
            f"AssembleAgent: 完成组卷 {len(questions)} 题，平均难度系数={avg_coefficient}"
        )
        return AssembleResult(
            markdown_content=markdown_content,
            title=title,
            warnings=warnings,
        )
