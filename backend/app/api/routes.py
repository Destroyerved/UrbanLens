"""API routes (PRD §56).

Every route takes `?city=` and defaults to Ahmedabad.
"""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter, HTTPException, Query

from app.core.config import CITIES, get_city
from app.data.loader import FACILITY_TYPES, get_dataset
from app.gis.raster import population_within_km
from app.ml import development_model

router = APIRouter()


def _dataset(city: str | None):
    try:
        return get_dataset(city)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/health")
def health(city: str | None = Query(default=None)) -> dict:
    ds = _dataset(city)
    by_type: dict[str, int] = {}
    for f in ds.facilities:
        t = f["properties"].get("facility_type", "?")
        by_type[t] = by_type.get(t, 0) + 1
    return {
        "ok": True,
        "engine": "python",
        "city": ds.city.id,
        "city_name": ds.city.name,
        "counts": {
            "wards": len(ds.wards),
            "land_polygons": len(ds.land),
            "facilities": len(ds.facilities),
            "roads": len(ds.roads),
            "population_cells": ds.grid.populated_cells,
        },
        "population_total": ds.population,
        "facilities_by_type": by_type,
        "grid": {
            "cell_size_m": 250,
            "rows": ds.grid.rows,
            "cols": ds.grid.cols,
        },
    }


@router.get("/cities")
def cities() -> dict:
    return {
        "cities": [
            {
                "id": c.id,
                "name": c.name,
                "state": c.state,
                "center": list(c.center),
                "zoom": c.zoom,
                "corridors": [co.name for co in c.corridors],
            }
            for c in CITIES.values()
        ],
        "default": get_city(None).id,
    }


@router.get("/wards")
def wards(city: str | None = Query(default=None)) -> dict:
    ds = _dataset(city)
    return {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "geometry": w["geometry"], "properties": w["properties"]}
            for w in ds.wards
        ],
    }


@router.get("/population")
def population(city: str | None = Query(default=None), step: int = Query(default=1, ge=1, le=8)) -> dict:
    """Population raster as points — the density heatmap layer (PRD §7, §68)."""
    ds = _dataset(city)
    g = ds.grid
    lng_g, lat_g = g.cell_centres()
    mask = g.pop > 0
    rows, cols = np.where(mask)
    keep = (rows % step == 0) & (cols % step == 0)
    rows, cols = rows[keep], cols[keep]

    features = [
        {
            "type": "Feature",
            "properties": {
                "density": round(float(g.density[r, c])),
                "population": round(float(g.pop[r, c])),
            },
            "geometry": {
                "type": "Point",
                "coordinates": [round(float(lng_g[r, c]), 5), round(float(lat_g[r, c]), 5)],
            },
        }
        for r, c in zip(rows, cols)
    ]
    return {
        "type": "FeatureCollection",
        "properties": {
            "cell_size_m": 250,
            "cells": len(features),
            "max_density": round(float(g.density.max())),
            "total_population": ds.population,
            "source": "derived",
        },
        "features": features,
    }


@router.get("/accessibility")
def accessibility(
    lng: float,
    lat: float,
    city: str | None = Query(default=None),
) -> dict:
    """15-minute-city reading at a point (PRD §14)."""
    ds = _dataset(city)
    walk_kmh, drive_kmh = 4.8, 22.0
    plan = [
        ("hospital", "drive"), ("clinic", "walk"), ("school", "walk"),
        ("park", "walk"), ("bus_stop", "walk"), ("metro_station", "drive"),
        ("government_office", "drive"),
    ]
    items = []
    for ftype, mode in plan:
        idx = ds.facility_index.get(ftype)
        dist = idx.nearest_km(lng, lat) if idx and len(idx) else float("inf")
        speed = walk_kmh if mode == "walk" else drive_kmh
        minutes = (dist / speed) * 60 if np.isfinite(dist) else 999
        items.append({
            "facility_type": ftype,
            "mode": mode,
            "distance_km": round(dist, 2) if np.isfinite(dist) else None,
            "minutes": round(minutes),
            "reachable": bool(minutes <= 15),
        })
    reachable = sum(1 for i in items if i["reachable"])
    return {
        "point": [lng, lat],
        "items": items,
        "score": round(100 * reachable / len(items)),
    }


@router.get("/population/within")
def population_within(
    lng: float,
    lat: float,
    radius_km: float = Query(default=3.0, gt=0, le=50),
    city: str | None = Query(default=None),
) -> dict:
    ds = _dataset(city)
    return {
        "point": [lng, lat],
        "radius_km": radius_km,
        "population": population_within_km(ds.grid, lng, lat, radius_km),
    }


@router.get("/ml/model")
def ml_model(city: str | None = Query(default=None)) -> dict:
    """The trained development model's metrics and feature importances (PRD §11)."""
    ds = _dataset(city)
    report = development_model.load_report(ds.city.id)
    if report is None:
        raise HTTPException(
            status_code=404,
            detail=f"No trained model for '{ds.city.id}'. Run: python -m app.ml.train {ds.city.id}",
        )
    return report


@router.post("/ml/train")
def ml_train(city: str | None = Query(default=None)) -> dict:
    ds = _dataset(city)
    from dataclasses import asdict

    return asdict(development_model.train(ds))


@router.get("/facilities")
def facilities(
    city: str | None = Query(default=None),
    facility_type: str | None = Query(default=None),
) -> dict:
    ds = _dataset(city)
    feats = ds.facilities
    if facility_type:
        if facility_type not in FACILITY_TYPES:
            raise HTTPException(status_code=400, detail=f"Unknown facility type '{facility_type}'")
        feats = [f for f in feats if f["properties"].get("facility_type") == facility_type]
    return {"type": "FeatureCollection", "features": feats}
