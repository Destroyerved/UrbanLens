"""Ultra-fast UI bootstrap payload.

The regular API remains available for diagnostics and third-party clients, but
UrbanLens' browser should not fetch/parse eight overlapping GeoJSON documents on
every city switch. This module compacts exactly the fields the UI needs into one
cacheable payload, pre-serializes it with orjson, pre-gzips it once, and persists
both byte streams in SQLite. A fresh worker can therefore serve the first city
request without rebuilding Python dictionaries or recompressing megabytes.
"""
from __future__ import annotations

import gzip
import hashlib
from functools import lru_cache
from typing import Any

import numpy as np
import orjson

from app.core.cache import singleflight
from app.data.database import load_response_cache, store_response_cache
from app.data.loader import ACTIVE_DB_PATH, get_dataset
from app.gis import analysis
from app.gis.parcels import _observed_for, get_parcels

CACHE_KEY = "ui-bootstrap-v5"
POP_STEP = 4
CELL_DEG = 0.00225 * POP_STEP


def _round(v: float, digits: int = 5) -> float:
    return round(float(v), digits)


def _finite(v: Any, default: float = 999.0) -> float:
    try:
        x = float(v)
        return x if np.isfinite(x) else default
    except (TypeError, ValueError):
        return default


def _ring(geometry: dict[str, Any]) -> list[list[float]]:
    """Largest exterior ring, quantized for screen rendering."""
    coords = geometry.get("coordinates") or []
    if geometry.get("type") == "Polygon":
        ring = coords[0] if coords else []
    elif geometry.get("type") == "MultiPolygon":
        ring = max((p[0] for p in coords if p), key=len, default=[])
    else:
        ring = []
    # Five decimals is ~1.1 m latitude precision, far below the parcel source's
    # own simplification tolerance, while removing noisy float tails.
    out: list[list[float]] = []
    prev: tuple[float, float] | None = None
    for c in ring:
        if len(c) < 2:
            continue
        pt = (_round(c[0]), _round(c[1]))
        if pt != prev:
            out.append([pt[0], pt[1]])
            prev = pt
    if out and out[0] != out[-1]:
        out.append(list(out[0]))
    return out


def _line(geometry: dict[str, Any]) -> list[list[float]]:
    coords = geometry.get("coordinates") or []
    if geometry.get("type") == "MultiLineString":
        coords = max(coords, key=len, default=[])
    if not isinstance(coords, list):
        return []
    # Render geometry does not need thousands of vertices on a single OSM way.
    # Keep up to ~48 points, always preserving the last endpoint.
    if len(coords) > 48:
        step = max(1, int(np.ceil(len(coords) / 48)))
        selected = coords[::step]
        if selected[-1] != coords[-1]:
            selected.append(coords[-1])
        coords = selected
    return [[_round(c[0]), _round(c[1])] for c in coords if len(c) >= 2]


def _nearest_growth(pop_xy: np.ndarray, pred_xy: np.ndarray, pred_p: np.ndarray) -> np.ndarray:
    """Nearest prediction value for each population point, vectorized in chunks."""
    if len(pred_xy) == 0:
        return np.zeros(len(pop_xy), dtype=np.float32)
    out = np.empty(len(pop_xy), dtype=np.float32)
    # Chunks cap temporary memory for large districts/composites.
    for start in range(0, len(pop_xy), 2048):
        chunk = pop_xy[start : start + 2048]
        d2 = (
            (chunk[:, None, 0] - pred_xy[None, :, 0]) ** 2
            + (chunk[:, None, 1] - pred_xy[None, :, 1]) ** 2
        )
        out[start : start + len(chunk)] = pred_p[np.argmin(d2, axis=1)]
    return out


