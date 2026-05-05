"""Generate and stream a grounded answer for the current chat turn."""

from __future__ import annotations

from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_chat_model
from backend.app.core.sse import SSEManager, emit_node_complete, emit_node_start
from backend.app.graphs.knowledge_chat.state import KnowledgeChatState
from backend.app.graphs.knowledge_chat.trace import set_step_state


def _chunk_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    return str(content or "")


def _build_context(chunks: list[dict]) -> str:
    parts: list[str] = []
    for idx, chunk in enumerate(chunks, start=1):
        doc_name = chunk.get("original_filename") or chunk.get("document_title") or "未命名文档"
        heading = chunk.get("heading") or "未标注章节"
        section_path = chunk.get("section_path") or heading
        parts.append(
            f"[{idx}] 文档：{doc_name}\n章节：{section_path}\n内容：{chunk.get('content', '')[:1800]}"
        )
    return "\n\n---\n\n".join(parts)


async def generate_answer(state: KnowledgeChatState) -> dict:
    session_id = state["session_id"]
    latest_user_message = state.get("latest_user_message", "").strip()
    chunks = state.get("retrieved_chunks", [])
    history = state.get("messages", [])
    assistant_message_id = state["assistant_message_id"]
    execution_trace = set_step_state(
        state.get("execution_trace"),
        assistant_message_id,
        "generate_answer",
        status="active",
        message="正在生成回答...",
    )

    await emit_node_start(
        session_id,
        "generate_answer",
        "正在生成回答...",
        assistant_message_id=assistant_message_id,
    )

    if not latest_user_message:
        answer = "我没有收到有效的问题内容。"
        await SSEManager.get_instance().send_event(
            session_id,
            "answer_delta",
            {"assistant_message_id": assistant_message_id, "delta": answer},
        )
        return {
            "answer": answer,
            "execution_trace": set_step_state(
                execution_trace,
                assistant_message_id,
                "generate_answer",
                status="complete",
                message="回答生成完成",
            ),
            "current_node": "generate_answer",
            "progress": 0.9,
            "status_message": "回答生成完成",
        }

    if not chunks:
        answer = "我在当前知识库范围内没有检索到足够依据，暂时无法可靠回答这个问题。你可以换一种问法，或扩大选中的文档范围。"
        await SSEManager.get_instance().send_event(
            session_id,
            "answer_delta",
            {"assistant_message_id": assistant_message_id, "delta": answer},
        )
        await emit_node_complete(
            session_id,
            "generate_answer",
            "未检索到足够依据，已返回保守回答",
            assistant_message_id=assistant_message_id,
            input_summary={"latest_user_message": latest_user_message[:500]},
            output_summary={"answer_chars": len(answer), "grounded": False},
            progress=0.9,
        )
        return {
            "answer": answer,
            "execution_trace": set_step_state(
                execution_trace,
                assistant_message_id,
                "generate_answer",
                status="complete",
                message="未检索到足够依据，已返回保守回答",
            ),
            "current_node": "generate_answer",
            "progress": 0.9,
            "status_message": "回答生成完成",
        }

    system_prompt = (
        "你是 CogniLoop 的知识库问答助手。你的回答必须严格基于提供的知识片段。\n"
        "要求：\n"
        "1. 优先直接回答问题，再补充必要说明。\n"
        "2. 不得编造知识库中不存在的事实。\n"
        "3. 如果片段只能部分回答，要明确说明不确定部分。\n"
        "4. 使用简洁、清晰的中文。适合学习场景。\n"
        "5. 不要在正文中虚构出处编号，也不要提及“系统提示”或“检索片段”。"
    )

    context_text = _build_context(chunks)
    history_window = history[-8:-1] if len(history) > 1 else []
    prompt_messages = [
        SystemMessage(content=system_prompt),
        *history_window,
        HumanMessage(
            content=(
                f"请基于以下知识内容回答用户问题。\n\n"
                f"【知识内容】\n{context_text}\n\n"
                f"【用户问题】\n{latest_user_message}"
            )
        ),
    ]

    parts: list[str] = []
    async with async_session_factory() as session:
        llm = await get_chat_model(session, temperature=0.2)
        async for chunk in llm.astream(prompt_messages):
            delta = _chunk_to_text(getattr(chunk, "content", ""))
            if not delta:
                continue
            parts.append(delta)
            await SSEManager.get_instance().send_event(
                session_id,
                "answer_delta",
                {"assistant_message_id": assistant_message_id, "delta": delta},
            )

    answer = "".join(parts).strip()
    if not answer:
        answer = "我暂时没能生成有效回答，请稍后重试。"
        await SSEManager.get_instance().send_event(
            session_id,
            "answer_delta",
            {"assistant_message_id": assistant_message_id, "delta": answer},
        )

    await emit_node_complete(
        session_id,
        "generate_answer",
        "回答生成完成",
        assistant_message_id=assistant_message_id,
        input_summary={
            "latest_user_message": latest_user_message[:500],
            "history_messages_used": len(history_window),
            "context_chunk_count": len(chunks),
        },
        output_summary={"answer_chars": len(answer), "grounded": True},
        progress=0.9,
    )

    return {
        "answer": answer,
        "execution_trace": set_step_state(
            execution_trace,
            assistant_message_id,
            "generate_answer",
            status="complete",
            message="回答生成完成",
        ),
        "current_node": "generate_answer",
        "progress": 0.9,
        "status_message": "回答生成完成",
    }
