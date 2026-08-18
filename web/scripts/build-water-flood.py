"""Bake water-body and derived flood-risk polygons into web/data/engine for
every district.

  * <city>_water.json — REAL water bodies from the engine's land layer
    (`land_use=water`: lakes, reservoirs, basins, wetlands) plus OSM river
    lines from the roads layer buffered to a ~150 m half-width, so flowing
    water shows as a water body even where OSM has no polygon. Clipped to the
    district (wards union) and simplified to keep the payload small.

  * <city>_flood.json — DERIVED flood susceptibility from water proximity
    (there is no DEM in this build, so elevation cannot drive it):
      high   = water ± 150 m
      medium = water ± 150–400 m
    These are modelled advisory zones, flagged in the layer's meta.source.

Composites are handled by the backend merging member districts in memory, so
no composite water/flood files are produced.
"""
from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import shape, mapping, LineString
from shapely.ops import unary_union, transform as shp_transform
from pyproj import Transformer

REPO = Path(__file__).resolve().parents[2]
ENGINE = REPO / "web" / "data" / "engine"

RIVER_HALF_WIDTH_M = 150.0
FLOOD_HIGH_BUFFER_M = 150.0
FLOOD_MEDIUM_BUFFER_M = 400.0
SIMPLIFY_M = 30.0
MIN_AREA_SQM = 1000.0
FLOOD_MIN_AREA_SQM = 2000.0

_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True)
_INV = Transformer.from_crs("EPSG:32643", "EPSG:4326", always_xy=True)


def area_m2(g) -> float:
    return abs(shp_transform(lambda x, y, *z: _UTM.transform(x, y), g).area)


def simplify_m(g, tol):
    g_utm = shp_transform(lambda x, y, *z: _UTM.transform(x, y), g)
    s_utm = g_utm.simplify(tol, preserve_topology=True)
    return shp_transform(lambda x, y, *z: _INV.transform(x, y), s_utm)


def buffer_m(g, metres):
    g_utm = shp_transform(lambda x, y, *z: _UTM.transform(x, y), g)
    b_utm = g_utm.buffer(metres)
    return shp_transform(lambda x, y, *z: _INV.transform(x, y), b_utm)


def load_json(path):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def ward_union(city):
    d = load_json(ENGINE / f"{city}_wards.json")
    if not d:
        return None
    polys = []
    for f in d["features"]:
        g = shape(f["geometry"])
        if g.geom_type == "Polygon":
            polys.append(g)
    return unary_union(polys) if polys else None


def ring_to_polygon(g):
    if g.geom_type == "Polygon":
        return g
    if g.geom_type == "LineString" and g.is_closed:
        from shapely.geometry import Polygon
        return Polygon(g.coords)
    return None


