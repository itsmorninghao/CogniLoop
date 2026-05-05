"""Short-lived stream auth tickets for SSE / WebSocket endpoints.

Browser EventSource cannot send custom headers, so the frontend first fetches a
short-lived signed ticket through a normal authenticated API request, then
passes that ticket to the stream endpoint as a query parameter.

The previous in-memory one-time store broke under multi-worker deployments
because the ticket could be issued by worker A and consumed by worker B.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt

from backend.app.core.config import settings

_PURPOSE = "stream_ticket"


def issue_ticket(user_id: int, ttl: int = 30) -> str:
    """Issue a signed ticket for a user. Valid for `ttl` seconds."""
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "purpose": _PURPOSE,
        "jti": secrets.token_urlsafe(8),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl)).timestamp()),
    }
    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def consume_ticket(ticket: str) -> int | None:
    """Validate a signed ticket and return the user_id if valid."""
    try:
        payload = jwt.decode(
            ticket,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError:
        return None

    if payload.get("purpose") != _PURPOSE:
        return None

    subject = payload.get("sub")
    try:
        return int(subject)
    except (TypeError, ValueError):
        return None
