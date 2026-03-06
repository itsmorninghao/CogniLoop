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

DESIGN_PROMPT = """你是一位教育出题专家。根据以下信息设计出题规格。

## 知识内容
{knowledge_context}

## 出题配置
- 题目数量：{count}
- 难度等级：{difficulty}
- 题型要求：{question_types}

## 答题人画像
{profile_info}

## 要求
请为每道题设计一个规格，包含：
1. question_type: 题型（single_choice / multiple_choice / fill_blank / short_answer / true_false）
2. topic: 考察的知识点
3. difficulty: 该题难度 (easy / medium / hard)
4. focus: 考察重点描述
5. source_hint: 参考的知识片段索引

请直接返回 JSON 数组格式，不要包含其他文字：
[{{"question_type": "...", "topic": "...", "difficulty": "...", "focus": "...", "source_hint": 0}}, ...]"""


async def question_designer(state: QuizGenState) -> dict:
    """
    Use LLM to design question specifications based on RAG chunks and quiz config.
    """
    from backend.app.core.sse import emit_node_start, emit_node_complete
    
    session_id = state.get("session_id", "")
    await emit_node_start(session_id, "question_designer", "正在设计题目规格...")

    quiz_config = state.get("quiz_config", {})
    rag_chunks = state.get("rag_chunks", [])
    user_profile = state.get("user_profile")

    # Handle the two different schema shapes
    if "question_counts" in quiz_config:
        # New shape: count is total of values in question_counts dict
        question_counts = quiz_config["question_counts"]
        count = sum(question_counts.values()) if question_counts else 5
        question_types = [qt for qt, c in question_counts.items() if c > 0]
    else:
        # Old shape
        count = quiz_config.get("count", 5)
        question_types = quiz_config.get("question_types", ["single_choice", "fill_blank", "short_answer"])
        
    difficulty = quiz_config.get("difficulty", "medium")
    custom_prompt = quiz_config.get("custom_prompt", "")

    knowledge_parts = []
    for i, chunk in enumerate(rag_chunks[:15]):
        section = chunk.get("section_path", "")
        prefix = f"[{i}] {section}: " if section else f"[{i}] "
        knowledge_parts.append(prefix + chunk["content"][:300])

    knowledge_context = "\n\n".join(knowledge_parts)

    if user_profile:
        profile_info = (
            f"- 历史准确率: {user_profile.get('avg_accuracy', '未知')}\n"
            f"- 薄弱知识点: {', '.join(user_profile.get('weak_topics', []))}\n"
            f"- 已做题数: {user_profile.get('total_questions', 0)}"
        )
    else:
        profile_info = "新用户，无历史数据，使用标准难度"
        
    custom_instructions = f"\n\n## 附加出题要求（必须严格遵守）\n{custom_prompt}" if custom_prompt else ""

    prompt = DESIGN_PROMPT.format(
        knowledge_context=knowledge_context,
        count=count,
        question_types=", ".join(question_types),
        difficulty=difficulty,
        profile_info=profile_info,
        custom_instructions=custom_instructions,
    )

    async with async_session_factory() as session:
        llm = await get_chat_model(session, temperature=0.3)
        response = await llm.ainvoke(prompt)

    content = response.content.strip()

    try:
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        specs = json.loads(content)
    except json.JSONDecodeError:
        logger.error("Question designer JSON parse failed: %s", content[:200])
        # Fallback: generate simple specs matching the requested counts
        specs = []
        if "question_counts" in quiz_config:
            for qt, c in quiz_config["question_counts"].items():
                for i in range(c):
                    specs.append({
                        "question_type": qt,
                        "topic": f"基础概念",
                        "difficulty": difficulty,
                        "focus": "综合理解",
                        "source_hint": i % len(rag_chunks) if rag_chunks else 0,
                    })
        else:
            specs = [
                {
                    "question_type": question_types[i % len(question_types)] if question_types else "single_choice",
                    "topic": f"知识点{i + 1}",
                    "difficulty": difficulty,
                    "focus": "综合理解",
                    "source_hint": i % len(rag_chunks) if rag_chunks else 0,
                }
                for i in range(count)
            ]

    logger.info("Designed %d question specs", len(specs))
    
    msg = f"已设计 {len(specs)} 道题目规格"
    await emit_node_complete(
        session_id, "question_designer", msg,
        input_summary={
            "requested_count": count,
            "difficulty": difficulty,
            "question_types": question_types,
            "rag_chunks_used": len(rag_chunks[:15]),
            "custom_prompt": custom_prompt[:100] if custom_prompt else None,
        },
        output_summary={
            "specs_generated": len(specs),
            "specs": [
                {
                    "type": s.get("question_type"),
                    "topic": s.get("topic", "")[:40],
                    "difficulty": s.get("difficulty"),
                    "focus": s.get("focus", "")[:60],
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
