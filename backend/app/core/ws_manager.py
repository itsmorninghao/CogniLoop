"""
WebSocket connection manager — maintains per-user connections.
"""

from __future__ import annotations

import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Manages active WebSocket connections, keyed by user_id."""

    def __init__(self) -> None:
        self._connections: dict[int, set[WebSocket]] = defaultdict(set)

    async def connect(self, user_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self._connections[user_id].add(ws)
        logger.debug(
            "WS connected user=%d (total=%d)", user_id, len(self._connections[user_id])
        )

    def disconnect(self, user_id: int, ws: WebSocket) -> None:
        self._connections[user_id].discard(ws)
        if not self._connections[user_id]:
            del self._connections[user_id]
        logger.debug("WS disconnected user=%d", user_id)

    async def push(self, user_id: int, data: dict) -> None:
        """Send a JSON message to all connections of the given user."""
        dead: list[WebSocket] = []
        for ws in list(self._connections.get(user_id, [])):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)

    async def push_unread_count(self, user_id: int, count: int) -> None:
        """Convenience method — push an unread-count update."""
        await self.push(user_id, {"type": "unread_count", "count": count})


ws_manager = WebSocketManager()
