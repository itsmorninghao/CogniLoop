"""QuestionAgent —— 依据 QuestionTask 生成题目"""

import json
import logging
import re

from langchain_openai import ChatOpenAI

from backend.app.graph.exam_agents.prompts import (
    DIFFICULTY_LABELS,
    QUESTION_AGENT_SYSTEM,
    QUESTION_AGENT_USER_FILL_BLANK_NO_RAG,
    QUESTION_AGENT_USER_FILL_BLANK_RAG,
    QUESTION_AGENT_USER_NO_RAG,
    QUESTION_AGENT_USER_RAG,
    QUESTION_AGENT_USER_SHORT_ANSWER,
    QUESTION_TYPE_LABELS,
    RETRY_SECTION_TEMPLATE,
)
from backend.app.graph.exam_agents.schemas import GeneratedQuestion, QuestionTask
from backend.app.services.config_service import get_agent_llm_config

logger = logging.getLogger(__name__)

_CHOICE_TYPES = {"single_choice", "multiple_choice"}
_FILL_TYPES = {"fill_blank"}


def _build_examples_text(task: QuestionTask) -> str:
    if not task.same_position_examples:
        return "（暂无同位置历年真题）"
    lines = []
    for ex in task.same_position_examples:
        lines.append(
            f"【{ex.year}年 {ex.region}】\n{ex.content}\n参考答案：{ex.answer}"
        )
    return "\n\n---\n\n".join(lines)


def _build_retry_section(task: QuestionTask) -> str:
    if not task.retry_feedback:
        return ""
    return RETRY_SECTION_TEMPLATE.format(retry_feedback=task.retry_feedback)


def _parse_choice_question(markdown: str, task: QuestionTask) -> GeneratedQuestion:
    """从 Markdown 中提取选择题各字段（单选 / 多选）"""
    content_match = re.search(
        r"\*\*题目内容\*\*[：:]\s*(.+?)(?=\n\*\*|$)", markdown, re.DOTALL
    )
    question_text = content_match.group(1).strip() if content_match else markdown[:500]

    options: dict[str, str] = {}
    for letter in "ABCD":
        opt_match = re.search(
            rf"\*\*选项\s*{letter}\*\*[：:]\s*(.+?)(?=\n\*\*|$)", markdown, re.DOTALL
        )
        if opt_match:
            options[letter] = opt_match.group(1).strip()

    # 捕获答案：支持单字母（单选）和多字母（多选），并去重排序
    answer_match = re.search(
        r"\*\*正确答案\*\*[：:]\s*([A-Da-d][A-Da-d\s、,]*)", markdown
    )
    if answer_match:
        raw_ans = answer_match.group(1).upper()
        letters = re.findall(r"[A-D]", raw_ans)
        correct_answer = "".join(sorted(set(letters))) if letters else "A"
    else:
        correct_answer = "A"

    explanation_match = re.search(r"\*\*解析\*\*[：:]\s*(.+?)$", markdown, re.DOTALL)
    explanation = explanation_match.group(1).strip() if explanation_match else ""

    return GeneratedQuestion(
        task_id=task.task_id,
        question_type=task.question_type,
        question_text=question_text,
        options=options if options else None,
        correct_answer=correct_answer,
        explanation=explanation,
        knowledge_point=task.knowledge_point,
        target_difficulty_level=task.target_difficulty_level,
        raw_markdown=markdown,
    )


def _parse_fill_blank_question(markdown: str, task: QuestionTask) -> GeneratedQuestion:
    """从 Markdown 中提取填空题各字段（答案为文本而非字母）"""
    content_match = re.search(
        r"\*\*题目内容\*\*[：:]\s*(.+?)(?=\n\*\*|$)", markdown, re.DOTALL
    )
    question_text = content_match.group(1).strip() if content_match else markdown[:500]

    # 填空题答案是文本，不限于字母
    answer_match = re.search(
        r"\*\*正确答案\*\*[：:]\s*(.+?)(?=\n\*\*|$)", markdown, re.DOTALL
    )
    correct_answer = answer_match.group(1).strip() if answer_match else ""

    explanation_match = re.search(r"\*\*解析\*\*[：:]\s*(.+?)$", markdown, re.DOTALL)
    explanation = explanation_match.group(1).strip() if explanation_match else ""

    return GeneratedQuestion(
        task_id=task.task_id,
        question_type=task.question_type,
        question_text=question_text,
        options=None,
        correct_answer=correct_answer,
        explanation=explanation,
        knowledge_point=task.knowledge_point,
        target_difficulty_level=task.target_difficulty_level,
        raw_markdown=markdown,
    )


