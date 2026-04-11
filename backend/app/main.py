from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any, List

try:
    import psycopg2
except ImportError:  # pragma: no cover - optional in lightweight local runs
    psycopg2 = None

try:
    import redis
except ImportError:  # pragma: no cover - optional in lightweight local runs
    redis = None
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
try:
    from pydantic_settings import BaseSettings
except ImportError:  # pragma: no cover - optional in lightweight local runs
    from pydantic import BaseModel

    class BaseSettings(BaseModel):  # type: ignore[misc]
        """Fallback settings base when pydantic-settings is unavailable."""

        pass
try:
    from shapely.geometry import LineString, shape
    from shapely.geometry.base import BaseGeometry
except ImportError:  # pragma: no cover - optional dependency in local dev envs
    LineString = None
    shape = None
    BaseGeometry = Any

from . import cache
try:
    from . import graph as graph_module
except Exception:  # pragma: no cover - optional heavy dep path
    graph_module = None

try:
    from . import router as routing
except Exception:  # pragma: no cover - optional heavy dep path
    routing = None
from .fire_data import (
    fetch_live_fire_perimeters,
    key_incidents_from_feature_collection,
)
from .historical_data import load_palisades_history
from .mock import LIVE_UPDATES, MOCK_ROUTES, OVERLAY_GEOJSON, WILDFIRE_STATUS
from .models import (
    FireImpact,
    GeoOverlay,
    HistoricalIncidentResponse,
    LiveResponse,
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
    if psycopg2 is None:
        logger.warning("psycopg2 is unavailable; Postgres ping skipped")
        return

    try:
        conn = psycopg2.connect(settings.database_url, connect_timeout=1)
        conn.close()
        logger.info("Postgres connection established")
    except Exception as exc:  # pragma: no cover - best-effort logging
        logger.warning("Postgres ping failed: %s", exc)


def _ping_redis() -> None:
    if redis is None:
        logger.warning("redis package is unavailable; Redis ping skipped")
        return

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
    if graph_module is None:
        logger.warning("Graph module unavailable. Route warmup skipped.")
        return

    # Warm graph cache in background so startup doesn't block
    loop = asyncio.get_running_loop()
    try:
        loop.run_in_executor(None, graph_module.get_graph)
    except Exception as exc:  # pragma: no cover - best-effort warmup
        logger.warning("Graph warmup failed: %s", exc)


def _utc_now_iso() -> str:
    return datetime.now(tz=UTC).isoformat().replace("+00:00", "Z")


def _serialize_route_option(option: dict[str, Any]) -> dict[str, Any]:
    geometry_payload = option.get("geometry")
    if not isinstance(geometry_payload, dict):
        geometry_payload = {
            "type": option["type"],
            "coordinates": option["coordinates"],
        }

    return {
        "id": option["id"],
        "name": option["name"],
        "distance_miles": option["distance_miles"],
        "duration_minutes": option["duration_minutes"],
        "risk": option["risk"],
        "segments": option.get("segments", []),
        "geometry": geometry_payload,
    }


def _mock_route_options() -> list[dict[str, Any]]:
    def _normalize(payload: dict[str, Any]) -> dict[str, Any]:
        geometry = payload.get("geometry", {})
        return {
            "id": str(payload.get("id", "mock-route")),
            "name": str(payload.get("name", "Fallback Route")),
            "distance_miles": float(payload.get("distance_miles", 0.0)),
            "duration_minutes": float(payload.get("duration_minutes", 0.0)),
            "risk": str(payload.get("risk", "moderate")),
            "segments": payload.get("segments", []),
            "geometry": geometry,
            "type": geometry.get("type", "LineString"),
            "coordinates": geometry.get("coordinates", []),
        }

    options = [_normalize(MOCK_ROUTES["recommended"])]
    for route_payload in MOCK_ROUTES.get("alternatives", []):
        options.append(_normalize(route_payload))
    return options


def _safe_shape(geometry_payload: dict[str, Any] | None) -> BaseGeometry | None:
    if shape is None:
        return None

    if not geometry_payload:
        return None

    try:
        parsed = shape(geometry_payload)
    except Exception:
        return None

    if parsed.is_empty:
        return None

    if parsed.is_valid:
        return parsed

    try:
        repaired = parsed.buffer(0)
    except Exception:
        return None

    if repaired.is_empty or not repaired.is_valid:
        return None
    return repaired


def _route_geometry(route_option: dict[str, Any]) -> BaseGeometry | None:
    geometry_payload = route_option.get("geometry")
    if isinstance(geometry_payload, dict):
        return _safe_shape(geometry_payload)

    return _safe_shape(
        {
            "type": route_option.get("type"),
            "coordinates": route_option.get("coordinates"),
        }
    )


def _count_overlap_segments(
    route_geom: BaseGeometry | None,
    fire_geometries: list[BaseGeometry],
) -> int:
    if LineString is None:
        return 0

    if route_geom is None or route_geom.is_empty or not fire_geometries:
        return 0

    if isinstance(route_geom, LineString):
        lines: list[LineString] = [route_geom]
    elif route_geom.geom_type == "MultiLineString":
        lines = list(route_geom.geoms)
    else:
        return int(any(route_geom.intersects(fire_geom) for fire_geom in fire_geometries))

    overlap_segments = 0
    for line in lines:
        coords = list(line.coords)
        for idx in range(len(coords) - 1):
            segment = LineString([coords[idx], coords[idx + 1]])
            if any(segment.intersects(fire_geom) for fire_geom in fire_geometries):
                overlap_segments += 1
    return overlap_segments


def _detect_fire_impact(
    route_option: dict[str, Any],
    fire_feature_collection: dict[str, Any],
) -> FireImpact:
    route_geom = _route_geometry(route_option)
    if route_geom is None:
        return FireImpact(
            blocked=False,
            impacted_incidents=[],
            overlap_segments=0,
        )

    impacted_incidents: list[str] = []
    fire_geometries: list[BaseGeometry] = []

    for feature in fire_feature_collection.get("features", []):
        feature_geom = _safe_shape(feature.get("geometry"))
        if feature_geom is None:
            continue

        fire_geometries.append(feature_geom)
        if route_geom.intersects(feature_geom):
            properties = feature.get("properties", {})
            incident_name = (
                properties.get("name")
                or properties.get("IncidentName")
                or "Unnamed Incident"
            )
            if incident_name not in impacted_incidents:
                impacted_incidents.append(str(incident_name))

    overlap_segments = _count_overlap_segments(route_geom, fire_geometries)
    return FireImpact(
        blocked=overlap_segments > 0,
        impacted_incidents=impacted_incidents,
        overlap_segments=overlap_segments,
    )


def _live_overlays(fire_feature_collection: dict[str, Any]) -> list[GeoOverlay]:
    overlays: list[GeoOverlay] = []
    for payload in OVERLAY_GEOJSON.values():
        overlay_payload = dict(payload)
        if overlay_payload["id"] == "fire_perimeters":
            overlay_payload = {**overlay_payload, "data": fire_feature_collection}
        overlays.append(GeoOverlay(**overlay_payload))
    return overlays


def _fallback_live_response(fetched_at: str) -> LiveResponse:
    status_payload = {**WILDFIRE_STATUS, "updated_at": fetched_at}
    return LiveResponse(
        fetched_at=fetched_at,
        status=WildfireStatus(**status_payload),
        overlays=[GeoOverlay(**payload) for payload in OVERLAY_GEOJSON.values()],
        updates=[LiveUpdate(**update) for update in LIVE_UPDATES],
        key_incidents=[],
    )


def _compute_route_options(
    request: RouteRequest,
    fire_geojson: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    if routing is None:
        logger.warning("Routing engine unavailable; returning mock route options.")
        return _mock_route_options()

    try:
        route_options = routing.compute_routes(
            origin=request.origin,
            destination=request.destination,
            fire_geojson=fire_geojson,
        )
    except ValueError:
        raise
    except Exception as exc:
        logger.warning("Route computation failed; returning mock route options: %s", exc)
        return _mock_route_options()

    if not route_options:
        logger.warning("Route computation returned no options; returning mock route options.")
        return _mock_route_options()

    primary = route_options[0]
    primary_coords = primary.get("coordinates")
    if primary.get("id") == "unavailable" or not primary_coords:
        logger.warning("Route engine returned unavailable/empty route; returning mock route options.")
        return _mock_route_options()

    return route_options


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/status", response_model=WildfireStatus)
def get_status() -> WildfireStatus:
    return WildfireStatus(**WILDFIRE_STATUS)


@app.post("/api/routes", response_model=RouteResponse)
def get_routes(request: RouteRequest) -> RouteResponse:
    logger.info(
        "Route requested from %s overlays=%s mode=%s",
        request.origin,
        request.overlays,
        request.mode,
    )
    overlays_key = ",".join(sorted(request.overlays))
    cache_key = (
        f"route:{request.origin}:{request.destination}:"
        f"{request.timestamp}:{request.mode}:{overlays_key}"
    )
    cached = cache.get_cached_route(cache_key)
    if cached:
        return RouteResponse(**cached)

    try:
        baseline_routes = _compute_route_options(request, fire_geojson=None)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    route_options = baseline_routes
    fire_impact = FireImpact(
        blocked=False,
        impacted_incidents=[],
        overlap_segments=0,
    )

    fire_overlay_enabled = "fire_perimeters" in request.overlays
    if request.mode == "live" and fire_overlay_enabled and baseline_routes:
        try:
            live_fire_geojson = fetch_live_fire_perimeters()
        except Exception as exc:
            logger.warning("Live fire fetch failed for routing fallback: %s", exc)
            live_fire_geojson = OVERLAY_GEOJSON["fire_perimeters"]["data"]

        fire_impact = _detect_fire_impact(baseline_routes[0], live_fire_geojson)
        if fire_impact.blocked:
            try:
                route_options = _compute_route_options(request, fire_geojson=live_fire_geojson)
            except ValueError as exc:
                logger.warning("Fire-penalty reroute failed; returning baseline route: %s", exc)
                route_options = baseline_routes

    result = {
        "recommended": _serialize_route_option(route_options[0]),
        "alternatives": [_serialize_route_option(route) for route in route_options[1:]],
        "fire_impact": fire_impact.model_dump(),
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


@app.get("/api/live", response_model=LiveResponse)
def get_live() -> LiveResponse:
    fetched_at = _utc_now_iso()
    try:
        fire_feature_collection = fetch_live_fire_perimeters()
        status_payload = {
            **WILDFIRE_STATUS,
            "active_fires": len(fire_feature_collection.get("features", [])),
            "updated_at": fetched_at,
        }
        return LiveResponse(
            fetched_at=fetched_at,
            status=WildfireStatus(**status_payload),
            overlays=_live_overlays(fire_feature_collection),
            updates=[LiveUpdate(**update) for update in LIVE_UPDATES],
            key_incidents=key_incidents_from_feature_collection(fire_feature_collection),
        )
    except Exception as exc:
        logger.warning("Live endpoint falling back to mock payload: %s", exc)
        return _fallback_live_response(fetched_at)


@app.get("/api/history/palisades", response_model=HistoricalIncidentResponse)
def get_history_palisades() -> HistoricalIncidentResponse:
    payload = load_palisades_history()
    return HistoricalIncidentResponse(**payload)
