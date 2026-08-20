"""DEM-driven flood susceptibility (v2).

v1 scored absolute elevation + Euclidean water distance and sampled each parcel
at its centroid. v2 uses the physically meaningful signal instead:

* **height above the nearest water surface** (`rel_height = elev - water_elev`)
  — a parcel close to a river that sits high above it is safe; a low-lying
  basin far from any water is not.
* **slope** from the DEM gradient — flat floodplains accumulate, steep banks
  drain.
* **water distance** as a mild secondary term inside the floodplain.

Risk at every DEM cell combines these into a score that thresholds into the
same three levels (low / medium / high) as v1, so the map legend, the parcel
`flood_risk` attribute and the vector search feature all stay identical.

Parcel-level values are aggregated over the parcel's own footprint rather than
sampled at its centroid: the level is the max over the parcel's cells unless a
small high-risk sliver would overstate it (a parcel is only high when a real
share of its area is at risk), and elevation is the mean over its cells.

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
# The DEM is merged at 1/3600 deg (~30 m) cells but the source data is 90 m,
# so slope is measured over 3 cells to match the true data resolution.
CELL_M = 30.0
DATA_RES_CELLS = 3
SLOPE_SPACING_M = CELL_M * DATA_RES_CELLS  # 90 m

WATER_NEAR_M = 150.0
WATER_MID_M = 400.0

# Height above the nearest water surface, in metres.
REL_HIGH_M = 1.5
REL_MED_HIGH_M = 3.0
REL_MED_M = 5.0
REL_LOW_M = 8.0
REL_FAR_M = 12.0

# Slope thresholds in degrees.
FLAT_SLOPE_DEG = 0.5
GENTLE_SLOPE_DEG = 1.5
MODERATE_SLOPE_DEG = 3.0
STEEP_SLOPE_DEG = 5.0

LEVELS = {0: "low", 1: "medium", 2: "high"}


class FloodRisk:
    """A district's precomputed risk raster, sampleable at any lon/lat."""

    def __init__(self, levels, elev, water, transform):
        self.levels = levels
        self.elev = elev
        self.water = water
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
            elev_m = None if e is None or np.isnan(e) or e > 900 else int(round(float(e)))
            return LEVELS[level], elev_m
        except Exception:  # noqa: BLE001
            return None

    def polygon_stats(self, rings: list[list[tuple[float, float]]]) -> dict[int, tuple[str, int | None]]:
        """Aggregate risk over each parcel's footprint (list of lon/lat rings).

        Returns {parcel_index: (level_str, mean_elevation_m)}. Water cells are
        excluded from the aggregation so a parcel merely touching a river is
        not dragged to high by the water column itself.
        """
        from rasterio.features import rasterize
        from shapely.geometry import Polygon

        n = len(rings)
        geoms = [
            (Polygon(r), i + 1)
            for i, r in enumerate(rings)
            if len(r) >= 4
        ]
        if not geoms:
            return {}
        rid = rasterize(
            geoms,
            out_shape=self.levels.shape,
            transform=self.transform,
            fill=0,
            all_touched=True,
            dtype="int32",
        ).ravel()

        # Only land cells count towards a parcel's flood level.
        land = np.where(self.water.ravel(), 0, rid)
        cell_cnt = np.bincount(land, minlength=n + 1)

        high = np.bincount(land, weights=(self.levels.ravel() >= 2), minlength=n + 1)
        med_plus = np.bincount(land, weights=(self.levels.ravel() >= 1), minlength=n + 1)

        elev_valid = self.elev.ravel() < 900
        elev_sum = np.bincount(land, weights=np.where(elev_valid, self.elev.ravel(), 0.0), minlength=n + 1)
        elev_cnt = np.bincount(land, weights=elev_valid.astype(np.float64), minlength=n + 1)

        out: dict[int, tuple[str, int | None]] = {}
        for i in range(1, n + 1):
            c = int(cell_cnt[i])
            if c == 0:
                continue
            fh = high[i] / c
            fp = med_plus[i] / c
            level = 2 if fh >= 0.05 else (1 if fp >= 0.2 else 0)
            elev_m = int(round(elev_sum[i] / elev_cnt[i])) if elev_cnt[i] > 0 else None
            out[i - 1] = (LEVELS[level], elev_m)
        return out


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
    try:
        import rasterio
        from rasterio.merge import merge
    except ImportError:
        # The DEM tiles ship with the repo, so reaching here means the reader is
        # missing rather than the data. Same outcome as no DEM: the heuristic
        # takes over instead of taking the whole parcel build down.
        return None, None

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


