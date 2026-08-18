"""Bake DEM-driven flood-susceptibility zones into web/data/engine.

Replaces the naive "water ± distance" zones (build-water-flood.py) with zones
derived from the Copernicus DEM 30 m + the real water layer, using the same
risk model the backend samples for each parcel (app/gis/flood.py), so the map
layer and the parcel flood_risk attribute always agree.

  * <city>_flood.json — high / medium zones polygonised from the risk raster,
    clipped to the district and simplified.

Districts whose DEM tiles have not been fetched yet are left untouched (their
previous flood file stays), so a partial download never produces blank layers.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from shapely.geometry import shape, mapping
from shapely.ops import unary_union, transform as shp_transform
from pyproj import Transformer

REPO = Path(__file__).resolve().parents[2]
ENGINE = REPO / "web" / "data" / "engine"
sys.path.insert(0, str(REPO / "backend"))

from app.gis.flood import compute_risk  # noqa: E402

SIMPLIFY_M = 60.0
FLOOD_MIN_AREA_SQM = 20000.0

_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True)
_INV = Transformer.from_crs("EPSG:32643", "EPSG:4326", always_xy=True)


def area_m2(g) -> float:
    return abs(shp_transform(lambda x, y, *z: _UTM.transform(x, y), g).area)


def simplify_m(g, tol):
    g_utm = shp_transform(lambda x, y, *z: _UTM.transform(x, y), g)
    s_utm = g_utm.simplify(tol, preserve_topology=True)
    return shp_transform(lambda x, y, *z: _INV.transform(x, y), s_utm)


def ward_union(city):
    doc = json.loads((ENGINE / f"{city}_wards.json").read_text(encoding="utf-8"))
    polys = [shape(f["geometry"]) for f in doc["features"]]
    return unary_union(polys)


def build_city(city):
    boundary = ward_union(city)
    water = json.loads((ENGINE / f"{city}_water.json").read_text(encoding="utf-8"))
    res = compute_risk(boundary.bounds, water)
    if res is None:
        print(f"{city}: DEM not ready yet, kept previous flood file")
        return
    levels, _, transform = res

    import rasterio

    features = []
    seen = set()
    for geom, value in rasterio.features.shapes(levels.astype("int16"), transform=transform):
        level = int(value)
        if level == 0:
            continue
        g = shape(geom)
        if boundary is not None and not g.intersects(boundary):
            continue
        g = g.intersection(boundary)
        if g.is_empty or g.area <= 0:
            continue
        g = simplify_m(g, SIMPLIFY_M)
        if g.is_empty:
            continue
        parts = g.geoms if g.geom_type == "MultiPolygon" else [g]
        for part in parts:
            a = area_m2(part)
            if a < FLOOD_MIN_AREA_SQM:
                continue
            key = (round(part.centroid.x, 3), round(part.centroid.y, 3), level)
            if key in seen:
                continue
            seen.add(key)
            name = "high" if level == 2 else "medium"
            features.append({
                "type": "Feature",
                "geometry": mapping(part),
                "properties": {
                    "id": f"{name.upper()}-{len(features)}",
                    "level": name,
                    "area_sqm": round(a, 1),
                    "source": "dem-elevation+water-proximity",
                },
            })

    doc = {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "source": "Copernicus DEM 30m elevation + OSM water proximity (app/gis/flood.py). "
                      "high = low-lying flat land near water; medium = moderate.",
            "count": len(features),
            "total_area_sqm": round(sum(f["properties"]["area_sqm"] for f in features), 1),
            "high_area_sqm": round(sum(f["properties"]["area_sqm"] for f in features if f["properties"]["level"] == "high"), 1),
            "medium_area_sqm": round(sum(f["properties"]["area_sqm"] for f in features if f["properties"]["level"] == "medium"), 1),
        },
    }
    (ENGINE / f"{city}_flood.json").write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    print(
        f"{city}: {len(features)} zones "
        f"({doc['meta']['high_area_sqm']/1e6:.0f} km2 high / "
        f"{doc['meta']['medium_area_sqm']/1e6:.0f} km2 medium)"
    )


if __name__ == "__main__":
    for p in sorted(ENGINE.glob("*_land.json")):
        city = p.name[: -len("_land.json")]
        if city in ("ahmedabad-gandhinagar", "ahmedabad-metro", "gujarat"):
            continue
        build_city(city)