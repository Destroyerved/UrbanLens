"""Conservation priority and encroachment screening.

Both analytics here are deliberately built only on layers that are real
measurements, because both make claims that would be damaging if they rested
on modelled data:

  * Conservation priority names land worth protecting.
  * Encroachment screening names land that may have been built on illegally.

The engine's parcels are largely modelled gap-fill, its zoning is entirely
modelled, and only a handful of parcels carry confirmed tenure — so none of
those may be an input. What is used instead:

  greenspace   real OSM + AMC park/garden/forest polygons
  water        real OSM water bodies
  vegetation   Sentinel-2 NDVI, per ward
  flood        DEM elevation + water proximity
  growth grid  the trained development model's own output

Terrain slope is deliberately absent. The DEM is only reachable through the
flood module's private tile loader, and the flood layer it produces already
encodes elevation and water proximity — re-deriving slope would add a fragile
second DEM path for a component the flood term largely covers.
"""

from __future__ import annotations

from shapely.geometry import shape
from shapely.strtree import STRtree

from app.core.cache import singleflight
from app.data.loader import (
    data_signature,
    get_flood,
    get_greenspace,
    get_vegetation,
    get_water,
)
from app.gis.parcels import get_parcels
from app.ml.prediction import growth_grid

# Weights over the sensitivity components. Green cover and open water dominate:
# they are the things a conservation plan actually protects, whereas NDVI is a
# ward-scale average and flood risk is a constraint on building rather than an
# ecological value in itself.
SENSITIVITY_WEIGHTS = {"green": 0.40, "water": 0.25, "ndvi": 0.20, "flood": 0.15}

# A cell counts as a conservation priority when sensitive land is genuinely
# under pressure. Both halves must be substantial — high pressure over bare
# ground is just growth, and untouched green with no pressure needs no plan.
PRIORITY_SENSITIVITY_MIN = 35.0
PRIORITY_PRESSURE_MIN = 0.45

# Encroachment screening thresholds. OSM polygons legitimately abut one
# another and digitising slivers are common, so a candidate must overlap
# meaningfully in both absolute and relative terms before it is reported.
ENCROACH_MIN_SQM = 500.0
ENCROACH_MIN_FRACTION = 0.10
# At or above this the parcel is effectively inside the target rather than
# crossing into it, which is as often co-mapping as it is occupation.
CONTAINED_FRACTION = 0.90

BUILT_USES = {"residential", "commercial", "industrial", "institutional", "mixed"}

# Both results are persisted against the data signature, which only tracks the
# source layers. Changing a weight, a threshold or an output field here does
# not move that signature, so a stale row would be served against new code —
# bump this whenever the shape or the meaning of either result changes.
ANALYTIC_VERSION = "v2-confidence"


def _valid(geom):
    """Shapely geometry from a GeoJSON feature, or None if it will not build."""
    try:
        g = shape(geom)
        if g.is_empty:
            return None
        return g if g.is_valid else g.buffer(0)
    except Exception:  # noqa: BLE001 — a bad polygon is skipped, not fatal
        return None


def _feature_geoms(fc) -> list:
    feats = fc.get("features", []) if isinstance(fc, dict) else (fc or [])
    out = []
    for f in feats:
        g = _valid(f.get("geometry"))
        if g is not None:
            out.append((g, f.get("properties", {}) or {}))
    return out


def _coverage(tree, geoms: list, cell, cell_area: float) -> float:
    """Fraction of a cell covered by an indexed polygon set, clamped to 1."""
    if cell_area <= 0 or not geoms or tree is None:
        return 0.0
    total = 0.0
    for idx in tree.query(cell):
        try:
            inter = geoms[int(idx)].intersection(cell)
            if not inter.is_empty:
                total += inter.area
        except Exception:  # noqa: BLE001
            continue
        if total >= cell_area:
            break
    return min(1.0, total / cell_area)


