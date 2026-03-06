import asyncio

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_solve_verifier_models
from backend.app.core.sse import emit_node_complete, emit_node_start
from backend.app.graphs.pro_generation.nodes._progress import compute_loop_progress
from backend.app.graphs.pro_generation.state import ProQuizState

STUDENT_PROFILES = [
    {
        "name": "Top Student",
        "desc": "年级前5%的学霸，基础极其扎实，思维敏捷，能看透出题陷阱。",
        "style": "精准、简练、一针见血。",
    },
    {
        "name": "Upper-Average Student",
        "desc": "中上等生，基础扎实，能理解大多数题型，偶尔在细节处失分。",
        "style": "思路清晰，偶有小失误。",
    },
    {
        "name": "Average Student",
        "desc": "中等生水平，基础概念掌握但容易记混，面对变形题容易掉坑。",
        "style": "中规中矩，偶尔依靠直觉蒙题。",
    },
    {
        "name": "Below-Average Student",
        "desc": "中下等生，部分知识点掌握不牢，容易被干扰选项迷惑。",
        "style": "答题不自信，常常在两个选项间摇摆。",
    },
    {
        "name": "Poor Student",
        "desc": "后进生，基础薄弱，有很多知识盲区，几乎只凭第一直觉作答。",
        "style": "犹豫不决，答案短且缺乏逻辑。",
    },
]


async def _simulate_student(
    profile: dict,
    question: dict,
    subject: str,
    use_degradation: bool,
    llm: ChatOpenAI,
) -> dict:
    """Run one simulated student attempt with dual-prompt mode support."""
    if use_degradation:
        # ON: role-play prompt — let the same model simulate different ability levels
        system_msg = (
            "你现在是一个正在考试的学生。你的画像是：\n"
            f"- 学科：{subject}\n"
            f"- 水平：{profile['desc']}\n"
            f"- 答题风格：{profile['style']}\n"
            "请根据你的水平尝试解答这道题。如果觉得难或者不会，可以直接瞎蒙或回答错误答案。\n"
            "你只需要输出最终的答案核心内容，不需要过多的解释过程。"
        )
    else:
        # OFF (default): simple prompt — rely on different model capabilities for natural variation
        system_msg = f"请直接解答以下{subject}题目。只输出最终答案，不需要解释过程。"

    # Build messages directly to avoid curly braces in question content
    # being misinterpreted as LangChain template variables.
    solve_messages = [
        SystemMessage(content=system_msg),
        HumanMessage(
            content=f"题目：{question.get('content')}\n选项(若有)：{question.get('options', '无')}"
        ),
    ]

    try:
        res = await llm.ainvoke(solve_messages)
        student_answer = res.content.strip()
    except Exception:
        student_answer = "(该学生未能完成作答)"

    # Grade the answer (using teacher prompt)
    grade_messages = [
        SystemMessage(
            content=(
                "你是一名阅卷老师。请根据标准答案判断学生作答是否正确。\n"
                "如果学生回答正确或切中要害，请输出：[CORRECT]\n"
                "如果思路偏离或全错，请输出：[INCORRECT]\n"
                "简要附上1句话阅卷理由即可。"
            )
        ),
        HumanMessage(
            content=(
                f"标准答案：{question.get('correct_answer')}\n"
                f"解析：{question.get('analysis', '无')}\n\n"
                f"学生答案：{student_answer}"
            )
        ),
    ]

    try:
        grade_res = await llm.ainvoke(grade_messages)
        grade_text = grade_res.content.strip()
        score = 100 if "[CORRECT]" in grade_text else 0
    except Exception:
        score = 0
        grade_text = "ERROR"

    return {
        "student": profile["name"],
        "student_answer": student_answer,
        "score": score,
        "grade_reason": grade_text,
    }


async def verify_solve(
    question: dict,
    subject: str,
    use_degradation: bool | None = None,
) -> list[dict]:
    """Reusable function: simulate students solving a question (1–5 based on config).

    Args:
        question: question dict with content, options, correct_answer, analysis
        subject: subject scope string
        use_degradation: deprecated; per-student prompt_degradation from config takes precedence.

    Returns:
        List of solve result dicts.
    """
    async with async_session_factory() as session:
        model_specs = await get_solve_verifier_models(session)

    # Each model spec has its own prompt_degradation setting
    tasks = []
    for i, spec in enumerate(model_specs):
        profile = STUDENT_PROFILES[i % len(STUDENT_PROFILES)]
        deg = spec["prompt_degradation"]
        tasks.append(_simulate_student(profile, question, subject, deg, spec["llm"]))

    results = list(await asyncio.gather(*tasks))
    return results


async def solve_verifier_node(state: ProQuizState) -> dict:
    """Instantiate 3 virtual students (Good, Avg, Poor) to solve the generated question concurrently."""
    session_id = state.get("session_id", "")
    completed = state.get("completed_questions", [])
    total_q = sum(state.get("target_count", {}).values())
    q_num = len(completed) + 1

    await emit_node_start(
        session_id, "solve_verifier", f"AI学情模拟测算（第 {q_num}/{total_q} 题）..."
    )

    q_dict = state.get("current_question")
    if not q_dict:
        await emit_node_complete(
            session_id,
            "solve_verifier",
            "无题目可验证",
            progress=compute_loop_progress(len(completed), total_q, 0.6),
        )
        return {"solve_results": []}

    subject = state.get("subject_scope", "综合")
    results = await verify_solve(q_dict, subject)

    scores = [r["score"] for r in results]
    await emit_node_complete(
        session_id,
        "solve_verifier",
        f"（第 {q_num}/{total_q} 题）{len(results)}名模拟学生已作答",
        output_summary={"scores": scores, "names": [r["student"] for r in results]},
        progress=compute_loop_progress(len(completed), total_q, 0.6),
    )

    return {"solve_results": results}
