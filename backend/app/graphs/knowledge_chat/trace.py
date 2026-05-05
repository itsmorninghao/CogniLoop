"""Helpers for knowledge-chat execution trace persistence and SSE updates."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

TRACE_STEP_KEYS = ("rewrite_query", "retrieve_knowledge", "generate_answer")


def _default_steps() -> dict[str, dict[str, str | None]]:
    return {
        "rewrite_query": {"status": "pending", "message": None},
        "retrieve_knowledge": {"status": "pending", "message": None},
        "generate_answer": {"status": "pending", "message": None},
    }


def normalize_execution_trace(
    trace: Any,
    assistant_message_id: int,
) -> dict[str, Any]:
    base: dict[str, Any] = {
        "assistant_message_id": assistant_message_id,
        "current_step": None,
        "status_message": None,
        "steps": _default_steps(),
        "rewrite_query": None,
        "query_source": None,
        "history_turns_used": 0,
        "retrieval_query": None,
        "vector_result_count": 0,
        "keyword_result_count": 0,
        "hybrid_result_count": 0,
        "expanded_candidate_count": 0,
        "retrieval_results": [],
        "rerank_results": [],
    }
    if not isinstance(trace, dict):
        return base

    merged = deepcopy(base)
    for key, value in trace.items():
        if key == "steps" and isinstance(value, dict):
            for step_key, step_value in value.items():
                if step_key not in merged["steps"] or not isinstance(step_value, dict):
                    continue
                if "status" in step_value:
                    merged["steps"][step_key]["status"] = step_value["status"]
                if "message" in step_value:
                    merged["steps"][step_key]["message"] = step_value["message"]
            continue
        merged[key] = value

    merged["assistant_message_id"] = assistant_message_id
    return merged


def set_step_state(
    trace: Any,
    assistant_message_id: int,
    step_key: str,
    *,
    status: str,
    message: str | None = None,
) -> dict[str, Any]:
    next_trace = normalize_execution_trace(trace, assistant_message_id)
    if step_key not in next_trace["steps"]:
        return next_trace

    next_trace["steps"][step_key]["status"] = status
    if message is not None:
        next_trace["steps"][step_key]["message"] = message
        next_trace["status_message"] = message
    if status == "active":
        next_trace["current_step"] = step_key
    elif next_trace.get("current_step") == step_key and status in {"complete", "error"}:
        next_trace["current_step"] = None
    return next_trace


def set_rewrite_details(
    trace: Any,
    assistant_message_id: int,
    *,
    retrieval_query: str,
    query_source: str,
    history_turns_used: int,
) -> dict[str, Any]:
    next_trace = normalize_execution_trace(trace, assistant_message_id)
    next_trace["rewrite_query"] = retrieval_query
    next_trace["query_source"] = query_source
    next_trace["history_turns_used"] = history_turns_used
    next_trace["retrieval_query"] = retrieval_query
    return next_trace


def set_retrieval_details(
    trace: Any,
    assistant_message_id: int,
    *,
    retrieval_query: str,
    vector_result_count: int,
    keyword_result_count: int,
    hybrid_result_count: int,
    expanded_candidate_count: int,
    retrieval_results: list[dict],
) -> dict[str, Any]:
    next_trace = normalize_execution_trace(trace, assistant_message_id)
    next_trace["retrieval_query"] = retrieval_query
    next_trace["vector_result_count"] = vector_result_count
    next_trace["keyword_result_count"] = keyword_result_count
    next_trace["hybrid_result_count"] = hybrid_result_count
    next_trace["expanded_candidate_count"] = expanded_candidate_count
    next_trace["retrieval_results"] = retrieval_results
    return next_trace


def set_rerank_details(
    trace: Any,
    assistant_message_id: int,
    *,
    rerank_results: list[dict],
) -> dict[str, Any]:
    next_trace = normalize_execution_trace(trace, assistant_message_id)
    next_trace["rerank_results"] = rerank_results
    return next_trace


def mark_trace_error(
    trace: Any,
    assistant_message_id: int,
    *,
    error_message: str,
) -> dict[str, Any]:
    next_trace = normalize_execution_trace(trace, assistant_message_id)
    current_step = next_trace.get("current_step") or "generate_answer"
    return set_step_state(
        next_trace,
        assistant_message_id,
        current_step,
        status="error",
        message=error_message,
    )
