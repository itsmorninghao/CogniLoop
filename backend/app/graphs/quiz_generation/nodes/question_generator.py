"""
Node 5: Question Generator — LLM generates actual quiz questions from specs.
"""

from __future__ import annotations

import json
import logging

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_chat_model
from backend.app.graphs.quiz_generation.state import QuizGenState

logger = logging.getLogger(__name__)

GENERATE_PROMPT = """你是一位专业的出题老师。根据以下题目规格和参考知识内容，生成一道高质量的题目。

## 题目规格
- 题型：{question_type}
- 知识点：{topic}
- 难度：{difficulty}
- 考察重点：{focus}

## 参考知识内容
{source_content}

## 输出要求
请严格按以下 JSON 格式返回，不要包含其他文字：

对于选择题 (single_choice / multiple_choice / true_false):
{{
    "question_type": "{question_type}",
    "content": "题目描述",
    "options": {{"A": "选项A", "B": "选项B", "C": "选项C", "D": "选项D"}},
    "correct_answer": "A",
    "analysis": "解析说明",
    "score": 1.0
}}

对于填空题 (fill_blank):
{{
    "question_type": "fill_blank",
    "content": "____是指...",
    "options": null,
    "correct_answer": "标准答案",
    "analysis": "解析说明",
    "score": 1.0
}}

对于简答题 (short_answer):
{{
    "question_type": "short_answer",
    "content": "请简述...",
    "options": null,
    "correct_answer": "参考答案要点",
    "analysis": "评分标准和解析",
    "score": 2.0
}}

注意事项：
- 题目内容必须基于所提供的参考知识
- 选择题必须有4个选项(A/B/C/D)，判断题只需2个选项
- 正确答案必须是明确的
- 分析要详细说明为什么答案正确"""


async def question_generator(state: QuizGenState) -> dict:
    """
    Generate actual questions from the question specs using LLM.
    """
    from backend.app.core.sse import emit_node_complete, emit_node_start

    session_id = state.get("session_id", "")
    await emit_node_start(
        session_id, "question_generator", "LLM 正在逐题生成题目内容..."
    )

    question_specs = state.get("question_specs", [])
    rag_chunks = state.get("rag_chunks", [])

    questions = []

    async with async_session_factory() as session:
        llm = await get_chat_model(session, temperature=0.5)

        for i, spec in enumerate(question_specs):
            try:
                source_idx = (
                    spec.get("source_hint", i % len(rag_chunks)) if rag_chunks else 0
                )
                if rag_chunks and 0 <= source_idx < len(rag_chunks):
                    source = rag_chunks[source_idx]
                    source_content = source["content"]
                    source_chunk_id = source.get("id")
                elif rag_chunks:
                    source = rag_chunks[i % len(rag_chunks)]
                    source_content = source["content"]
                    source_chunk_id = source.get("id")
                else:
                    source_content = "无参考内容"
                    source_chunk_id = None

                prompt = GENERATE_PROMPT.format(
                    question_type=spec.get("question_type", "single_choice"),
                    topic=spec.get("topic", ""),
                    difficulty=spec.get("difficulty", "medium"),
                    focus=spec.get("focus", ""),
                    source_content=source_content[:1500],
                )

                response = await llm.ainvoke(prompt)
                content = response.content.strip()

                if content.startswith("```"):
                    content = content.split("```")[1]
                    if content.startswith("json"):
                        content = content[4:]

                question = json.loads(content)
                question["question_index"] = i
                question["source_chunks"] = [source_chunk_id] if source_chunk_id else []
                questions.append(question)

                logger.info(
                    "Generated question %d/%d: %s",
                    i + 1,
                    len(question_specs),
                    spec.get("topic"),
                )

            except Exception as e:
                logger.error("Failed to generate question %d: %s", i, e)
                # Create a fallback question
                questions.append(
                    {
                        "question_type": spec.get("question_type", "single_choice"),
                        "question_index": i,
                        "content": f"关于{spec.get('topic', '此知识点')}的问题（生成失败，请重试）",
                        "options": {
                            "A": "选项A",
                            "B": "选项B",
                            "C": "选项C",
                            "D": "选项D",
                        }
                        if spec.get("question_type")
                        in ("single_choice", "multiple_choice")
                        else None,
                        "correct_answer": "A",
                        "analysis": f"生成失败: {str(e)[:100]}",
                        "score": 1.0,
                        "source_chunks": [],
                    }
                )

    logger.info("Generated %d questions total", len(questions))

    type_counts: dict[str, int] = {}
    for q in questions:
        t = q.get("question_type", "unknown")
        type_counts[t] = type_counts.get(t, 0) + 1

    msg = f"已生成 {len(questions)} 道题目"
    await emit_node_complete(
        session_id,
        "question_generator",
        msg,
        input_summary={
            "specs_count": len(question_specs),
            "question_types": [s.get("question_type") for s in question_specs],
            "llm_temperature": 0.5,
        },
        output_summary={
            "generated_count": len(questions),
            "type_breakdown": type_counts,
            "previews": [
                {"type": q.get("question_type"), "content": q.get("content", "")[:80]}
                for q in questions[:5]
            ],
        },
        progress=0.8,
    )

    return {
        "questions": questions,
        "current_node": "question_generator",
        "progress": 0.8,
        "status_message": msg,
    }
