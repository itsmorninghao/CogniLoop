"""SSE one-time ticket store for secure stream authentication.

Browser EventSource cannot send custom headers, so we issue a short-lived
ticket via a normal authenticated POST, then exchange it at the SSE endpoint.
"""

import secrets
import time

_tickets: dict[str, tuple[int, float]] = {}


def issue_ticket(user_id: int, ttl: int = 30) -> str:
    """Issue a ticket for a user. Valid for `ttl` seconds (default 30)."""
    token = secrets.token_urlsafe(24)
    _tickets[token] = (user_id, time.monotonic() + ttl)
    return token


def consume_ticket(ticket: str) -> int | None:
    """Consume and validate a ticket. Returns user_id or None if invalid/expired."""
    entry = _tickets.pop(ticket, None)
    if not entry:
        return None
    user_id, exp = entry
    return user_id if time.monotonic() < exp else None
