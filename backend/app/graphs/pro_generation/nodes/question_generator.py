import json

from langchain_core.messages import HumanMessage, SystemMessage

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_node_chat_model
from backend.app.core.sse import emit_node_complete, emit_node_start
from backend.app.graphs.pro_generation.nodes._progress import compute_loop_progress
from backend.app.graphs.pro_generation.state import ProQuizState


async def generate_question(
    qtype: str,
    ctx: dict,
    examples: list[dict],
    feedback: str | None = None,
) -> dict:
    """Reusable function: generate a single question using LLM.

    Args:
        qtype: question type (e.g. "single_choice")
        ctx: dict with keys: subject, difficulty, hotspot, rag_context
        examples: few-shot examples list
        feedback: quality feedback from previous attempt, if retrying

    Returns:
        Question dict with question_type, content, options, correct_answer, analysis.
    """
    subject = ctx.get("subject", "综合")
    difficulty = ctx.get("difficulty", "medium")
    hotspot = ctx.get("hotspot", "")
    rag_context = ctx.get("rag_context", "")

    # Format RAG knowledge context
    rag_section = ""
    if rag_context:
        rag_section = (
            f"【参考知识内容（请基于以下知识点出题）】\n{rag_context[:3000]}\n\n"
        )

    # Format few shots
    shots_text = ""
    if examples:
        shots_text = "【参考真题范例（用于模仿出题风格与难度）】\n"
        for i, s in enumerate(examples, 1):
            shots_text += f"--范例 {i}--\n题干: {s['content']}\n答案: {s['answer']}\n\n"

    # Format instructions based on type
    if qtype == "single_choice":
        format_instr = '{"content": "题目描述", "options": {"A": "选项1", "B": "选项2", "C": "选项3", "D": "选项4"}, "correct_answer": "A", "analysis": "解析"}'
    elif qtype == "fill_blank":
        format_instr = '{"content": "题目描述，包含下划线 ___", "options": null, "correct_answer": "填空答案", "analysis": "解析"}'
    else:
        format_instr = '{"content": "题目描述", "options": null, "correct_answer": "参考答案文本", "analysis": "解析"}'

    sys_msg = (
        "你是一个极其专业的顶级学科命题专家。你需要编写1道全新、高质量的原创试题。\n"
        f"当前任务：生成1道【{subject}】领域的【{qtype}】题，难度目标为【{difficulty}】。\n\n"
        f"{rag_section}"
        f"{shots_text}"
        "【素材要求】\n你可以参考以下最新热点来构思出题背景（以此增加趣味性），但不能偏离核心知识点考查：\n"
        f"{hotspot}\n\n"
        "【输出格式】必须输出合法的严格JSON对象，不要输出其他任何解释性文字！格式如下：\n"
        f"{format_instr}\n"
    )

    user_msg = (
        "请开始出题。如果之前出题有错误，请根据此反馈修正再出题:\n" + str(feedback)
        if feedback
        else "请开始出题。"
    )

    # Build messages directly instead of using ChatPromptTemplate to avoid
    # curly braces in content (e.g. math set notation {1,2,3}) being
    # misinterpreted as LangChain template variables.
    messages = [SystemMessage(content=sys_msg), HumanMessage(content=user_msg)]

    async with async_session_factory() as session:
        llm = await get_node_chat_model("question_generator", session)

    retry = 0
    question_dict_out = None
    while retry < 3:
        try:
            res = await llm.ainvoke(messages)
            content = res.content.strip()
            if content.startswith("```json"):
                content = content[7:]
            if content.endswith("```"):
                content = content[:-3]

            question_dict_out = json.loads(content.strip())
            question_dict_out["question_type"] = qtype
            break
        except (json.JSONDecodeError, ValueError) as e:
            retry += 1
            print(f"Question Generation JSON parse error (attempt {retry}/3): {e}")

    if not question_dict_out:
        fallback_options = (
            {"A": "概念A", "B": "概念B", "C": "概念C", "D": "概念D"}
            if qtype == "single_choice"
            else None
        )
        question_dict_out = {
            "question_type": qtype,
            "content": f"请解释什么是 {subject} 中的重要概念？",
            "options": fallback_options,
            "correct_answer": "A" if qtype == "single_choice" else "略",
            "analysis": "系统生成出错，此为兜底题目",
            "difficulty_score": 0.5,
        }

    return question_dict_out


async def question_generator_node(state: ProQuizState) -> dict:
    """Generate a single question using Few-Shot examples, the current Hotspots, and user config."""
    session_id = state.get("session_id", "")
    completed = state.get("completed_questions", [])
    total_q = sum(state.get("target_count", {}).values())
    q_num = len(completed) + 1

    await emit_node_start(
        session_id, "question_generator", f"原创命题（第 {q_num}/{total_q} 题）..."
    )

    qtype = state.get("current_type_generating")
    if not qtype:
        return {}

    ctx = {
        "subject": state.get("subject_scope", "综合"),
        "difficulty": state.get("target_difficulty", "medium"),
        "hotspot": state.get("hotspot_context", ""),
        "rag_context": state.get("rag_context", ""),
    }
    examples = state.get("few_shot_examples", [])
    feedback = state.get("quality_feedback")

    question_dict_out = await generate_question(qtype, ctx, examples, feedback)

    preview = (question_dict_out.get("content") or "")[:80]
    await emit_node_complete(
        session_id,
        "question_generator",
        f"（第 {q_num}/{total_q} 题）命题完成",
        output_summary={"question_type": qtype, "content_preview": preview},
        progress=compute_loop_progress(len(completed), total_q, 0.2),
    )

    return {"current_question": question_dict_out}