def _conservation_cached(city_id: str, signature: str) -> dict:
    grid = growth_grid(city_id)
    cells = grid.get("features", []) or []
    if not cells:
        return {"city": city_id, "cells": [], "priorities": [], "summary": {}}

    green = _feature_geoms(get_greenspace(city_id))
    water = _feature_geoms(get_water(city_id))
    floods = _feature_geoms(get_flood(city_id))

    green_geoms = [g for g, _ in green]
    water_geoms = [g for g, _ in water]
    # Only the flood classes that actually constrain development; the layer
    # also carries low-risk polygons covering most of the plain.
    flood_geoms = [g for g, p in floods if str(p.get("level", "")).lower() in ("high", "medium")]

    green_tree = STRtree(green_geoms) if green_geoms else None
    water_tree = STRtree(water_geoms) if water_geoms else None
    flood_tree = STRtree(flood_geoms) if flood_geoms else None

    # Ward NDVI, looked up by whichever ward polygon contains the cell centre.
    veg = _feature_geoms(get_vegetation(city_id))
    veg_geoms = [g for g, _ in veg]
    veg_ndvi = [float(p.get("ndvi_mean") or 0.0) for _, p in veg]
    veg_tree = STRtree(veg_geoms) if veg_geoms else None
    ndvi_values = [v for v in veg_ndvi if v > 0]
    ndvi_lo = min(ndvi_values) if ndvi_values else 0.0
    ndvi_hi = max(ndvi_values) if ndvi_values else 1.0

    out_cells = []
    for f in cells:
        cell = _valid(f.get("geometry"))
        if cell is None:
            continue
        area = cell.area
        props = f.get("properties", {}) or {}
        pressure = float(props.get("growth_probability") or 0.0)

        green_frac = _coverage(green_tree, green_geoms, cell, area)
        water_frac = _coverage(water_tree, water_geoms, cell, area)
        flood_frac = _coverage(flood_tree, flood_geoms, cell, area)

        ndvi = 0.0
        if veg_tree is not None:
            centre = cell.centroid
            for idx in veg_tree.query(centre):
                i = int(idx)
                if veg_geoms[i].contains(centre):
                    ndvi = veg_ndvi[i]
                    break
        ndvi_norm = (
            (ndvi - ndvi_lo) / (ndvi_hi - ndvi_lo) if ndvi_hi > ndvi_lo and ndvi > 0 else 0.0
        )

        components = {
            # Coverage fractions saturate quickly: a cell that is a fifth park
            # is already ecologically meaningful, so scale rather than use the
            # raw fraction, which would only ever flag whole reserves.
            "green": min(1.0, green_frac * 2.5),
            "water": min(1.0, water_frac * 4.0),
            "ndvi": max(0.0, min(1.0, ndvi_norm)),
            "flood": min(1.0, flood_frac * 2.0),
        }
        sensitivity = 100.0 * sum(
            SENSITIVITY_WEIGHTS[k] * components[k] for k in SENSITIVITY_WEIGHTS
        )
        # The product is the point: conservation priority exists only where
        # ecological value and development pressure coincide. A sum would rank
        # a pristine untouched cell alongside a threatened one.
        priority = sensitivity * pressure

        out_cells.append({
            "centroid": [round(cell.centroid.x, 5), round(cell.centroid.y, 5)],
            "sensitivity": round(sensitivity, 1),
            "pressure": round(pressure, 3),
            "risk_category": props.get("risk_category"),
            "priority": round(priority, 1),
            "components": {k: round(v, 3) for k, v in components.items()},
            "at_risk": sensitivity >= PRIORITY_SENSITIVITY_MIN and pressure >= PRIORITY_PRESSURE_MIN,
        })

    out_cells.sort(key=lambda c: -c["priority"])
    at_risk = [c for c in out_cells if c["at_risk"]]
    sens_all = [c["sensitivity"] for c in out_cells] or [0.0]

    return {
        "city": city_id,
        "cell_count": len(out_cells),
        "weights": SENSITIVITY_WEIGHTS,
        "thresholds": {
            "sensitivity_min": PRIORITY_SENSITIVITY_MIN,
            "pressure_min": PRIORITY_PRESSURE_MIN,
        },
        "summary": {
            "cells_at_risk": len(at_risk),
            "share_at_risk_pct": round(len(at_risk) / len(out_cells) * 100, 1) if out_cells else 0.0,
            "mean_sensitivity": round(sum(sens_all) / len(sens_all), 1),
            "peak_priority": out_cells[0]["priority"] if out_cells else 0.0,
        },
        "priorities": out_cells[:25],
        "cells": out_cells,
    }


def conservation(city_id: str) -> dict:
    """Ecologically sensitive land ranked by the development pressure on it."""
    from app.data.database import load_json_cache, store_json_cache
    from app.data.loader import ACTIVE_DB_PATH

    signature = f"{data_signature(city_id)}|{ANALYTIC_VERSION}"
    if ACTIVE_DB_PATH is not None:
        hit = load_json_cache(ACTIVE_DB_PATH, "conservation", city_id, signature)
        if isinstance(hit, dict):
            return hit
    with singleflight(("conservation", city_id, signature)):
        if ACTIVE_DB_PATH is not None:
            hit = load_json_cache(ACTIVE_DB_PATH, "conservation", city_id, signature)
            if isinstance(hit, dict):
                return hit
        result = _conservation_cached(city_id, signature)
        if ACTIVE_DB_PATH is not None:
            store_json_cache(ACTIVE_DB_PATH, "conservation", city_id, signature, result)
        return result


