"""Context Distributor node for Pro generation.

Assigns different subsets of RAG chunks and hotspot items to each question generator
so every generated question draws from a distinct knowledge perspective.

Distribution strategy:
  - RAG chunks + hotspot:  LLM-controlled, with rule-based fallback
  - Few-shot examples:     Rule-based round-robin (guaranteed non-repeating per type)

Fallback hierarchy:
  1. JSON parse completely fails  → full rule-based fallback for all generators
  2. A generator's chunk_ids are missing / all invalid → rule-based fallback for that generator
  3. A generator's hotspot_index is missing / invalid  → cycle by global generator index
"""

import json
import logging
import math

from langchain_core.messages import HumanMessage, SystemMessage

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_node_chat_model
from backend.app.core.sse import emit_node_complete, emit_node_start
from backend.app.graphs.pro_generation.state import ProQuizState

logger = logging.getLogger(__name__)


def _fallback_chunk_ids(gen_idx: int, total_gens: int, n_chunks: int) -> list[int]:
    """Round-robin chunk assignment: each generator gets a non-overlapping window."""
    if n_chunks == 0:
        return []
    chunks_per_gen = max(math.ceil(n_chunks / max(total_gens, 1)), 2)
    start = (gen_idx * chunks_per_gen) % n_chunks
    return [(start + j) % n_chunks for j in range(chunks_per_gen)]


def _assign_few_shots(
    qtype: str, local_index: int, few_shot_pool: dict[str, list[dict]]
) -> list[dict]:
    """Rule-based: give each generator of the same type a different pair of examples."""
    examples = few_shot_pool.get(qtype, [])
    if not examples:
        return []
    n = len(examples)
    if n <= 2:
        return examples  # pool too small, everyone gets the same
    # Slide a window of 2 by local_index * 2, wrapping around
    start = (local_index * 2) % n
    return [examples[(start + j) % n] for j in range(2)]


async def _llm_distribute(
    generators: list[dict],
    rag_chunks: list[dict],
    hotspot_items: list[str],
    session_id: str,
) -> dict:
    """Ask the LLM to assign chunk_ids and hotspot_index to each generator.

    Returns a dict keyed by context_key (e.g. "single_choice_0") with:
        {"chunk_ids": [int, ...], "hotspot_index": int}
    Returns empty dict on any failure so callers can apply fallback.
    """
    if not rag_chunks and not hotspot_items:
        return {}

    # Build compact chunk list for prompt (index + first 150 chars)
    chunk_summaries = [
        f"[{c['index']}] {c['content'][:150].replace(chr(10), ' ')}" for c in rag_chunks
    ]
    hotspot_summaries = [f"[{i}] {h[:120]}" for i, h in enumerate(hotspot_items)]

    gen_list = "\n".join(
        f"- {g['key']}（题型: {g['type']}，序号: {g['local_index']}）"
        for g in generators
    )

    chunks_per_gen = max(math.ceil(len(rag_chunks) / max(len(generators), 1)), 2)

    sys_prompt = (
        "你是一个出题资源分配专家。你的任务是将知识片段和时事热点分配给不同的出题手，"
        "使每个出题手覆盖不同的知识侧面，生成的题目尽量不重复、不雷同。\n\n"
        f"【出题手列表】（共 {len(generators)} 个）\n{gen_list}\n\n"
        f"【知识片段池】（共 {len(rag_chunks)} 条，每条显示前150字）\n"
        + "\n".join(chunk_summaries)
        + "\n\n"
        f"【时事热点池】（共 {len(hotspot_items)} 条）\n"
        + "\n".join(hotspot_summaries)
        + "\n\n"
        "【分配规则】\n"
        f"1. 每个出题手分配约 {chunks_per_gen} 条知识片段（用片段的数字编号列表表示）\n"
        "2. 不同出题手尽量分配不同的片段，覆盖尽量全面\n"
        "3. 每个出题手分配 1 条时事热点（用热点的数字编号表示）\n"
        "4. 同类型的出题手（如多道单选题）必须分配不同的热点编号\n\n"
        "【输出格式】严格 JSON 对象，key 为出题手标识，value 包含 chunk_ids 和 hotspot_index，例如：\n"
        '{"single_choice_0": {"chunk_ids": [0, 2], "hotspot_index": 0}, '
        '"fill_blank_0": {"chunk_ids": [1, 3], "hotspot_index": 1}}\n'
        "不要输出任何其他文字。"
    )

    try:
        async with async_session_factory() as session:
            llm = await get_node_chat_model("question_generator", session)
        response = await llm.ainvoke(
            [
                SystemMessage(content=sys_prompt),
                HumanMessage(content="请开始分配。"),
            ]
        )
        raw = str(response.content).strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except Exception as e:
        logger.warning(
            "distributor LLM call failed (%s), will use rule-based fallback", e
        )
        return {}


