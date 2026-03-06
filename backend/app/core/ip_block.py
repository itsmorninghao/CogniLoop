"""IP-based login failure tracking and blocking."""

import json
from datetime import datetime, timezone

from fastapi import Request

from backend.app.core.config import settings
from backend.app.core.redis_pubsub import get_redis

_HISTORY_KEY = "login_history"
_HISTORY_MAX = 200  # 最多保留最近 200 条记录
_ENABLED_KEY = "ip_block_enabled"  # "1" = on, absent/other = off (default off)


def get_client_ip(request: Request) -> str:
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def is_ip_blocked(ip: str) -> bool:
    if not await get_ip_block_enabled():
        return False
    return bool(await get_redis().exists(f"login_blocked:{ip}"))


async def record_login_failure(ip: str, username: str) -> None:
    r = get_redis()
    fail_key = f"login_fail:{ip}"
    block_key = f"login_blocked:{ip}"
    count = await r.incr(fail_key)
    await r.expire(fail_key, settings.LOGIN_FAIL_WINDOW_MINUTES * 60)
    if count >= settings.LOGIN_MAX_ATTEMPTS:
        await r.set(block_key, str(count), ex=settings.LOGIN_BLOCK_MINUTES * 60)
        await r.delete(fail_key)
    await _append_history(ip, username, success=False)


async def record_login_success(ip: str, username: str) -> None:
    await reset_login_failures(ip)
    await _append_history(ip, username, success=True)


async def reset_login_failures(ip: str) -> None:
    await get_redis().delete(f"login_fail:{ip}")


async def _append_history(ip: str, username: str, success: bool) -> None:
    r = get_redis()
    entry = json.dumps(
        {
            "ip": ip,
            "username": username,
            "success": success,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )
    await r.lpush(_HISTORY_KEY, entry)
    await r.ltrim(_HISTORY_KEY, 0, _HISTORY_MAX - 1)


# Admin helpers


async def get_ip_block_enabled() -> bool:
    return await get_redis().get(_ENABLED_KEY) == "1"


async def set_ip_block_enabled(enabled: bool) -> None:
    await get_redis().set(_ENABLED_KEY, "1" if enabled else "0")


async def list_blocked_ips() -> list[dict]:
    r = get_redis()
    result = []
    async for key in r.scan_iter("login_blocked:*"):
        ip = key.removeprefix("login_blocked:")
        ttl = await r.ttl(key)
        fail_count = await r.get(f"login_fail:{ip}")
        result.append(
            {"ip": ip, "ttl_seconds": ttl, "fail_count": int(fail_count or 0)}
        )
    return result


async def unblock_ip(ip: str) -> None:
    r = get_redis()
    await r.delete(f"login_blocked:{ip}", f"login_fail:{ip}")


async def block_ip_manually(ip: str) -> None:
    await get_redis().set(
        f"login_blocked:{ip}",
        "manual",
        ex=settings.LOGIN_BLOCK_MINUTES * 60,
    )


async def get_login_history(limit: int = 100) -> list[dict]:
    r = get_redis()
    entries = await r.lrange(_HISTORY_KEY, 0, min(limit, _HISTORY_MAX) - 1)
    return [json.loads(e) for e in entries]
