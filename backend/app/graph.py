from __future__ import annotations

import logging

import networkx as nx
import osmnx as ox

logger = logging.getLogger("emberpath.graph")

# Bounding box around Pacific Palisades / West LA
# (north, south, east, west) — tighten if download is slow
BBOX = (34.15, 33.95, -118.30, -118.65)

_graph: nx.MultiDiGraph | None = None


def get_graph() -> nx.MultiDiGraph:
    """Download and cache the OSM drive graph for the target area."""
    global _graph
    if _graph is None:
        logger.info("Downloading OSM road graph for bbox %s …", BBOX)
        _graph = ox.graph_from_bbox(BBOX, network_type="drive")
        logger.info(
            "Graph loaded: %d nodes, %d edges",
            _graph.number_of_nodes(),
            _graph.number_of_edges(),
        )
    return _graph