def _build(city_id: str) -> dict[str, Any]:
    from app.ml.prediction import growth_grid

    ds = get_dataset(city_id)
    parcels = get_parcels(city_id)

    wards = []
    for w in ds.wards:
        p = w["properties"]
        wards.append([
            p.get("ward_code", ""),
            p.get("name", ""),
            _ring(w["geometry"]),
            [_round(x, 6) for x in p.get("centroid", [0, 0])],
            round(float(p.get("area_sqm", 0)) / 1_000_000, 2),
            int(round(float(p.get("population", 0)))),
        ])

    parcel_rows = []
    for p in parcels:
        conflict = bool(analysis.classify_zoning_conflict(p)[0])
        parcel_rows.append([
            p.parcel_id,
            p.survey_number or "—",
            p.ward,
            [_round(p.centroid[0], 6), _round(p.centroid[1], 6)],
            _ring(p.geometry),
            round(float(p.area_sqm) / 10_000, 2),
            p.ownership,
            p.zoning,
            p.land_use,
            int(p.history.get(2018, 0)),
            int(p.history.get(2022, 0)),
            int(p.history.get(2024, 0)),
            int(p.built_up_percent),
            int(p.vegetation_percent),
            round(_finite(p.road_km), 2),
            round(_finite(p.nearest.get("hospital")), 2),
            round(_finite(p.nearest.get("school")), 2),
            round(_finite(p.nearest.get("park")), 2),
            round(min(_finite(p.nearest.get("bus_stop")), _finite(p.nearest.get("metro_station"))), 2),
            int(p.pop_3km),
            p.flood_risk,
            int(round(float(p.scores.get("infrastructure", 0)))),
            int(round(100 - float(p.scores.get("environment", 0)))),
            int(round(float(p.scores.get("development_potential", 0)))),
            conflict,
        ])

    facilities = []
    for f in ds.facilities:
        p = f["properties"]
        coords = f["geometry"]["coordinates"]
        facilities.append([
            p.get("id", ""), p.get("name", ""), p.get("facility_type", ""),
            _round(coords[0], 6), _round(coords[1], 6),
        ])

    # Roads are visual context, not an analysis input in the browser. Sending
    # thousands of tiny OSM arterial features makes MapLibre spend more time
    # tiling them than the user spends looking at them. Preserve every highway
    # and deterministically sample arterials to a bounded render budget. Full
    # roads remain available from /api/roads for tools that need them.
    road_candidates = [r for r in ds.roads if r["properties"].get("road_type") != "river"]
    highways = [r for r in road_candidates if r["properties"].get("road_type") == "highway"]
    arterials = [r for r in road_candidates if r["properties"].get("road_type") != "highway"]
    road_budget = 1400
    arterial_budget = max(0, road_budget - len(highways))
    if len(arterials) > arterial_budget > 0:
        stride = max(1, int(np.ceil(len(arterials) / arterial_budget)))
        arterials = arterials[::stride][:arterial_budget]
    elif arterial_budget == 0:
        arterials = []
    roads = []
    for r in highways + arterials:
        roads.append([
            r["properties"].get("id", ""),
            r["properties"].get("name", ""),
            _line(r["geometry"]),
        ])

    # Population + growth + healthcare reach become ONE compact grid. This
    # removes two requests and the browser's O(population_cells*growth_cells)
    # nearest-neighbour loop.
    g = ds.grid
    lng_g, lat_g = g.cell_centres()
    rr, cc = np.where(g.pop > 0)
    keep = (rr % POP_STEP == 0) & (cc % POP_STEP == 0)
    rr, cc = rr[keep], cc[keep]
    lngs = lng_g[rr, cc]
    lats = lat_g[rr, cc]
    pops = g.pop[rr, cc] * (POP_STEP * POP_STEP)

    prediction = growth_grid(city_id)
    pred_xy: list[list[float]] = []
    pred_p: list[float] = []
    for feat in prediction.get("features", []):
        ring = feat.get("geometry", {}).get("coordinates", [[[]]])[0]
        if not ring:
            continue
        xs = [c[0] for c in ring]
        ys = [c[1] for c in ring]
        pred_xy.append([sum(xs) / len(xs), sum(ys) / len(ys)])
        pred_p.append(float(feat.get("properties", {}).get("growth_probability", 0)))
    xy = np.column_stack((lngs, lats)) if len(lngs) else np.zeros((0, 2), dtype=float)
    growth = _nearest_growth(
        xy,
        np.asarray(pred_xy, dtype=float).reshape((-1, 2)) if pred_xy else np.zeros((0, 2)),
        np.asarray(pred_p, dtype=np.float32),
    )
    hospital = ds.facility_index.get("hospital")
    if hospital is not None and len(hospital):
        hospital_km = hospital.nearest_km_many(lngs, lats)
    else:
        hospital_km = np.zeros(len(lngs), dtype=float)

    # Observed built-up fraction per grid cell (0–1) for each Landsat-class year,
    # produced by web/scripts/build-observed.py from the Esri land-cover rasters.
    # Aligned to ds.grid so (rr, cc) indexes straight in. Absent when the
    # observation pass has not run for this city.
    obs_built = None
    obs = _observed_for(city_id)
    if obs and obs.get("grid"):
        og = obs["grid"]
        if (
            int(og.get("rows", -1)) == g.rows
            and int(og.get("cols", -1)) == g.cols
        ):
            obs_built = {}
            for r, c, *fracs in og.get("built", []):
                if len(fracs) >= 3:
                    obs_built[(int(r), int(c))] = (float(fracs[0]), float(fracs[1]), float(fracs[2]))

    grid = []
    for lng, lat, pop, gp, hk, r, c in zip(lngs, lats, pops, growth, hospital_km, rr, cc):
        row = [_round(lng, 5), _round(lat, 5), int(round(pop)), round(float(gp), 3), round(float(hk), 2)]
        if obs_built is not None:
            b18, b22, b24 = obs_built.get((int(r), int(c)), (0.0, 0.0, 0.0))
            row += [_round(b18, 4), _round(b22, 4), _round(b24, 4)]
        grid.append(row)

    return {
        # Deliberately short keys: this is a browser transport format, not the
        # public semantic API. web/lib/dataset.ts is its documented decoder.
        "v": 5,
        "c": city_id,
        "cell": CELL_DEG,
        "w": wards,
        "p": parcel_rows,
        "f": facilities,
        "r": roads,
        "g": grid,
        # Small precomputed summaries keep Overview/Growth/Infrastructure panels
        # off the dynamic API path. All are already persistent-cache aware.
        "a": {
            "o": analysis.city_overview(city_id),
            "i": {
                "wards": analysis.infrastructure_gaps(city_id),
                "coverage": analysis.coverage_report(city_id),
            },
            "gr": analysis.growth_summary(city_id),
        },
    }


