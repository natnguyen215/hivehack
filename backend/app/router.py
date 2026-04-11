from __future__ import annotations

import logging
from typing import Any

try:
    import networkx as nx
except ImportError:  # pragma: no cover - optional dependency in local dev envs
    nx = None
    NetworkXNoPath = RuntimeError
else:
    NetworkXNoPath = nx.NetworkXNoPath

try:
    import osmnx as ox
except ImportError:  # pragma: no cover - optional dependency in local dev envs
    ox = None

try:
    from shapely.geometry import LineString, mapping, shape
    from shapely.geometry.base import BaseGeometry
    from shapely.ops import unary_union
except ImportError:  # pragma: no cover - optional dependency in local dev envs
    LineString = None
    mapping = None
    shape = None
    unary_union = None
    BaseGeometry = Any

logger = logging.getLogger("emberpath.router")

FIRE_PENALTY_MULTIPLIER = 9_999_999
FIRE_BUFFER_DEGREES = 0.01  # ~1 km
HIGHWAY_PENALTY_MULTIPLIER = 1.65
ALT_PATH_PENALTY_MULTIPLIER = 3.25
MAJOR_HIGHWAY_TYPES = {
    "motorway",
    "motorway_link",
    "trunk",
    "trunk_link",
}


def _unavailable_routes() -> list[dict[str, Any]]:
    return [
        {
            "id": "unavailable",
            "name": "No Available Route",
            "risk": "high",
            "segments": [],
            "type": "LineString",
            "coordinates": [],
            "distance_miles": 0.0,
            "duration_minutes": 0.0,
        }
    ]


def _get_graph_or_raise() -> Any:
    try:
        from .graph import get_graph
    except Exception as exc:  # pragma: no cover - import safety
        raise RuntimeError("Routing graph module is unavailable.") from exc
    return get_graph()

ROUTE_PROFILES: list[dict[str, Any]] = [
    {
        "id": "safe",
        "name": "Safest Evacuation Route",
        "metric": "length",
        "avoid_highways": False,
    },
    {
        "id": "fast",
        "name": "Fastest Open Route",
        "metric": "travel_time",
        "avoid_highways": False,
    },
    {
        "id": "local",
        "name": "Lower-Exposure Local Route",
        "metric": "length",
        "avoid_highways": True,
    },
]

# Well-known locations for string-based origin/destination
KNOWN_LOCATIONS: dict[str, list[float]] = {
    "los angeles": [-118.2437, 34.0522],
    "la": [-118.2437, 34.0522],
    "los angeles, ca": [-118.2437, 34.0522],
    "santa barbara": [-119.6982, 34.4208],
    "santa barbara, ca": [-119.6982, 34.4208],
    "ventura": [-119.2290, 34.2746],
    "ventura, ca": [-119.2290, 34.2746],
    "malibu": [-118.7798, 34.0259],
    "malibu, ca": [-118.7798, 34.0259],
    "pasadena": [-118.1445, 34.1478],
    "pasadena, ca": [-118.1445, 34.1478],
    "santa monica": [-118.4912, 34.0195],
    "santa monica, ca": [-118.4912, 34.0195],
    "calabasas": [-118.6387, 34.1367],
    "calabasas, ca": [-118.6387, 34.1367],
    "thousand oaks": [-118.8370, 34.1706],
    "thousand oaks, ca": [-118.8370, 34.1706],
    "oxnard": [-119.1771, 34.1975],
    "oxnard, ca": [-119.1771, 34.1975],
    "downtown la": [-118.2437, 34.0522],
}


def resolve_location(loc: str | list[float]) -> list[float]:
    """Convert a string address or [lng, lat] list to [lng, lat] coordinates."""
    if isinstance(loc, list):
        if len(loc) != 2:
            raise ValueError("Coordinate list must be [lng, lat].")
        return [float(loc[0]), float(loc[1])]

    key = str(loc).strip().lower()
    if key in KNOWN_LOCATIONS:
        return KNOWN_LOCATIONS[key]

    if ox is None:
        raise ValueError(
            f"Could not geocode '{loc}'. Pick a suggested place or pass coordinates."
        )

    try:
        point = ox.geocode(str(loc))
        # ox.geocode returns (lat, lng)
        return [point[1], point[0]]
    except Exception as exc:
        raise ValueError(
            f"Could not geocode '{loc}'. Pick a suggested place or pass coordinates."
        ) from exc


