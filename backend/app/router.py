from __future__ import annotations

import logging

import networkx as nx
import osmnx as ox
from shapely.geometry import Point, shape

from .graph import get_graph

logger = logging.getLogger("emberpath.router")

FIRE_PENALTY_MULTIPLIER = 9_999_999
FIRE_BUFFER_DEGREES = 0.01  # ~1 km


def _fire_geometry(fire_geojson: dict) -> dict:
    """Accept either GeoJSON Feature or Geometry payloads."""
    if fire_geojson.get("type") == "Feature":
        return fire_geojson["geometry"]
    return fire_geojson


def _penalized_graph(fire_geojson: dict) -> nx.MultiDiGraph:
    """Return a copy of the graph with edges near the fire polygon heavily penalized."""
    G = get_graph().copy()
    fire_shape = shape(_fire_geometry(fire_geojson))
    danger_zone = fire_shape.buffer(FIRE_BUFFER_DEGREES)

    for u, _v, _k, data in G.edges(data=True, keys=True):
        node = G.nodes[u]
        if danger_zone.contains(Point(node["x"], node["y"])):
            data["weight"] = data.get("length", 1) * FIRE_PENALTY_MULTIPLIER
        else:
            data["weight"] = data.get("length", 1)

    return G


def compute_route(
    origin: list[float],       # [lng, lat]
    destination: list[float],  # [lng, lat]
    fire_geojson: dict | None = None,
) -> dict:
    """
    Return a GeoJSON LineString for the safest path from origin to destination.
    If fire_geojson is provided, roads inside/near the fire polygon are penalized.
    """
    G = _penalized_graph(fire_geojson) if fire_geojson else get_graph()
    weight = "weight" if fire_geojson else "length"

    orig_node = ox.nearest_nodes(G, origin[0], origin[1])
    dest_node = ox.nearest_nodes(G, destination[0], destination[1])

    try:
        path_nodes = nx.shortest_path(G, orig_node, dest_node, weight=weight)
    except nx.NetworkXNoPath:
        logger.warning("No path found from %s to %s", origin, destination)
        return {"type": "LineString", "coordinates": []}

    coords = [[G.nodes[n]["x"], G.nodes[n]["y"]] for n in path_nodes]
    return {"type": "LineString", "coordinates": coords}
