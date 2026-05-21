from __future__ import annotations

from typing import Any, Dict, List, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class WildfireStatus(BaseModel):
    level: str
    advisory: str
    active_fires: int = Field(..., ge=0)
    counties: List[str]
    updated_at: str


class RouteSegment(BaseModel):
    name: str
    distance_miles: float
    duration_minutes: float
    risk: str


class Route(BaseModel):
    id: str
    name: str
    distance_miles: float
    duration_minutes: float
    risk: str
    segments: List[RouteSegment]
    geometry: Dict[str, Any]


class RouteRequest(BaseModel):
    origin: Any  # string address or [lng, lat]
    destination: Any = [-119.6982, 34.4208]  # string address or [lng, lat]
    overlays: List[str] = []
    timestamp: str = "T+0"
    mode: Literal["live", "historical"] = "live"

    @field_validator("origin", "destination", mode="before")
    @classmethod
    def validate_coordinate_pair(cls, v: Any) -> Any:
        if not isinstance(v, (list, tuple)) or len(v) != 2:
            return v
        lng, lat = v
        try:
            lng, lat = float(lng), float(lat)
        except (TypeError, ValueError):
            raise ValueError("coordinate values must be numeric")
        if not (-180 <= lng <= 180):
            raise ValueError(f"longitude {lng} is out of range [-180, 180]")
        if not (-90 <= lat <= 90):
            raise ValueError(f"latitude {lat} is out of range [-90, 90]")
        return v


class FireImpact(BaseModel):
    blocked: bool = False
    impacted_incidents: List[str] = []
    overlap_segments: int | None = None


class RouteResponse(BaseModel):
    recommended: Route
    alternatives: List[Route]
    fire_impact: FireImpact | None = None

    @model_validator(mode="before")
    @classmethod
    def ensure_fire_impact_present(cls, data: Any) -> Any:
        if isinstance(data, dict) and "fire_impact" not in data:
            data["fire_impact"] = None
        return data


class GeoOverlay(BaseModel):
    id: str
    name: str
    category: str
    data: Dict[str, Any]


class OverlaysResponse(BaseModel):
    overlays: List[GeoOverlay]


class LiveUpdate(BaseModel):
    id: str
    category: str
    severity: str
    message: str
    timestamp: str


class KeyIncident(BaseModel):
    id: str
    name: str
    acres: float
    severity: str
    updated_at: str | None = None
    display_status: str | None = None


class LiveResponse(BaseModel):
    fetched_at: str
    status: WildfireStatus
    overlays: List[GeoOverlay]
    updates: List[LiveUpdate]
    key_incidents: List[KeyIncident]


class HistoricalSnapshot(BaseModel):
    index: int
    label: str
    timestamp: str
    acres: float
    geojson: Dict[str, Any]
    routeBlocked: bool
    routeName: str
    routeRisk: Literal["low", "moderate", "high"]
    routeGeometry: Dict[str, Any]


class HistoricalIncident(BaseModel):
    id: str
    name: str
    start_at: str
    end_at: str
    description: str


class HistoricalIncidentResponse(BaseModel):
    incident: HistoricalIncident
    snapshots: List[HistoricalSnapshot]
