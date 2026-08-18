"""Bake green-space polygons into web/data/engine/<city>_greenspace.json for
every district.

Source: the engine's land layer (web/data/engine/<city>_land.json), whose
`land_use=green` bucket already holds the OSM green polygons (parks, gardens,
grassland, forest, wood, scrub, recreation grounds, heath, plantations) fetched
for all 34 districts. AMC Recreational Services park polygons are added for
Ahmedabad only. Every feature is clipped to its district boundary (wards union)
and simplified to a metre tolerance to keep the payload small.

This replaces the older raw/osm-only builder, which covered just Ahmedabad and
Gandhinagar. Composites are handled by the backend merging member districts in
memory, so no composite greenspace files are produced.
"""
from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import shape, Polygon, mapping
from shapely.ops import unary_union, transform as shp_transform
from pyproj import Transformer

REPO = Path(__file__).resolve().parents[2]
RAW = REPO / "raw"
ENGINE = REPO / "web" / "data" / "engine"

SIMPLIFY_M = 2.0

_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True)
_INV = Transformer.from_crs("EPSG:32643", "EPSG:4326", always_xy=True)


def area_m2(g) -> float:
    return abs(shp_transform(lambda x, y, *z: _UTM.transform(x, y), g).area)


def simplify_m(g, tol):
    g_utm = shp_transform(lambda x, y, *z: _UTM.transform(x, y), g)
    s_utm = g_utm.simplify(tol, preserve_topology=True)
    return shp_transform(lambda x, y, *z: _INV.transform(x, y), s_utm)


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
        return Polygon(g.coords)
    return None


def build_city(city):
    land = load_json(ENGINE / f"{city}_land.json")
    if not land:
        print(f"{city}: no land layer, skipping")
        return

    out = []
    seen = set()
    sources = set()

    for f in land["features"]:
        p = f["properties"]
        if p.get("land_use") != "green":
            continue
        g = ring_to_polygon(shape(f["geometry"]))
        if g is None or g.area <= 0:
            continue
        tag = p.get("osm_tag") or "green"
        oid = f"GS-{p.get('id', 'G')}"
        if oid in seen:
            continue
        seen.add(oid)
        sources.add("OSM")
        out.append({
            "type": "Feature",
            "geometry": mapping(g),
            "properties": {
                "id": oid,
                "name": (p.get("name") or "").strip() or None,
                "category": tag.split("=")[-1],
                "ward_id": None,
                "area_sqm": round(area_m2(g), 1),
                "source": "OSM",
            },
        })

    # AMC Recreational Services parks (Ahmedabad only)
    amc = RAW / "amc" / "Recreational_Services" / "0_Parks_Garden.geojson"
    if city == "ahmedabad" and amc.exists():
        for f in load_json(amc)["features"]:
            g = ring_to_polygon(shape(f["geometry"]))
            if g is None or g.area <= 0:
                continue
            p = f["properties"]
            name = (p.get("name_of_park") or "").strip()
            area_sqm = float(p.get("garden_area") or 0) or area_m2(g)
            oid = f"AMC-PARK-{p.get('objectid', len(out))}"
            if oid in seen:
                continue
            seen.add(oid)
            sources.add("AMC")
            out.append({
                "type": "Feature",
                "geometry": mapping(g),
                "properties": {
                    "id": oid,
                    "name": name or None,
                    "category": "park",
                    "ward_id": p.get("ward_id"),
                    "area_sqm": round(area_sqm, 1),
                    "source": "AMC",
                },
            })

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
            area = area_m2(g2)
            if area < 1.0:
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
            "source": "OpenStreetMap" + (" + AMC Recreation" if "AMC" in sources else ""),
            "categories": sorted({f["properties"]["category"] for f in kept}),
            "count": len(kept),
            "total_area_sqm": round(total_area, 1),
        },
    }
    dest = ENGINE / f"{city}_greenspace.json"
    dest.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    print(f"{city}: {len(kept)} greenspace features ({total_area/1e6:.2f} km2) -> {dest.name}")


if __name__ == "__main__":
    for p in sorted(ENGINE.glob("*_land.json")):
        city = p.name[: -len("_land.json")]
        if city in ("ahmedabad-gandhinagar", "ahmedabad-metro", "gujarat"):
            continue
        build_city(city)
