"""Redis Pub/Sub helper for cross-process SSE broadcasting."""

import json

import redis.asyncio as aioredis

from backend.app.core.config import settings

_redis: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


async def publish(channel: str, data: dict) -> None:
    """Publish a JSON-serializable dict to a Redis channel."""
    await get_redis().publish(channel, json.dumps(data))


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
