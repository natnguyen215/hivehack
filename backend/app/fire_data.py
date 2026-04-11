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
CALIFORNIA_BBOX = "-124.48,32.53,-114.13,42.01"
LIVE_FIELDS = (
    "OBJECTID,IncidentName,GISAcres,DateCurrent,CurrentDateAge,IRWINID,"
    "IncidentTypeCategory"
)


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
    record_count: int = 80,
    timeout_seconds: float = 9.0,
) -> dict[str, Any]:
    params = {
        "where": "IncidentTypeCategory='WF' AND CurrentDateAge<=2",
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


def key_incidents_from_feature_collection(
    feature_collection: dict[str, Any],
    max_items: int = 6,
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
