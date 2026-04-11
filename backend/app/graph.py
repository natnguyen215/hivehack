from __future__ import annotations

import logging

import networkx as nx
import osmnx as ox

logger = logging.getLogger("emberpath.graph")

# Bounding box covering LA through Santa Barbara along the coast
# (north, south, east, west) — wide enough for realistic evacuation routing
BBOX = (34.50, 33.90, -118.10, -119.80)

_graph: nx.MultiDiGraph | None = None


def get_graph() -> nx.MultiDiGraph:
    """Download and cache the OSM drive graph for the target area."""
    global _graph
    if _graph is None:
        logger.info("Downloading OSM road graph for bbox %s ...", BBOX)
        _graph = ox.graph_from_bbox(*BBOX, network_type="drive")
        # Add edge speeds first (uses maxspeed tags where available,
        # falls back to defaults for the road type), then travel times.
        _graph = ox.routing.add_edge_speeds(_graph)
        _graph = ox.routing.add_edge_travel_times(_graph)
        logger.info(
            "Graph loaded: %d nodes, %d edges",
            _graph.number_of_nodes(),
            _graph.number_of_edges(),
        )
    return _graph
