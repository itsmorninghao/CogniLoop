from backend.app.core.sse import emit_node_complete, emit_node_start
from backend.app.graphs.pro_generation.state import ProQuizState


async def paper_assembler_node(state: ProQuizState) -> dict:
    """Finalize the questions array from the accumulated state."""
    session_id = state.get("session_id", "")
    await emit_node_start(session_id, "paper_assembler", "正在组卷...")

    completed = state.get("completed_questions", [])

    final = []
    index = 1
    for q in completed:
        final.append(
            {
                "question_index": index,
                "question_type": q["question_type"],
                "content": q["content"],
                "options": q.get("options"),
                "correct_answer": q.get("correct_answer"),
                "analysis": q.get("analysis"),
                "score": 10,
            }
        )
        index += 1

    await emit_node_complete(
        session_id,
        "paper_assembler",
        f"组卷完成，共 {len(final)} 道题",
        output_summary={"question_count": len(final)},
        progress=0.95,
    )

    return {"final_questions": final}
