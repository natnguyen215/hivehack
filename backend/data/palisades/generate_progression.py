"""
Generate 5 timestamped Palisades fire perimeter GeoJSON files.

Strategy:
  - Load the real final perimeter (23,448 acres, Jan 21)
  - The fire spread W→E from ignition near Pacific Palisades (~-118.526, 34.049)
    westward to Malibu (~-118.686) over ~5 days
  - For each timestamp, clip the final MultiPolygon to only the portion
    that would have burned by that date using a longitude cutoff that advances
    westward, scaled to match the known acreage progression.
  - Then output clean, timestamped GeoJSON FeatureCollections.

Known progression (from Wikipedia / CalFire ICS-209 reports):
  t1: Jan 7 ~6pm  →   1,262 acres  (ignition + initial spread)
  t2: Jan 8 ~11pm →  17,234 acres  (explosive spread to Malibu)
  t3: Jan 10 ~2pm →  21,317 acres  (~8% contained)
  t4: Jan 12 ~6am →  23,707 acres  (growth nearly stopped)
  t5: Jan 21      →  23,448 acres  (65% contained, survey correction)
"""

import json
import math
from shapely.geometry import shape, mapping, MultiPolygon, Polygon, box
from shapely.ops import unary_union

DATA_DIR = "/Users/loaner/Library/CloudStorage/OneDrive-Personal/Documents/CODE/hivehack/backend/data/palisades"

# Load the real final perimeter
with open(f"{DATA_DIR}/palisades_final_raw.geojson") as f:
    raw = json.load(f)

final_geom = shape(raw["features"][0]["geometry"])
print(f"Loaded final geometry: {final_geom.geom_type}, valid={final_geom.is_valid}")
if not final_geom.is_valid:
    final_geom = final_geom.buffer(0)

# Bounding box of the full fire
min_lon, min_lat, max_lon, max_lat = final_geom.bounds
print(f"Bounds: [{min_lon:.4f}, {min_lat:.4f}, {max_lon:.4f}, {max_lat:.4f}]")

# Ignition area: eastern portion near Pacific Palisades
# Fire spread primarily WEST and slightly south (toward PCH / Malibu coastline)
# and also north into the Santa Monica Mountains
IGN_LON = -118.526   # easternmost fire origin (Palisades Drive / Sunset)
IGN_LAT = 34.049

# The full fire spans from IGN_LON west to min_lon over 5 days.
# We use a "wave front" longitude that advances westward to approximate spread.

def lon_cutoff_for_acreage(target_acres: float, final_acres: float = 23448) -> float:
    """
    Compute approximate western longitude cutoff corresponding to target acreage.
    Uses a nonlinear ramp: most expansion happened on Day 2 (Jan 8).
    """
    ratio = min(target_acres / final_acres, 1.0)
    # Nonlinear: fire exploded west on Day 2, then slowed
    # Map ratio → fraction of west-east span to include
    # ratio 0.054 (1262/23448) ≈ 0.054 → just the eastern ignition zone
    # ratio 0.735 (17234/23448) → most of the fire already burning
    # Use a power curve to model the explosive first day
    frac = ratio ** 0.45  # compressed expansion for early rapid spread
    lon = IGN_LON + frac * (min_lon - IGN_LON)
    return lon

TIMESTAMPS = [
    {
        "timestamp": "2025-01-07T18:30:00Z",
        "label": "Day 1 – Ignition",
        "acres": 1262,
        "contained_pct": 0,
        "description": "Fire ignites near Palisades Drive; explosive growth under 80mph Santa Ana winds",
    },
    {
        "timestamp": "2025-01-08T23:00:00Z",
        "label": "Day 2 – Explosive Spread",
        "acres": 17234,
        "contained_pct": 0,
        "description": "Fire races west to Malibu; destroys Pacific Palisades community, PCH threatened",
    },
    {
        "timestamp": "2025-01-10T14:33:00Z",
        "label": "Day 4 – Winds Ease",
        "acres": 21317,
        "contained_pct": 8,
        "description": "Fire at 21,317 acres; winds beginning to ease; 8% containment achieved",
    },
    {
        "timestamp": "2025-01-12T06:33:00Z",
        "label": "Day 6 – Growth Stops",
        "acres": 23707,
        "contained_pct": 11,
        "description": "Fire reaches near-final size of 23,707 acres; growth effectively ceases",
    },
    {
        "timestamp": "2025-01-21T23:43:00Z",
        "label": "Day 15 – 65% Contained",
        "acres": 23448,
        "contained_pct": 65,
        "description": "Survey-corrected final perimeter: 23,448 acres; fire fully contained Jan 31",
    },
]


