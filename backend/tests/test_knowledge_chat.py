"""Unit tests for knowledge_chat service helpers and schemas.

These tests cover the pure-Python helpers introduced/modified during the
kb-qa hardening pass:
- ``_safe_error_message`` — sanitizes exceptions before they reach the client.
- ``_db_messages_to_langchain`` — drops broken/error assistant rows so they
  are not replayed back into the model context.
- ``KnowledgeChatSessionCreateRequest`` — enforces the doc_ids cap.

We intentionally avoid spinning up the full app + LangGraph here; those paths
require an LLM and a populated KB and are exercised manually on the staging
deploy.
"""

from __future__ import annotations

import pytest

from backend.app.core.exceptions import BadRequestError
from backend.app.models.knowledge_chat import KBChatMessage
from backend.app.schemas.knowledge_chat import (
    MAX_SCOPE_DOC_IDS,
    KnowledgeChatSessionCreateRequest,
)
from backend.app.services.knowledge_chat_service import (
    GENERIC_FAILURE_MESSAGE,
    _db_messages_to_langchain,
    _safe_error_message,
    _truncate_title,
)


def test_safe_error_message_keeps_app_exception_detail() -> None:
    exc = BadRequestError("当前知识库范围内没有可用于问答的就绪文档")
    assert _safe_error_message(exc) == "当前知识库范围内没有可用于问答的就绪文档"


def test_safe_error_message_collapses_unknown_exception() -> None:
    exc = RuntimeError("postgres://user:secret@host/db connection refused")
    # Internal connection details must NOT leak to clients/DB.
    assert _safe_error_message(exc) == GENERIC_FAILURE_MESSAGE


def test_safe_error_message_truncates_long_detail() -> None:
    long_msg = "x" * 1000
    exc = BadRequestError(long_msg)
    out = _safe_error_message(exc)
    assert len(out) == 500
    assert out == "x" * 500


def _msg(role: str, content: str, status: str = "complete") -> KBChatMessage:
    return KBChatMessage(
        session_id="s",
        role=role,
        content=content,
        status=status,
    )


def test_db_messages_to_langchain_drops_broken_assistant_rows() -> None:
    msgs = [
        _msg("user", "问题 A"),
        _msg("assistant", "回答 A"),
        _msg("user", "问题 B"),
        _msg("assistant", "", status="error"),  # broken row, must be skipped
        _msg("user", "问题 C"),
    ]
    out = _db_messages_to_langchain(msgs)
    contents = [m.content for m in out]
    assert contents == ["问题 A", "回答 A", "问题 B", "问题 C"]


def test_db_messages_to_langchain_skips_blank_content() -> None:
    msgs = [
        _msg("user", "   "),
        _msg("user", "实际问题"),
    ]
    out = _db_messages_to_langchain(msgs)
    assert [m.content for m in out] == ["实际问题"]


def test_session_create_request_enforces_doc_ids_cap() -> None:
    # Exactly at the cap is fine.
    KnowledgeChatSessionCreateRequest(
        knowledge_base_id=1, doc_ids=list(range(MAX_SCOPE_DOC_IDS))
    )
    # One over the cap is rejected.
    with pytest.raises(ValueError):
        KnowledgeChatSessionCreateRequest(
            knowledge_base_id=1, doc_ids=list(range(MAX_SCOPE_DOC_IDS + 1))
        )


def test_truncate_title_collapses_whitespace_and_caps_length() -> None:
    assert _truncate_title("  hello   world  ") == "hello world"
    long = "字" * 200
    out = _truncate_title(long, limit=50)
    assert len(out) == 50