def bootstrap_signature(city_id: str) -> str:
    # The payload embeds parcel rows (geometry, tenure, history, scores), so it
    # must invalidate on every parcel-engine change, not just the base layers.
    # parcel_signature includes data_signature plus streets/buildings mtime and
    # FILL_VERSION — missing any of those serves a stale bootstrap from the
    # persisted response cache after an engine swap.
    from app.gis.parcels import parcel_signature

    return f"boot-v5|{parcel_signature(city_id)}"


@lru_cache(maxsize=128)
def _payload_cached(city_id: str, signature: str) -> tuple[bytes, bytes, str]:
    if ACTIVE_DB_PATH is not None:
        persisted = load_response_cache(ACTIVE_DB_PATH, CACHE_KEY, city_id, signature)
        if persisted is not None:
            return persisted

    body = _build(city_id)
    raw = orjson.dumps(body, option=orjson.OPT_NON_STR_KEYS)
    gz = gzip.compress(raw, compresslevel=6, mtime=0)
    etag = '"' + hashlib.blake2b(raw, digest_size=12).hexdigest() + '"'
    if ACTIVE_DB_PATH is not None:
        store_response_cache(ACTIVE_DB_PATH, CACHE_KEY, city_id, signature, raw, gz, etag)
    return raw, gz, etag


def get_bootstrap_payload(city_id: str) -> tuple[bytes, bytes, str]:
    sig = bootstrap_signature(city_id)
    with singleflight((CACHE_KEY, city_id, sig)):
        return _payload_cached(city_id, sig)
