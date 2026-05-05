"""Redis Pub/Sub helper for cross-process SSE broadcasting."""

import json

import redis.asyncio as aioredis

from backend.app.core.config import settings

_redis: aioredis.Redis | None = None

# Per-session event ring buffer kept in Redis so a late-arriving SSE
# subscriber (e.g. the HTTP stream that opens after the POST that started the
# graph) can catch up on events that were dispatched before it connected.
SSE_BUFFER_MAX = 100
SSE_BUFFER_TTL = 300  # seconds


def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


def _buffer_key(session_id: str) -> str:
    return f"sse:buf:{session_id}"


async def publish(channel: str, data: dict) -> None:
    """Publish a JSON-serializable dict to a Redis channel."""
    await get_redis().publish(channel, json.dumps(data))


async def buffer_event(session_id: str, data: dict) -> None:
    """Append an event to the per-session ring buffer.

    Best-effort: failures are swallowed by the caller because the buffer is a
    nice-to-have replay for late subscribers, not authoritative state.
    """
    key = _buffer_key(session_id)
    payload = json.dumps(data)
    redis_client = get_redis()
    pipe = redis_client.pipeline(transaction=False)
    pipe.rpush(key, payload)
    pipe.ltrim(key, -SSE_BUFFER_MAX, -1)
    pipe.expire(key, SSE_BUFFER_TTL)
    await pipe.execute()


async def fetch_buffered_events(session_id: str) -> list[dict]:
    """Return the buffered events for a session in original order."""
    key = _buffer_key(session_id)
    raw = await get_redis().lrange(key, 0, -1)
    out: list[dict] = []
    for item in raw:
        try:
            out.append(json.loads(item))
        except (TypeError, ValueError):
            continue
    return out


async def clear_buffered_events(session_id: str) -> None:
    """Remove the per-session ring buffer, e.g. when the session completes."""
    await get_redis().delete(_buffer_key(session_id))


async def subscribe_channel(channel: str):
    """Async generator yielding dict messages from a Redis channel."""
    pubsub = get_redis().pubsub()
    await pubsub.subscribe(channel)
    try:
        async for msg in pubsub.listen():
            if msg["type"] == "message":
                yield json.loads(msg["data"])
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()