def build_city(city):
    land = load_json(ENGINE / f"{city}_land.json")
    roads = load_json(ENGINE / f"{city}_roads.json")
    boundary = ward_union(city)

    water = []
    seen = set()

    def add(g, cid, name, category):
        if g is None or g.is_empty or g.area <= 0:
            return
        if cid in seen:
            return
        seen.add(cid)
        water.append((g, cid, name, category))

    if land:
        for f in land["features"]:
            p = f["properties"]
            if p.get("land_use") != "water":
                continue
            g = ring_to_polygon(shape(f["geometry"]))
            if g is None:
                continue
            tag = (p.get("osm_tag") or "water").split("=")[-1]
            add(g, p.get("id", "W"), p.get("name"), tag)
    if roads:
        for f in roads["features"]:
            p = f["properties"]
            if p.get("road_type") != "river":
                continue
            line = shape(f["geometry"])
            if not isinstance(line, LineString):
                continue
            g = buffer_m(line, RIVER_HALF_WIDTH_M)
            add(g, f"RIVER-{p.get('id', 'R')}", p.get("name"), "river")

    # Clip every water body to the district and drop slivers.
    kept = []
    for g, cid, name, category in water:
        if boundary is not None:
            if not g.intersects(boundary):
                continue
            g = g.intersection(boundary)
        if g.is_empty or g.area <= 0:
            continue
        if g.geom_type not in ("Polygon", "MultiPolygon"):
            continue
        a = area_m2(g)
        if a < MIN_AREA_SQM:
            continue
        g = simplify_m(g, SIMPLIFY_M)
        if g.is_empty:
            continue
        kept.append({
            "type": "Feature",
            "geometry": mapping(g),
            "properties": {
                "id": cid,
                "name": (name or "").strip() or None,
                "category": category,
                "area_sqm": round(a, 1),
                "source": "OSM",
            },
        })

    water_union = unary_union([shape(f["geometry"]) for f in kept]) if kept else None
    total_water = sum(f["properties"]["area_sqm"] for f in kept)
    water_doc = {
        "type": "FeatureCollection",
        "features": kept,
        "meta": {
            "source": "OpenStreetMap water polygons + river lines (buffered)",
            "categories": sorted({f["properties"]["category"] for f in kept}),
            "count": len(kept),
            "total_area_sqm": round(total_water, 1),
        },
    }
    (ENGINE / f"{city}_water.json").write_text(
        json.dumps(water_doc, ensure_ascii=False), encoding="utf-8"
    )

    # Flood susceptibility from water proximity (modelled, no DEM).
    flood = []
    if water_union is not None and not water_union.is_empty:
        for level, low, high in (
            ("high", 0.0, FLOOD_HIGH_BUFFER_M),
            ("medium", FLOOD_HIGH_BUFFER_M, FLOOD_MEDIUM_BUFFER_M),
        ):
            zone = buffer_m(water_union, high)
            if low > 0:
                zone = zone.difference(buffer_m(water_union, low))
            if zone.is_empty or zone.area <= 0:
                continue
            if boundary is not None:
                if not zone.intersects(boundary):
                    continue
                zone = zone.intersection(boundary)
            if zone.is_empty or zone.area <= 0:
                continue
            if zone.geom_type not in ("Polygon", "MultiPolygon"):
                continue
            zone = simplify_m(zone, SIMPLIFY_M)
            if zone.is_empty:
                continue
            parts = zone.geoms if zone.geom_type == "MultiPolygon" else [zone]
            for part in parts:
                a = area_m2(part)
                if a < FLOOD_MIN_AREA_SQM:
                    continue
                flood.append({
                    "type": "Feature",
                    "geometry": mapping(part),
                    "properties": {
                        "id": f"{level.upper()}-{len(flood)}",
                        "level": level,
                        "area_sqm": round(a, 1),
                        "source": "derived-water-buffer",
                    },
                })

    flood_doc = {
        "type": "FeatureCollection",
        "features": flood,
        "meta": {
            "source": "Modelled advisory zones: water ±150 m (high), 150–400 m (medium). No DEM in this build.",
            "count": len(flood),
            "total_area_sqm": round(sum(f["properties"]["area_sqm"] for f in flood), 1),
            "high_area_sqm": round(sum(f["properties"]["area_sqm"] for f in flood if f["properties"]["level"] == "high"), 1),
            "medium_area_sqm": round(sum(f["properties"]["area_sqm"] for f in flood if f["properties"]["level"] == "medium"), 1),
        },
    }
    (ENGINE / f"{city}_flood.json").write_text(
        json.dumps(flood_doc, ensure_ascii=False), encoding="utf-8"
    )

    n_high = sum(1 for f in flood if f["properties"]["level"] == "high")
    n_med = sum(1 for f in flood if f["properties"]["level"] == "medium")
    print(
        f"{city}: {len(kept)} water ({total_water/1e6:.1f} km2) · "
        f"flood {n_high} high + {n_med} medium"
    )


if __name__ == "__main__":
    for p in sorted(ENGINE.glob("*_land.json")):
        city = p.name[: -len("_land.json")]
        if city in ("ahmedabad-gandhinagar", "ahmedabad-metro", "gujarat"):
            continue
        build_city(city)