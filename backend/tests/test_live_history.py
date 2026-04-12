from __future__ import annotations

from urllib.parse import parse_qs, urlparse

from app import fire_data
from app import main
from app.historical_data import load_palisades_history
from app.models import RouteRequest


def _segments(points: list[list[float]]) -> list[tuple[list[float], list[float]]]:
    return list(zip(points, points[1:]))


def _orientation(a: list[float], b: list[float], c: list[float]) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _on_segment(a: list[float], b: list[float], point: list[float]) -> bool:
    epsilon = 1e-9
    return (
        min(a[0], b[0]) - epsilon <= point[0] <= max(a[0], b[0]) + epsilon
        and min(a[1], b[1]) - epsilon <= point[1] <= max(a[1], b[1]) + epsilon
        and abs(_orientation(a, b, point)) <= epsilon
    )


def _segments_intersect(
    a: list[float],
    b: list[float],
    c: list[float],
    d: list[float],
) -> bool:
    epsilon = 1e-9
    o1 = _orientation(a, b, c)
    o2 = _orientation(a, b, d)
    o3 = _orientation(c, d, a)
    o4 = _orientation(c, d, b)

    if (
        ((o1 > epsilon and o2 < -epsilon) or (o1 < -epsilon and o2 > epsilon))
        and ((o3 > epsilon and o4 < -epsilon) or (o3 < -epsilon and o4 > epsilon))
    ):
        return True

    return any(
        (
            _on_segment(a, b, c),
            _on_segment(a, b, d),
            _on_segment(c, d, a),
            _on_segment(c, d, b),
        )
    )


def _point_in_ring(point: list[float], ring: list[list[float]]) -> bool:
    x, y = point
    inside = False
    previous_index = len(ring) - 1

    for index, current in enumerate(ring):
        previous = ring[previous_index]
        intersects = (
            (current[1] > y) != (previous[1] > y)
            and x
            < (previous[0] - current[0]) * (y - current[1]) / ((previous[1] - current[1]) or 1e-12)
            + current[0]
        )
        if intersects:
            inside = not inside
        previous_index = index

    return inside


def _line_intersects_ring(line: list[list[float]], ring: list[list[float]]) -> bool:
    for start, end in _segments(line):
        if _point_in_ring(start, ring) or _point_in_ring(end, ring):
            return True

        for ring_start, ring_end in _segments(ring):
            if _segments_intersect(start, end, ring_start, ring_end):
                return True

    return False


def _polygon_rings(geometry: dict) -> list[list[list[float]]]:
    if geometry.get("type") == "Polygon":
        return [geometry["coordinates"][0]]
    if geometry.get("type") == "MultiPolygon":
        return [polygon[0] for polygon in geometry["coordinates"]]
    return []


def _route_intersects_snapshot(snapshot: dict) -> bool:
    line = snapshot["routeGeometry"]["coordinates"]
    for feature in snapshot["geojson"].get("features", []):
        for ring in _polygon_rings(feature.get("geometry", {})):
            if _line_intersects_ring(line, ring):
                return True
    return False


def test_get_live_uses_live_perimeters(monkeypatch) -> None:
    fire_feature_collection = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": "inc-1",
                    "name": "Alpha Fire",
                    "acres": 1450.5,
                    "severity": "moderate",
                    "updated_at": "2026-04-11T18:00:00Z",
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [-118.45, 34.05],
                            [-118.35, 34.05],
                            [-118.35, 34.12],
                            [-118.45, 34.12],
                            [-118.45, 34.05],
                        ]
                    ],
                },
            }
        ],
    }

    monkeypatch.setattr(main, "fetch_live_fire_perimeters", lambda: fire_feature_collection)
    monkeypatch.setattr(
        main,
        "key_incidents_from_feature_collection",
        lambda _fc: [
            {
                "id": "inc-1",
                "name": "Alpha Fire",
                "acres": 1450.5,
                "severity": "moderate",
                "updated_at": "2026-04-11T18:00:00Z",
                "display_status": None,
            }
        ],
    )

    response = main.get_live()

    fire_overlay = next(overlay for overlay in response.overlays if overlay.id == "fire_perimeters")
    assert fire_overlay.data == fire_feature_collection
    assert response.status.active_fires == 1
    assert response.key_incidents[0].name == "Alpha Fire"
    assert response.fetched_at.endswith("Z")


def test_get_status_uses_live_fire_count(monkeypatch) -> None:
    monkeypatch.setattr(
        main,
        "fetch_live_fire_perimeters",
        lambda: {
            "type": "FeatureCollection",
            "features": [{"type": "Feature"}, {"type": "Feature"}],
        },
    )

    response = main.get_status()

    assert response.active_fires == 2
    assert response.updated_at.endswith("Z")


