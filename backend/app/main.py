from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import time
from datetime import UTC, datetime
from typing import Any, List
from urllib.parse import quote

try:
    import psycopg2
except ImportError:  # pragma: no cover - optional in lightweight local runs
    psycopg2 = None

try:
    import httpx
except ImportError:  # pragma: no cover - optional in lightweight local runs
    httpx = None

try:
    import redis
except ImportError:  # pragma: no cover - optional in lightweight local runs
    redis = None

try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.middleware import SlowAPIMiddleware
    from slowapi.util import get_remote_address
    _slowapi_available = True
except ImportError:  # pragma: no cover - installed via requirements.txt
    _slowapi_available = False

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
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
    build_evacuation_zones,
    fetch_live_fire_perimeters,
    fetch_smoke_plumes,
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

# Module-level cache for live fire perimeter data (avoids hammering ArcGIS on every request)
_fire_perimeter_cache: dict[str, Any] | None = None
_fire_perimeter_cache_ts: float = 0.0
_FIRE_PERIMETER_TTL = 60.0

if _slowapi_available:
    limiter = Limiter(key_func=get_remote_address, default_limits=["30/minute"])


class Settings(BaseSettings):
    database_url: str = "postgresql://ember:ember@postgres:5432/emberpath"
    redis_url: str = "redis://redis:6379/0"
    allowed_origins: List[str] = ["http://localhost:3000"]
    secret_key: str = "dev-secret-change-me"
    mapbox_token: str = ""
    allow_mock_fallback: bool = True


settings = Settings()

app = FastAPI(title="EmberPath Mock API", version="0.1.0")

if _slowapi_available:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

if _slowapi_available:
    app.add_middleware(SlowAPIMiddleware)


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


def _get_cached_fire_perimeters() -> dict[str, Any]:
    global _fire_perimeter_cache, _fire_perimeter_cache_ts
    if (
        _fire_perimeter_cache is not None
        and time.monotonic() - _fire_perimeter_cache_ts < _FIRE_PERIMETER_TTL
    ):
        return _fire_perimeter_cache
    data = fetch_live_fire_perimeters()
    _fire_perimeter_cache = data
    _fire_perimeter_cache_ts = time.monotonic()
    return data


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


def _parse_coords(value: Any) -> list[float] | None:
    """Extract [lng, lat] from a coordinate pair. Returns None for string addresses."""
    if isinstance(value, (list, tuple)) and len(value) == 2:
        try:
            return [float(value[0]), float(value[1])]
        except (TypeError, ValueError):
            return None
    return None


