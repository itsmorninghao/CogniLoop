from backend.app.core.sse import emit_node_complete, emit_node_start
from backend.app.graphs.pro_generation.nodes._progress import compute_loop_progress
from backend.app.graphs.pro_generation.state import ProQuizState


def analyze_difficulty(
    solve_results: list[dict],
    target: str,
) -> tuple[float, bool]:
    """Reusable function: analyze difficulty from solve results.

    Args:
        solve_results: list of dicts with "score" key (0 or 100)
        target: difficulty target ("easy", "medium", "hard")

    Returns:
        Tuple of (difficulty_score, is_acceptable).
    """
    if not solve_results:
        return 0.5, True

    total_score = sum(r["score"] for r in solve_results)
    max_possible = len(solve_results) * 100
    accuracy = total_score / max_possible if max_possible else 0
    final_score = round(1.0 - accuracy, 2)

    if target == "easy":
        acceptable = final_score <= 0.4
    elif target == "hard":
        acceptable = final_score >= 0.6
    else:  # medium
        acceptable = 0.3 <= final_score <= 0.7

    return final_score, acceptable


async def difficulty_analyzer_node(state: ProQuizState) -> dict:
    """Analyze solve results against target difficulty and approve or reject."""
    session_id = state.get("session_id", "")
    completed = list(state.get("completed_questions", []))
    total_q = sum(state.get("target_count", {}).values())
    q_num = len(completed) + 1

    await emit_node_start(
        session_id,
        "difficulty_analyzer",
        f"难度分析与调校（第 {q_num}/{total_q} 题）...",
    )

    q_dict = state.get("current_question", {})
    if not q_dict:
        return {}

    results = state.get("solve_results", [])
    target = state.get("target_difficulty", "medium")
    retry_count = state.get("retry_count", 0)

    final_score, acceptable = analyze_difficulty(results, target)

    # Generate feedback for difficulty mismatch
    if target == "easy":
        feedback = "上道题太难了（即使是学霸也容易出错）。请出得更基础直白一点。"
    elif target == "hard":
        feedback = "上道题太简单了（连基础差的学生都能蒙对）。请增加思维陷阱、干扰项或考察更深层次的核心原理。"
    else:
        feedback = "难度偏向了极端（太难或太简单），请调整到中等水平：学霸能做对，中等生需要思考，后进生完全不会。"

    if acceptable or retry_count >= 2:
        q_dict["difficulty_score"] = final_score
        completed.append(q_dict)
        await emit_node_complete(
            session_id,
            "difficulty_analyzer",
            f"（第 {q_num}/{total_q} 题）难度合格，已收录（得分 {final_score:.2f}）",
            output_summary={"difficulty_score": final_score, "accepted": True},
            progress=compute_loop_progress(len(completed), total_q, 0.8),
        )
        return {
            "completed_questions": completed,
            "current_question": None,
            "quality_feedback": None,
            "solve_results": [],
        }
    else:
        await emit_node_complete(
            session_id,
            "difficulty_analyzer",
            f"（第 {q_num}/{total_q} 题）难度不合格（{final_score:.2f}），需重新出题",
            output_summary={
                "difficulty_score": final_score,
                "accepted": False,
                "retry": retry_count + 1,
            },
            progress=compute_loop_progress(len(completed), total_q, 0.8),
        )
        return {"quality_feedback": feedback, "retry_count": retry_count + 1}
