"""Knowledge-chat service."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from sqlalchemy import delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from backend.app.core.sse import SSEManager
from backend.app.graphs.knowledge_chat.graph import knowledge_chat_graph
from backend.app.graphs.knowledge_chat.trace import (
    mark_trace_error,
    normalize_execution_trace,
)
from backend.app.models.knowledge_base import KBDocument, KnowledgeBase
from backend.app.models.knowledge_chat import KBChatMessage, KBChatSession
from backend.app.models.user import User
from backend.app.schemas.knowledge_chat import (
    KnowledgeChatMessageCreateRequest,
    KnowledgeChatMessageResponse,
    KnowledgeChatScopeDocument,
    KnowledgeChatSendMessageResponse,
    KnowledgeChatSessionCreateRequest,
    KnowledgeChatSessionListItem,
    KnowledgeChatSessionResponse,
)
from backend.app.services.kb_service import _check_kb_access, _get_kb_or_404

logger = logging.getLogger(__name__)

_background_tasks: set[asyncio.Task] = set()


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _scope_doc_ids(chat_session: KBChatSession) -> list[int]:
    raw = chat_session.scope or {}
    doc_ids = raw.get("doc_ids", [])
    return [int(doc_id) for doc_id in doc_ids if isinstance(doc_id, int)]


def _truncate_title(text: str, limit: int = 50) -> str:
    text = " ".join(text.strip().split())
    return text[:limit] if len(text) > limit else text


async def _resolve_scope_documents(
    kb_id: int,
    requested_doc_ids: list[int],
    user: User,
    session: AsyncSession,
) -> tuple[KnowledgeBase, list[KBDocument]]:
    kb = await _get_kb_or_404(kb_id, session)
    await _check_kb_access(kb, user, session)

    if requested_doc_ids:
        doc_ids = sorted(set(requested_doc_ids))
        stmt = select(KBDocument).where(
            KBDocument.knowledge_base_id == kb_id,
            KBDocument.id.in_(doc_ids),
            KBDocument.status == "ready",
        )
        docs = (await session.execute(stmt)).scalars().all()
        if len(docs) != len(doc_ids):
            raise BadRequestError("所选文档不存在、无权限或尚未处理完成")
    else:
        stmt = (
            select(KBDocument)
            .where(
                KBDocument.knowledge_base_id == kb_id,
                KBDocument.status == "ready",
            )
            .order_by(KBDocument.created_at.desc())
        )
        docs = (await session.execute(stmt)).scalars().all()

    if not docs:
        raise BadRequestError("当前知识库范围内没有可用于问答的就绪文档")

    return kb, docs


async def _get_chat_session_or_404(
    session_id: str, session: AsyncSession
) -> KBChatSession:
    result = await session.execute(
        select(KBChatSession).where(KBChatSession.id == session_id)
    )
    chat_session = result.scalar_one_or_none()
    if not chat_session:
        raise NotFoundError("Knowledge chat session")
    return chat_session


def _check_chat_session_owner(chat_session: KBChatSession, user: User) -> None:
    if chat_session.user_id != user.id and not user.is_admin:
        raise ForbiddenError("No access to this knowledge chat session")


async def _selected_documents(
    chat_session: KBChatSession, session: AsyncSession
) -> list[KnowledgeChatScopeDocument]:
    doc_ids = _scope_doc_ids(chat_session)
    if not doc_ids:
        return []

    stmt = select(KBDocument).where(KBDocument.id.in_(doc_ids))
    docs = {doc.id: doc for doc in (await session.execute(stmt)).scalars().all()}
    items: list[KnowledgeChatScopeDocument] = []
    for doc_id in doc_ids:
        doc = docs.get(doc_id)
        if doc is None:
            continue
        items.append(
            KnowledgeChatScopeDocument(
                id=doc.id,
                original_filename=doc.original_filename,
                file_type=doc.file_type,
            )
        )
    return items


def _build_message_response(message: KBChatMessage) -> KnowledgeChatMessageResponse:
    citations = message.citations if isinstance(message.citations, list) else []
    trace = message.trace if isinstance(message.trace, dict) else None
    return KnowledgeChatMessageResponse(
        id=message.id,
        session_id=message.session_id,
        role=message.role,
        content=message.content,
        status=message.status,
        citations=citations,
        trace=trace,
        retrieval_query=message.retrieval_query,
        error_message=message.error_message,
        created_at=message.created_at,
        updated_at=message.updated_at,
    )


async def _build_session_response(
    chat_session: KBChatSession,
    session: AsyncSession,
    *,
    message_count: int | None = None,
    include_messages: bool = False,
) -> KnowledgeChatSessionResponse:
    kb_result = await session.execute(
        select(KnowledgeBase.name).where(KnowledgeBase.id == chat_session.knowledge_base_id)
    )
    kb_name = kb_result.scalar_one_or_none() or "未知知识库"

    if message_count is None:
        count_result = await session.execute(
            select(func.count(KBChatMessage.id)).where(
                KBChatMessage.session_id == chat_session.id
            )
        )
        message_count = int(count_result.scalar_one() or 0)

    selected_docs = await _selected_documents(chat_session, session)
    messages_payload: list[KnowledgeChatMessageResponse] | None = None
    if include_messages:
        msg_result = await session.execute(
            select(KBChatMessage)
            .where(KBChatMessage.session_id == chat_session.id)
            .order_by(KBChatMessage.created_at, KBChatMessage.id)
        )
        messages_payload = [
            _build_message_response(msg) for msg in msg_result.scalars().all()
        ]

    return KnowledgeChatSessionResponse(
        id=chat_session.id,
        user_id=chat_session.user_id,
        title=chat_session.title,
        knowledge_base_id=chat_session.knowledge_base_id,
        knowledge_base_name=kb_name,
        status=chat_session.status,
        scope_doc_ids=_scope_doc_ids(chat_session),
        selected_documents=selected_docs,
        message_count=message_count,
        last_message_at=chat_session.last_message_at,
        created_at=chat_session.created_at,
        updated_at=chat_session.updated_at,
        messages=messages_payload,
    )


async def create_chat_session(
    req: KnowledgeChatSessionCreateRequest,
    user: User,
    session: AsyncSession,
) -> KnowledgeChatSessionResponse:
    kb, docs = await _resolve_scope_documents(req.knowledge_base_id, req.doc_ids, user, session)

    now = _now()
    chat_session = KBChatSession(
        user_id=user.id,
        knowledge_base_id=kb.id,
        title=f"{kb.name} 问答",
        scope={"doc_ids": [doc.id for doc in docs]},
        status="idle",
        last_message_at=now,
        created_at=now,
        updated_at=now,
    )
    session.add(chat_session)
    await session.flush()
    await session.refresh(chat_session)
    return await _build_session_response(chat_session, session, message_count=0)


async def list_chat_sessions(
    user: User,
    session: AsyncSession,
    *,
    limit: int = 100,
    offset: int = 0,
) -> list[KnowledgeChatSessionListItem]:
    count_subq = (
        select(
            KBChatMessage.session_id,
            func.count(KBChatMessage.id).label("message_count"),
        )
        .group_by(KBChatMessage.session_id)
        .subquery()
    )

    stmt = (
        select(
            KBChatSession,
            KnowledgeBase.name.label("knowledge_base_name"),
            func.coalesce(count_subq.c.message_count, 0).label("message_count"),
        )
        .join(KnowledgeBase, KnowledgeBase.id == KBChatSession.knowledge_base_id)
        .outerjoin(count_subq, count_subq.c.session_id == KBChatSession.id)
        .where(KBChatSession.user_id == user.id)
        .order_by(KBChatSession.last_message_at.desc(), KBChatSession.created_at.desc())
        .offset(offset)
        .limit(limit)
    )

    result = await session.execute(stmt)
    items: list[KnowledgeChatSessionListItem] = []
    for chat_session, knowledge_base_name, message_count in result.all():
        items.append(
            KnowledgeChatSessionListItem(
                id=chat_session.id,
                title=chat_session.title,
                knowledge_base_id=chat_session.knowledge_base_id,
                knowledge_base_name=knowledge_base_name or "未知知识库",
                status=chat_session.status,
                message_count=int(message_count or 0),
                selected_doc_count=len(_scope_doc_ids(chat_session)),
                last_message_at=chat_session.last_message_at,
                created_at=chat_session.created_at,
                updated_at=chat_session.updated_at,
            )
        )
    return items


async def get_chat_session(
    session_id: str,
    user: User,
    session: AsyncSession,
) -> KnowledgeChatSessionResponse:
    chat_session = await _get_chat_session_or_404(session_id, session)
    _check_chat_session_owner(chat_session, user)
    return await _build_session_response(chat_session, session, include_messages=True)


async def delete_chat_session(
    session_id: str,
    user: User,
    session: AsyncSession,
) -> None:
    chat_session = await _get_chat_session_or_404(session_id, session)
    _check_chat_session_owner(chat_session, user)

    await session.execute(
        delete(KBChatMessage).where(KBChatMessage.session_id == chat_session.id)
    )
    await session.delete(chat_session)


async def send_chat_message(
    session_id: str,
    req: KnowledgeChatMessageCreateRequest,
    user: User,
    session: AsyncSession,
) -> KnowledgeChatSendMessageResponse:
    chat_session = await _get_chat_session_or_404(session_id, session)
    _check_chat_session_owner(chat_session, user)

    content = req.content.strip()
    if not content:
        raise BadRequestError("消息内容不能为空")
    if chat_session.status == "streaming":
        raise BadRequestError("当前会话仍在生成回答，请稍候")

    msg_count_result = await session.execute(
        select(func.count(KBChatMessage.id)).where(KBChatMessage.session_id == session_id)
    )
    existing_message_count = int(msg_count_result.scalar_one() or 0)

    now = _now()
    user_message = KBChatMessage(
        session_id=session_id,
        role="user",
        content=content,
        status="complete",
        created_at=now,
        updated_at=now,
    )
    assistant_message = KBChatMessage(
        session_id=session_id,
        role="assistant",
        content="",
        status="streaming",
        citations=[],
        trace=None,
        created_at=now,
        updated_at=now,
    )
    session.add(user_message)
    session.add(assistant_message)
    await session.flush()
    await session.refresh(user_message)
    await session.refresh(assistant_message)
    assistant_message.trace = normalize_execution_trace(None, assistant_message.id)
    session.add(assistant_message)

    if existing_message_count == 0:
        chat_session.title = _truncate_title(content) or chat_session.title
    chat_session.status = "streaming"
    chat_session.last_message_at = now
    chat_session.updated_at = now
    session.add(chat_session)

    # Commit the user/assistant rows BEFORE spawning the background task.
    # Otherwise the worker (which opens a fresh session) may run before this
    # request's session commits and find no rows. This replaces the old
    # ``await asyncio.sleep(0.35)`` band-aid.
    await session.commit()
    # The dep ``get_session`` will try to commit again on cleanup; that is a
    # no-op on an already-committed session and is safe.

    session_payload = await _build_session_response(
        chat_session,
        session,
        message_count=existing_message_count + 2,
    )
    response = KnowledgeChatSendMessageResponse(
        session=session_payload,
        user_message=_build_message_response(user_message),
        assistant_message=_build_message_response(assistant_message),
    )

    task = asyncio.create_task(
        _answer_message_background(
            session_id=session_id,
            user_id=user.id,
            user_message_id=user_message.id,
            assistant_message_id=assistant_message.id,
        )
    )
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return response


def _db_messages_to_langchain(messages: list[KBChatMessage]) -> list[BaseMessage]:
    """Convert persisted chat rows to LangChain messages.

    Skips assistant rows that did not complete successfully (status != complete
    or empty content) so that broken/error responses are NOT replayed back into
    the model context on the next turn.
    """
    result: list[BaseMessage] = []
    for message in messages:
        content = (message.content or "").strip()
        if not content:
            continue
        if message.role == "user":
            result.append(HumanMessage(content=content))
        elif message.role == "assistant":
            if message.status != "complete":
                continue
            result.append(AIMessage(content=content))
    return result


async def _answer_message_background(
    *,
    session_id: str,
    user_id: int,
    user_message_id: int,
    assistant_message_id: int,
) -> None:
    from backend.app.core.database import async_session_factory

    sse = SSEManager.get_instance()
    await sse.send_event(
        session_id,
        "message_started",
        {
            "user_message_id": user_message_id,
            "assistant_message_id": assistant_message_id,
        },
    )

    try:
        async with async_session_factory() as session:
            chat_session = await _get_chat_session_or_404(session_id, session)
            if chat_session.user_id != user_id:
                raise ForbiddenError("No access to this knowledge chat session")

            msg_result = await session.execute(
                select(KBChatMessage)
                .where(KBChatMessage.session_id == session_id)
                .order_by(KBChatMessage.created_at, KBChatMessage.id)
            )
            all_messages = msg_result.scalars().all()

            user_message = next(
                (msg for msg in all_messages if msg.id == user_message_id and msg.role == "user"),
                None,
            )
            assistant_message = next(
                (msg for msg in all_messages if msg.id == assistant_message_id and msg.role == "assistant"),
                None,
            )
            if user_message is None or assistant_message is None:
                raise NotFoundError("Knowledge chat message")

            graph_history = [
                msg
                for msg in all_messages
                if msg.id != assistant_message_id
            ]
            langchain_history = _db_messages_to_langchain(graph_history)

            initial_state = {
                "session_id": session_id,
                "user_id": user_id,
                "knowledge_base_id": chat_session.knowledge_base_id,
                "scope_doc_ids": _scope_doc_ids(chat_session),
                "user_message_id": user_message_id,
                "assistant_message_id": assistant_message_id,
                "latest_user_message": user_message.content,
                "messages": langchain_history,
                "execution_trace": normalize_execution_trace(
                    assistant_message.trace, assistant_message_id
                ),
                "errors": [],
            }
            result = await knowledge_chat_graph.ainvoke(initial_state)

            assistant_message.content = str(result.get("answer", "")).strip()
            assistant_message.citations = result.get("citations", [])
            assistant_message.retrieval_query = result.get("retrieval_query")
            assistant_message.trace = normalize_execution_trace(
                result.get("execution_trace"), assistant_message_id
            )
            assistant_message.status = "complete"
            assistant_message.error_message = None
            assistant_message.updated_at = _now()
            session.add(assistant_message)

            chat_session.status = "idle"
            chat_session.updated_at = _now()
            chat_session.last_message_at = assistant_message.updated_at
            session.add(chat_session)
            await session.commit()

        await sse.send_event(
            session_id,
            "message_complete",
            {
                "assistant_message_id": assistant_message_id,
                "status": "complete",
            },
        )
    except Exception as exc:
        logger.error("Knowledge chat failed for %s: %s", session_id, exc, exc_info=True)
        error_message = str(exc)[:500] or "回答生成失败"

        try:
            async with async_session_factory() as session:
                assistant_msg = (
                    await session.execute(
                        select(KBChatMessage).where(KBChatMessage.id == assistant_message_id)
                    )
                ).scalar_one_or_none()
                chat_session = await _get_chat_session_or_404(session_id, session)

                if assistant_msg is not None:
                    assistant_msg.status = "error"
                    assistant_msg.error_message = error_message
                    assistant_msg.trace = mark_trace_error(
                        assistant_msg.trace,
                        assistant_message_id,
                        error_message=error_message,
                    )
                    assistant_msg.updated_at = _now()
                    session.add(assistant_msg)

                chat_session.status = "error"
                chat_session.updated_at = _now()
                session.add(chat_session)
                await session.commit()
        except Exception:
            logger.error("Failed to persist knowledge chat error state", exc_info=True)

        await sse.send_event(
            session_id,
            "message_error",
            {
                "assistant_message_id": assistant_message_id,
                "error": error_message,
            },
        )


async def assert_stream_access(
    session_id: str,
    *,
    user_id: int,
    session: AsyncSession,
) -> None:
    chat_session = await _get_chat_session_or_404(session_id, session)
    if chat_session.user_id != user_id:
        raise ForbiddenError("No access to this knowledge chat session")