def test_get_overlays_uses_live_fire_perimeters(monkeypatch) -> None:
    fire_feature_collection = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"id": "inc-1", "name": "Blue", "acres": 15.53, "severity": "low"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [-118.45, 34.05],
                            [-118.35, 34.05],
                            [-118.35, 34.12],
                            [-118.45, 34.12],
                            [-118.45, 34.05],
                        ]
                    ],
                },
            }
        ],
    }
    monkeypatch.setattr(main, "fetch_live_fire_perimeters", lambda: fire_feature_collection)
    monkeypatch.setattr(main, "fetch_smoke_plumes", lambda: {"type": "FeatureCollection", "features": []})

    response = main.get_overlays()

    fire_overlay = next(overlay for overlay in response.overlays if overlay.id == "fire_perimeters")
    assert fire_overlay.data == fire_feature_collection


def test_fetch_live_fire_perimeters_limits_query_to_california(monkeypatch) -> None:
    requested_url: dict[str, str] = {}

    def _fake_http_get_json(url: str, timeout_seconds: float = 9.0) -> dict:
        requested_url["value"] = url
        return {"type": "FeatureCollection", "features": []}

    monkeypatch.setattr(fire_data, "_http_get_json", _fake_http_get_json)

    response = fire_data.fetch_live_fire_perimeters(record_count=25, timeout_seconds=3.0)

    assert response == {"type": "FeatureCollection", "features": []}

    parsed = urlparse(requested_url["value"])
    params = parse_qs(parsed.query)
    assert params["geometry"] == [fire_data.CALIFORNIA_BBOX]
    assert params["resultRecordCount"] == ["25"]
    assert params["geometryType"] == ["esriGeometryEnvelope"]
    assert params["spatialRel"] == ["esriSpatialRelIntersects"]


def test_get_live_falls_back_to_mock_on_fetch_error(monkeypatch) -> None:
    def _raise_fetch_error() -> dict:
        raise RuntimeError("upstream unavailable")

    monkeypatch.setattr(main, "fetch_live_fire_perimeters", _raise_fetch_error)

    response = main.get_live()

    assert response.status.level == main.WILDFIRE_STATUS["level"]
    assert response.status.active_fires == main.WILDFIRE_STATUS["active_fires"]
    assert len(response.updates) == len(main.LIVE_UPDATES)
    assert response.key_incidents == []

    fire_overlay = next(overlay for overlay in response.overlays if overlay.id == "fire_perimeters")
    assert fire_overlay.data == main.OVERLAY_GEOJSON["fire_perimeters"]["data"]


def test_get_history_palisades_uses_loader(monkeypatch) -> None:
    payload = {
        "incident": {
            "id": "palisades-2025-calfd-000738",
            "name": "Palisades Fire (2025)",
            "start_at": "2025-01-07T22:11:44Z",
            "end_at": "2025-02-04T23:11:22Z",
            "description": "Curated archived perimeter checkpoints.",
        },
        "snapshots": [
            {
                "index": 0,
                "label": "Checkpoint 1",
                "timestamp": "2025-01-07T22:11:44Z",
                "acres": 771.57,
                "geojson": {"type": "FeatureCollection", "features": []},
                "routeBlocked": False,
                "routeName": "US-101 N",
                "routeRisk": "low",
                "routeGeometry": {
                    "type": "LineString",
                    "coordinates": [
                        [-118.2437, 34.0522],
                        [-119.6982, 34.4208],
                    ],
                },
            }
        ],
    }
    monkeypatch.setattr(main, "load_palisades_history", lambda: payload)

    response = main.get_history_palisades()

    assert response.incident.id == "palisades-2025-calfd-000738"
    assert response.snapshots[0].label == "Checkpoint 1"
    assert response.snapshots[0].routeRisk == "low"


def test_historical_snapshot_routes_stay_outside_fire_perimeters() -> None:
    payload = load_palisades_history()

    intersecting_labels = [
        snapshot["label"]
        for snapshot in payload["snapshots"]
        if _route_intersects_snapshot(snapshot)
    ]

    assert intersecting_labels == []


def test_get_routes_handles_missing_shapely(monkeypatch) -> None:
    baseline_route = {
        "id": "safe",
        "name": "Safest Evacuation Route",
        "distance_miles": 18.5,
        "duration_minutes": 27.0,
        "risk": "low",
        "type": "LineString",
        "coordinates": [[-118.2437, 34.0522], [-118.50, 34.20]],
    }

    monkeypatch.setattr(main, "shape", None)
    monkeypatch.setattr(main, "LineString", None)
    monkeypatch.setattr(
        main,
        "_compute_route_options",
        lambda _request, fire_geojson: [baseline_route],
    )
    monkeypatch.setattr(
        main,
        "fetch_live_fire_perimeters",
        lambda: {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"name": "Alpha Fire"},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [-118.45, 34.05],
                                [-118.35, 34.05],
                                [-118.35, 34.12],
                                [-118.45, 34.12],
                                [-118.45, 34.05],
                            ]
                        ],
                    },
                }
            ],
        },
    )

    request = RouteRequest(
        origin=[-118.2437, 34.0522],
        destination=[-119.6982, 34.4208],
        overlays=["fire_perimeters"],
        mode="live",
    )
    response = main.get_routes(request)

    assert response.recommended.id == "safe"
    assert response.fire_impact is not None
    assert response.fire_impact.blocked is False
    assert response.fire_impact.impacted_incidents == []
    assert response.fire_impact.overlap_segments == 0
