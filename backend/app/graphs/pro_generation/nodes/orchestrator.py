"""Orchestrator node — determines next batch of question generators by slot position."""

from backend.app.core.database import async_session_factory
from backend.app.graphs.pro_generation.state import ProQuizState
from backend.app.services.config_service import get_config


async def orchestrator_node(state: ProQuizState) -> dict:
    """Determine the next batch of question generators.

    Returns current_batch_types as a list of context keys in the form
    "slot_{position}" (e.g. "slot_1", "slot_9").
    """
    selected_positions = state.get("selected_slot_positions", [])

    # Merge previous batch results into completed questions
    completed = list(state.get("completed_questions", []))
    batch_results = state.get("batch_results", [])
    if batch_results:
        completed = completed + list(batch_results)

    # Find which positions are already completed
    completed_keys = set()
    for q in completed:
        pos = q.get("slot_position")
        if pos is not None:
            completed_keys.add(f"slot_{pos}")

    async with async_session_factory() as session:
        concurrency_str = await get_config("PRO_CONCURRENCY", session)
    concurrency = max(1, min(10, int(concurrency_str or "3")))

    # Build next batch — only positions not yet completed
    remaining = [
        f"slot_{pos}" for pos in selected_positions
        if f"slot_{pos}" not in completed_keys
    ]

    batch = remaining[:concurrency]

    if not batch:
        return {
            "current_batch_types": [],
            "completed_questions": completed,
            "batch_results": [],
        }

    return {
        "current_batch_types": batch,
        "completed_questions": completed,
        "batch_results": [],
    }