def _encroachment_cached(city_id: str, signature: str) -> dict:
    """Built land overlapping protected water and green polygons.

    Real geometry against real geometry: only parcels that came from a mapped
    OSM boundary are considered, never the modelled gap-fill grid, and the
    thing they intrude on is a mapped water body or park. Nothing here uses
    ownership or zoning.
    """
    green = _feature_geoms(get_greenspace(city_id))
    water = _feature_geoms(get_water(city_id))
    targets = [(g, p, "green") for g, p in green] + [(g, p, "water") for g, p in water]
    if not targets:
        return {"city": city_id, "candidates": [], "summary": {}}

    target_geoms = [t[0] for t in targets]
    tree = STRtree(target_geoms)

    candidates = []
    for p in get_parcels(city_id):
        # The modelled fill grid covers land no source maps; an overlap with it
        # says nothing about the ground. Only mapped boundaries can testify.
        if p.source == "modelled-fill":
            continue
        if p.land_use not in BUILT_USES:
            continue
        geom = _valid(p.geometry)
        if geom is None or geom.area <= 0:
            continue
        for idx in tree.query(geom):
            i = int(idx)
            tgeom, tprops, kind = targets[i]
            try:
                inter = geom.intersection(tgeom)
            except Exception:  # noqa: BLE001
                continue
            if inter.is_empty:
                continue
            frac = inter.area / geom.area
            # Convert the overlap to m² using the parcel's own measured area,
            # so the figure stays in real units without projecting geometry.
            overlap_sqm = frac * float(p.area_sqm)
            if overlap_sqm < ENCROACH_MIN_SQM or frac < ENCROACH_MIN_FRACTION:
                continue
            candidates.append({
                "parcel_id": p.parcel_id,
                "ward": p.ward,
                "land_use": p.land_use,
                "parcel_source": p.source,
                "centroid": list(p.centroid),
                "intrudes_on": kind,
                "target_name": tprops.get("name") or tprops.get("category") or kind,
                "target_category": tprops.get("category"),
                "target_source": tprops.get("source"),
                "overlap_sqm": round(overlap_sqm),
                "overlap_pct": round(frac * 100, 1),
                # A partial overlap is the signature of an actual intrusion:
                # built land crossing into a protected boundary. Total
                # containment is more often one real-world feature mapped in
                # two layers — the institutional polygon of a monument sitting
                # inside the water polygon of its own tank, for instance. Both
                # are reported, because dropping the contained ones would hide
                # genuine wholesale occupation of a lake bed; they are just
                # not presented as equally likely.
                "confidence": "review" if frac >= CONTAINED_FRACTION else "likely",
            })

    candidates.sort(key=lambda c: -c["overlap_sqm"])
    water_hits = [c for c in candidates if c["intrudes_on"] == "water"]
    green_hits = [c for c in candidates if c["intrudes_on"] == "green"]

    return {
        "city": city_id,
        "thresholds": {"min_sqm": ENCROACH_MIN_SQM, "min_fraction": ENCROACH_MIN_FRACTION},
        "summary": {
            "candidates": len(candidates),
            "on_water": len(water_hits),
            "on_green": len(green_hits),
            "likely": sum(1 for c in candidates if c["confidence"] == "likely"),
            "needs_review": sum(1 for c in candidates if c["confidence"] == "review"),
            "total_overlap_ha": round(sum(c["overlap_sqm"] for c in candidates) / 10_000, 2),
            "water_overlap_ha": round(sum(c["overlap_sqm"] for c in water_hits) / 10_000, 2),
            "green_overlap_ha": round(sum(c["overlap_sqm"] for c in green_hits) / 10_000, 2),
        },
        "candidates": candidates[:100],
    }


def encroachment(city_id: str) -> dict:
    """Candidate intrusions of built land into mapped water and green space."""
    from app.data.database import load_json_cache, store_json_cache
    from app.data.loader import ACTIVE_DB_PATH

    signature = f"{data_signature(city_id)}|{ANALYTIC_VERSION}"
    if ACTIVE_DB_PATH is not None:
        hit = load_json_cache(ACTIVE_DB_PATH, "encroachment", city_id, signature)
        if isinstance(hit, dict):
            return hit
    with singleflight(("encroachment", city_id, signature)):
        if ACTIVE_DB_PATH is not None:
            hit = load_json_cache(ACTIVE_DB_PATH, "encroachment", city_id, signature)
            if isinstance(hit, dict):
                return hit
        result = _encroachment_cached(city_id, signature)
        if ACTIVE_DB_PATH is not None:
            store_json_cache(ACTIVE_DB_PATH, "encroachment", city_id, signature, result)
        return result
