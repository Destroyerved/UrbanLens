"""Normalisation applied to the raw OSM layers.

Mirrors web/lib/engine/data/real.ts so both backends see the same facilities.
"""

from __future__ import annotations

import re

# India's OSM tags many clinics and nursing homes as amenity=hospital. Treat one
# as a real hospital only if it is mapped as a building (an OSM way) or its name
# clearly denotes a major facility; everything else becomes a clinic. Without
# this, healthcare-gap analysis is meaningless — every neighbourhood looks like
# it has a hospital.
MAJOR_HOSPITAL = re.compile(
    r"medical college|civil hospital|general hospital|multi.?special|super.?special"
    r"|institute|trauma|referral|government hospital|govt\.? hospital",
    re.IGNORECASE,
)


def normalise_facilities(features: list[dict]) -> list[dict]:
    """Reclassify over-tagged hospitals, then merge near-duplicates."""
    reclassified: list[dict] = []
    for f in features:
        props = dict(f["properties"])
        if props.get("facility_type") == "hospital":
            is_way = str(props.get("id", "")).startswith("OSM-W")
            if not is_way and not MAJOR_HOSPITAL.search(str(props.get("name", ""))):
                props["facility_type"] = "clinic"
        reclassified.append({**f, "properties": props})

    # Merge near-duplicate points of the same type on a ~150 m grid — one real
    # facility is frequently mapped several times.
    seen: set[str] = set()
    merged: list[dict] = []
    for f in reclassified:
        lng, lat = f["geometry"]["coordinates"]
        key = f"{f['properties']['facility_type']}:{lng:.3f}:{lat:.3f}"
        if key in seen:
            continue
        seen.add(key)
        merged.append(f)
    return merged


def decimate(coords: list[list[float]], max_points: int = 14) -> list[list[float]]:
    """Thin a road geometry so nearest-vertex distance stays cheap."""
    if len(coords) <= max_points:
        return coords
    step = -(-len(coords) // max_points)  # ceil division
    out = coords[::step]
    if out[-1] != coords[-1]:
        out.append(coords[-1])
    return out
