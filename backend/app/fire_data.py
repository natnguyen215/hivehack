from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlencode
from urllib.request import urlopen

try:
    from shapely.geometry import mapping, shape
except ImportError:  # pragma: no cover - optional dependency in local dev envs
    mapping = None
    shape = None

logger = logging.getLogger("emberpath.fire_data")

LIVE_PERIMETERS_URL = (
    "https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/"
    "USA_Wildfires_v1/FeatureServer/1/query"
)
NOAA_HMS_SMOKE_URL = (
    "https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/"
    "NOAA_Smoke_Polygons/FeatureServer/0/query"
)
CALIFORNIA_BBOX = "-124.48,32.53,-114.13,42.01"
USA_BBOX = "-125.0,24.0,-66.0,50.0"
LIVE_FIELDS = (
    "OBJECTID,IncidentName,GISAcres,DateCurrent,CurrentDateAge,IRWINID,"
    "IncidentTypeCategory"
)
SMOKE_FIELDS = "OBJECTID,Density,Satellite,Start,End"


def _http_get_json(url: str, timeout_seconds: float = 9.0) -> dict[str, Any]:
    with urlopen(url, timeout=timeout_seconds) as response:  # noqa: S310 - static host
        payload = response.read().decode("utf-8")
    return json.loads(payload)


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _parse_coordinate(value: Any) -> list[float]:
    if isinstance(value, str):
        parts = value.strip().split()
        if len(parts) >= 2:
            return [_safe_float(parts[0]), _safe_float(parts[1])]
        return [0.0, 0.0]

    if isinstance(value, (list, tuple)) and len(value) >= 2:
        return [_safe_float(value[0]), _safe_float(value[1])]

    return [0.0, 0.0]


def _normalize_coordinates(value: Any) -> Any:
    if isinstance(value, str):
        return _parse_coordinate(value)

    if isinstance(value, (list, tuple)):
        if not value:
            return []
        first = value[0]
        if isinstance(first, (int, float, str)):
            return _parse_coordinate(value)
        return [_normalize_coordinates(item) for item in value]

    return value


def _normalize_geometry(raw_geometry: dict[str, Any]) -> dict[str, Any]:
    geom_type = raw_geometry.get("type")
    coords = _normalize_coordinates(raw_geometry.get("coordinates", []))
    return {"type": geom_type, "coordinates": coords}


def _simplify_geometry(geometry: dict[str, Any], tolerance: float = 0.0006) -> dict[str, Any]:
    if shape is None or mapping is None:
        return geometry

    try:
        shapely_geom = shape(geometry)
    except Exception:
        return geometry

    if shapely_geom.is_empty:
        return geometry

    try:
        simplified = shapely_geom.simplify(tolerance, preserve_topology=True)
        if simplified.is_empty:
            return geometry
        return mapping(simplified)
    except Exception:
        return geometry


def _to_iso_utc(value: Any) -> str | None:
    if value is None:
        return None

    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
        return parsed.astimezone(UTC).isoformat().replace("+00:00", "Z")

    if isinstance(value, (int, float)):
        # ArcGIS date fields are milliseconds since epoch.
        if value > 10_000_000_000:
            value = value / 1000.0
        return datetime.fromtimestamp(value, tz=UTC).isoformat().replace("+00:00", "Z")

    return None


def severity_from_acres(acres: float) -> str:
    if acres >= 50_000:
        return "critical"
    if acres >= 10_000:
        return "high"
    if acres >= 1_000:
        return "moderate"
    return "low"


def _normalize_feature(feature: dict[str, Any]) -> dict[str, Any] | None:
    geometry = feature.get("geometry")
    if not geometry:
        return None

    normalized_geometry = _normalize_geometry(geometry)
    simplified_geometry = _simplify_geometry(normalized_geometry)

    props = feature.get("properties", {})
    acres = round(
        _safe_float(
            props.get("GISAcres")
            or props.get("acres")
            or props.get("area_acres")
            or 0.0
        ),
        2,
    )
    incident_name = str(
        props.get("IncidentName")
        or props.get("incidentName")
        or props.get("incident_name")
        or "Unnamed Incident"
    )
    incident_id = str(
        props.get("IRWINID")
        or props.get("recordId")
        or props.get("OBJECTID")
        or feature.get("id")
        or incident_name
    )

    updated_at = _to_iso_utc(
        props.get("DateCurrent")
        or props.get("poly_DateCurrent")
        or props.get("created")
        or props.get("CreateDate")
    )
    severity = severity_from_acres(acres)

    return {
        "type": "Feature",
        "geometry": simplified_geometry,
        "properties": {
            "id": incident_id,
            "name": incident_name,
            "acres": acres,
            "severity": severity,
            "updated_at": updated_at,
            "display_status": props.get("displayStatus"),
        },
    }


