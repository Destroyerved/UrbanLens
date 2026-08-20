"""Fetch OSM building footprints around each study area's urban cores.

WHY THIS EXISTS
---------------
The engine's `land` layer (landuse/natural polygons) is sparse in most Gujarat
districts, so the public map leans on gap-fill parcels there. Building footprints
are the densest real geometry OSM has for towns: unioned into nearby clusters
they become plot-level parcels with real ground-truth shapes and dimensions.

Buildings are fetched only around each district's urban cores (not the whole
bbox — rural farmland has no buildings and would waste requests), checkpointed
into backend/.cache/overpass-tiles/buildings so interrupted runs resume.

    python scripts/fetch_buildings.py                # every district
    python scripts/fetch_buildings.py amreli kutch   # named areas only
    python scripts/fetch_buildings.py --force amreli
"""
from __future__ import annotations

import json
import math
import os
import random
import sys
import time

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend"))

import requests  # noqa: E402

from app.core.config import CITIES  # noqa: E402

OUT_DIR = os.path.join(REPO_ROOT, "web", "data", "engine")
TILE_DIR = os.path.join(REPO_ROOT, "backend", ".cache", "overpass-tiles", "buildings")

ENDPOINTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.osm.jp/api/interpreter",
]

HEADERS = {"User-Agent": "urbanlens-dataset-prep/1.0 (SIH 2026 student project)"}

# Dense footprints need smaller tiles than streets to stay under Overpass limits.
MAX_TILE_DEG = 0.045
TILE_TIMEOUT_S = 180

# Radius around each urban core that is fetched, km. Scales with the district's
# population: the biggest cities need a wider band; a 300k town cores at ~4 km.
def core_radius_km(population: int) -> float:
    return min(11.0, max(3.0, 6.0 * math.sqrt(population / 1_000_000)))


def tiles(bbox: tuple[float, float, float, float]) -> list[tuple[float, float, float, float]]:
    w, s, e, n = bbox
    nx = max(1, int((e - w) / MAX_TILE_DEG) + 1)
    ny = max(1, int((n - s) / MAX_TILE_DEG) + 1)
    dx, dy = (e - w) / nx, (n - s) / ny
    return [
        (w + i * dx, s + j * dy, w + (i + 1) * dx, s + (j + 1) * dy)
        for i in range(nx)
        for j in range(ny)
    ]


def core_tiles(city, radius_km: float) -> list[tuple[float, float, float, float]]:
    out: list[tuple[float, float, float, float]] = []
    seen: set[str] = set()
    for lng, lat in city.urban_cores:
        m_per_deg_lng = 111320.0 * math.cos(math.radians(lat))
        d = radius_km * 1000.0
        w, s = lng - d / m_per_deg_lng, lat - d / 111320.0
        e, n = lng + d / m_per_deg_lng, lat + d / 111320.0
        for t in tiles((w, s, e, n)):
            key = f"{t[0]:.5f}_{t[1]:.5f}_{t[2]:.5f}_{t[3]:.5f}"
            if key not in seen:
                seen.add(key)
                out.append(t)
    return out


def tile_cache_path(city_id: str, tile: tuple[float, float, float, float]) -> str:
    w, s, e, n = tile
    key = f"{w:.5f}_{s:.5f}_{e:.5f}_{n:.5f}"
    return os.path.join(TILE_DIR, f"{city_id}-{key}.json")


def fetch_tile(tile: tuple[float, float, float, float]) -> list[dict]:
    w, s, e, n = tile
    query = (
        f"[out:json][timeout:150];"
        f'way["building"~"^(house|residential|apartments|yes|commercial|industrial'
        f'|retail|office|school|college|hospital|public|government|hut|farm|'
        f'garage|warehouse|service|roof|shed|dormitory|church|mosque|temple)$"]'
        f'({s:.5f},{w:.5f},{n:.5f},{e:.5f});'
        f"out geom;"
    )
    last = ""
    for attempt in range(6):
        ep = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            r = requests.post(ep, data={"data": query}, headers=HEADERS, timeout=TILE_TIMEOUT_S)
            if r.status_code == 200:
                return r.json().get("elements", [])
            last = f"HTTP {r.status_code}"
        except Exception as exc:  # noqa: BLE001 — any transport failure is a retry
            last = f"{type(exc).__name__}: {exc}"
        time.sleep(3 + attempt * 4 + random.random() * 2)
    raise RuntimeError(f"tile {tile} failed after 6 attempts — {last}")


def to_features(elements: list[dict]) -> list[dict]:
    seen: set[int] = set()
    out: list[dict] = []
    for el in elements:
        oid = el.get("id")
        if oid in seen or not el.get("geometry"):
            continue
        seen.add(oid)
        coords = [[c["lon"], c["lat"]] for c in el["geometry"]]
        if len(coords) < 4:
            continue
        out.append({
            "type": "Feature",
            "properties": {
                "id": f"OSM-W{oid}",
                "building": el.get("tags", {}).get("building", "yes"),
            },
            "geometry": {"type": "Polygon", "coordinates": [coords]},
        })
    return out


def fetch_area(city_id: str, force: bool = False) -> None:
    city = CITIES.get(city_id)
    if city is None:
        print(f"!! unknown area '{city_id}'", flush=True)
        return
    if city.kind == "composite":
        print(f"== {city_id}: composite (resolved from member districts), skipping", flush=True)
        return

    path = os.path.join(OUT_DIR, f"{city_id}_buildings.json")
    if os.path.exists(path) and not force:
        print(f"== {city_id}: already present, skipping", flush=True)
        return

    parts = core_tiles(city, core_radius_km(city.population))
    print(f"== {city_id}: {len(parts)} core tiles (radius ~{core_radius_km(city.population):.1f} km)",
          flush=True)
    os.makedirs(TILE_DIR, exist_ok=True)
    elements: list[dict] = []
    for i, t in enumerate(parts, 1):
        cache = tile_cache_path(city_id, t)
        if os.path.exists(cache):
            with open(cache, encoding="utf-8") as fh:
                got = json.load(fh)
            elements.extend(got)
            print(f"   tile {i}/{len(parts)}  {len(got):6d} ways  (cached)", flush=True)
            continue

        started = time.time()
        got = fetch_tile(t)
        with open(cache, "w", encoding="utf-8") as fh:
            json.dump(got, fh, separators=(",", ":"))
        elements.extend(got)
        print(f"   tile {i}/{len(parts)}  {len(got):6d} ways  {time.time() - started:5.1f}s",
              flush=True)
        time.sleep(1.5)

    feats = to_features(elements)
    doc = {
        "type": "FeatureCollection",
        "meta": {
            "source": "OpenStreetMap via Overpass API",
            "licence": "ODbL 1.0",
            "fetched": time.strftime("%Y-%m-%d"),
            "note": "Building footprints around urban cores. Engine-side only.",
        },
        "features": feats,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    print(f"== {city_id}: {len(feats)} buildings -> {path} "
          f"({os.path.getsize(path) / 1e6:.1f} MB)", flush=True)


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    ids = args or [c for c in CITIES if CITIES[c].kind != "composite"]
    for city_id in ids:
        try:
            fetch_area(city_id, force=force)
        except Exception as exc:  # noqa: BLE001 — one area failing must not stop the rest
            print(f"!! {city_id} failed: {exc}", flush=True)


if __name__ == "__main__":
    main()