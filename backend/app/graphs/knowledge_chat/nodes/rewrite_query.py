"""Rewrite the latest chat turn into a retrieval-friendly query."""

from __future__ import annotations

import logging

from langchain_core.messages import AIMessage, HumanMessage

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_chat_model
from backend.app.core.sse import SSEManager, emit_node_complete, emit_node_start
from backend.app.graphs.knowledge_chat.state import KnowledgeChatState
from backend.app.graphs.knowledge_chat.trace import (
    set_rewrite_details,
    set_step_state,
)

logger = logging.getLogger(__name__)


def _build_history_lines(messages: list, limit: int = 6) -> list[str]:
    lines: list[str] = []
    for msg in messages[-limit:]:
        if isinstance(msg, HumanMessage):
            lines.append(f"用户：{msg.content}")
        elif isinstance(msg, AIMessage):
            lines.append(f"助手：{msg.content}")
    return lines


async def rewrite_query(state: KnowledgeChatState) -> dict:
    session_id = state["session_id"]
    assistant_message_id = state["assistant_message_id"]
    latest_user_message = state.get("latest_user_message", "").strip()
    messages = state.get("messages", [])
    fast_mode = state.get("mode") == "fast"

    # In fast mode this node does no LLM work — emit nothing so the UI does
    # not flash a "理解问题" step that would never have any user-visible
    # content, and mark the trace step as complete immediately.
    if fast_mode:
        execution_trace = set_step_state(
            state.get("execution_trace"),
            assistant_message_id,
            "rewrite_query",
            status="complete",
            message="已跳过(快速模式)",
        )
    else:
        execution_trace = set_step_state(
            state.get("execution_trace"),
            assistant_message_id,
            "rewrite_query",
            status="active",
            message="正在理解你的问题...",
        )
        await emit_node_start(
            session_id,
            "rewrite_query",
            "正在理解你的问题...",
            assistant_message_id=assistant_message_id,
        )

    if not latest_user_message:
        return {
            "retrieval_query": "",
            "query_source": "empty",
            "execution_trace": set_step_state(
                execution_trace,
                assistant_message_id,
                "rewrite_query",
                status="complete",
                message="未收到有效问题",
            ),
            "current_node": "rewrite_query",
            "progress": 0.05,
            "status_message": "未收到有效问题",
        }

    history_lines = _build_history_lines(messages[:-1], limit=6) if len(messages) > 1 else []
    fast_mode = state.get("mode") == "fast"
    if fast_mode or not history_lines:
        query = latest_user_message[:200]
        query_source = "fast" if fast_mode else "direct"
        query_prompt = ""
    else:
        prompt = (
            "你是知识库检索改写器。请结合对话上下文，把用户最后一句问题改写成一条适合文档检索的独立查询。\n"
            "要求：\n"
            "1. 保留核心实体、章节、概念、限定条件。\n"
            "2. 不要回答问题，只输出检索查询。\n"
            "3. 控制在 50 字以内。\n\n"
            f"对话上下文：\n{chr(10).join(history_lines)}\n\n"
            f"用户最新问题：{latest_user_message}"
        )
        try:
            async with async_session_factory() as session:
                llm = await get_chat_model(session, temperature=0)
                resp = await llm.ainvoke([HumanMessage(content=prompt)])
            query = str(resp.content).strip()[:200] or latest_user_message[:200]
            query_source = "rewrite"
            query_prompt = prompt
        except Exception as exc:
            logger.warning("rewrite_query failed, falling back to latest message: %s", exc)
            query = latest_user_message[:200]
            query_source = "fallback"
            query_prompt = ""

    execution_trace = set_rewrite_details(
        execution_trace,
        assistant_message_id,
        retrieval_query=query,
        query_source=query_source,
        history_turns_used=len(history_lines),
    )
    execution_trace = set_step_state(
        execution_trace,
        assistant_message_id,
        "rewrite_query",
        status="complete",
        message="已跳过(快速模式)" if fast_mode else "已生成检索查询",
    )

    if not fast_mode:
        await SSEManager.get_instance().send_event(
            session_id,
            "rewrite_result",
            {
                "assistant_message_id": assistant_message_id,
                "retrieval_query": query,
                "query_source": query_source,
                "history_turns_used": len(history_lines),
            },
        )

        await emit_node_complete(
            session_id,
            "rewrite_query",
            "已生成检索查询",
            assistant_message_id=assistant_message_id,
            input_summary={"latest_user_message": latest_user_message[:500]},
            output_summary={
                "retrieval_query": query,
                "query_source": query_source,
                "history_turns_used": len(history_lines),
                **({"query_prompt": query_prompt[:2000]} if query_prompt else {}),
            },
            progress=0.1,
        )

    return {
        "retrieval_query": query,
        "query_source": query_source,
        "execution_trace": execution_trace,
        "current_node": "rewrite_query",
        "progress": 0.1,
        "status_message": "已生成检索查询",
    }
