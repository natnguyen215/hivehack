from __future__ import annotations

from urllib.parse import parse_qs, urlparse

from app import fire_data
from app import main
from app.models import RouteRequest


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
