"""Raster -> GeoJSON ingestion for observed built-up history.

Build-time pipeline that turns the downloaded GHSL Built-up Surface R2023A
(100 m, EPSG:54009, epochs E1975..E2020) and Esri 10 m annual land cover
(UTM, class 7 = Built Area, years 2018/2022/2025) into vector artefacts per city:

  1. observed parcel history  {parcel_id: {year: built_up_percent}}
     stored in the json_cache table under key "observed-history". The forecast
     / parcels work consumes this to replace the synthetic history.
  2. per-epoch/per-year built-up extent FeatureCollections
     eventually stored in the layers table (builtup_ghsl_{epoch},
     builtup_esri_{year}) for the observed-built-up map layer.

No rasters are ever served at runtime; the browser only sees GeoJSON.

CLI:
    python -m app.data.ghsl --city ahmedabad                # all years
    python -m app.data.ghsl --city ahmedabad --kind ghsl
    python -m app.data.ghsl --city ahmedabad --kind esri
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[3]
GHSL_DIR = REPO_ROOT / "datasets" / "ghsl"
ESRI_DIR = REPO_ROOT / "datasets" / "esri"

GHSL_EPOCHS = ["1975", "1980", "1985", "1990", "1995",
               "2000", "2005", "2010", "2015", "2020"]
ESRI_YEARS = ["2018", "2022", "2024"]

# Target grid spacing in degrees (~55 m). Both 100 m GHSL and 10 m Esri are
# sub-pixel here, so zonal fractions aggregate cleanly.
WARP_DEG = 0.001        # observed_history: zonal stats want finer cells
EXTENT_DEG = 0.002      # display-only extents: coarser = far cheaper at district zoom
GHSL_CELL_M2 = 100.0 * 100.0
GHSL_BUILT_THRESHOLD = 1.0  # >= 1 m² of built area in a cell counts as built
ESRI_BUILT_CLASS = 7
SIMPLIFY_TOL = 0.0008  # ~90 m, keeps rendered polygons light
MIN_POLY_M2 = 150 * 150  # drop noise smaller than a 150 m block


def _city_bounds(lng: float, lat: float, radius_km: float) -> tuple[float, float, float, float]:
    d_lat = radius_km / 110.574
    d_lng = radius_km / (111.320 * max(0.1, abs(np.cos(np.radians(lat)))))
    return (lng - d_lng, lat - d_lat, lng + d_lng, lat + d_lat)


def _warp_clip(paths: list[Path], bounds: tuple[float, float, float, float],
               deg: float | None = None) -> np.ndarray | None:
    """Reproject+merge tiles into one WGS84 float32 array clipped to bounds."""
    import rasterio
    from rasterio.warp import reproject, Resampling

    deg = deg or WARP_DEG
    west, south, east, north = bounds
    width = max(1, int(round((east - west) / deg)))
    height = max(1, int(round((north - south) / deg)))
    transform = rasterio.transform.from_bounds(west, south, east, north, width, height)
    acc = np.full((height, width), np.nan, dtype=np.float32)

    any_data = False
    for p in paths:
        try:
            with rasterio.open(p) as src:
                if src.crs is None:
                    continue
                x0, y0, x1, y1 = rasterio.warp.transform_bounds(
                    src.crs, "EPSG:4326", *src.bounds)
                if not (x1 > west and x0 < east and y1 > south and y0 < north):
                    continue
                chunk = np.zeros((height, width), dtype=np.float32)
                reproject(
                    source=rasterio.band(src, 1),
                    destination=chunk,
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=transform,
                    dst_crs="EPSG:4326",
                    resampling=Resampling.bilinear,
                    dst_nodata=np.nan,
                )
                good = np.isfinite(chunk)
                if good.any():
                    acc = np.where(good, chunk, acc)
                    any_data = True
        except Exception:
            continue
    return acc if any_data else None


def _polygonize(built: np.ndarray, bounds, deg: float | None = None) -> list[dict]:
    import rasterio
    from rasterio.features import shapes
    from shapely.geometry import shape as to_shape, mapping

    deg = deg or WARP_DEG
    width = built.shape[1]
    height = built.shape[0]
    transform = rasterio.transform.from_bounds(*bounds, width, height)
    # poly.area is in square degrees; convert to m² (111.32 km/deg at equator).
    m2_per_deg2 = 111320.0 * 111320.0
    out = []
    for geom, value in shapes(built.astype("uint8"), mask=built, transform=transform):
        if value != 1:
            continue
        poly = to_shape(geom)
        if poly.area * m2_per_deg2 <= MIN_POLY_M2:
            continue
        poly = poly.simplify(SIMPLIFY_TOL, preserve_topology=True)
        if poly.is_empty or poly.area * m2_per_deg2 <= MIN_POLY_M2:
            continue
        out.append({"type": "Feature", "properties": {}, "geometry": mapping(poly)})
    return out


def observed_history(city_id: str, parcels, kind: str = "all") -> dict[str, dict[int, int]]:
    """Per-parcel built-up% by year for one city's Parcel list."""
    if not parcels:
        return {}
    cents = np.array([p.centroid for p in parcels])
    lng = float(cents[:, 0].mean()); lat = float(cents[:, 1].mean())
    spread_y = float(np.ptp(cents[:, 1])); spread_x = float(np.ptp(cents[:, 0]))
    spread = max(spread_y, spread_x) + 0.03
    bounds = (lng - spread, lat - spread, lng + spread, lat + spread)

    if kind in ("ghsl", "all"):
        sources = [("ghsl", y, sorted(GHSL_DIR.glob(f"E{y}_*.tif"))) for y in GHSL_EPOCHS]
    else:
        sources = [("esri", y, sorted(ESRI_DIR.glob(f"*_{y}.tif"))) for y in ESRI_YEARS]

    result: dict[str, dict[int, int]] = {}
    # Parcels are disjoint city plots, so one rasterize pass labels every cell
    # with its parcel index — then per-parcel zonal stats are a single boolean
    # mask each, instead of 10k+ geometry_mask calls per epoch.
    from rasterio.features import rasterize
    import rasterio

    for src, year, paths in sources:
        arr = _warp_clip(paths, bounds) if paths else None
        if arr is None:
            print(f"[ghsl] {src} {year}: no data in bounds, skipping")
            continue
        if src == "ghsl":
            frac_arr = arr / GHSL_CELL_M2
        else:
            frac_arr = (arr == ESRI_BUILT_CLASS).astype(np.float32)
        transform = rasterio.transform.from_bounds(*bounds, arr.shape[1], arr.shape[0])
        label = rasterize(
            ((p.geometry, i + 1) for i, p in enumerate(parcels)),
            out_shape=arr.shape,
            transform=transform,
            fill=0,
            dtype="int32",
        )
        for i, p in enumerate(parcels):
            vals = frac_arr[label == i + 1]
            vals = vals[np.isfinite(vals)]
            frac = float(np.clip(vals.mean() if vals.size else 0.0, 0.0, 1.0))
            if not np.isfinite(frac):
                frac = 0.0
            result.setdefault(p.parcel_id, {})[int(year)] = int(round(frac * 100))
        mean_pct = frac_arr.mean()
        mean_pct = 0.0 if np.isnan(mean_pct) else mean_pct
        print(f"[ghsl] {src} {year}: {int(round(mean_pct * 100))}% mean cell built-up")
    return result


