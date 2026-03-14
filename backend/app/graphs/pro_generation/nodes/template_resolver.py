"""Template resolver node — loads exam templates and builds few-shot map."""

import random

from sqlalchemy.orm import selectinload

from backend.app.core.database import async_session_factory
from backend.app.core.sse import emit_node_complete, emit_node_start
from backend.app.graphs.pro_generation.state import ProQuizState
from backend.app.models.exam_template import (
    ExamTemplate,
    ExamTemplateSlot,
    ExamTemplateSlotQuestion,
)

try:
    from sqlmodel import select
except ImportError:
    from sqlalchemy import select


async def template_resolver_node(state: ProQuizState) -> dict:
    """Load selected templates, merge slots by position, build few-shot map.

    1. Load templates by template_ids with eager-loaded slots + questions
    2. Get selected_slot_positions (default: all positions from all templates)
    3. Cross-template conflict detection → raise on conflict
    4. Merge slots by position: aggregate questions from all templates at each position
    5. Build merged_slots and few_shot_map
    """
    session_id = state.get("session_id", "")
    template_ids = state.get("template_ids", [])
    selected_positions = state.get("selected_slot_positions", [])

    await emit_node_start(session_id, "template_resolver", "正在加载试卷模板...")

    if not template_ids:
        await emit_node_complete(
            session_id, "template_resolver", "未选择试卷模板，跳过范例预取", progress=0.14
        )
        return {"merged_slots": [], "few_shot_map": {}}

    async with async_session_factory() as session:
        stmt = (
            select(ExamTemplate)
            .where(ExamTemplate.id.in_(template_ids))
            .options(
                selectinload(ExamTemplate.slots).selectinload(ExamTemplateSlot.questions)
            )
        )
        result = await session.execute(stmt)
        templates = list(result.scalars().unique().all())

    if not templates:
        await emit_node_complete(
            session_id, "template_resolver", "未找到选中的模板", progress=0.14
        )
        return {"merged_slots": [], "few_shot_map": {}}

    # Collect all slots grouped by position
    slots_by_position: dict[int, list[ExamTemplateSlot]] = {}
    for tmpl in templates:
        for slot in tmpl.slots:
            slots_by_position.setdefault(slot.position, []).append(slot)

    # Default: select all positions if none specified
    if not selected_positions:
        selected_positions = sorted(slots_by_position.keys())

    # Cross-template conflict detection
    conflicts = []
    for pos in selected_positions:
        slots_at_pos = slots_by_position.get(pos, [])
        if len(slots_at_pos) <= 1:
            continue
        types = {s.template_id: s.question_type for s in slots_at_pos}
        unique_types = set(types.values())
        if len(unique_types) > 1:
            conflicts.append({"position": pos, "conflicting_types": types})

    if conflicts:
        conflict_desc = "; ".join(
            f"位置{c['position']}: {c['conflicting_types']}" for c in conflicts
        )
        msg = f"跨模板冲突: {conflict_desc}"
        await emit_node_complete(session_id, "template_resolver", msg, progress=0.14)
        raise RuntimeError(f"模板冲突未解决: {msg}")

    # Build merged_slots and few_shot_map
    merged_slots: list[dict] = []
    few_shot_map: dict[int, list[dict]] = {}

    for pos in sorted(selected_positions):
        slots_at_pos = slots_by_position.get(pos, [])
        if not slots_at_pos:
            continue

        # Use question_type from the first slot (they should all agree after conflict check)
        question_type = slots_at_pos[0].question_type
        label = slots_at_pos[0].label
        # Try to find a non-empty label
        for s in slots_at_pos:
            if s.label:
                label = s.label
                break

        # Aggregate questions from all templates at this position
        all_questions = []
        for slot in slots_at_pos:
            for q in slot.questions:
                all_questions.append({
                    "content": q.content,
                    "answer": q.answer or "",
                    "analysis": q.analysis or "无",
                    "difficulty": q.difficulty or "medium",
                })

        merged_slots.append({
            "position": pos,
            "question_type": question_type,
            "label": label,
            "question_count": len(all_questions),
        })
        few_shot_map[pos] = all_questions

    total_questions = sum(len(v) for v in few_shot_map.values())
    await emit_node_complete(
        session_id,
        "template_resolver",
        f"已加载 {len(templates)} 个模板，{len(merged_slots)} 个题位，共 {total_questions} 道范例",
        input_summary={
            "template_ids": template_ids,
            "selected_positions": selected_positions,
        },
        output_summary={
            "merged_slot_count": len(merged_slots),
            "total_few_shot": total_questions,
            "per_position": {pos: len(qs) for pos, qs in few_shot_map.items()},
        },
        progress=0.14,
    )

    return {
        "merged_slots": merged_slots,
        "few_shot_map": few_shot_map,
        "selected_slot_positions": selected_positions,
    }
