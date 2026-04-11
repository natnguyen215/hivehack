from __future__ import annotations

from typing import Any, Dict, List

from pydantic import BaseModel, Field


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
    origin: List[float]  # [lng, lat]
    destination: List[float] = [-119.6982, 34.4208]  # default: Santa Barbara
    overlays: List[str] = []
    timestamp: str = "T+0"


class RouteResponse(BaseModel):
    recommended: Route
    alternatives: List[Route]


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
