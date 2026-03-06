"""
Node 6: Quality Checker — validates generated questions for correctness and completeness.
Conditionally retries the question_generator if quality is too low.
"""

from __future__ import annotations

import json
import logging

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_chat_model
from backend.app.graphs.quiz_generation.state import QuizGenState

logger = logging.getLogger(__name__)

CHECK_PROMPT = """你是一位题目质量审查专家。请检查以下 {count} 道题目的质量。

## 题目列表
{questions_json}

## 检查标准
1. 题目描述是否清晰、无歧义
2. 选择题选项是否合理（无明显错误选项）
3. 答案是否正确
4. 解析是否准确

请为每道题评分（1-10分），并标注需要修正的问题。
返回 JSON 格式：
[{{"index": 0, "score": 8, "issue": null}}, {{"index": 1, "score": 4, "issue": "选项B和D重复"}}]

只返回 JSON 数组，不要其他文字。"""


async def quality_checker(state: QuizGenState) -> dict:
    """
    Validate generated questions for quality.
    If quality is below threshold and retry_count < 2, signals for retry.
    """
    from backend.app.core.sse import emit_node_complete, emit_node_start

    session_id = state.get("session_id", "")
    await emit_node_start(session_id, "quality_checker", "正在进行质量校验...")

    questions = state.get("questions", [])
    retry_count = state.get("retry_count", 0)

    if not questions:
        return {
            "validated_questions": [],
            "is_complete": True,
            "current_node": "quality_checker",
            "progress": 1.0,
            "status_message": "未生成任何题目",
            "errors": ["No questions generated"],
        }

    q_summary = []
    for i, q in enumerate(questions):
        q_summary.append(
            {
                "index": i,
                "type": q.get("question_type"),
                "content": q.get("content", "")[:200],
                "options": q.get("options"),
                "answer": q.get("correct_answer", "")[:100],
            }
        )

    async with async_session_factory() as session:
        try:
            llm = await get_chat_model(session, temperature=0)
            prompt = CHECK_PROMPT.format(
                count=len(questions),
                questions_json=json.dumps(q_summary, ensure_ascii=False, indent=2),
            )
            response = await llm.ainvoke(prompt)
            content = response.content.strip()

            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]

            scores = json.loads(content)
            score_map = {item["index"]: item for item in scores}

        except Exception as e:
            logger.warning("Quality check LLM failed: %s — passing all", e)
            score_map = {}

    validated = []
    low_quality_count = 0
    for i, q in enumerate(questions):
        check = score_map.get(i, {"score": 7, "issue": None})
        q_score = check.get("score", 7)
        issue = check.get("issue")

        if q_score >= 5:
            q["quality_score"] = q_score
            if issue:
                q["quality_note"] = issue
            validated.append(q)
        else:
            low_quality_count += 1
            logger.warning(
                "Question %d scored %d (issue: %s) — dropped", i, q_score, issue
            )

    avg_score = (
        sum(q.get("quality_score", 7) for q in validated) / len(validated)
        if validated
        else 0
    )

    # If too many were dropped and we haven't retried yet, signal retry
    needs_retry = (
        low_quality_count > len(questions) * 0.3  # More than 30% dropped
        and retry_count < 2
        and len(validated) < state.get("quiz_config", {}).get("count", 5) * 0.7
    )

    if needs_retry:
        logger.info(
            "Quality too low (avg=%.1f, dropped=%d), triggering retry",
            avg_score,
            low_quality_count,
        )
        retry_msg = f"质量校验未通过，正在重新生成... (第{retry_count + 1}次)"
        await emit_node_complete(
            session_id,
            "quality_checker",
            retry_msg,
            input_summary={"question_count": len(questions)},
            output_summary={
                "passed": len(validated),
                "dropped": low_quality_count,
                "avg_score": round(avg_score, 1),
                "needs_retry": True,
            },
            progress=0.85,
        )
        return {
            "retry_count": retry_count + 1,
            "is_complete": False,
            "current_node": "quality_checker",
            "progress": 0.85,
            "status_message": retry_msg,
        }

    logger.info(
        "Quality check passed: %d/%d questions (avg score: %.1f)",
        len(validated),
        len(questions),
        avg_score,
    )

    msg = f"质量校验完成，{len(validated)} 道题目通过"
    await emit_node_complete(
        session_id,
        "quality_checker",
        msg,
        input_summary={"question_count": len(questions)},
        output_summary={
            "passed": len(validated),
            "dropped": low_quality_count,
            "avg_score": round(avg_score, 1),
            "needs_retry": False,
        },
        progress=1.0,
    )

    return {
        "validated_questions": validated,
        "is_complete": True,
        "current_node": "quality_checker",
        "progress": 1.0,
        "status_message": msg,
    }
