"""The growth-probability surface, served by the trained model (PRD §11).

This is where the ML earns its place: rather than a hand-written formula, each
cell's score comes from the gradient-boosted classifier in
`development_model`, and the same feature importances that explain the model
explain the layer.

Read the honesty note in `development_model` before quoting this as a forecast.
The model scores how developed a location *looks* given roads, people and
existing development. On undeveloped land that reads as development pressure —
a real planning signal — but it is not a dated prediction, and the response
labels it accordingly.
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np
from shapely.geometry import Point, shape
from shapely.prepared import prep
from shapely.strtree import STRtree

from app.core.config import MODEL_DIR
from app.data.loader import get_dataset
from app.gis.parcels import _nearest_core
from app.gis.raster import PointIndex, density_at, population_within_km

CELL_DEG = 0.008  # ~0.85 km


def risk_category(p: float) -> str:
    if p < 0.2:
        return "very_low"
    if p < 0.4:
        return "low"
    if p < 0.6:
        return "medium"
    if p < 0.8:
        return "high"
    return "very_high"


@lru_cache(maxsize=4)
def _model(city_id: str):
    """The trained classifier, or None if it cannot be used.

    Returning None is a supported state, not a failure: `growth_grid` falls back
    to the proximity heuristic and labels the layer accordingly. Both reasons to
    give up — no model file, and no xgboost on the machine — have to reach that
    fallback. Importing xgboost at the top of this function meant an install
    without it raised straight through the route and the 2030 layer (PRD §11)
    500'd instead of degrading.
    """
    path = MODEL_DIR / f"development_{city_id}.json"
    if not path.exists():
        return None
    try:
        import xgboost as xgb
    except ImportError:
        return None
    booster = xgb.XGBClassifier()
    booster.load_model(str(path))
    return booster


@lru_cache(maxsize=4)
def growth_grid(city_id: str) -> dict:
    """Score a grid of cells clipped to the municipal outline."""
    from app.ml.development_model import BUILT_UP, FEATURE_NAMES

    ds = get_dataset(city_id)
    model = _model(city_id)

    ward_geoms = [shape(w["geometry"]) for w in ds.wards]
    tree = STRtree(ward_geoms)
    prepared = [prep(g) for g in ward_geoms]

    # "Distance to built-up land" needs a reference set of already-built places.
    built_pts = [
        tuple(shape(f["geometry"]).centroid.coords[0])
        for f in ds.land
        if f["properties"].get("land_use") in BUILT_UP
    ]
    built_idx = PointIndex(built_pts)

    min_lng, min_lat, max_lng, max_lat = ds.city.bbox
    rows: list[list[float]] = []
    cells: list[tuple[float, float]] = []

    lat = min_lat
    while lat < max_lat:
        lng = min_lng
        while lng < max_lng:
            cx, cy = lng + CELL_DEG / 2, lat + CELL_DEG / 2
            pt = Point(cx, cy)
            inside = any(prepared[i].contains(pt) for i in tree.query(pt))
            if inside:
                _, core_km = _nearest_core(ds.city, cx, cy)
                transit = min(
                    ds.facility_index["bus_stop"].nearest_km(cx, cy),
                    ds.facility_index["metro_station"].nearest_km(cx, cy),
                )
                rows.append([
                    ds.road_index.nearest_km(cx, cy),
                    core_km,
                    built_idx.nearest_km(cx, cy),
                    ds.facility_index["hospital"].nearest_km(cx, cy),
                    ds.facility_index["school"].nearest_km(cx, cy),
                    transit,
                    density_at(ds.grid, cx, cy),
                    float(population_within_km(ds.grid, cx, cy, 3.0)),
                    # Cell area in hectares — the model's size feature. Every
                    # cell is the same size, so this contributes no signal here;
                    # it is present only to match the training feature order.
                    (CELL_DEG * 111.32) ** 2 * 100,
                ])
                cells.append((lng, lat))
            lng += CELL_DEG
        lat += CELL_DEG

    if not cells:
        return {"type": "FeatureCollection", "features": [], "properties": {"model": "none"}}

    X = np.asarray(rows, dtype=float)
    if model is not None:
        probs = model.predict_proba(X)[:, 1]
        source = "xgboost"
    else:
        # No trained model — fall back to a transparent proximity heuristic so
        # the layer still renders, and say which produced it.
        probs = np.clip(np.exp(-X[:, 2] / 1.5) * 0.8 + np.exp(-X[:, 0] / 1.2) * 0.2, 0.01, 0.99)
        source = "heuristic"

    features = []
    for (lng, lat), p in zip(cells, probs):
        features.append({
            "type": "Feature",
            "properties": {
                "growth_probability": round(float(p), 3),
                "risk_category": risk_category(float(p)),
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [round(lng, 6), round(lat, 6)],
                    [round(lng + CELL_DEG, 6), round(lat, 6)],
                    [round(lng + CELL_DEG, 6), round(lat + CELL_DEG, 6)],
                    [round(lng, 6), round(lat + CELL_DEG, 6)],
                    [round(lng, 6), round(lat, 6)],
                ]],
            },
        })

    return {
        "type": "FeatureCollection",
        "properties": {
            "model": source,
            "cells": len(features),
            "cell_size_km": round(CELL_DEG * 111.32, 2),
            "feature_names": FEATURE_NAMES,
            "interpretation": (
                "Probability that a location resembles already-developed land, given roads, "
                "people and existing development. On undeveloped land this reads as development "
                "pressure. It is not a dated forecast — that needs observed built-up extent at "
                "two dates (GHSL or Sentinel-2)."
            ),
        },
        "features": features,
    }