def clip_to_acreage(geom, target_acres: float, final_acres: float = 23448):
    """
    Clip the geometry to approximately represent the given acreage.

    For early stages: use an expanding ellipse centered on the ignition point,
    oriented with a long east-west axis (fire spread west toward Malibu)
    and shorter north-south axis (bounded by Santa Monica Mountains / PCH).

    The ellipse is intersected with the real final perimeter so the boundary
    follows actual terrain-constrained fire lines.
    """
    if target_acres >= final_acres * 0.98:
        return geom  # full perimeter — use as-is

    ratio = target_acres / final_acres

    # Degrees per km at this latitude
    lat_km = 1.0 / 111.0          # 1 km in latitude degrees
    lon_km = 1.0 / (111.0 * math.cos(math.radians(IGN_LAT)))

    # Total fire area ≈ 23448 acres = 94.93 sq km
    # Approximate semi-axes of final fire (stretched W-E ellipse):
    #   W extent from ignition: ~15.7 km  (IGN_LON=-118.526 to min_lon=-118.686)
    #   N extent:                ~8.9 km
    #   S extent (to coast):     ~2.5 km
    #   E extent:                ~2.5 km

    # Scale the ellipse uniformly from the ignition point.
    # Use sqrt(ratio) for area scaling (area ∝ r²), but fire spread west very fast,
    # so use a power < 0.5 for west axis and ≥ 0.5 for others.

    # West axis (primary spread direction, explosive on Day 2)
    # ratio=0.054 → west_scale≈0.17; ratio=0.735 → west_scale≈0.87
    west_scale = ratio ** 0.38

    # Other axes scale more uniformly
    other_scale = ratio ** 0.5

    # Semi-axes in degrees
    a_west  = west_scale  * (IGN_LON - min_lon)   # westward expansion
    a_east  = other_scale * (max_lon - IGN_LON)    # eastward (small)
    a_north = other_scale * (max_lat - IGN_LAT)    # northward into mountains
    a_south = other_scale * (IGN_LAT - min_lat)    # southward toward coast

    # Build the clipping ellipse as a polygon
    # Parametric: lon(t) = IGN_LON + r_lon(t)*cos(t), lat(t) = IGN_LAT + r_lat(t)*sin(t)
    n_pts = 256
    pts = []
    for i in range(n_pts):
        theta = 2 * math.pi * i / n_pts
        # Quadrant-dependent radius
        r_lon = a_west if math.cos(theta) < 0 else a_east
        r_lat = a_north if math.sin(theta) > 0 else a_south
        lon = IGN_LON + r_lon * math.cos(theta)
        lat = IGN_LAT + r_lat * math.sin(theta)
        pts.append((lon, lat))
    pts.append(pts[0])
    clip_ellipse = Polygon(pts)

    clipped = geom.intersection(clip_ellipse)

    if clipped.is_empty:
        print(f"  Warning: empty intersection for {target_acres} acres, using bbox fallback")
        # Fallback: simple bbox
        lon_cut = IGN_LON + west_scale * (min_lon - IGN_LON)
        clipped = geom.intersection(box(lon_cut, min_lat - 0.01, max_lon + 0.01, max_lat + 0.01))

    # Simplify for small early files
    if target_acres < 5000:
        clipped = clipped.simplify(0.001, preserve_topology=True)
    elif target_acres < 15000:
        clipped = clipped.simplify(0.0005, preserve_topology=True)

    return clipped


def make_feature(geom, props: dict) -> dict:
    return {
        "type": "Feature",
        "properties": props,
        "geometry": mapping(geom),
    }


def make_featurecollection(features: list, meta: dict) -> dict:
    return {
        "type": "FeatureCollection",
        "metadata": meta,
        "features": features,
    }


# Generate each file
for stage in TIMESTAMPS:
    ts_label = stage["timestamp"].replace(":", "").replace("-", "")[:15]
    filename = f"palisades_{ts_label}.geojson"
    out_path = f"{DATA_DIR}/{filename}"

    print(f"\nGenerating {filename} ({stage['acres']:,} acres)...")
    clipped = clip_to_acreage(final_geom, stage["acres"])

    # Compute GIS acres from clipped area (approximate via degree-to-km conversion)
    # 1 degree lat ≈ 111 km; 1 degree lon ≈ 111 * cos(lat) km
    # area in sq degrees → sq km → acres (1 sq km = 247.105 acres)
    avg_lat = (min_lat + max_lat) / 2
    area_sq_deg = clipped.area
    area_sq_km = area_sq_deg * (111.0 ** 2) * math.cos(math.radians(avg_lat))
    area_acres = area_sq_km * 247.105
    print(f"  Clipped area: ~{area_acres:,.0f} acres (target: {stage['acres']:,})")

    feature = make_feature(clipped, {
        "incident_name": "Palisades Fire",
        "unique_fire_id": "2025-CALFD-000738",
        "timestamp": stage["timestamp"],
        "label": stage["label"],
        "reported_acres": stage["acres"],
        "gis_acres_approx": round(area_acres),
        "percent_contained": stage["contained_pct"],
        "county": "Los Angeles",
        "state": "CA",
        "ignition_point": {"lon": IGN_LON, "lat": IGN_LAT},
        "description": stage["description"],
        "data_source": "NIFC WFIGS (final perimeter); progression stages approximated from ICS-209 acreage reports",
    })

    fc = make_featurecollection([feature], {
        "fire": "Palisades Fire",
        "timestamp": stage["timestamp"],
        "reported_acres": stage["acres"],
        "source": "NIFC WFIGS Interagency Fire Perimeters (2025-CALFD-000738)",
        "note": "Final perimeter is official NIFC/WFIGS data. Intermediate timestamps derived by clipping final perimeter to match ICS-209 reported acreages.",
    })

    with open(out_path, "w") as f:
        json.dump(fc, f, separators=(",", ":"))

    file_size = len(json.dumps(fc))
    print(f"  Saved → {filename} ({file_size/1024:.1f} KB)")

print("\nDone. Generated files:")
import os
for fn in sorted(os.listdir(DATA_DIR)):
    if fn.endswith(".geojson") and "palisades_2025" in fn:
        path = f"{DATA_DIR}/{fn}"
        size = os.path.getsize(path)
        print(f"  {fn}  ({size/1024:.1f} KB)")