def _fire_geometry(fire_geojson: dict) -> dict:
    """Accept GeoJSON Feature, FeatureCollection, or Geometry payloads."""
    if fire_geojson.get("type") == "Feature":
        return fire_geojson["geometry"]
    if fire_geojson.get("type") == "FeatureCollection":
        if shape is None or mapping is None or unary_union is None:
            for feat in fire_geojson.get("features", []):
                geom = feat.get("geometry")
                if geom:
                    return geom
            return {"type": "GeometryCollection", "geometries": []}

        geometries: list[BaseGeometry] = []
        for feat in fire_geojson.get("features", []):
            geom = feat.get("geometry")
            if not geom:
                continue
            try:
                shaped = shape(geom)
            except Exception:
                continue
            if not shaped.is_empty:
                geometries.append(shaped)

        if not geometries:
            return {"type": "GeometryCollection", "geometries": []}

        if len(geometries) == 1:
            return mapping(geometries[0])
        return mapping(unary_union(geometries))
    return fire_geojson


def _safe_float(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _edge_base_weight(data: dict[str, Any], metric: str) -> float:
    length_m = _safe_float(data.get("length"), 1.0)
    if metric == "travel_time":
        # 13.4 m/s ~= 30 mph fallback when OSM travel_time is absent
        return _safe_float(data.get("travel_time"), length_m / 13.4)
    return length_m


def _is_major_highway(data: dict[str, Any]) -> bool:
    highway = data.get("highway")
    if isinstance(highway, (list, tuple, set)):
        values = {str(v).lower() for v in highway}
    elif highway is None:
        values = set()
    else:
        values = {str(highway).lower()}
    return bool(values & MAJOR_HIGHWAY_TYPES)


def _edge_linestring(
    G: nx.MultiDiGraph,
    u: int,
    v: int,
    data: dict[str, Any],
) -> LineString:
    if LineString is None:
        raise RuntimeError("LineString is unavailable because shapely is not installed.")

    geom = data.get("geometry")
    if isinstance(geom, LineString):
        return geom
    return LineString(
        [
            (G.nodes[u]["x"], G.nodes[u]["y"]),
            (G.nodes[v]["x"], G.nodes[v]["y"]),
        ]
    )


def _weighted_graph(
    fire_geojson: dict | None,
    metric: str,
    avoid_highways: bool,
) -> tuple[nx.MultiDiGraph, BaseGeometry | None]:
    """
    Return a graph weighted for a specific routing profile.
    Weights combine distance/time, major-highway penalties, and fire penalties.
    """
    if nx is None:
        raise RuntimeError("networkx is unavailable; cannot compute routes.")
    if ox is None:
        raise RuntimeError("osmnx is unavailable; cannot compute routes.")

    G = _get_graph_or_raise().copy()
    danger_zone: BaseGeometry | None = None

    if fire_geojson and shape is not None:
        fire_shape = shape(_fire_geometry(fire_geojson))
        danger_zone = fire_shape.buffer(FIRE_BUFFER_DEGREES)

    for u, v, _k, data in G.edges(data=True, keys=True):
        edge_weight = _edge_base_weight(data, metric)

        if avoid_highways and _is_major_highway(data):
            edge_weight *= HIGHWAY_PENALTY_MULTIPLIER

        if danger_zone is not None and LineString is not None:
            edge_line = _edge_linestring(G, u, v, data)
            if edge_line.intersects(danger_zone):
                edge_weight *= FIRE_PENALTY_MULTIPLIER

        data["weight"] = max(edge_weight, 0.001)

    return G, danger_zone


def _choose_edge_data(
    edge_data: dict[Any, dict[str, Any]],
    weight_key: str,
) -> dict[str, Any]:
    best_key = min(
        edge_data,
        key=lambda key: _safe_float(
            edge_data[key].get(weight_key),
            _safe_float(edge_data[key].get("length"), float("inf")),
        ),
    )
    return edge_data[best_key]


def _apply_path_penalty(
    G: nx.MultiDiGraph,
    path_nodes: list[int],
    multiplier: float,
) -> None:
    """Penalize every edge between path node pairs to force alternate routes."""
    if multiplier <= 1:
        return

    for i in range(len(path_nodes) - 1):
        u, v = path_nodes[i], path_nodes[i + 1]
        edge_data = G.get_edge_data(u, v)
        if not edge_data:
            continue

        for key in edge_data:
            current = _safe_float(edge_data[key].get("weight"), 1.0)
            edge_data[key]["weight"] = current * multiplier


def _extract_edge_geometry(
    G: nx.MultiDiGraph,
    path_nodes: list[int],
    weight_key: str,
) -> list[list[float]]:
    """
    Extract full road geometry from a node path.
    Use edge geometry when available and fall back to node-to-node lines.
    """
    coords: list[list[float]] = []

    for i in range(len(path_nodes) - 1):
        u, v = path_nodes[i], path_nodes[i + 1]
        edge_data = G.get_edge_data(u, v)
        if edge_data is None:
            coords.append([float(G.nodes[u]["x"]), float(G.nodes[u]["y"])])
            continue

        data = _choose_edge_data(edge_data, weight_key)

        if LineString is not None and isinstance(data.get("geometry"), LineString):
            geom = data["geometry"]
            edge_coords = list(geom.coords)

            u_point = (G.nodes[u]["x"], G.nodes[u]["y"])
            first = edge_coords[0]
            last = edge_coords[-1]

            dist_fwd = (first[0] - u_point[0]) ** 2 + (first[1] - u_point[1]) ** 2
            dist_rev = (last[0] - u_point[0]) ** 2 + (last[1] - u_point[1]) ** 2
            if dist_rev < dist_fwd:
                edge_coords = list(reversed(edge_coords))

            if coords and coords[-1] == [float(edge_coords[0][0]), float(edge_coords[0][1])]:
                edge_coords = edge_coords[1:]

            coords.extend([[float(c[0]), float(c[1])] for c in edge_coords])
        else:
            node_coord = [float(G.nodes[u]["x"]), float(G.nodes[u]["y"])]
            if not coords or coords[-1] != node_coord:
                coords.append(node_coord)

    if path_nodes:
        last_node = path_nodes[-1]
        final_coord = [float(G.nodes[last_node]["x"]), float(G.nodes[last_node]["y"])]
        if not coords or coords[-1] != final_coord:
            coords.append(final_coord)

    return coords


def _compute_distance_and_duration(
    G: nx.MultiDiGraph,
    path_nodes: list[int],
    weight_key: str,
) -> tuple[float, float]:
    """
    Compute total distance (miles) and duration (minutes) along a path.
    Uses edge length (meters) and travel_time (seconds).
    """
    total_meters = 0.0
    total_seconds = 0.0

    for i in range(len(path_nodes) - 1):
        u, v = path_nodes[i], path_nodes[i + 1]
        edge_data = G.get_edge_data(u, v)
        if edge_data is None:
            continue

        data = _choose_edge_data(edge_data, weight_key)
        length_m = _safe_float(data.get("length"), 0.0)
        total_meters += length_m
        total_seconds += _safe_float(data.get("travel_time"), length_m / 13.4)

    miles = total_meters * 0.000621371
    minutes = total_seconds / 60.0
    return round(miles, 1), round(minutes, 1)


def _path_touches_zone(
    G: nx.MultiDiGraph,
    path_nodes: list[int],
    danger_zone: BaseGeometry | None,
    weight_key: str,
) -> bool:
    if danger_zone is None or LineString is None:
        return False

    for i in range(len(path_nodes) - 1):
        u, v = path_nodes[i], path_nodes[i + 1]
        edge_data = G.get_edge_data(u, v)
        if edge_data is None:
            continue

        data = _choose_edge_data(edge_data, weight_key)
        if _edge_linestring(G, u, v, data).intersects(danger_zone):
            return True

    return False


def _risk_label(
    fire_geojson: dict | None,
    touches_danger_zone: bool,
    metric: str,
    avoid_highways: bool,
) -> str:
    if fire_geojson is None:
        return "low"
    if touches_danger_zone:
        return "high"
    if avoid_highways:
        return "low"
    if metric == "travel_time":
        return "moderate"
    return "low"


def _build_route_option(
    option_id: str,
    option_name: str,
    fire_geojson: dict | None,
    metric: str,
    avoid_highways: bool,
    G: nx.MultiDiGraph,
    path_nodes: list[int],
    danger_zone: BaseGeometry | None,
) -> dict[str, Any]:
    coords = _extract_edge_geometry(G, path_nodes, weight_key="weight")
    distance_miles, duration_minutes = _compute_distance_and_duration(
        G,
        path_nodes,
        weight_key="weight",
    )
    touches_zone = _path_touches_zone(G, path_nodes, danger_zone, weight_key="weight")

    return {
        "id": option_id,
        "name": option_name,
        "risk": _risk_label(fire_geojson, touches_zone, metric, avoid_highways),
        "type": "LineString",
        "coordinates": coords,
        "distance_miles": distance_miles,
        "duration_minutes": duration_minutes,
        "_path_nodes": path_nodes,
    }


def compute_routes(
    origin: str | list[float],
    destination: str | list[float],
    fire_geojson: dict | None = None,
) -> list[dict[str, Any]]:
    """
    Return up to three route options with real road geometries:
    - safest (recommended)
    - fastest
    - lower-exposure local roads
    """
    try:
        origin_coords = resolve_location(origin)
        dest_coords = resolve_location(destination)

        route_options: list[dict[str, Any]] = []
        seen_paths: set[tuple[int, ...]] = set()

        for profile in ROUTE_PROFILES:
            G, danger_zone = _weighted_graph(
                fire_geojson=fire_geojson,
                metric=profile["metric"],
                avoid_highways=profile["avoid_highways"],
            )
            orig_node = ox.nearest_nodes(G, origin_coords[0], origin_coords[1])
            dest_node = ox.nearest_nodes(G, dest_coords[0], dest_coords[1])

            try:
                path_nodes = nx.shortest_path(G, orig_node, dest_node, weight="weight")
            except NetworkXNoPath:
                logger.warning(
                    "No path found for profile %s from %s to %s",
                    profile["id"],
                    origin_coords,
                    dest_coords,
                )
                continue

            signature = tuple(path_nodes)
            if signature in seen_paths:
                continue
            seen_paths.add(signature)

            route_options.append(
                _build_route_option(
                    option_id=profile["id"],
                    option_name=profile["name"],
                    fire_geojson=fire_geojson,
                    metric=profile["metric"],
                    avoid_highways=profile["avoid_highways"],
                    G=G,
                    path_nodes=path_nodes,
                    danger_zone=danger_zone,
                )
            )

        # If profiles collapse to one path, force at least one alternate path.
        while route_options and len(route_options) < 2:
            G, danger_zone = _weighted_graph(
                fire_geojson=fire_geojson,
                metric="length",
                avoid_highways=False,
            )
            for existing in route_options:
                _apply_path_penalty(
                    G,
                    existing["_path_nodes"],
                    ALT_PATH_PENALTY_MULTIPLIER,
                )

            orig_node = ox.nearest_nodes(G, origin_coords[0], origin_coords[1])
            dest_node = ox.nearest_nodes(G, dest_coords[0], dest_coords[1])

            try:
                alt_nodes = nx.shortest_path(G, orig_node, dest_node, weight="weight")
            except NetworkXNoPath:
                break

            alt_signature = tuple(alt_nodes)
            if alt_signature in seen_paths:
                break
            seen_paths.add(alt_signature)

            route_options.append(
                _build_route_option(
                    option_id=f"alt-{len(route_options)}",
                    option_name=f"Alternative Route {len(route_options)}",
                    fire_geojson=fire_geojson,
                    metric="length",
                    avoid_highways=False,
                    G=G,
                    path_nodes=alt_nodes,
                    danger_zone=danger_zone,
                )
            )
    except ValueError:
        raise
    except Exception as exc:
        logger.warning("Routing degraded to unavailable route: %s", exc)
        return _unavailable_routes()

    if not route_options:
        logger.warning("No route found from %s to %s", origin_coords, dest_coords)
        return _unavailable_routes()

    for option in route_options:
        option.pop("_path_nodes", None)

    return route_options[:3]


def compute_route(
    origin: str | list[float],
    destination: str | list[float],
    fire_geojson: dict | None = None,
) -> dict:
    """
    Backward-compatible single-route helper for callers that only need
    one recommended route geometry.
    """
    routes = compute_routes(origin, destination, fire_geojson=fire_geojson)
    best = routes[0]
    return {
        "type": best["type"],
        "coordinates": best["coordinates"],
        "distance_miles": best["distance_miles"],
        "duration_minutes": best["duration_minutes"],
    }