def _mock_route_options(
    origin: Any = None,
    destination: Any = None,
) -> list[dict[str, Any]]:
    origin_coords = _parse_coords(origin)
    dest_coords = _parse_coords(destination)

    def _normalize(payload: dict[str, Any]) -> dict[str, Any]:
        geometry = payload.get("geometry", {})
        coords = [list(c) for c in geometry.get("coordinates", [])]

        # Replace start/end coordinates with user-provided origin/destination
        if coords:
            if origin_coords:
                coords[0] = origin_coords
            if dest_coords:
                coords[-1] = dest_coords

        patched_geometry = {
            "type": geometry.get("type", "LineString"),
            "coordinates": coords,
        }
        return {
            "id": str(payload.get("id", "mock-route")),
            "name": str(payload.get("name", "Fallback Route")),
            "distance_miles": float(payload.get("distance_miles", 0.0)),
            "duration_minutes": float(payload.get("duration_minutes", 0.0)),
            "risk": str(payload.get("risk", "moderate")),
            "segments": payload.get("segments", []),
            "geometry": patched_geometry,
            "type": patched_geometry["type"],
            "coordinates": patched_geometry["coordinates"],
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
        # Conservative default: treat unextractable geometry as potentially unsafe
        # rather than assuming safe, to avoid routing users into unverified areas.
        logger.warning("Could not extract route geometry; treating route as blocked")
        return FireImpact(
            blocked=True,
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


def _live_overlays(
    fire_feature_collection: dict[str, Any],
    smoke_feature_collection: dict[str, Any] | None = None,
) -> list[GeoOverlay]:
    overlays: list[GeoOverlay] = []
    evac_data = build_evacuation_zones(fire_feature_collection)
    for payload in OVERLAY_GEOJSON.values():
        overlay_payload = dict(payload)
        if overlay_payload["id"] == "fire_perimeters":
            overlay_payload = {**overlay_payload, "data": fire_feature_collection}
        elif overlay_payload["id"] == "evacuation_zones":
            overlay_payload = {**overlay_payload, "data": evac_data}
        elif overlay_payload["id"] == "smoke_plumes" and smoke_feature_collection:
            overlay_payload = {**overlay_payload, "data": smoke_feature_collection}
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
        if not settings.allow_mock_fallback:
            raise HTTPException(status_code=503, detail="Routing service unavailable")
        logger.warning("Routing engine unavailable; returning mock route options.")
        return _mock_route_options(request.origin, request.destination)

    try:
        route_options = routing.compute_routes(
            origin=request.origin,
            destination=request.destination,
            fire_geojson=fire_geojson,
        )
    except ValueError:
        raise
    except Exception as exc:
        if not settings.allow_mock_fallback:
            raise HTTPException(status_code=503, detail="Routing service unavailable") from exc
        logger.warning("Route computation failed; returning mock route options: %s", exc)
        return _mock_route_options(request.origin, request.destination)

    if not route_options:
        if not settings.allow_mock_fallback:
            raise HTTPException(status_code=503, detail="Routing service unavailable")
        logger.warning("Route computation returned no options; returning mock route options.")
        return _mock_route_options(request.origin, request.destination)

    primary = route_options[0]
    primary_coords = primary.get("coordinates")
    if primary.get("id") == "unavailable" or not primary_coords:
        if not settings.allow_mock_fallback:
            raise HTTPException(status_code=503, detail="Routing service unavailable")
        logger.warning("Route engine returned unavailable/empty route; returning mock route options.")
        return _mock_route_options(request.origin, request.destination)

    return route_options


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/status", response_model=WildfireStatus)
def get_status() -> WildfireStatus:
    return WildfireStatus(**WILDFIRE_STATUS)


@app.post("/api/v1/routes", response_model=RouteResponse)
def get_routes(request: RouteRequest) -> RouteResponse:
    logger.info(
        "Route requested from %s overlays=%s mode=%s",
        request.origin,
        request.overlays,
        request.mode,
    )
    overlays_key = ",".join(sorted(request.overlays))
    cache_key_plaintext = (
        f"route:{request.origin}:{request.destination}:"
        f"{request.timestamp}:{request.mode}:{overlays_key}"
    )
    cache_key = hmac.new(
        settings.secret_key.encode(),
        cache_key_plaintext.encode(),
        hashlib.sha256,
    ).hexdigest()
    cached = cache.get_cached_route(cache_key)
    if cached:
        return RouteResponse(**cached)

    fire_overlay_enabled = "fire_perimeters" in request.overlays
    live_fire_geojson: dict[str, Any] | None = None

    # Always fetch live fire data when in live mode so routes account for fires
    if request.mode == "live" and fire_overlay_enabled:
        try:
            live_fire_geojson = fetch_live_fire_perimeters()
        except Exception as exc:
            logger.warning("Live fire fetch failed for routing: %s", exc)
            live_fire_geojson = OVERLAY_GEOJSON["fire_perimeters"]["data"]

    try:
        route_options = _compute_route_options(request, fire_geojson=live_fire_geojson)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    fire_impact = FireImpact(
        blocked=False,
        impacted_incidents=[],
        overlap_segments=0,
    )

    # Check fire impact on the recommended route
    if live_fire_geojson and route_options:
        fire_impact = _detect_fire_impact(route_options[0], live_fire_geojson)

    result = {
        "recommended": _serialize_route_option(route_options[0]),
        "alternatives": [_serialize_route_option(route) for route in route_options[1:]],
        "fire_impact": fire_impact.model_dump(),
    }
    cache.set_cached_route(cache_key, result)
    return RouteResponse(**result)


@app.get("/api/v1/overlays", response_model=OverlaysResponse)
def get_overlays() -> OverlaysResponse:
    overlays = [GeoOverlay(**payload) for payload in OVERLAY_GEOJSON.values()]
    return OverlaysResponse(overlays=overlays)


@app.get("/api/v1/updates", response_model=list[LiveUpdate])
def get_live_updates() -> list[LiveUpdate]:
    return [LiveUpdate(**update) for update in LIVE_UPDATES]


@app.get("/api/v1/live", response_model=LiveResponse)
@(limiter.limit("5/minute") if _slowapi_available else lambda f: f)
def get_live(request: Request) -> LiveResponse:
    fetched_at = _utc_now_iso()
    try:
        fire_feature_collection = _get_cached_fire_perimeters()
        smoke_feature_collection: dict[str, Any] | None = None
        try:
            smoke_feature_collection = fetch_smoke_plumes()
        except Exception as smoke_exc:
            logger.warning("Smoke plume fetch failed; using mock data: %s", smoke_exc)

        status_payload = {
            **WILDFIRE_STATUS,
            "active_fires": len(fire_feature_collection.get("features", [])),
            "updated_at": fetched_at,
        }
        return LiveResponse(
            fetched_at=fetched_at,
            status=WildfireStatus(**status_payload),
            overlays=_live_overlays(fire_feature_collection, smoke_feature_collection),
            updates=[LiveUpdate(**update) for update in LIVE_UPDATES],
            key_incidents=key_incidents_from_feature_collection(fire_feature_collection),
        )
    except Exception as exc:
        logger.warning("Live endpoint falling back to mock payload: %s", exc)
        return _fallback_live_response(fetched_at)


@app.get("/api/v1/history/palisades", response_model=HistoricalIncidentResponse)
def get_history_palisades() -> HistoricalIncidentResponse:
    payload = load_palisades_history()
    return HistoricalIncidentResponse(**payload)


@app.get("/api/v1/proxy/directions/{profile}/{coordinates:path}")
async def proxy_directions(profile: str, coordinates: str, request: Request) -> Any:
    if httpx is None:
        raise HTTPException(status_code=503, detail="httpx is not installed")
    if not settings.mapbox_token:
        raise HTTPException(status_code=503, detail="MAPBOX_TOKEN not configured")

    params = {k: v for k, v in request.query_params.items() if k != "access_token"}
    params["access_token"] = settings.mapbox_token

    url = f"https://api.mapbox.com/directions/v5/mapbox/{profile}/{coordinates}"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, params=params, timeout=10.0)

    if not resp.is_success:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@app.get("/api/v1/proxy/geocoding/suggest")
async def proxy_geocoding_suggest(
    q: str,
    proximity: str | None = None,
    country: str | None = None,
    limit: int = 5,
) -> Any:
    if httpx is None:
        raise HTTPException(status_code=503, detail="httpx is not installed")
    if not settings.mapbox_token:
        raise HTTPException(status_code=503, detail="MAPBOX_TOKEN not configured")

    params: dict[str, Any] = {
        "access_token": settings.mapbox_token,
        "types": "place,address,poi",
        "bbox": "-124.48,32.53,-114.13,42.01",
        "limit": str(limit),
    }
    if country:
        params["country"] = country
    if proximity:
        params["proximity"] = proximity

    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{quote(q)}.json"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, params=params, timeout=10.0)

    if not resp.is_success:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


# ---------------------------------------------------------------------------
# Legacy /api/* → /api/v1/* redirects (301 Moved Permanently)
# Keeps existing clients working while they migrate to versioned paths.
# ---------------------------------------------------------------------------

@app.get("/api/status")
def redirect_status() -> RedirectResponse:
    return RedirectResponse(url="/api/v1/status", status_code=301)


@app.post("/api/routes")
def redirect_routes() -> RedirectResponse:
    return RedirectResponse(url="/api/v1/routes", status_code=301)


@app.get("/api/overlays")
def redirect_overlays() -> RedirectResponse:
    return RedirectResponse(url="/api/v1/overlays", status_code=301)


@app.get("/api/updates")
def redirect_updates() -> RedirectResponse:
    return RedirectResponse(url="/api/v1/updates", status_code=301)


@app.get("/api/live")
def redirect_live() -> RedirectResponse:
    return RedirectResponse(url="/api/v1/live", status_code=301)


@app.get("/api/history/palisades")
def redirect_history_palisades() -> RedirectResponse:
    return RedirectResponse(url="/api/v1/history/palisades", status_code=301)


@app.get("/api/proxy/directions/{profile}/{coordinates:path}")
def redirect_proxy_directions(profile: str, coordinates: str, request: Request) -> RedirectResponse:
    qs = request.url.query
    url = f"/api/v1/proxy/directions/{profile}/{coordinates}"
    if qs:
        url = f"{url}?{qs}"
    return RedirectResponse(url=url, status_code=301)


@app.get("/api/proxy/geocoding/suggest")
def redirect_proxy_geocoding_suggest(request: Request) -> RedirectResponse:
    qs = request.url.query
    url = "/api/v1/proxy/geocoding/suggest"
    if qs:
        url = f"{url}?{qs}"
    return RedirectResponse(url=url, status_code=301)
