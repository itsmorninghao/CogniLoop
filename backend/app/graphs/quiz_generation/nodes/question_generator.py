"""
Node 4: Question Generator — concurrent LLM question generation from question_plans.
Handles both initial generation and per-question retry mode.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_chat_model
from backend.app.graphs.quiz_generation.state import QuizGenState

logger = logging.getLogger(__name__)

CONCURRENCY_LIMIT = int(os.environ.get("QUIZ_GEN_CONCURRENCY", "3"))

GENERATE_PROMPT_SYSTEM = """你是一位专业的出题老师。根据题目规格和参考知识内容，生成一道高质量的题目。

## 题目规格
- 题型：{question_type}
- 核心考点：{core_point}
- 难度：{difficulty}
- 出题角度：{challenge_angle}

## 参考知识内容
{source_content}

{feedback_section}
## 输出要求
严格按以下 JSON 格式返回，不要包含其他文字：

对于选择题 (single_choice / multiple_choice / true_false):
{{"question_type": "{question_type}", "content": "题目描述", "options": {{"A": "选项A", "B": "选项B", "C": "选项C", "D": "选项D"}}, "correct_answer": "A", "analysis": "解析说明", "score": 1.0, "knowledge_points": ["核心知识点1", "知识点2"]}}

对于填空题 (fill_blank):
{{"question_type": "fill_blank", "content": "____是指...", "options": null, "correct_answer": "标准答案", "analysis": "解析说明", "score": 1.0, "knowledge_points": ["知识点"]}}

对于简答题 (short_answer):
{{"question_type": "short_answer", "content": "请简述...", "options": null, "correct_answer": "参考答案要点", "analysis": "评分标准和解析", "score": 2.0, "knowledge_points": ["知识点1", "知识点2"]}}

注意：
- 题目内容必须基于所提供的参考知识
- 选择题必须有4个选项(A/B/C/D)，判断题只需2个选项
- knowledge_points 填写该题考察的1-3个核心知识点名称"""


async def _generate_single_question(
    plan: dict,
    rag_chunks: list[dict],
    quiz_config: dict,
    semaphore: asyncio.Semaphore,
    feedback: str | None = None,
) -> dict:
    """Generate a single question from a plan, respecting the concurrency semaphore."""
    async with semaphore:
        slot_index = plan["slot_index"]
        qtype = plan["question_type"]
        core_point = plan["core_point"]
        challenge_angle = plan["challenge_angle"]
        chunk_indices = plan.get("chunk_indices", [slot_index % max(len(rag_chunks), 1)])

        difficulty = quiz_config.get("difficulty", "medium")

        source_parts = []
        for idx in chunk_indices:
            if 0 <= idx < len(rag_chunks):
                source_parts.append(rag_chunks[idx]["content"][:500])
        source_content = "\n\n".join(source_parts) if source_parts else "（无参考内容）"

        feedback_section = ""
        if feedback:
            feedback_section = f"## 上轮质检反馈（请据此修正）\n{feedback}\n\n"

        prompt = GENERATE_PROMPT_SYSTEM.format(
            question_type=qtype,
            core_point=core_point,
            difficulty=difficulty,
            challenge_angle=challenge_angle,
            source_content=source_content,
            feedback_section=feedback_section,
        )

        try:
            async with async_session_factory() as session:
                llm = await get_chat_model(session, temperature=0.5)
            response = await llm.ainvoke(prompt)
            content = response.content.strip()

            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]

            question = json.loads(content.strip())
            question["slot_index"] = slot_index
            question["question_type"] = qtype  # enforce from plan
            question["source_chunks"] = [
                rag_chunks[idx].get("id") for idx in chunk_indices
                if 0 <= idx < len(rag_chunks) and rag_chunks[idx].get("id")
            ]
            if "knowledge_points" not in question or not isinstance(question["knowledge_points"], list):
                question["knowledge_points"] = [core_point] if core_point else []

            logger.info("Generated question slot=%d type=%s", slot_index, qtype)
            return question

        except Exception as e:
            logger.error("Failed to generate question slot=%d: %s", slot_index, e)
            return _fallback_question(slot_index, qtype, core_point)


def _fallback_question(slot_index: int, qtype: str, core_point: str) -> dict:
    return {
        "slot_index": slot_index,
        "question_type": qtype,
        "content": f"关于{core_point}的问题（生成失败，请重试）",
        "options": {"A": "选项A", "B": "选项B", "C": "选项C", "D": "选项D"}
        if qtype in ("single_choice", "multiple_choice")
        else None,
        "correct_answer": "A" if qtype == "single_choice" else "",
        "analysis": "生成失败",
        "score": 1.0,
        "source_chunks": [],
        "knowledge_points": [core_point] if core_point else [],
    }


async def question_generator(state: QuizGenState) -> dict:
    """
    Generate questions concurrently from question_plans.
    In retry mode, only regenerates questions in questions_needing_retry.
    """
    from backend.app.core.sse import emit_node_complete, emit_node_start

    session_id = state.get("session_id", "")
    await emit_node_start(session_id, "question_generator", "LLM 并发生成题目...")

    question_plans = state.get("question_plans", [])
    rag_chunks = state.get("rag_chunks", [])
    quiz_config = state.get("quiz_config", {})
    questions_needing_retry = state.get("questions_needing_retry", [])

    # Determine which slots to generate
    if questions_needing_retry:
        retry_map = {item["slot_index"]: item["issue"] for item in questions_needing_retry}
        plans_to_run = [p for p in question_plans if p["slot_index"] in retry_map]
        feedbacks = {p["slot_index"]: retry_map[p["slot_index"]] for p in plans_to_run}
    else:
        plans_to_run = question_plans
        feedbacks = {}

    semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)
    tasks = [
        _generate_single_question(
            plan=plan,
            rag_chunks=rag_chunks,
            quiz_config=quiz_config,
            semaphore=semaphore,
            feedback=feedbacks.get(plan["slot_index"]),
        )
        for plan in plans_to_run
    ]
    new_questions = await asyncio.gather(*tasks)

    # Merge with existing questions (replace retried slots)
    existing_questions: list[dict] = list(state.get("questions", []))
    existing_map = {q["slot_index"]: q for q in existing_questions}
    for q in new_questions:
        existing_map[q["slot_index"]] = q
    merged = sorted(existing_map.values(), key=lambda x: x["slot_index"])

    type_counts: dict[str, int] = {}
    for q in merged:
        t = q.get("question_type", "unknown")
        type_counts[t] = type_counts.get(t, 0) + 1

    mode = "重试" if questions_needing_retry else "首次"
    msg = f"{mode}生成完成，共 {len(merged)} 道题目"
    await emit_node_complete(
        session_id,
        "question_generator",
        msg,
        input_summary={
            "mode": mode,
            "slots_generated": len(plans_to_run),
            "concurrency_limit": CONCURRENCY_LIMIT,
        },
        output_summary={
            "total_questions": len(merged),
            "type_breakdown": type_counts,
        },
        progress=0.75,
    )

    return {
        "questions": merged,
        "questions_needing_retry": [],  # clear retry list
        "current_node": "question_generator",
        "progress": 0.75,
        "status_message": msg,
    }
