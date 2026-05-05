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
import uuid
from collections import defaultdict, deque
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
    event_id: str = field(default_factory=lambda: uuid.uuid4().hex)


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
        for queue in queues:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning("SSE queue full for session %s", session_id)

        # Cross-process broadcast via Redis (best-effort) + per-session ring
        # buffer so that subscribers connecting after the event was dispatched
        # can replay what they missed.
        try:
            from backend.app.core.redis_pubsub import buffer_event, publish

            payload = {
                "event_id": event.event_id,
                "event_type": event_type,
                "timestamp": event.timestamp,
                "_source_pid": _PROCESS_ID,
                **(data or {}),
            }
            await publish(f"sse:{session_id}", payload)
            try:
                await buffer_event(session_id, payload)
            except Exception:
                logger.warning(
                    "SSE redis buffer FAILED for %s/%s",
                    session_id[:8],
                    event_type,
                    exc_info=True,
                )
        except Exception:
            logger.warning(
                "SSE redis publish FAILED for %s/%s",
                session_id[:8],
                event_type,
                exc_info=True,
            )

    async def create_subscriber(self, session_id: str) -> asyncio.Queue:
        """Eagerly register a subscriber queue and return it.

        Call this BEFORE returning an EventSourceResponse so the queue is
        registered immediately when the HTTP endpoint is called, not lazily
        when the response body starts streaming.

        The buffered-event replay happens later (inside ``consume``) to ensure
        the cross-process Redis bridge is running first; otherwise events
        published in the small window between buffer snapshot and bridge
        subscribe would be lost. With the bridge started first, replay may
        legitimately duplicate events that the bridge also forwards — the
        ``event_id`` dedup in ``consume`` is what keeps that clean.
        """
        queue: asyncio.Queue[SSEEvent | None] = asyncio.Queue(maxsize=200)
        self._queues[session_id].append(queue)
        logger.info(
            "SSE subscriber registered for session %s (total: %d)",
            session_id[:8],
            len(self._queues[session_id]),
        )
        return queue

    async def _replay_buffered(
        self, session_id: str, queue: asyncio.Queue
    ) -> int:
        try:
            from backend.app.core.redis_pubsub import fetch_buffered_events

            buffered = await fetch_buffered_events(session_id)
        except Exception:
            logger.warning(
                "SSE buffer fetch failed for %s",
                session_id[:8],
                exc_info=True,
            )
            return 0

        replayed = 0
        for payload in buffered:
            event_type = payload.get("event_type")
            if not isinstance(event_type, str) or not event_type:
                continue
            timestamp = payload.get("timestamp")
            try:
                event_timestamp = float(timestamp)
            except (TypeError, ValueError):
                event_timestamp = time.time()
            event_id = payload.get("event_id")
            if not isinstance(event_id, str) or not event_id:
                event_id = uuid.uuid4().hex
            data = {
                k: v
                for k, v in payload.items()
                if k not in {"event_id", "event_type", "timestamp", "_source_pid"}
            }
            try:
                queue.put_nowait(
                    SSEEvent(
                        event_type=event_type,
                        data=data,
                        timestamp=event_timestamp,
                        event_id=event_id,
                    )
                )
                replayed += 1
            except asyncio.QueueFull:
                break
        return replayed

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
        # Give the redis bridge a tick to actually subscribe before we replay
        # buffered events. This narrows the window where a concurrently
        # published event could land in neither the snapshot nor the bridge.
        # Any leftover overlap is handled by the event_id dedup below.
        await asyncio.sleep(0)
        await self._replay_buffered(session_id, queue)
        # Flush the response body immediately so the client / proxy / ASGI layer
        # commits to the stream before the first real event arrives. Without
        # this, the generator can sit on queue.get() for up to 30s before
        # yielding anything, and any teardown of a prior EventSource (e.g. a
        # page refresh) can race the new connection into being cancelled
        # before its first yield ever lands.
        yield {"comment": "ready"}
        # Dedup ring: events buffered in Redis are also forwarded by the cross-
        # process bridge in a small race window, so a subscriber may legitimately
        # receive the same event from two paths. event_id makes that recoverable.
        seen_ids: deque[str] = deque(maxlen=512)
        seen_set: set[str] = set()
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield {"comment": "keepalive"}
                    continue

                if event is None:
                    break

                if event.event_id in seen_set:
                    continue
                if len(seen_ids) == seen_ids.maxlen:
                    seen_set.discard(seen_ids[0])
                seen_ids.append(event.event_id)
                seen_set.add(event.event_id)

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
        queue = await self.create_subscriber(session_id)
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

                event_id = payload.get("event_id")
                if not isinstance(event_id, str) or not event_id:
                    event_id = uuid.uuid4().hex

                data = {
                    key: value
                    for key, value in payload.items()
                    if key not in {"event_id", "event_type", "timestamp", "_source_pid"}
                }
                queue.put_nowait(
                    SSEEvent(
                        event_type=event_type,
                        data=data,
                        timestamp=event_timestamp,
                        event_id=event_id,
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
    # The ring buffer is no longer useful once the session has completed; drop
    # it so a fresh subscriber for a new turn doesn't replay yesterday's events.
    try:
        from backend.app.core.redis_pubsub import clear_buffered_events

        await clear_buffered_events(session_id)
    except Exception:
        logger.warning(
            "SSE buffer clear failed for %s",
            session_id[:8],
            exc_info=True,
        )


async def emit_error(session_id: str, error: str) -> None:
    """Emit an error SSE event."""
    sse = SSEManager.get_instance()
    await sse.send_event(session_id, "error", {"error": error})
