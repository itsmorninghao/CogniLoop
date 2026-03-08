"""
Node 5: Quality Checker — per-question hallucination detection.
PASS: add to validated_questions.
FAIL: add to questions_needing_retry for question_generator to redo.
"""

from __future__ import annotations

import asyncio
import json
import logging

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_chat_model
from backend.app.graphs.quiz_generation.state import QuizGenState

logger = logging.getLogger(__name__)

_CHECK_SYSTEM = """你是一位题目质量审查专家。请检查下面这道题的质量。

只看两件事：
1. 答案与题干是否逻辑自洽（选项覆盖、填空答案是否合理）
2. 解析内容是否存在明显的知识性错误或无法从题干/常识推导的内容（幻觉）

如果题目质量合格，只输出：PASS
如果存在问题，输出：FAIL: <简要说明具体问题>

不要输出其他任何内容。"""


async def _check_single_question(
    question: dict,
    semaphore: asyncio.Semaphore,
) -> tuple[int, bool, str]:
    """Check a single question. Returns (slot_index, is_pass, issue)."""
    async with semaphore:
        slot_index = question.get("slot_index", 0)
        qtype = question.get("question_type", "")
        content = question.get("content", "")[:500]
        options = question.get("options")
        correct_answer = question.get("correct_answer", "")[:200]
        analysis = question.get("analysis", "")[:500]

        user_content = json.dumps(
            {
                "question_type": qtype,
                "content": content,
                "options": options,
                "correct_answer": correct_answer,
                "analysis": analysis,
            },
            ensure_ascii=False,
            indent=None,
        )

        try:
            async with async_session_factory() as session:
                llm = await get_chat_model(session, temperature=0)
            from langchain_core.messages import HumanMessage, SystemMessage
            messages = [
                SystemMessage(content=_CHECK_SYSTEM),
                HumanMessage(content=user_content),
            ]
            response = await llm.ainvoke(messages)
            reply = response.content.strip()
        except Exception as e:
            logger.warning("Quality check LLM failed for slot %d: %s", slot_index, e)
            return slot_index, True, ""  # fail open: pass on error

        if reply.upper().startswith("PASS"):
            return slot_index, True, ""
        else:
            issue = reply[5:].strip() if reply.upper().startswith("FAIL") else reply
            return slot_index, False, issue


async def quality_checker(state: QuizGenState) -> dict:
    """
    Per-question hallucination detection.
    - All PASS → is_complete=True, write validated_questions
    - Any FAIL and retry_count < 2 → write questions_needing_retry, is_complete=False
    - Any FAIL and retry_count >= 2 → pass all remaining as-is
    """
    from backend.app.core.sse import emit_node_complete, emit_node_start

    session_id = state.get("session_id", "")
    await emit_node_start(session_id, "quality_checker", "正在逐题质量校验...")

    questions = state.get("questions", [])
    retry_count = state.get("retry_count", 0)

    if not questions:
        return {
            "validated_questions": [],
            "is_complete": True,
            "current_node": "quality_checker",
            "progress": 1.0,
            "status_message": "未生成任何题目",
        }

    from backend.app.graphs.quiz_generation.nodes.question_generator import CONCURRENCY_LIMIT
    semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)
    tasks = [_check_single_question(q, semaphore) for q in questions]
    results = await asyncio.gather(*tasks)

    pass_map: dict[int, bool] = {}
    issue_map: dict[int, str] = {}
    for slot_index, is_pass, issue in results:
        pass_map[slot_index] = is_pass
        if not is_pass:
            issue_map[slot_index] = issue

    validated = [q for q in questions if pass_map.get(q.get("slot_index", 0), True)]
    failed = [q for q in questions if not pass_map.get(q.get("slot_index", 0), True)]

    if not failed:
        msg = f"质量校验通过，{len(validated)} 道题目全部合格"
        await emit_node_complete(
            session_id,
            "quality_checker",
            msg,
            input_summary={"question_count": len(questions)},
            output_summary={"passed": len(validated), "failed": 0},
            progress=1.0,
        )
        return {
            "validated_questions": validated,
            "is_complete": True,
            "current_node": "quality_checker",
            "progress": 1.0,
            "status_message": msg,
        }

    if retry_count >= 2:
        # Max retries reached: include all questions
        msg = f"质量校验完成（已达最大重试次数），共 {len(questions)} 道题目"
        for q in failed:
            q["quality_note"] = issue_map.get(q.get("slot_index", 0), "质检未通过")
        await emit_node_complete(
            session_id,
            "quality_checker",
            msg,
            input_summary={"question_count": len(questions)},
            output_summary={"passed": len(validated), "forced_pass": len(failed)},
            progress=1.0,
        )
        return {
            "validated_questions": questions,  # include all
            "is_complete": True,
            "current_node": "quality_checker",
            "progress": 1.0,
            "status_message": msg,
        }

    # Trigger per-question retry
    questions_needing_retry = [
        {"slot_index": q.get("slot_index", 0), "issue": issue_map.get(q.get("slot_index", 0), "质检未通过")}
        for q in failed
    ]

    retry_msg = f"发现 {len(failed)} 道题需重出（第{retry_count + 1}轮重试）"
    await emit_node_complete(
        session_id,
        "quality_checker",
        retry_msg,
        input_summary={"question_count": len(questions)},
        output_summary={
            "passed": len(validated),
            "needs_retry": len(failed),
            "retry_count": retry_count + 1,
        },
        progress=0.85,
    )
    return {
        "questions_needing_retry": questions_needing_retry,
        "retry_count": retry_count + 1,
        "is_complete": False,
        "current_node": "quality_checker",
        "progress": 0.85,
        "status_message": retry_msg,
    }
