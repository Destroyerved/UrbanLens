"""DEM-driven flood susceptibility.

The old per-parcel rule was essentially "far from water ⇒ low risk". This module
replaces it with a real terrain model: the Copernicus DEM 30 m (fetched by
web/scripts/fetch-dem.py into D:\\UrbanLens-data\\dem) supplies elevation, and
the built water layer supplies water polygons. Risk at every 30 m cell combines
* elevation (floodplains are flat and low) and
* proximity to real water bodies / rivers / wetlands,
so a parcel can be high-risk despite being far from water (a low-lying basin)
or low-risk despite touching water (steep, high bank).

Scores are thresholds into high / medium / low so the map legend and the parcel
`flood_risk` attribute stay identical — one model, one source of truth.

When the DEM is absent (fresh clone without the pipeline data) everything falls
back to the old heuristic so nothing breaks.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

from app.core.config import REPO_ROOT

# Copernicus DEM 30 m tiles, clipped to Gujarat and coarsened to 90 m by
# web/scripts/shrink-dem.py. Lives in the repo so the project folder is
# self-contained and shareable; overridable with URBANLENS_DEM.
DEM_DIR = Path(
    os.environ.get("URBANLENS_DEM", REPO_ROOT / "datasets" / "dem")
)

# Risk-model constants (degrees of thresholding, not sacred numbers).
WATER_NEAR_M = 150.0
WATER_MID_M = 400.0
WATER_FAR_M = 800.0
ELEV_LOW_M = 6.0
ELEV_MID_M = 15.0
ELEV_HIGH_M = 30.0
CELL_M = 30.0

LEVELS = {0: "low", 1: "medium", 2: "high"}


class FloodRisk:
    """A district's precomputed risk raster, sampleable at any lon/lat."""

    def __init__(self, levels: np.ndarray, elev: np.ndarray, transform):
        self.levels = levels
        self.elev = elev
        self.transform = transform
        self.height, self.width = levels.shape

    def at(self, lng: float, lat: float) -> tuple[str, int | None] | None:
        try:
            col, row = ~self.transform * (lng, lat)
            c, r = int(col), int(row)
            if r < 0 or c < 0 or r >= self.height or c >= self.width:
                return None
            level = int(self.levels[r, c])
            e = self.elev[r, c]
            elev_m = None if e is None or np.isnan(e) else int(round(float(e)))
            return LEVELS[level], elev_m
        except Exception:  # noqa: BLE001
            return None


def _tiles_for(bbox: tuple[float, float, float, float]):
    import math

    minx, miny, maxx, maxy = bbox
    out = []
    for lat in range(math.floor(miny), math.floor(maxy) + 1):
        for lon in range(math.floor(minx), math.floor(maxx) + 1):
            p = DEM_DIR / f"N{lat:02d}_E{lon:03d}.tif"
            if p.exists():
                out.append(p)
    return out


def _load_dem(bbox):
    """Merge the DEM tiles covering bbox into one array + transform."""
    tiles = _tiles_for(bbox)
    if not tiles:
        return None, None
    import rasterio
    from rasterio.merge import merge

    with rasterio.Env():
        datasets = [rasterio.open(t) for t in tiles]
        try:
            data, transform = merge(
                datasets, bounds=bbox, res=(1 / 3600, 1 / 3600), nodata=-32767
            )
        finally:
            for d in datasets:
                d.close()
    band = data[0]
    if hasattr(band, "filled"):
        band = band.filled(np.nan)
    elev = np.asarray(band).astype(np.float32)
    return elev, transform


def _water_mask(water_fc, transform, shape):
    import rasterio
    from rasterio.features import rasterize

    shapes = [
        (feat["geometry"], 1) for feat in water_fc.get("features", [])
    ]
    if not shapes:
        return np.zeros(shape, dtype=bool)
    out = rasterize(
        shapes,
        out_shape=shape,
        transform=transform,
        fill=0,
        all_touched=True,
        dtype="uint8",
    )
    return out.astype(bool)


def compute_risk(
    bbox: tuple[float, float, float, float], water_fc: dict[str, Any] | None
) -> tuple[np.ndarray, np.ndarray, Any] | None:
    """Elevation + water-distance score raster for a district. Returns
    (levels, elev_m, transform), or None when no DEM is installed."""
    elev, transform = _load_dem(bbox)
    if elev is None or transform is None:
        return None
    import scipy.ndimage as ndi

    elev = np.nan_to_num(elev, nan=999.0)

    mask = _water_mask(water_fc or {"features": []}, transform, elev.shape)
    dist_m = ndi.distance_transform_edt(~mask) * CELL_M

    prox = np.zeros_like(dist_m)
    prox = np.where(dist_m < WATER_NEAR_M, 2.0, prox)
    prox = np.where((dist_m >= WATER_NEAR_M) & (dist_m < WATER_MID_M), 1.5, prox)
    prox = np.where((dist_m >= WATER_MID_M) & (dist_m < WATER_FAR_M), 0.5, prox)

    el = np.zeros_like(elev)
    el = np.where(elev < ELEV_LOW_M, 3.0, el)
    el = np.where((elev >= ELEV_LOW_M) & (elev < ELEV_MID_M), 2.0, el)
    el = np.where((elev >= ELEV_MID_M) & (elev < ELEV_HIGH_M), 1.0, el)

    score = prox + el
    score[mask] = 5.0  # water itself is always high risk

    levels = np.zeros_like(score, dtype=np.uint8)
    levels = np.where(score >= 4.5, 2, levels)
    levels = np.where((score >= 3.0) & (score < 4.5), 1, levels)
    return levels, elev, transform


def load_district(ds) -> FloodRisk | None:
    """Backend entry point: build (and cache) the risk raster for a Dataset."""
    if not DEM_DIR.exists():
        return None
    try:
        from app.data.loader import get_water

        water = get_water(ds.city.id)
    except FileNotFoundError:
        water = None
    bounds = [np.inf, np.inf, -np.inf, -np.inf]
    from shapely.geometry import shape as shp

    for w in ds.wards:
        minx, miny, maxx, maxy = shp(w["geometry"]).bounds
        bounds[0] = min(bounds[0], minx)
        bounds[1] = min(bounds[1], miny)
        bounds[2] = max(bounds[2], maxx)
        bounds[3] = max(bounds[3], maxy)
    if not np.isfinite(bounds[0]):
        return None
    res = compute_risk(tuple(bounds), water)
    if res is None:
        return None
    levels, elev, transform = res
    return FloodRisk(levels, elev, transform)