"""Build observed built-up history from Esri Global Land Cover rasters.

Esri's 10 m annual land cover (Sentinel-2 based; built-up class = 5) is stored
per UTM tile per year in datasets/esri/{tile}_{year}.tif. For every district
this script:

* reads each tile/year windowed over the district bbox, downsampled to ~30 m
  by majority class,
* assigns every pixel to the engine's analysis-grid cell (vectorized lon/lat
  lookup) and to its parcel footprint (rasterized once per district),
* counts built pixels per grid cell and per parcel for 2018 / 2022 / 2024,
* writes web/data/engine/{city}_observed.json:

    {
      "km2":     {"2018": n, "2022": n, "2024": n},        // built area, km²
      "grid":    {layout matching the engine grid,         // built fractions
                  "built": [[r, c, b18, b22, b24], ...]},
      "parcels": {"GJ-AM-00001": {"2018": 55, ...}, ...}   // built-up %
    }

The engine's growth summary, parcel history, built-up layers and the bootstrap
grid all read this file; when it is absent they fall back to the modelled
values, so a fresh clone without the rasters still works.

For ahmedabad it also emits web/data/observed.ts so the landing page's demo
history is the same observed series.

Parcel geometries come from the persistent parcel cache (they are the same
boundaries the fill uses); a city without a cache entry falls back to the
parcel engine.

Usage:
    python web/scripts/build-observed.py             # every district
    python web/scripts/build-observed.py [ids...]    # only these districts
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "backend"))

import rasterio  # noqa: E402
import rasterio.warp  # noqa: E402
from affine import Affine  # noqa: E402
from pyproj import Transformer  # noqa: E402
from rasterio.enums import Resampling  # noqa: E402
from rasterio.features import rasterize  # noqa: E402
from rasterio.windows import Window  # noqa: E402
from shapely.geometry import shape as shp  # noqa: E402
from shapely.ops import transform as shp_transform  # noqa: E402

from app.core.config import DATA_DIR, REPO_ROOT  # noqa: E402
from app.data.database import connect, load_parcel_cache  # noqa: E402
from app.data.loader import ACTIVE_DB_PATH, get_dataset  # noqa: E402

ESRI_DIR = REPO_ROOT / "datasets" / "esri"
TILES = ["42Q", "42R", "43Q", "43R"]
YEARS = (2018, 2022, 2024)
BUILT_CLASS = 7  # Esri 10 m annual LULC: 7 = built area (see scripts/fetch_esri_lulc.py)
# The rasters are ~10 m; aggregate at ~30 m (majority class), matching the DEM.
RATIO = 3.0
CHUNK_ROWS = 2048
BUILT_THRESHOLD = 0.02  # cells with less built than this are dropped from grid

# Landing demo lattice (web/data/grid.ts).
LAND_LON_MIN, LAND_LON_MAX, LAND_DLON = 72.445, 72.705, 0.011
LAND_LAT_MIN, LAND_LAT_MAX, LAND_DLAT = 22.935, 23.135, 0.009
LAND_ROWS = int(np.ceil((LAND_LAT_MAX - LAND_LAT_MIN) / LAND_DLAT))
LAND_COLS = int(np.ceil((LAND_LON_MAX - LAND_LON_MIN) / LAND_DLON))

WRITE_LANDING = {"ahmedabad"}


def _latest_parcel_rows(city_id: str):
    """(parcel_id, geometry, land_use) rows from the persistent cache."""
    if ACTIVE_DB_PATH is None:
        return None
    conn = connect(ACTIVE_DB_PATH, readonly=True)
    try:
        row = conn.execute(
            "SELECT source_signature FROM parcel_cache WHERE city=? "
            "ORDER BY updated_at DESC LIMIT 1",
            (city_id,),
        ).fetchone()
        if not row:
            return None
        rows = load_parcel_cache(ACTIVE_DB_PATH, city_id, row[0])
    finally:
        conn.close()
    if not rows:
        return None
    out = []
    for r in rows:
        g = r.get("geometry") or {}
        if not g.get("coordinates"):
            continue
        out.append((r["parcel_id"], g, r.get("land_use", "")))
    return out


def _load_parcels(city_id: str):
    rows = _latest_parcel_rows(city_id)
    if rows is not None:
        return rows
    from app.gis.parcels import get_parcels  # slow fallback for fresh clones

    ps = get_parcels(city_id)
    return [(p.parcel_id, p.geometry, p.land_use) for p in ps]


def _window_and_block(src, west, south, east, north):
    """Bounded window over the district bbox, read downsampled to ~30 m."""
    w = src.window(west, south, east, north)
    try:
        w = w.intersection(Window(0, 0, src.width, src.height))
    except rasterio.errors.WindowError:
        return None, None
    if w.width < 1 or w.height < 1:
        return None, None
    out_h = max(1, int(round(w.height / RATIO)))
    out_w = max(1, int(round(w.width / RATIO)))
    block = src.read(1, window=w, out_shape=(out_h, out_w), resampling=Resampling.mode)
    wt = src.window_transform(w)
    new_aff = Affine(
        wt.a * (w.width / out_w), 0.0, wt.c,
        0.0, wt.e * (w.height / out_h), wt.f,
    )
    return block, new_aff


def _rasterize_parcels(parcel_geoms, new_aff, out_h, out_w, crs):
    tx = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    shapes = []
    for i, (pid, geom, lu) in enumerate(parcel_geoms, start=1):
        try:
            poly = shp(geom)
            poly = shp_transform(lambda x, y, *z: tx.transform(x, y), poly)
        except Exception:  # noqa: BLE001
            continue
        shapes.append((poly, i))
    if not shapes:
        return None
    return rasterize(shapes, out_shape=(out_h, out_w), transform=new_aff, fill=0, dtype="int32")


def process_city(city_id: str) -> dict:
    ds = get_dataset(city_id)
    g = ds.grid
    n = g.rows * g.cols

    parcel_geoms = [(pid, geom, lu) for pid, geom, lu in _load_parcels(city_id) if lu != "water"]

    tot_cnt = np.zeros(n, dtype=np.int64)
    built_cnt = {y: np.zeros(n, dtype=np.int64) for y in YEARS}
    p_tot = np.zeros(len(parcel_geoms), dtype=np.int64)
    p_built = {y: np.zeros(len(parcel_geoms), dtype=np.int64) for y in YEARS}
    land_tot = np.zeros(LAND_ROWS * LAND_COLS, dtype=np.int64)
    land_built = {y: np.zeros(LAND_ROWS * LAND_COLS, dtype=np.int64) for y in YEARS}

    pid_rast_cache: dict[str, np.ndarray | None] = {}
    to4326_cache: dict[str, Transformer] = {}

    for year in YEARS:
        for tile in TILES:
            p = ESRI_DIR / f"{tile}_{year}.tif"
            if not p.exists():
                continue
            t0 = time.time()
            with rasterio.open(p) as src:
                try:
                    west, south, east, north = rasterio.warp.transform_bounds(
                        "EPSG:4326", src.crs,
                        g.min_lng, g.min_lat,
                        g.min_lng + g.cols * g.cell_lng,
                        g.min_lat + g.rows * g.cell_lat,
                    )
                except Exception:  # noqa: BLE001
                    continue
                block, new_aff = _window_and_block(src, west, south, east, north)
                if block is None:
                    continue
                out_h, out_w = block.shape
                built = block == BUILT_CLASS

                tx = to4326_cache.get(tile)
                if tx is None:
                    tx = Transformer.from_crs(src.crs, "EPSG:4326", always_xy=True)
                    to4326_cache[tile] = tx

                if tile not in pid_rast_cache:
                    pid_rast_cache[tile] = (
                        _rasterize_parcels(parcel_geoms, new_aff, out_h, out_w, src.crs)
                        if parcel_geoms else None
                    )
                pid_rast = pid_rast_cache[tile]

                g_px = p_px = 0
                first_year = year == YEARS[0]
                for start in range(0, out_h, CHUNK_ROWS):
                    end = min(out_h, start + CHUNK_ROWS)
                    xs = (np.arange(out_w, dtype=np.float32) + 0.5) * new_aff.a + new_aff.c
                    ys = (np.arange(start, end, dtype=np.float32) + 0.5) * new_aff.e + new_aff.f
                    xx, yy = np.meshgrid(xs, ys)
                    lng, lat = tx.transform(xx, yy)
                    chunk_built = built[start:end].ravel()

                    # Engine grid cells.
                    r = np.floor((lat - g.min_lat) / g.cell_lat).astype(np.int64)
                    c = np.floor((lng - g.min_lng) / g.cell_lng).astype(np.int64)
                    ok = (r >= 0) & (r < g.rows) & (c >= 0) & (c < g.cols)
                    ok = ok.ravel()
                    r, c = r.ravel()[ok], c.ravel()[ok]
                    wok = g.ward_idx[r, c] >= 0
                    r, c = r[wok], c[wok]
                    ids = r * g.cols + c
                    if first_year:
                        np.add.at(tot_cnt, ids, 1)
                    np.add.at(built_cnt[year], ids, chunk_built[ok][wok])
                    g_px += ids.size

                    # Landing lattice (ahmedabad): same pixel assignment.
                    lr = np.floor((lat - LAND_LAT_MIN) / LAND_DLAT).astype(np.int64)
                    lc = np.floor((lng - LAND_LON_MIN) / LAND_DLON).astype(np.int64)
                    lok = (lr >= 0) & (lr < LAND_ROWS) & (lc >= 0) & (lc < LAND_COLS)
                    lok = lok.ravel()
                    if lok.any():
                        lids = lr.ravel()[lok] * LAND_COLS + lc.ravel()[lok]
                        if first_year:
                            np.add.at(land_tot, lids, 1)
                        np.add.at(land_built[year], lids, chunk_built[lok])

                    # Parcel footprints.
                    if pid_rast is not None:
                        pflat = pid_rast.ravel()[start * out_w:end * out_w]
                        p_ids = pflat[pflat > 0]
                        if p_ids.size:
                            if first_year:
                                np.add.at(p_tot, p_ids - 1, 1)
                            np.add.at(p_built[year], p_ids - 1, chunk_built[pflat > 0])
                            p_px += p_ids.size
            print(f"    {tile} {year}: {g_px:,} grid px, {p_px:,} parcel px ({time.time()-t0:.0f}s)", flush=True)

    return {
        "g": g,
        "tot_cnt": tot_cnt,
        "built_cnt": built_cnt,
        "parcel_geoms": parcel_geoms,
        "p_tot": p_tot,
        "p_built": p_built,
        "land_tot": land_tot,
        "land_built": land_built,
    }


def _assemble(city_id: str, res: dict) -> dict:
    g = res["g"]
    tot = res["tot_cnt"]
    valid = tot > 0
    n = g.rows * g.cols

    km2 = {}
    union = np.zeros(n, dtype=bool)
    row_area = np.repeat(g.row_area_km2, g.cols)
    for y in YEARS:
        frac = np.where(valid, res["built_cnt"][y] / np.maximum(tot, 1), 0.0)
        km2[str(y)] = int(round(float((frac * row_area).sum())))
        union |= frac >= BUILT_THRESHOLD

    cells_out = []
    for idx in np.flatnonzero(union & valid):
        r, c = divmod(int(idx), g.cols)
        vals = []
        for y in YEARS:
            f = res["built_cnt"][y][idx] / tot[idx]
            vals.append(round(f, 3) if f >= 0.001 else 0.0)
        cells_out.append([int(r), int(c), *vals])

    parcels_out = {}
    for i, (pid, geom, lu) in enumerate(res["parcel_geoms"]):
        t = int(res["p_tot"][i])
        if t == 0:
            continue
        parcels_out[pid] = {
            str(y): int(round(100 * res["p_built"][y][i] / t)) for y in YEARS
        }

    return {
        "meta": {
            "source": "Esri Land Cover (Sentinel-2), built-up class, 10 m aggregated to 30 m",
            "years": list(YEARS),
            "parcels": len(parcels_out),
            "cells": len(cells_out),
        },
        "km2": km2,
        "grid": {
            "rows": g.rows,
            "cols": g.cols,
            "min_lng": g.min_lng,
            "min_lat": g.min_lat,
            "cell_lng": g.cell_lng,
            "cell_lat": g.cell_lat,
            "built": cells_out,
        },
        "parcels": parcels_out,
    }


def _write_landing_ts(res: dict) -> None:
    tot = res["land_tot"]
    valid = tot > 0
    rows = []
    # Cell area varies with latitude (degrees -> km).
    lats = LAND_LAT_MIN + (np.arange(LAND_ROWS) + 0.5) * LAND_DLAT
    row_area_km2 = (LAND_DLON * 111.32 * np.cos(np.radians(lats))) * (LAND_DLAT * 110.57)
    km2_out = {}
    for y in YEARS:
        frac = np.where(valid, res["land_built"][y] / np.maximum(tot, 1), 0.0)
        km2_out[str(y)] = int(round(float((frac.reshape(LAND_ROWS, LAND_COLS) * row_area_km2[:, None]).sum())))
    union = np.zeros_like(tot, dtype=bool)
    for y in YEARS:
        union |= np.where(valid, res["land_built"][y] / np.maximum(tot, 1), 0.0) >= BUILT_THRESHOLD
    for idx in np.flatnonzero(union & valid):
        r, c = divmod(int(idx), LAND_COLS)
        vals = []
        for y in YEARS:
            f = res["land_built"][y][idx] / tot[idx]
            vals.append(round(f, 3) if f >= 0.001 else 0.0)
        rows.append([int(r), int(c), *vals])

    lines = [
        "// GENERATED by web/scripts/build-observed.py — do not edit by hand.",
        "// Observed built-up cover (Esri land cover, built class) on the landing",
        "// demo lattice. [row, col, built2018, built2022, built2024], fraction 0..1.",
        "export const OBSERVED_LON_MIN = 72.445;",
        "export const OBSERVED_LON_MAX = 72.705;",
        "export const OBSERVED_LAT_MIN = 22.935;",
        "export const OBSERVED_LAT_MAX = 23.135;",
        "export const OBSERVED_DLON = 0.011;",
        "export const OBSERVED_DLAT = 0.009;",
        f"export const OBSERVED_KM2: Record<string, number> = {json.dumps(km2_out)};",
        f"export const OBSERVED_BUILT: [number, number, number, number, number][] = {json.dumps(rows)};",
        "",
    ]
    dest = REPO / "web" / "data" / "observed.ts"
    dest.write_text("\n".join(lines), encoding="utf-8")
    print(f"  wrote {dest.relative_to(REPO)} ({len(rows)} cells)", flush=True)


def main(argv: list[str]) -> int:
    cfg = json.loads((DATA_DIR / "gujarat_config.json").read_text(encoding="utf-8"))
    districts = {d["id"]: d for d in cfg.get("districts", [])}
    if argv:
        ids = [a for a in argv if a in districts]
    else:
        ids = list(districts)
    if not ids:
        print("no district ids matched")
        return 1

    ok, failed = 0, 0
    for city_id in ids:
        print(f"\n== {city_id} ================", flush=True)
        t0 = time.time()
        try:
            res = process_city(city_id)
            out = _assemble(city_id, res)
            dest = DATA_DIR / f"{city_id}_observed.json"
            dest.write_text(json.dumps(out), encoding="utf-8")
            print(f"  wrote {dest.name} ({dest.stat().st_size/1e6:.1f} MB, {time.time()-t0:.0f}s)", flush=True)
            if city_id in WRITE_LANDING:
                _write_landing_ts(res)
            ok += 1
        except Exception as e:  # noqa: BLE001
            print(f"!! {city_id} failed: {e}", flush=True)
            failed += 1
    print(f"\nDONE: {ok} ok, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))