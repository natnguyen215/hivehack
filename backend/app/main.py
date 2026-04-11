from __future__ import annotations

import asyncio
import logging
from typing import List

import psycopg2
import redis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic_settings import BaseSettings

from .mock import LIVE_UPDATES, OVERLAY_GEOJSON, WILDFIRE_STATUS
from . import graph as graph_module
from . import router as routing
from . import db, cache
from .models import (
    GeoOverlay,
    LiveUpdate,
    OverlaysResponse,
    RouteRequest,
    RouteResponse,
    WildfireStatus,
)

logger = logging.getLogger("emberpath")
logging.basicConfig(level=logging.INFO)


class Settings(BaseSettings):
    database_url: str = "postgresql://ember:ember@postgres:5432/emberpath"
    redis_url: str = "redis://redis:6379/0"
    allowed_origins: List[str] = ["http://localhost:3000"]


settings = Settings()

app = FastAPI(title="EmberPath Mock API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _ping_postgres() -> None:
    try:
        conn = psycopg2.connect(settings.database_url, connect_timeout=1)
        conn.close()
        logger.info("Postgres connection established")
    except Exception as exc:  # pragma: no cover - best-effort logging
        logger.warning("Postgres ping failed: %s", exc)


def _ping_redis() -> None:
    try:
        client = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=1)
        client.ping()
        logger.info("Redis connection established")
    except Exception as exc:  # pragma: no cover - best-effort logging
        logger.warning("Redis ping failed: %s", exc)


async def _attempt_service_pings() -> None:
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _ping_postgres)
    await loop.run_in_executor(None, _ping_redis)


@app.on_event("startup")
async def startup_event() -> None:
    await _attempt_service_pings()
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, graph_module.get_graph)  # warm graph cache
    except Exception as exc:  # pragma: no cover - best-effort warmup
        logger.warning("Graph warmup failed: %s", exc)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/status", response_model=WildfireStatus)
def get_status() -> WildfireStatus:
    return WildfireStatus(**WILDFIRE_STATUS)


@app.post("/api/routes", response_model=RouteResponse)
def get_routes(request: RouteRequest) -> RouteResponse:
    logger.info("Route requested from %s overlays=%s", request.origin, request.overlays)
    cache_key = f"route:{request.origin}:{request.destination}:{request.timestamp}"
    cached = cache.get_cached_route(cache_key)
    if cached:
        return RouteResponse(**cached)

    fire_polygon = db.get_fire_polygon(request.timestamp)
    geometry = routing.compute_route(
        origin=request.origin,
        destination=request.destination,
        fire_geojson=fire_polygon,
    )

    result = {
        "recommended": {
            "id": "dynamic",
            "name": "Safest Evacuation Route",
            "distance_miles": 0.0,
            "duration_minutes": 0.0,
            "risk": "low" if fire_polygon else "unknown",
            "segments": [],
            "geometry": geometry,
        },
        "alternatives": [],
    }
    cache.set_cached_route(cache_key, result)
    return RouteResponse(**result)


@app.get("/api/overlays", response_model=OverlaysResponse)
def get_overlays() -> OverlaysResponse:
    overlays = [GeoOverlay(**payload) for payload in OVERLAY_GEOJSON.values()]
    return OverlaysResponse(overlays=overlays)


@app.get("/api/updates", response_model=list[LiveUpdate])
def get_live_updates() -> list[LiveUpdate]:
    return [LiveUpdate(**update) for update in LIVE_UPDATES]
