"""QuestionAgent —— 依据 QuestionTask 生成题目（JSON 输出）"""

import json
import logging

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
_MAX_JSON_RETRY = 3


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


def _strip_json_wrapper(raw: str) -> str:
    """剥除 LLM 可能输出的 ```json ... ``` 包裹。"""
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        inner: list[str] = []
        in_block = False
        for line in lines:
            if line.startswith("```") and not in_block:
                in_block = True
                continue
            if line.startswith("```") and in_block:
                break
            if in_block:
                inner.append(line)
        text = "\n".join(inner)
    return text


def _parse_question_json(raw: str, task: QuestionTask) -> GeneratedQuestion:
    """解析 LLM 返回的 JSON，构建 GeneratedQuestion。"""
    text = _strip_json_wrapper(raw)
    data = json.loads(text)

    content: str = data.get("content") or data.get("question_text", "")
    options_raw = data.get("options")
    options: dict[str, str] | None = None
    if options_raw and isinstance(options_raw, list):
        options = {item["key"]: item["value"] for item in options_raw if "key" in item}
    elif options_raw and isinstance(options_raw, dict):
        options = options_raw

    answer: str = str(data.get("answer") or "")
    if task.question_type in _CHOICE_TYPES and answer:
        # 规范化：大写 + 排序去重
        letters = sorted(set(c.upper() for c in answer if c.upper() in "ABCDE"))
        answer = "".join(letters) if letters else answer.upper()

    explanation: str = data.get("explanation") or data.get("analysis", "")
    scoring_points: str | None = data.get("scoring_points") or data.get("scoring_point")

    return GeneratedQuestion(
        task_id=task.task_id,
        question_type=task.question_type,
        question_text=content,
        options=options if options else None,
        correct_answer=answer,
        explanation=explanation,
        scoring_points=scoring_points if scoring_points else None,
        knowledge_point=task.knowledge_point,
        target_difficulty_level=task.target_difficulty_level,
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
        """生成单道题目，输出解析后的 GeneratedQuestion。"""
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
            user_prompt = (
                QUESTION_AGENT_USER_RAG.format(
                    rag_context=task.rag_context, **common_kwargs
                )
                if task.rag_context
                else QUESTION_AGENT_USER_NO_RAG.format(**common_kwargs)
            )
        elif task.question_type in _FILL_TYPES:
            user_prompt = (
                QUESTION_AGENT_USER_FILL_BLANK_RAG.format(
                    rag_context=task.rag_context, **common_kwargs
                )
                if task.rag_context
                else QUESTION_AGENT_USER_FILL_BLANK_NO_RAG.format(**common_kwargs)
            )
        else:
            rag_label = (
                "课程知识库相关内容（请在此范围内出题）：\n" + task.rag_context
                if task.rag_context
                else "（无课程知识库，请按高考标准出题）"
            )
            user_prompt = QUESTION_AGENT_USER_SHORT_ANSWER.format(
                rag_or_norag=rag_label,
                **common_kwargs,
            )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        span_id = None
        if tracer is not None:
            span_id = tracer.start_span(
                agent="QuestionAgent",
                model=self.model_name,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                position_index=task.position_index,
            )

        last_error: Exception | None = None
        for attempt in range(_MAX_JSON_RETRY):
            resp = await self.llm.ainvoke(messages)
            raw = resp.content.strip()

            try:
                question = _parse_question_json(raw, task)
                if tracer is not None and span_id:
                    tracer.end_span(span_id, output=raw)
                return question
            except (json.JSONDecodeError, KeyError, ValueError) as e:
                last_error = e
                logger.warning(
                    f"QuestionAgent JSON 解析失败（第 {attempt + 1} 次），pos={task.position_index}: {e}"
                )
                messages.append({"role": "assistant", "content": raw})
                messages.append(
                    {
                        "role": "user",
                        "content": f"你的输出不是合法 JSON，解析错误：{e}。请只输出合法 JSON 对象，不要有任何其他文字。",
                    }
                )

        if tracer is not None and span_id:
            tracer.end_span(span_id, output=f"[JSON 解析失败: {last_error}]")
        raise ValueError(
            f"QuestionAgent JSON 解析连续 {_MAX_JSON_RETRY} 次失败，pos={task.position_index}: {last_error}"
        )