def _parse_short_answer_question(
    markdown: str, task: QuestionTask
) -> GeneratedQuestion:
    """从 Markdown 中提取主观题各字段"""
    content_match = re.search(
        r"\*\*题目内容\*\*[：:]\s*(.+?)(?=\n\*\*|$)", markdown, re.DOTALL
    )
    question_text = content_match.group(1).strip() if content_match else markdown[:800]

    answer_match = re.search(
        r"\*\*参考答案\*\*[：:]\s*(.+?)(?=\n\*\*评分要点|\n\*\*解析|$)",
        markdown,
        re.DOTALL,
    )
    correct_answer = answer_match.group(1).strip() if answer_match else ""

    scoring_match = re.search(
        r"\*\*评分要点\*\*[：:]\s*([\s\S]+?)(?=\n\*\*解析|$)", markdown
    )
    scoring_points = scoring_match.group(1).strip() if scoring_match else None

    explanation_match = re.search(r"\*\*解析\*\*[：:]\s*(.+?)$", markdown, re.DOTALL)
    explanation = explanation_match.group(1).strip() if explanation_match else ""

    return GeneratedQuestion(
        task_id=task.task_id,
        question_type=task.question_type,
        question_text=question_text,
        options=None,
        correct_answer=correct_answer,
        explanation=explanation,
        scoring_points=scoring_points,
        knowledge_point=task.knowledge_point,
        target_difficulty_level=task.target_difficulty_level,
        raw_markdown=markdown,
    )


class QuestionAgent:
    def __init__(self) -> None:
        cfg = get_agent_llm_config("question")
        self.model_name = cfg["model"]
        self.llm = ChatOpenAI(
            api_key=cfg["api_key"],
            base_url=cfg["base_url"],
            model=cfg["model"],
            temperature=0.8,
        )

    async def run(self, task: QuestionTask, tracer=None) -> GeneratedQuestion:
        """生成单道题目"""
        is_choice = task.question_type in _CHOICE_TYPES
        examples_text = _build_examples_text(task)
        retry_section = _build_retry_section(task)
        difficulty_label = DIFFICULTY_LABELS.get(task.target_difficulty_level, "中等")
        type_label = QUESTION_TYPE_LABELS.get(task.question_type, task.question_type)

        system_prompt = QUESTION_AGENT_SYSTEM.format(
            position_label=task.position_label,
            question_type_label=type_label,
            same_position_examples=examples_text,
            knowledge_point=task.knowledge_point,
            difficulty_label=difficulty_label,
        )

        common_kwargs = dict(
            hotspot_material=task.hotspot_material or "（无热点材料）",
            extra_instructions=task.extra_instructions or "无",
            retry_section=retry_section,
            position_index=task.position_index,
            question_type=task.question_type,
        )

        if is_choice:
            rag_or_norag = (
                QUESTION_AGENT_USER_RAG.format(
                    rag_context=task.rag_context, **common_kwargs
                )
                if task.rag_context
                else QUESTION_AGENT_USER_NO_RAG.format(**common_kwargs)
            )
        elif task.question_type in _FILL_TYPES:
            rag_or_norag = (
                QUESTION_AGENT_USER_FILL_BLANK_RAG.format(
                    rag_context=task.rag_context, **common_kwargs
                )
                if task.rag_context
                else QUESTION_AGENT_USER_FILL_BLANK_NO_RAG.format(**common_kwargs)
            )
        else:
            rag_or_norag_label = (
                "课程知识库相关内容（请在此范围内出题）：\n" + task.rag_context
                if task.rag_context
                else "（无课程知识库，请按高考标准出题）"
            )
            rag_or_norag = QUESTION_AGENT_USER_SHORT_ANSWER.format(
                rag_or_norag=rag_or_norag_label,
                **common_kwargs,
            )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": rag_or_norag},
        ]

        span_id = None
        if tracer is not None:
            span_id = tracer.start_span(
                agent="QuestionAgent",
                model=self.model_name,
                system_prompt=system_prompt,
                user_prompt=rag_or_norag,
                position_index=task.position_index,
            )

        resp = await self.llm.ainvoke(messages)
        markdown = resp.content.strip()

        if tracer is not None and span_id:
            tracer.end_span(span_id, output=markdown)

        if is_choice:
            return _parse_choice_question(markdown, task)
        elif task.question_type in _FILL_TYPES:
            return _parse_fill_blank_question(markdown, task)
        else:
            return _parse_short_answer_question(markdown, task)
