"""Fetch the full OpenStreetMap street network for each active study area.

WHY THIS EXISTS
---------------
`<city>_roads.json` carries only motorway/trunk/primary/secondary/tertiary — the
roads worth drawing on a city map. That is the right layer to *render*, but it is
the wrong layer to *build parcels from*: with only arterials, the smallest
enclosed block in an Indian city is still 100+ ha, so land polygons cut at those
roads stay neighbourhood-sized blobs rather than parcels.

Residential and service streets are what actually bound a city block. This script
pulls them into a separate `<city>_streets.json` that the engine reads at
parcel-build time and never sends to the browser — so the map payload is
unchanged while parcel boundaries become real streets instead of a synthetic grid.

    python scripts/fetch_streets.py                # every district
    python scripts/fetch_streets.py ahmedabad ...  # named areas only

Re-running skips areas whose file already exists; pass --force to refetch.
Individual tiles are checkpointed under backend/.cache/overpass-tiles, so a run
interrupted by an Overpass timeout resumes where it stopped rather than starting
the area again.
"""
from __future__ import annotations

import json
import os
import random
import sys
import time

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend"))

import requests  # noqa: E402

from app.core.config import CITIES  # noqa: E402

OUT_DIR = os.path.join(REPO_ROOT, "web", "data", "engine")
TILE_DIR = os.path.join(REPO_ROOT, "backend", ".cache", "overpass-tiles")

ENDPOINTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.osm.jp/api/interpreter",
]

# Everything a block can be bounded by. `service` is included because in Indian
# cities society internal roads are overwhelmingly tagged that way, and they are
# exactly the lines that separate one plot row from the next.
STREET_RE = (
    "^(motorway|trunk|primary|secondary|tertiary|unclassified|residential"
    "|living_street|service|pedestrian|road|track)$"
)

HEADERS = {"User-Agent": "urbanlens-dataset-prep/1.0 (SIH 2026 student project)"}

# Overpass rejects or times out on large dense extents, so every area is fetched
# as tiles no larger than this and stitched back together.
MAX_TILE_DEG = 0.09
TILE_TIMEOUT_S = 180


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


def tile_cache_path(city_id: str, tile: tuple[float, float, float, float]) -> str:
    w, s, e, n = tile
    key = f"{w:.5f}_{s:.5f}_{e:.5f}_{n:.5f}"
    return os.path.join(TILE_DIR, f"{city_id}-{key}.json")


def fetch_tile(tile: tuple[float, float, float, float]) -> list[dict]:
    w, s, e, n = tile
    query = (
        f"[out:json][timeout:150];"
        f'way["highway"~"{STREET_RE}"]({s:.5f},{w:.5f},{n:.5f},{e:.5f});'
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
        if len(coords) < 2:
            continue
        out.append({
            "type": "Feature",
            "properties": {
                "id": f"OSM-W{oid}",
                "highway": el.get("tags", {}).get("highway", ""),
            },
            "geometry": {"type": "LineString", "coordinates": coords},
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

    path = os.path.join(OUT_DIR, f"{city_id}_streets.json")
    if os.path.exists(path) and not force:
        print(f"== {city_id}: already present, skipping", flush=True)
        return

    parts = tiles(city.bbox)
    print(f"== {city_id}: {len(parts)} tiles", flush=True)
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
            "highway_filter": STREET_RE,
            "note": "Block-bounding street network. Engine-side only; never served to the browser.",
        },
        "features": feats,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    print(f"== {city_id}: {len(feats)} streets -> {path} "
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