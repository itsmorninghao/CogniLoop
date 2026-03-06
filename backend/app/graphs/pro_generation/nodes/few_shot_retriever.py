import random
from sqlalchemy import select
from backend.app.core.database import async_session_factory
from backend.app.models.bank_question import BankQuestion
from backend.app.graphs.pro_generation.state import ProQuizState
from backend.app.core.sse import emit_node_start, emit_node_complete
from backend.app.services.config_service import get_config


async def retrieve_few_shots(qtype: str, kb_ids: list[int], limit: int = 2) -> list[dict]:
    """Retrieve few-shot examples for a question type from bank KBs.

    Args:
        qtype: question type string (e.g. "single_choice")
        kb_ids: list of question bank KB IDs
        limit: max number of examples to return (default 2)

    Returns:
        List of formatted example dicts with content, answer, analysis, difficulty.
    """
    if not kb_ids:
        return []

    async with async_session_factory() as session:
        stmt = select(BankQuestion).where(
            BankQuestion.knowledge_base_id.in_(kb_ids),
            BankQuestion.question_type == qtype
        )
        stmt = stmt.order_by(BankQuestion.id).limit(100)

        result = await session.execute(stmt)
        candidates = list(result.scalars().all())

        if not candidates:
            stmt_fb = select(BankQuestion).where(BankQuestion.knowledge_base_id.in_(kb_ids)).limit(20)
            candidates = list((await session.execute(stmt_fb)).scalars().all())

    if not candidates:
        return []

    random.shuffle(candidates)
    selected = candidates[:limit]

    return [
        {
            "content": q.content,
            "answer": q.answer,
            "analysis": q.analysis or "无",
            "difficulty": q.difficulty,
        }
        for q in selected
    ]


async def few_shot_retriever_node(state: ProQuizState) -> dict:
    """Pre-fetch few-shot example pools for ALL question types before generation begins.

    Fetches a larger pool per type so the distributor can assign different subsets
    to each generator without repetition.
    """
    session_id = state.get("session_id", "")
    target_count = state.get("target_count", {})

    await emit_node_start(session_id, "few_shot_retriever", "批量预取各题型真题范例...")

    kb_ids = state.get("bank_kb_ids") or state.get("kb_ids", [])
    few_shot_pool: dict[str, list[dict]] = {}

    if not kb_ids or not target_count:
        await emit_node_complete(session_id, "few_shot_retriever", "未配置题库，跳过范例预取",
                                 progress=0.14)
        return {"few_shot_pool": {}}

    for qtype, count in target_count.items():
        # Fetch enough examples so each generator can get a unique pair
        # Each generator uses 2 examples, offset by local_index → need count * 2 at minimum
        fetch_limit = max(count * 2, 4)
        examples = await retrieve_few_shots(qtype, kb_ids, limit=fetch_limit)
        few_shot_pool[qtype] = examples

    total_fetched = sum(len(v) for v in few_shot_pool.values())
    await emit_node_complete(
        session_id, "few_shot_retriever",
        f"已预取 {len(few_shot_pool)} 种题型共 {total_fetched} 条范例",
        input_summary={
            "bank_kb_ids": kb_ids,
            "target_types": list(target_count.keys()),
        },
        output_summary={
            "total_fetched": total_fetched,
            "per_type": {qtype: len(v) for qtype, v in few_shot_pool.items()},
        },
        progress=0.14,
    )

    return {"few_shot_pool": few_shot_pool}


async def orchestrator_node(state: ProQuizState) -> dict:
    """Determine the next batch of question generators.

    Returns current_batch_types as a list of context keys in the form
    "{qtype}_{local_index}" (e.g. "single_choice_0", "fill_blank_1").
    This lets batch_pipeline look up each generator's pre-assigned context package.
    """
    target_count = state.get("target_count", {})

    # Merge previous batch results into completed questions
    completed = list(state.get("completed_questions", []))
    batch_results = state.get("batch_results", [])
    if batch_results:
        completed = completed + list(batch_results)

    # Count how many of each type are already done
    current_counts: dict[str, int] = {}
    for q in completed:
        t = q.get("question_type")
        if t:
            current_counts[t] = current_counts.get(t, 0) + 1

    # Read concurrency config
    async with async_session_factory() as session:
        concurrency_str = await get_config("PRO_CONCURRENCY", session)
    concurrency = max(1, min(10, int(concurrency_str or "3")))

    # Build next batch as context keys
    remaining: list[str] = []
    counts = dict(current_counts)
    for t, needed in target_count.items():
        while counts.get(t, 0) < needed and len(remaining) < concurrency:
            local_index = counts.get(t, 0)
            remaining.append(f"{t}_{local_index}")
            counts[t] = counts.get(t, 0) + 1

    if not remaining:
        return {
            "current_batch_types": [],
            "completed_questions": completed,
            "batch_results": [],
        }

    return {
        "current_batch_types": remaining,
        "completed_questions": completed,
        "batch_results": [],
    }