def fetch_live_fire_perimeters(
    record_count: int = 200,
    timeout_seconds: float = 12.0,
) -> dict[str, Any]:
    params = {
        "where": "IncidentTypeCategory='WF'",
        "outFields": LIVE_FIELDS,
        "returnGeometry": "true",
        "f": "geojson",
        "resultRecordCount": str(record_count),
        "orderByFields": "GISAcres DESC",
        "outSR": "4326",
        "geometry": CALIFORNIA_BBOX,
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
    }
    url = f"{LIVE_PERIMETERS_URL}?{urlencode(params)}"
    raw = _http_get_json(url, timeout_seconds=timeout_seconds)

    features = raw.get("features", [])
    normalized: list[dict[str, Any]] = []
    for feature in features:
        parsed = _normalize_feature(feature)
        if parsed is None:
            continue
        normalized.append(parsed)

    normalized.sort(
        key=lambda feature: _safe_float(feature["properties"].get("acres"), 0.0),
        reverse=True,
    )

    return {"type": "FeatureCollection", "features": normalized}


def _smoke_density_label(value: Any) -> str:
    raw = str(value).strip().lower() if value else ""
    if raw in ("heavy", "dense"):
        return "heavy"
    if raw in ("medium", "moderate"):
        return "medium"
    return "light"


def _normalize_smoke_feature(feature: dict[str, Any]) -> dict[str, Any] | None:
    geometry = feature.get("geometry")
    if not geometry:
        return None

    normalized_geometry = _normalize_geometry(geometry)
    simplified_geometry = _simplify_geometry(normalized_geometry, tolerance=0.002)

    props = feature.get("properties", {})
    density = _smoke_density_label(props.get("Density") or props.get("density"))
    satellite = str(props.get("Satellite") or props.get("satellite") or "Unknown")
    observed_at = _to_iso_utc(
        props.get("Start") or props.get("start") or props.get("CreateDate")
    )

    return {
        "type": "Feature",
        "geometry": simplified_geometry,
        "properties": {
            "name": f"{density.title()} Smoke",
            "density": density,
            "satellite": satellite,
            "observed_at": observed_at,
        },
    }


def fetch_smoke_plumes(
    record_count: int = 100,
    timeout_seconds: float = 10.0,
) -> dict[str, Any]:
    params = {
        "where": "1=1",
        "outFields": SMOKE_FIELDS,
        "returnGeometry": "true",
        "f": "geojson",
        "resultRecordCount": str(record_count),
        "outSR": "4326",
        "geometry": USA_BBOX,
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
    }
    url = f"{NOAA_HMS_SMOKE_URL}?{urlencode(params)}"
    raw = _http_get_json(url, timeout_seconds=timeout_seconds)

    features = raw.get("features", [])
    normalized: list[dict[str, Any]] = []
    for feature in features:
        parsed = _normalize_smoke_feature(feature)
        if parsed is None:
            continue
        normalized.append(parsed)

    return {"type": "FeatureCollection", "features": normalized}


def build_evacuation_zones(
    fire_feature_collection: dict[str, Any],
) -> dict[str, Any]:
    """Build evacuation zone polygons by buffering active fire perimeters.

    Uses Shapely to create a buffer around each fire perimeter, simulating
    evacuation zones.  Falls back to empty when Shapely is unavailable.
    """
    if shape is None or mapping is None:
        return {"type": "FeatureCollection", "features": []}

    features: list[dict[str, Any]] = []
    for fire_feature in fire_feature_collection.get("features", []):
        fire_geom = fire_feature.get("geometry")
        if not fire_geom:
            continue

        fire_props = fire_feature.get("properties", {})
        acres = _safe_float(fire_props.get("acres"), 0.0)
        incident_name = str(fire_props.get("name") or "Unnamed Incident")

        try:
            shapely_geom = shape(fire_geom)
        except Exception:
            continue

        if shapely_geom.is_empty:
            continue

        # Buffer distance scales with fire size (in degrees, ~0.01 ≈ 1km)
        buffer_deg = 0.02 if acres < 5000 else 0.04 if acres < 20000 else 0.06
        status = "voluntary" if acres < 5000 else "mandatory"

        try:
            zone_geom = shapely_geom.buffer(buffer_deg)
            if zone_geom.is_empty:
                continue
            zone_dict = mapping(zone_geom)
        except Exception:
            continue

        features.append({
            "type": "Feature",
            "geometry": _simplify_geometry(zone_dict, tolerance=0.001),
            "properties": {
                "name": f"{incident_name} Evacuation Zone",
                "zone_id": str(fire_props.get("id", incident_name)),
                "status": status,
                "acres": acres,
                "issued_at": fire_props.get("updated_at"),
            },
        })

    return {"type": "FeatureCollection", "features": features}


def key_incidents_from_feature_collection(
    feature_collection: dict[str, Any],
    max_items: int = 20,
) -> list[dict[str, Any]]:
    incidents: list[dict[str, Any]] = []
    for feature in feature_collection.get("features", []):
        props = feature.get("properties", {})
        incidents.append(
            {
                "id": str(props.get("id") or "unknown"),
                "name": str(props.get("name") or "Unnamed Incident"),
                "acres": _safe_float(props.get("acres"), 0.0),
                "severity": str(props.get("severity") or "low"),
                "updated_at": props.get("updated_at"),
                "display_status": props.get("display_status"),
            }
        )

    incidents.sort(key=lambda item: item["acres"], reverse=True)
    return incidents[:max_items]