def _water_surface_elevation(elev: np.ndarray, water: np.ndarray) -> np.ndarray:
    """Elevation of the nearest water surface for every cell.

    For each cell we take the DEM elevation of the nearest water cell, so
    `elev - water_surf` is the height a flood would have to rise to reach the
    cell along the shortest terrain route.
    """
    import scipy.ndimage as ndi

    _, idx = ndi.distance_transform_edt(~water, return_distances=True, return_indices=True)
    return elev[idx[0], idx[1]]


def compute_risk(
    bbox: tuple[float, float, float, float], water_fc: dict[str, Any] | None
) -> tuple[np.ndarray, np.ndarray, np.ndarray, Any] | None:
    """Height-above-water + slope + distance score raster for a district.

    Returns (levels, elev_m, water_mask, transform), or None when no DEM is
    installed.
    """
    elev, transform = _load_dem(bbox)
    if elev is None or transform is None:
        return None
    import scipy.ndimage as ndi

    elev = np.nan_to_num(elev, nan=999.0)
    water = _water_mask(water_fc or {"features": []}, transform, elev.shape)

    water_surf = _water_surface_elevation(elev, water)
    rel = np.where(water, 0.0, elev - water_surf)

    # Slope from the DEM gradient, measured at the true 90 m data spacing.
    gy, gx = np.gradient(elev, SLOPE_SPACING_M)
    slope_deg = np.degrees(np.arctan(np.hypot(gx, gy)))

    dist_m = ndi.distance_transform_edt(~water) * CELL_M

    # Height above the nearest water surface.
    rel_score = np.zeros_like(rel)
    rel_score = np.where(rel <= 0, 4.0, rel_score)
    rel_score = np.where((rel > 0) & (rel < REL_HIGH_M), 3.5, rel_score)
    rel_score = np.where((rel >= REL_HIGH_M) & (rel < REL_MED_HIGH_M), 3.0, rel_score)
    rel_score = np.where((rel >= REL_MED_HIGH_M) & (rel < REL_MED_M), 2.5, rel_score)
    rel_score = np.where((rel >= REL_MED_M) & (rel < REL_LOW_M), 2.0, rel_score)
    rel_score = np.where((rel >= REL_LOW_M) & (rel < REL_FAR_M), 1.0, rel_score)

    # Flat land amplifies flood accumulation; steep slopes drain.
    slope_mod = np.zeros_like(slope_deg)
    slope_mod = np.where(slope_deg < FLAT_SLOPE_DEG, 1.0, slope_mod)
    slope_mod = np.where(
        (slope_deg >= FLAT_SLOPE_DEG) & (slope_deg < GENTLE_SLOPE_DEG), 0.3, slope_mod
    )
    slope_mod = np.where(
        (slope_deg >= GENTLE_SLOPE_DEG) & (slope_deg < MODERATE_SLOPE_DEG), 0.0, slope_mod
    )
    slope_mod = np.where(
        (slope_deg >= MODERATE_SLOPE_DEG) & (slope_deg < STEEP_SLOPE_DEG), -0.5, slope_mod
    )
    slope_mod = np.where(slope_deg >= STEEP_SLOPE_DEG, -1.0, slope_mod)

    # Proximity only matters inside the floodplain.
    prox = np.zeros_like(dist_m)
    prox = np.where(dist_m < WATER_NEAR_M, 0.5, prox)
    prox = np.where((dist_m >= WATER_NEAR_M) & (dist_m < WATER_MID_M), 0.25, prox)

    score = rel_score + slope_mod + prox
    score[water] = 5.0  # water itself is always high risk

    levels = np.zeros_like(score, dtype=np.uint8)
    levels = np.where(score >= 4.0, 2, levels)
    levels = np.where((score >= 2.5) & (score < 4.0), 1, levels)
    return levels, elev, water, transform


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
    levels, elev, wmask, transform = res
    return FloodRisk(levels, elev, wmask, transform)