async def distributor_node(state: ProQuizState) -> dict:
    """Distribute pre-fetched context pools to each question generator."""
    session_id = state.get("session_id", "")
    await emit_node_start(session_id, "distributor", "正在为每道题分配专属出题素材...")

    rag_chunks: list[dict] = state.get("rag_chunks", [])
    hotspot_items: list[str] = state.get("hotspot_items", [])
    few_shot_pool: dict[str, list[dict]] = state.get("few_shot_pool", {})
    target_count: dict[str, int] = state.get("target_count", {})

    generators: list[dict] = []
    for qtype, count in target_count.items():
        for i in range(count):
            generators.append({"key": f"{qtype}_{i}", "type": qtype, "local_index": i})

    if not generators:
        await emit_node_complete(
            session_id, "distributor", "无需分配（无题目目标）", progress=0.18
        )
        return {"question_context_map": {}}

    llm_result = await _llm_distribute(
        generators, rag_chunks, hotspot_items, session_id
    )

    fallback_used = 0
    question_context_map: dict[str, dict] = {}

    for gen_idx, gen in enumerate(generators):
        key = gen["key"]
        qtype = gen["type"]
        local_index = gen["local_index"]
        assignment = llm_result.get(key, {}) if isinstance(llm_result, dict) else {}

        raw_ids = assignment.get("chunk_ids", [])
        valid_ids = [
            cid
            for cid in raw_ids
            if isinstance(cid, int) and 0 <= cid < len(rag_chunks)
        ]

        if not valid_ids:
            if raw_ids:  # had ids but all invalid
                logger.warning(
                    "distributor: all chunk_ids invalid for %s, using fallback", key
                )
            valid_ids = _fallback_chunk_ids(gen_idx, len(generators), len(rag_chunks))
            fallback_used += 1

        rag_context = "\n---\n".join(rag_chunks[cid]["content"] for cid in valid_ids)

        hotspot_index = assignment.get("hotspot_index")
        if (
            hotspot_index is None
            or not isinstance(hotspot_index, int)
            or not (0 <= hotspot_index < len(hotspot_items))
        ):
            hotspot_index = gen_idx % len(hotspot_items) if hotspot_items else 0
        hotspot = hotspot_items[hotspot_index] if hotspot_items else ""

        few_shot_examples = _assign_few_shots(qtype, local_index, few_shot_pool)

        question_context_map[key] = {
            "rag_context": rag_context,
            "hotspot": hotspot,
            "few_shot_examples": few_shot_examples,
        }

    fallback_note = (
        f"（{fallback_used} 个出题手使用了兜底分配）" if fallback_used else ""
    )
    gen_context_summary = {
        key: {
            "rag_chars": len(ctx.get("rag_context", "")),
            "hotspot": ctx.get("hotspot", "")[:60],
            "few_shot_count": len(ctx.get("few_shot_examples", [])),
        }
        for key, ctx in question_context_map.items()
    }
    await emit_node_complete(
        session_id,
        "distributor",
        f"已为 {len(generators)} 个出题手完成素材分配{fallback_note}",
        input_summary={
            "rag_chunks_count": len(rag_chunks),
            "hotspot_items_count": len(hotspot_items),
            "generators_count": len(generators),
        },
        output_summary={
            "total_generators": len(generators),
            "llm_distributed": len(generators) - fallback_used,
            "fallback_count": fallback_used,
            "context_map": gen_context_summary,
        },
        progress=0.18,
    )

    return {"question_context_map": question_context_map}
