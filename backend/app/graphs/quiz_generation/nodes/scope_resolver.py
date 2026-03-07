"""
Node 1: Scope Resolver — resolves knowledge_scope into concrete document/KB IDs.
"""

from __future__ import annotations

import logging

from backend.app.core.database import async_session_factory
from backend.app.graphs.quiz_generation.state import QuizGenState

logger = logging.getLogger(__name__)


async def scope_resolver(state: QuizGenState) -> dict:
    """
    Resolve the knowledge_scope config into concrete IDs.

    Input: state["knowledge_scope"] = {
        "kb_ids": [1, 2],
        "folder_ids": [3],
        "doc_ids": [5, 6],
    }

    Output: resolved_doc_ids, resolved_kb_ids
    """
    from backend.app.core.sse import emit_node_complete, emit_node_start

    session_id = state.get("session_id", "")
    await emit_node_start(session_id, "scope_resolver", "正在解析知识范围...")

    # Pre-flight: verify LLM is configured before kicking off any LLM calls
    async with async_session_factory() as _session:
        from backend.app.services.config_service import get_config
        api_key = await get_config("OPENAI_API_KEY", _session)
    if not api_key:
        msg = "LLM 未配置：请在管理后台 → 系统配置中设置 OPENAI_API_KEY"
        await emit_node_complete(session_id, "scope_resolver", msg, progress=0.0)
        raise RuntimeError(msg)

    scope = state.get("knowledge_scope", {})
    kb_ids = scope.get("kb_ids", [])
    folder_ids = scope.get("folder_ids", [])
    doc_ids = scope.get("doc_ids", [])

    # Start with explicit doc_ids
    resolved_docs = list(doc_ids)
    resolved_kbs = list(kb_ids)

    # If folders are specified, we need to look up documents in those folders
    # For now, we pass folder_ids as part of the scope for the retriever
    # The retriever will handle folder-level filtering

    # If only kb_ids are given, use them directly for retrieval
    if not resolved_docs and not folder_ids and not resolved_kbs:
        logger.warning("Empty knowledge scope for session %s", state.get("session_id"))

    logger.info(
        "Scope resolved: %d KBs, %d folders, %d docs",
        len(resolved_kbs),
        len(folder_ids),
        len(resolved_docs),
    )

    msg = f"已解析知识范围：{len(resolved_kbs)} 个知识库，{len(resolved_docs)} 个文档"
    await emit_node_complete(
        session_id,
        "scope_resolver",
        msg,
        input_summary={"kb_ids": kb_ids, "folder_ids": folder_ids, "doc_ids": doc_ids},
        output_summary={
            "resolved_kb_count": len(resolved_kbs),
            "resolved_doc_count": len(resolved_docs),
        },
        progress=0.1,
    )

    return {
        "resolved_doc_ids": resolved_docs,
        "resolved_kb_ids": resolved_kbs,
        "current_node": "scope_resolver",
        "progress": 0.1,
        "status_message": msg,
    }
