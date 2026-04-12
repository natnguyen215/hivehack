from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger("emberpath.cache")

# TTL for cached routes — 5 minutes. Short enough to reflect new fire data,
# long enough to avoid re-running osmnx Dijkstra on repeated identical requests.
ROUTE_TTL_SECONDS = 300

_redis_client: Any = None  # lazy-initialised on first use


def _get_client() -> Any:
    """Return a connected Redis client, or None if Redis is unavailable."""
    global _redis_client

    if _redis_client is not None:
        return _redis_client

    try:
        import redis  # type: ignore[import]
    except ImportError:
        logger.warning("redis package not installed; caching disabled.")
        return None

    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    try:
        client = redis.Redis.from_url(redis_url, socket_connect_timeout=1, decode_responses=True)
        client.ping()
        logger.info("Redis cache connected at %s", redis_url)
        _redis_client = client
        return _redis_client
    except Exception as exc:
        logger.warning("Redis unavailable (%s); caching disabled for this request.", exc)
        return None


def get_cached_route(key: str) -> dict | None:
    """Return a cached route dict, or None if not cached or Redis is unavailable."""
    client = _get_client()
    if client is None:
        return None

    try:
        raw = client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.warning("Cache read failed for key %r: %s", key, exc)
        return None


def set_cached_route(key: str, data: dict, ttl: int = ROUTE_TTL_SECONDS) -> None:
    """Cache a route dict under the given key with a TTL."""
    client = _get_client()
    if client is None:
        return

    try:
        client.setex(key, ttl, json.dumps(data))
    except Exception as exc:
        logger.warning("Cache write failed for key %r: %s", key, exc)


def invalidate(key: str) -> None:
    """Delete a single cache entry. No-op if key doesn't exist or Redis is down."""
    client = _get_client()
    if client is None:
        return

    try:
        client.delete(key)
    except Exception as exc:
        logger.warning("Cache invalidation failed for key %r: %s", key, exc)


def flush_routes() -> int:
    """Delete all route cache entries (keys matching 'route:*'). Returns count deleted."""
    client = _get_client()
    if client is None:
        return 0

    try:
        keys = client.keys("route:*")
        if keys:
            return client.delete(*keys)
        return 0
    except Exception as exc:
        logger.warning("Cache flush failed: %s", exc)
        return 0
