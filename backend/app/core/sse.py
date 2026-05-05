"""
SSE Manager — Server-Sent Events for real-time quiz observability.

Custom implementation replacing LangSmith for better frontend integration.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections import defaultdict
from contextlib import suppress
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator

logger = logging.getLogger(__name__)
_PROCESS_ID = os.getpid()


@dataclass
class SSEEvent:
    """A single SSE event."""

    event_type: str  # node_start, node_complete, progress, error, complete
    data: dict
    timestamp: float = field(default_factory=time.time)


class SSEManager:
    """
    Manages per-session SSE connections.

    NOTE: Process-local singleton — in multi-worker deployments (uvicorn --workers N),
    each worker process has its own SSEManager. Background tasks running in worker A
    will not reach SSE clients connected to worker B. For multi-worker production use,
    replace this with a Redis Pub/Sub backed implementation.

    Usage in graph nodes:
        sse = SSEManager.get_instance()
        await sse.send_event(session_id, "node_start", {"node": "rag_retriever"})

    Usage in API:
        @app.get("/quiz-sessions/{id}/stream")
        async def stream(id):
            sse = SSEManager.get_instance()
            return EventSourceResponse(sse.subscribe(id))
    """

    _instance: SSEManager | None = None
    _queues: dict[str, list[asyncio.Queue]]

    def __init__(self):
        self._queues = defaultdict(list)

    @classmethod
    def get_instance(cls) -> SSEManager:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def send_event(
        self,
        session_id: str,
        event_type: str,
        data: dict | None = None,
    ) -> None:
        """Send an SSE event to all subscribers of a session."""
        event = SSEEvent(
            event_type=event_type,
            data=data or {},
        )

        queues = self._queues.get(session_id, [])
        logger.info(
            "SSE dispatch: %s/%s → %d subscriber(s)",
            session_id[:8],
            event_type,
            len(queues),
        )
        for queue in queues:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning("SSE queue full for session %s", session_id)

        # Cross-process broadcast via Redis (best-effort)
        try:
            from backend.app.core.redis_pubsub import publish

            await publish(
                f"sse:{session_id}",
                {
                    "event_type": event_type,
                    "timestamp": event.timestamp,
                    "_source_pid": _PROCESS_ID,
                    **(data or {}),
                },
            )
        except Exception:
            pass  # Redis unavailable — local queues still work

    def create_subscriber(self, session_id: str) -> asyncio.Queue:
        """Eagerly register a subscriber queue and return it.

        Call this BEFORE returning an EventSourceResponse so the queue is
        registered immediately when the HTTP endpoint is called, not lazily
        when the response body starts streaming.
        """
        queue: asyncio.Queue[SSEEvent | None] = asyncio.Queue(maxsize=100)
        self._queues[session_id].append(queue)
        logger.info(
            "SSE subscriber registered for session %s (total: %d)",
            session_id[:8],
            len(self._queues[session_id]),
        )
        return queue

    def remove_subscriber(self, session_id: str, queue: asyncio.Queue) -> None:
        """Remove a subscriber queue."""
        try:
            self._queues[session_id].remove(queue)
        except (ValueError, KeyError):
            pass
        if not self._queues.get(session_id):
            self._queues.pop(session_id, None)

    async def consume(
        self, session_id: str, queue: asyncio.Queue
    ) -> AsyncGenerator[dict, None]:
        """Consume events from a pre-registered queue.

        Yields dicts with ``event`` and ``data`` keys that
        ``sse_starlette.EventSourceResponse`` converts into proper
        ``ServerSentEvent`` objects.  Raw strings MUST NOT be used because
        ``EventSourceResponse`` wraps them with an extra ``data:`` prefix,
        which breaks the SSE ``event:`` field and causes the browser to fire
        generic ``message`` events instead of named event types.
        """
        redis_task = asyncio.create_task(self._pump_redis_events(session_id, queue))
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30)
                except asyncio.TimeoutError:
                    yield {"comment": "keepalive"}
                    continue

                if event is None:
                    break

                yield self._to_sse_dict(event)

                if event.event_type == "complete":
                    break

        finally:
            redis_task.cancel()
            with suppress(asyncio.CancelledError):
                await redis_task
            self.remove_subscriber(session_id, queue)

    async def subscribe(self, session_id: str) -> AsyncGenerator[dict, None]:
        """Subscribe to SSE events for a session.

        NOTE: prefer create_subscriber() + consume() for HTTP endpoints to avoid
        the lazy-iteration race condition with EventSourceResponse.
        """
        queue = self.create_subscriber(session_id)
        async for event_dict in self.consume(session_id, queue):
            yield event_dict

    async def close_session(self, session_id: str) -> None:
        """Close all subscribers for a session."""
        queues = self._queues.get(session_id, [])
        for queue in queues:
            queue.put_nowait(None)

    async def _pump_redis_events(
        self,
        session_id: str,
        queue: asyncio.Queue,
    ) -> None:
        """Forward cross-process SSE events from Redis into the local queue."""
        try:
            from backend.app.core.redis_pubsub import subscribe_channel

            async for payload in subscribe_channel(f"sse:{session_id}"):
                if not isinstance(payload, dict):
                    continue

                if payload.get("_source_pid") == _PROCESS_ID:
                    continue

                event_type = payload.get("event_type")
                if not isinstance(event_type, str) or not event_type:
                    continue

                timestamp = payload.get("timestamp")
                try:
                    event_timestamp = float(timestamp)
                except (TypeError, ValueError):
                    event_timestamp = time.time()

                data = {
                    key: value
                    for key, value in payload.items()
                    if key not in {"event_type", "timestamp", "_source_pid"}
                }
                queue.put_nowait(
                    SSEEvent(
                        event_type=event_type,
                        data=data,
                        timestamp=event_timestamp,
                    )
                )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning(
                "Redis SSE bridge stopped for session %s",
                session_id[:8],
                exc_info=True,
            )

    @staticmethod
    def _to_sse_dict(event: SSEEvent) -> dict:
        """Convert an SSEEvent to a dict that EventSourceResponse understands."""
        return {
            "event": event.event_type,
            "data": json.dumps(
                {
                    "type": event.event_type,
                    "timestamp": event.timestamp,
                    **event.data,
                },
                ensure_ascii=False,
            ),
        }


# Helper functions for graph nodes


async def emit_node_start(
    session_id: str, node_name: str, message: str = "", **extra: Any
) -> None:
    """Emit a node_start SSE event."""
    sse = SSEManager.get_instance()
    await sse.send_event(
        session_id,
        "node_start",
        {
            "node": node_name,
            "message": message or f"正在执行: {node_name}",
            **extra,
        },
    )


async def emit_node_complete(
    session_id: str,
    node_name: str,
    message: str = "",
    *,
    input_summary: dict | None = None,
    output_summary: dict | None = None,
    progress: float | None = None,
    **extra: Any,
) -> None:
    """Emit a node_complete SSE event with I/O summaries for traceability."""
    sse = SSEManager.get_instance()
    data: dict = {
        "node": node_name,
        "message": message,
        **extra,
    }
    if input_summary is not None:
        data["input_summary"] = input_summary
    if output_summary is not None:
        data["output_summary"] = output_summary
    if progress is not None:
        data["progress"] = progress
    await sse.send_event(session_id, "node_complete", data)


async def emit_progress(session_id: str, progress: float, message: str) -> None:
    """Emit a progress SSE event."""
    sse = SSEManager.get_instance()
    await sse.send_event(
        session_id,
        "progress",
        {
            "progress": progress,
            "message": message,
        },
    )


async def emit_complete(session_id: str, data: dict | None = None) -> None:
    """Emit a complete SSE event and close the session."""
    sse = SSEManager.get_instance()
    await sse.send_event(session_id, "complete", data or {})
    await sse.close_session(session_id)


async def emit_error(session_id: str, error: str) -> None:
    """Emit an error SSE event."""
    sse = SSEManager.get_instance()
    await sse.send_event(session_id, "error", {"error": error})