def extract_extents(city_id: str, kind: str = "all") -> dict[str, list[dict]]:
    """Per-year built-up extent FeatureCollections for one city."""
    from app.core.config import get_city
    city = get_city(city_id)
    west, south, east, north = _city_bounds(*city.center, city.radius_km)
    bounds = (west, south, east, north)

    out: dict[str, list[dict]] = {}
    if kind in ("ghsl", "all"):
        for y in GHSL_EPOCHS:
            paths = sorted(GHSL_DIR.glob(f"E{y}_*.tif"))
            arr = _warp_clip(paths, bounds, EXTENT_DEG) if paths else None
            if arr is None:
                continue
            built = np.isfinite(arr) & (arr >= GHSL_BUILT_THRESHOLD)
            out[f"builtup_ghsl_{y}"] = _polygonize(built, bounds, EXTENT_DEG)
            print(f"[ghsl] extent {y}: {len(out[f'builtup_ghsl_{y}'])} polygons")
    if kind in ("esri", "all"):
        for y in ESRI_YEARS:
            paths = sorted(ESRI_DIR.glob(f"*_{y}.tif"))
            arr = _warp_clip(paths, bounds, EXTENT_DEG) if paths else None
            if arr is None:
                continue
            built = np.isfinite(arr) & (arr == ESRI_BUILT_CLASS)
            out[f"builtup_esri_{y}"] = _polygonize(built, bounds, EXTENT_DEG)
            print(f"[ghsl] extent {y}: {len(out[f'builtup_esri_{y}'])} polygons")
    return out


def count_extent_km2(fc: list[dict]) -> float:
    """Sum of polygon areas in km² — sanity check against published totals."""
    from shapely.geometry import shape
    from pyproj import Geod

    geod = Geod(ellps="WGS84")
    total = 0.0
    for f in fc:
        try:
            poly = shape(f["geometry"])
            area_m2 = abs(geod.geometry_area_perimeter(poly)[0])
            total += area_m2
        except Exception:
            continue
    return total / 1e6


def store_artifacts(city_id: str, hist: dict, extents: dict[str, list[dict]]) -> None:
    import sqlite3
    import orjson
    from datetime import datetime, timezone
    from app.data.database import ensure_database, store_json_cache
    from app.data.loader import ACTIVE_DB_PATH
    from app.data import loader

    db = ACTIVE_DB_PATH or REPO_ROOT / "backend" / "urbanlens.db"
    ensure_database(db)
    sig = loader.data_signature(city_id)

    store_json_cache(db, "observed-history", city_id, sig, hist)

    ts = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(db, timeout=30) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA busy_timeout=15000")
        for layer_name, feats in extents.items():
            fc = {"type": "FeatureCollection", "features": feats}
            conn.execute(
                "INSERT INTO layers(city,layer,data,updated_at) VALUES(?,?,?,?) "
                "ON CONFLICT(city,layer) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
                (city_id, layer_name, orjson.dumps(fc).decode(), ts),
            )
    print(f"[ghsl] stored observed-history ({len(hist)} parcels) + {len(extents)} layer(s) for {city_id}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", default="ahmedabad")
    ap.add_argument("--kind", choices=["ghsl", "esri", "all"], default="all")
    args = ap.parse_args()

    from app.gis.parcels import get_parcels
    from app.core.config import get_city

    city = get_city(args.city)
    print(f"[ghsl] city={args.city} center={city.center} radius={city.radius_km}km")
    parcels = get_parcels(args.city)
    print(f"[ghsl] {len(parcels)} parcels")

    hist = observed_history(args.city, parcels, args.kind)
    extents = extract_extents(args.city, args.kind)
    store_artifacts(args.city, hist, extents)

    for name, fc in extents.items():
        print(f"[ghsl] {name}: {count_extent_km2(fc):.1f} km² built-up extent")
    if hist:
        sample = next(iter(hist.items()))
        print(f"[ghsl] sample parcel {sample[0]}: {sample[1]}")