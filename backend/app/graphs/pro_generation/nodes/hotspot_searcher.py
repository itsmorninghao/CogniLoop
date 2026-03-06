import json
import logging
from langchain_core.messages import SystemMessage, HumanMessage
from backend.app.core.llm import get_node_chat_model
from backend.app.core.database import async_session_factory
from backend.app.graphs.pro_generation.state import ProQuizState
from backend.app.core.sse import emit_node_start, emit_node_complete

logger = logging.getLogger(__name__)

async def hotspot_searcher_node(state: ProQuizState) -> dict:
    """Fetch recent news or trendy topics and return as a list for per-generator assignment."""
    session_id = state.get("session_id", "")
    await emit_node_start(session_id, "hotspot_searcher", "正在检索时事热点...")

    subject = state.get("subject_scope", "综合")
    total_q = sum(state.get("target_count", {}).values())
    # Ask for enough items to give every generator a different one
    n_items = max(total_q, 3)

    hotspot_items: list[str] = []
    try:
        async with async_session_factory() as session:
            llm = await get_node_chat_model("hotspot_searcher", session)
        response = await llm.ainvoke([
            SystemMessage(content=(
                "你是一个时事热点追踪专家。请根据用户指定的【学科/知识范围】，"
                f"想出或搜索出 **{n_items} 个最近2年内相关的真实社会热点、科技突破、或有趣味性与教育意义的事件**。\n"
                "每条热点独立成段，格式要求：\n"
                "- 每条只写事件背景描述（1-3句话），不加编号和标题\n"
                "- 以 JSON 数组形式输出，例如：\n"
                '["事件背景描述1", "事件背景描述2", ...]'
            )),
            HumanMessage(content=f"我的出题领域范围是: {subject}"),
        ])
        raw = str(response.content).strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw.strip())
        if isinstance(parsed, list):
            hotspot_items = [str(item) for item in parsed if item]
    except Exception as e:
        logger.warning("hotspot_searcher failed to parse JSON (%s), falling back to plain text split", e)
        # Fallback: try to use raw content split by newlines as individual items
        try:
            lines = [l.strip() for l in str(response.content).splitlines() if l.strip()]  # type: ignore[possibly-undefined]
            hotspot_items = lines if lines else []
        except Exception:
            pass

    if not hotspot_items:
        hotspot_items = ["（热点素材获取失败，请以常规方式出题，无需强行融入时事背景）"]

    await emit_node_complete(
        session_id, "hotspot_searcher", f"已获取 {len(hotspot_items)} 条 {subject} 领域热点素材",
        input_summary={"subject": subject, "requested_count": n_items},
        output_summary={
            "count": len(hotspot_items),
            "items": [item[:100] for item in hotspot_items[:5]],
        },
        progress=0.12,
    )

    return {"hotspot_items": hotspot_items}
