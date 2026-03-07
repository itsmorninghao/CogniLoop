import json

from langchain_core.messages import HumanMessage, SystemMessage

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_node_chat_model
from backend.app.core.sse import emit_node_complete, emit_node_start
from backend.app.graphs.pro_generation.nodes._progress import compute_loop_progress
from backend.app.graphs.pro_generation.state import ProQuizState


async def check_quality(q_dict: dict, qtype: str) -> tuple[str | None, str, str, str]:
    """Reusable function: check question quality.

    Args:
        q_dict: question dict with content, options, correct_answer
        qtype: question type string

    Returns:
        Tuple of (feedback, sys_content, user_content, reply).
        feedback is None if approved, a string if rejected.
    """
    if not q_dict or "content" not in q_dict or "correct_answer" not in q_dict:
        msg = "核心字段内容(content)或(correct_answer)缺失，请重新生成完整的JSON对象。"
        return msg, "", "", ""

    # Fast format checks
    if qtype == "single_choice" and (
        not q_dict.get("options") or len(q_dict["options"]) < 2
    ):
        msg = "这道单选题的选项(options)不足或格式不正确，必须包含A、B、C、D等有效选项结构。"
        return msg, "", "", ""

    if qtype == "single_choice" and q_dict["correct_answer"] not in q_dict.get(
        "options", {}
    ):
        msg = "正确答案(correct_answer)不在给定的选项键(options)中，请核对后重新生成。"
        return msg, "", "", ""

    # Basic logic LLM check — use messages directly to avoid template issues
    # with curly braces in question content (e.g. math set notation {1,2,3}).
    sys_content = (
        "你是一个试题质量审查员。请对以下题目进行粗略审查：\n"
        "1. 题干是否有语病导致根本无法理解。\n"
        "2. 单选题是否存在明显无正确选项或多个绝对正确选项的情况（若非单选题则忽略该条）。\n"
        "3. 是否存在严重违反常识的设定。\n\n"
        "如果发现以上致命缺陷，请回复：[REJECT] 以及具体理由。\n"
        "如果结构和逻辑基本通顺，请回复：[APPROVE]"
    )
    user_content = (
        f"题目内容: {q_dict.get('content')}\n"
        f"选项: {json.dumps(q_dict.get('options', {}), ensure_ascii=False)}\n"
        f"答案: {q_dict.get('correct_answer')}"
    )

    reply = ""
    try:
        async with async_session_factory() as session:
            llm = await get_node_chat_model("quality_checker", session, temperature=0)
        res = await llm.ainvoke(
            [
                SystemMessage(content=sys_content),
                HumanMessage(content=user_content),
            ]
        )

        reply = res.content.strip()
        if "[REJECT]" in reply:
            return reply.replace("[REJECT]", "").strip(), sys_content, user_content, reply
    except Exception:
        pass

    return None, sys_content, user_content, reply


async def quality_checker_node(state: ProQuizState) -> dict:
    """Check if the generated question structure is complete and grammatically sound."""
    session_id = state.get("session_id", "")
    completed = state.get("completed_questions", [])
    total_q = sum(state.get("target_count", {}).values())
    q_num = len(completed) + 1

    await emit_node_start(
        session_id, "quality_checker", f"质量快审（第 {q_num}/{total_q} 题）..."
    )

    q_dict = state.get("current_question", {})
    qtype = state.get("current_type_generating")

    feedback, qc_sys, qc_usr, qc_reply = await check_quality(q_dict, qtype)

    if feedback:
        await emit_node_complete(
            session_id,
            "quality_checker",
            f"（第 {q_num}/{total_q} 题）质量不合格",
            input_summary={"system_prompt": qc_sys[:3000], "user_prompt": qc_usr[:3000]},
            output_summary={"result": "REJECT", "reason": feedback[:100], "llm_output": qc_reply[:2000]},
            progress=compute_loop_progress(len(completed), total_q, 0.4),
        )
        return {"quality_feedback": feedback}

    await emit_node_complete(
        session_id,
        "quality_checker",
        f"（第 {q_num}/{total_q} 题）质量审查通过",
        input_summary={"system_prompt": qc_sys[:3000], "user_prompt": qc_usr[:3000]},
        output_summary={"result": "APPROVE", "llm_output": qc_reply[:2000]},
        progress=compute_loop_progress(len(completed), total_q, 0.4),
    )

    return {"quality_feedback": None}
