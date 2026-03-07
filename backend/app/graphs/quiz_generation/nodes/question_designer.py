"""
Node 4: Question Designer — LLM designs question specifications based on
knowledge content, quiz config, and solver profile.
"""

from __future__ import annotations

import json
import logging

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_chat_model
from backend.app.graphs.quiz_generation.state import QuizGenState

logger = logging.getLogger(__name__)

DESIGN_PROMPT = """你是一位教育出题专家。根据以下信息，为已确定好的每道题填写出题规格。

## 知识内容
{knowledge_context}

## 答题人画像
{profile_info}

## 出题配置
- 难度等级：{difficulty}{custom_instructions}

## 待填写的题目列表
以下每道题的题型已经固定，请为每道题填写 topic（考察的知识点）、focus（考察重点描述）、source_hint（最相关的知识片段编号，取自上方知识内容的 [编号]）。

{skeleton_list}

## 要求
- 不同题目尽量覆盖不同的知识点，避免重复
- topic 和 focus 要具体，不要泛泛而谈
- source_hint 必须是上方知识内容中存在的编号（0 到 {max_source_idx}）
- 严格按题目数量返回，不要增减

请直接返回 JSON 数组，不要包含其他文字：
[{{"topic": "...", "focus": "...", "source_hint": 0}}, ...]"""


def _build_skeleton(question_counts: dict[str, int], count: int, question_types: list[str]) -> list[dict]:
    """Build ordered skeleton specs from question_counts (or fallback)."""
    skeleton: list[dict] = []
    if question_counts:
        for qt, c in question_counts.items():
            for _ in range(c):
                skeleton.append({"question_type": qt})
    else:
        for i in range(count):
            skeleton.append({"question_type": question_types[i % len(question_types)] if question_types else "single_choice"})
    return skeleton


async def question_designer(state: QuizGenState) -> dict:
    """
    Design question specifications: type/count from config, topic/focus/source_hint from LLM.
    """
    from backend.app.core.sse import emit_node_complete, emit_node_start

    session_id = state.get("session_id", "")
    await emit_node_start(session_id, "question_designer", "正在设计题目规格...")

    quiz_config = state.get("quiz_config", {})
    rag_chunks = state.get("rag_chunks", [])
    user_profile = state.get("user_profile")

    if "question_counts" in quiz_config:
        question_counts: dict[str, int] = {k: v for k, v in quiz_config["question_counts"].items() if v > 0}
        count = sum(question_counts.values()) if question_counts else 5
        question_types = list(question_counts.keys())
    else:
        question_counts = {}
        count = quiz_config.get("count", 5)
        question_types = quiz_config.get("question_types", ["single_choice", "fill_blank", "short_answer"])

    difficulty = quiz_config.get("difficulty", "medium")
    custom_prompt = quiz_config.get("custom_prompt", "")

    # Build skeleton — types and counts are fixed here, not by LLM
    skeleton = _build_skeleton(question_counts, count, question_types)

    knowledge_parts = []
    for i, chunk in enumerate(rag_chunks[:15]):
        section = chunk.get("section_path", "")
        prefix = f"[{i}] {section}: " if section else f"[{i}] "
        knowledge_parts.append(prefix + chunk["content"][:300])
    knowledge_context = "\n\n".join(knowledge_parts) if knowledge_parts else "（无知识片段）"
    max_source_idx = max(len(rag_chunks[:15]) - 1, 0)

    # Format skeleton for prompt display
    type_label = {
        "single_choice": "单选题", "multiple_choice": "多选题",
        "true_false": "判断题", "fill_blank": "填空题", "short_answer": "简答题",
    }
    skeleton_lines = [
        f"{i + 1}. 题型：{type_label.get(s['question_type'], s['question_type'])}"
        for i, s in enumerate(skeleton)
    ]
    skeleton_list = "\n".join(skeleton_lines)

    if user_profile:
        profile_info = (
            f"- 历史准确率: {user_profile.get('avg_accuracy', '未知')}\n"
            f"- 薄弱知识点: {', '.join(user_profile.get('weak_topics', []))}\n"
            f"- 已做题数: {user_profile.get('total_questions', 0)}"
        )
    else:
        profile_info = "新用户，无历史数据，使用标准难度"

    custom_instructions = f"\n- 附加要求：{custom_prompt}" if custom_prompt else ""

    prompt = DESIGN_PROMPT.format(
        knowledge_context=knowledge_context,
        profile_info=profile_info,
        difficulty=difficulty,
        custom_instructions=custom_instructions,
        skeleton_list=skeleton_list,
        max_source_idx=max_source_idx,
    )

    llm_fills: list[dict] = []
    try:
        async with async_session_factory() as session:
            llm = await get_chat_model(session, temperature=0.3)
        response = await llm.ainvoke(prompt)
        content = response.content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        llm_fills = json.loads(content)
        if not isinstance(llm_fills, list):
            llm_fills = []
    except Exception as e:
        logger.warning("Question designer LLM failed: %s", e)
        llm_fills = []

    # Merge: type from skeleton (authoritative), topic/focus/source_hint from LLM
    specs: list[dict] = []
    for i, slot in enumerate(skeleton):
        fill = llm_fills[i] if i < len(llm_fills) and isinstance(llm_fills[i], dict) else {}
        source_hint = fill.get("source_hint", i % max(len(rag_chunks[:15]), 1))
        if not isinstance(source_hint, int) or not (0 <= source_hint <= max_source_idx):
            source_hint = i % max(len(rag_chunks[:15]), 1)
        specs.append({
            "question_type": slot["question_type"],  # always from skeleton
            "topic": str(fill.get("topic", f"知识点{i + 1}"))[:100],
            "difficulty": difficulty,
            "focus": str(fill.get("focus", "综合理解"))[:200],
            "source_hint": source_hint,
        })

    logger.info("Designed %d question specs", len(specs))

    msg = f"已设计 {len(specs)} 道题目规格"
    await emit_node_complete(
        session_id,
        "question_designer",
        msg,
        input_summary={
            "requested_count": count,
            "difficulty": difficulty,
            "question_counts": question_counts or {qt: question_types.count(qt) for qt in question_types},
            "rag_chunks_used": len(rag_chunks[:15]),
            "custom_prompt": custom_prompt[:100] if custom_prompt else None,
        },
        output_summary={
            "specs_generated": len(specs),
            "specs": [
                {
                    "type": s["question_type"],
                    "topic": s["topic"][:40],
                    "focus": s["focus"][:60],
                }
                for s in specs
            ],
        },
        progress=0.4,
    )

    return {
        "question_specs": specs,
        "current_node": "question_designer",
        "progress": 0.4,
        "status_message": msg,
    }
