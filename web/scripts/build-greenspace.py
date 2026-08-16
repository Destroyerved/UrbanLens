"""Bake real green-space polygons into web/data/engine/<city>_greenspace.json.

Sources (all real vector data already in raw/):
  - AMC Recreational Services park polygons (Ahmedabad only, 257 features)
  - OSM landuse polygons tagged as green space (grassland, forest, wood, scrub,
    recreation_ground, plantation, farmland) for both cities; closed LineString
    rings are promoted to Polygons.

Every feature is clipped to its city boundary (wards union) and tagged with a
category, area_sqm, and the owning ward id.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from shapely.geometry import shape, Polygon, mapping
from shapely.ops import unary_union
from pyproj import Transformer

REPO = Path(r"C:\Users\Siddhi Patel\Desktop\Datasets")
RAW = REPO / "raw"
ENGINE = REPO / "UrbanLens-main" / "web" / "data" / "engine"

GREEN_TAGS = {
    "grassland", "forest", "wood", "scrub",
    "recreation_ground", "plantation", "farmland",
}

# No minimum area — keep every parcel (fidelity over payload).
MIN_AREA = 0.0

# Douglas-Peucker simplification tolerance, in metres (UTM zone 43).
# Must be applied in UTM, not WGS84 degrees (see simplify_m below).
SIMPLIFY_M = 2.0

# Composite study areas reuse their constituent cities' OSM sources, then clip
# to their own (wider) ward union.
COMPOSITES: dict[str, list[str]] = {
    "ahmedabad-gandhinagar": ["ahmedabad", "gandhinagar"],
    "ahmedabad-metro": ["ahmedabad", "gandhinagar"],
}

_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True)


def area_m2(g):
    from shapely.ops import transform as shp_transform
    gp = shp_transform(lambda x, y, *z: _UTM.transform(x, y), g)
    return abs(gp.area)


def simplify_m(g, tol):
    """Simplify a WGS84 geometry using a metre tolerance (in UTM space)."""
    from shapely.ops import transform as shp_transform

    g_utm = shp_transform(lambda x, y, *z: _UTM.transform(x, y), g)
    s_utm = g_utm.simplify(tol, preserve_topology=True)
    inv = Transformer.from_crs("EPSG:32643", "EPSG:4326", always_xy=True)
    return shp_transform(lambda x, y, *z: inv.transform(x, y), s_utm)


def load_feats(path):
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as fh:
        d = json.load(fh)
    return d.get("features", [])


def ward_union(city):
    p = ENGINE / f"{city}_wards.json"
    if not p.exists():
        return None
    d = json.loads(p.read_text(encoding="utf-8"))
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
        return Polygon(g.coords)
    return None


def feature_geometry(g):
    g = ring_to_polygon(shape(g))
    return g


def build_city(city):
    out = []
    seen = set()
    src_by_id = {}
    parts = COMPOSITES.get(city, [city])

    # 1. AMC parks (Ahmedabad only)
    amc = RAW / "amc" / "Recreational_Services" / "0_Parks_Garden.geojson"
    if "ahmedabad" in parts and amc.exists():
        for f in load_feats(amc):
            g = ring_to_polygon(shape(f["geometry"]))
            if g is None or g.area <= 0:
                continue
            p = f["properties"]
            name = (p.get("name_of_park") or "").strip()
            wid = p.get("ward_id")
            area_sqm = float(p.get("garden_area") or 0)
            if not area_sqm or area_sqm <= 0:
                area_sqm = area_m2(g)
            oid = f"AMC-PARK-{p.get('objectid', len(out))}"
            if oid in seen:
                continue
            seen.add(oid)
            src_by_id[oid] = "AMC"
            out.append({
                "type": "Feature",
                "geometry": mapping(g),
                "properties": {
                    "id": oid,
                    "name": name or None,
                    "category": "park",
                    "ward_id": wid,
                    "area_sqm": round(area_sqm, 1),
                    "source": "AMC",
                },
            })

    # 2. OSM landuse green polygons (each constituent city for composites)
    for part in parts:
        lu = RAW / "osm" / f"{part}_landuse.geojson"
        for f in load_feats(lu):
            p = f["properties"]
            tag = p.get("landuse") or p.get("natural") or ""
            if tag not in GREEN_TAGS:
                continue
            g = ring_to_polygon(shape(f["geometry"]))
            if g is None or g.area <= 0:
                continue
            oid = f"OSM-{p.get('osm_id', 'G')}-{tag}"
            if oid in seen:
                continue
            seen.add(oid)
            src_by_id[oid] = "OSM"
            out.append({
                "type": "Feature",
                "geometry": mapping(g),
                "properties": {
                    "id": oid,
                    "name": (p.get("name") or "").strip() or None,
                    "category": tag,
                    "ward_id": None,
                    "area_sqm": round(area_m2(g), 1),
                    "source": "OSM",
                },
            })

    # 3. OSM dedicated greenspace (each constituent city for composites)
    for part in parts:
        gs = RAW / "osm" / f"{part}_greenspace.geojson"
        for f in load_feats(gs):
            g = ring_to_polygon(shape(f["geometry"]))
            if g is None or g.area <= 0:
                continue
            p = f["properties"]
            oid = f"OSM-GS-{p.get('osm_id', 'G')}"
            if oid in seen:
                continue
            seen.add(oid)
            src_by_id[oid] = "OSM"
            out.append({
                "type": "Feature",
                "geometry": mapping(g),
                "properties": {
                    "id": oid,
                    "name": (p.get("name") or "").strip() or None,
                    "category": p.get("leisure") or "greenspace",
                    "ward_id": None,
                    "area_sqm": round(area_m2(g), 1),
                    "source": "OSM",
                },
            })

    # 4. Clip to city boundary + assign ward
    boundary = ward_union(city)
    kept = []
    if boundary is not None:
        for feat in out:
            g = shape(feat["geometry"])
            if not g.intersects(boundary):
                continue
            g2 = g.intersection(boundary)
            if g2.is_empty or g2.area <= 0:
                continue
            if g2.geom_type not in ("Polygon", "MultiPolygon"):
                continue
            # Drop tiny fragments (noise) and simplify edges to shrink payload.
            area = area_m2(g2)
            if area < MIN_AREA:
                continue
            g2 = simplify_m(g2, SIMPLIFY_M)
            if g2.is_empty:
                continue
            feat["geometry"] = mapping(g2)
            feat["properties"]["area_sqm"] = round(area, 1)
            kept.append(feat)
    else:
        kept = out

    total_area = sum(f["properties"]["area_sqm"] for f in kept)

    doc = {
        "type": "FeatureCollection",
        "features": kept,
        "meta": {
            "source": "AMC Recreation + OpenStreetMap",
            "categories": sorted({f["properties"]["category"] for f in kept}),
            "count": len(kept),
            "total_area_sqm": round(total_area, 1),
        },
    }
    dest = ENGINE / f"{city}_greenspace.json"
    dest.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    print(f"{city}: {len(kept)} greenspace features -> {dest.name}")
    print(f"   total area: {total_area/1e6:.2f} km2, sources: {src_by_id.get('AMC')}")


if __name__ == "__main__":
    os.makedirs(ENGINE, exist_ok=True)
    for c in ["ahmedabad", "gandhinagar", "ahmedabad-gandhinagar", "ahmedabad-metro"]:
        build_city(c)