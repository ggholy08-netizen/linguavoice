"""Origin checks, client identification and a small in-memory rate limiter."""
from __future__ import annotations

import time
from collections import deque

from starlette.requests import HTTPConnection

from .config import Settings


def origin_allowed(origin: str | None, settings: Settings) -> bool:
    if not origin:
        # Non-browser clients send no Origin. Browsers always send it on WebSocket and CORS requests.
        return False
    return origin.rstrip("/") in settings.allowed_origins


def client_key(conn: HTTPConnection, settings: Settings) -> str:
    if settings.trust_proxy_headers:
        fwd = conn.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return conn.client.host if conn.client else "unknown"


class RateLimiter:
    """Sliding-window limiter: at most `limit` events per `window` seconds per key (per process)."""

    def __init__(self, limit: int, window: float = 60.0):
        self.limit = limit
        self.window = window
        self.events: dict[str, deque[float]] = {}
        self._last_gc = time.monotonic()

    def allow(self, key: str) -> bool:
        if self.limit <= 0:
            return True
        now = time.monotonic()
        dq = self.events.setdefault(key, deque())
        while dq and now - dq[0] > self.window:
            dq.popleft()
        if len(dq) >= self.limit:
            return False
        dq.append(now)
        if now - self._last_gc > 300:
            self._gc(now)
        return True

    def _gc(self, now: float) -> None:
        self._last_gc = now
        for k in [k for k, dq in self.events.items() if not dq or now - dq[-1] > self.window]:
            self.events.pop(k, None)
