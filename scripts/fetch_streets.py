"""Fetch the full OpenStreetMap street network for each active study area.

WHY THIS EXISTS
---------------
`<city>_roads.json` carries only motorway/trunk/primary/secondary/tertiary — the
roads worth drawing on a city map. That is the right layer to *render*, but it is
the wrong layer to *build parcels from*: with only arterials, the smallest
enclosed block in Ahmedabad is still 100+ ha, so land polygons cut at those roads
stay neighbourhood-sized blobs rather than parcels.

Residential and service streets are what actually bound a city block. This script
pulls them into a separate `<city>_streets.json` that the engine reads at
parcel-build time and never sends to the browser — so the map payload is
unchanged while parcel boundaries become real streets instead of a synthetic grid.

    python scripts/fetch_streets.py                 # every active area
    python scripts/fetch_streets.py gandhinagar     # named areas only
    python scripts/fetch_streets.py --plan          # tile counts, fetch nothing
    python scripts/fetch_streets.py --force         # refetch areas already done

Once an area lands, rebuild its parcels so the new blocks are used:

    python scripts/prebuild_parcels.py <area> --force

TALKING TO OVERPASS WITHOUT LOSING A DAY
----------------------------------------
Overpass is a shared free service that 504s freely under load. Three things here
exist only because of that:

* Tiles outside the district are never requested. A study area's bbox can be far
  larger than the area itself — Gandhinagar's is seven times the district — and
  two runs died on a tile of empty countryside 40 km east of the city that was
  never going to be used. Tiles are tested against the union of the ward
  polygons first, which drops 38% of the work across the nine areas and 86% of
  Gandhinagar's.
* A tile that fails is quartered and retried rather than failing the area. Dense
  extents are what time out, and a quarter of a dense extent usually does not.
* Every tile is written to backend/.cache/overpass-tiles the moment it arrives,
  so an interrupted run resumes instead of starting over. Losing 40 good tiles
  to the 41st is what made this unusable the first time.
"""
from __future__ import annotations

import json
import os
import random
import sys
import time

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, "backend")

import requests  # noqa: E402
from shapely.geometry import box, shape  # noqa: E402
from shapely.ops import unary_union  # noqa: E402
from shapely.prepared import prep  # noqa: E402

from app.core.config import CITIES  # noqa: E402

DATA_DIR = os.path.join("web", "data", "engine")
TILE_DIR = os.path.join("backend", ".cache", "overpass-tiles")

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

MAX_TILE_DEG = 0.09     # starting tile edge; failures are quartered from here
MIN_TILE_DEG = 0.012    # below this a 504 is Overpass being down, not us asking too much
TILE_TIMEOUT_S = 180
ATTEMPTS_PER_TILE = 4

Tile = tuple[float, float, float, float]


def tiles(bbox: Tile) -> list[Tile]:
    w, s, e, n = bbox
    nx = max(1, int((e - w) / MAX_TILE_DEG) + 1)
    ny = max(1, int((n - s) / MAX_TILE_DEG) + 1)
    dx, dy = (e - w) / nx, (n - s) / ny
    return [
        (w + i * dx, s + j * dy, w + (i + 1) * dx, s + (j + 1) * dy)
        for i in range(nx)
        for j in range(ny)
    ]


def quarters(tile: Tile) -> list[Tile]:
    w, s, e, n = tile
    mx, my = (w + e) / 2, (s + n) / 2
    return [(w, s, mx, my), (mx, s, e, my), (w, my, mx, n), (mx, my, e, n)]


def district_filter(city_id: str):
    """A predicate for "does this tile touch the district at all?".

    Falls back to accepting everything when the ward layer is missing, so a new
    area still fetches rather than silently downloading nothing.
    """
    path = os.path.join(DATA_DIR, f"{city_id}_wards.json")
    if not os.path.exists(path):
        return lambda _tile: True
    with open(path, encoding="utf-8") as fh:
        wards = json.load(fh)["features"]
    shp = prep(unary_union([shape(w["geometry"]) for w in wards]))
    return lambda tile: shp.intersects(box(*tile))


def tile_cache_path(city_id: str, tile: Tile) -> str:
    w, s, e, n = tile
    return os.path.join(TILE_DIR, f"{city_id}-{w:.5f}_{s:.5f}_{e:.5f}_{n:.5f}.json")


def request_tile(tile: Tile) -> list[dict]:
    """One Overpass call, retried across mirrors. Raises if every attempt fails."""
    w, s, e, n = tile
    query = (
        f"[out:json][timeout:150];"
        f'way["highway"~"{STREET_RE}"]({s:.5f},{w:.5f},{n:.5f},{e:.5f});'
        f"out geom;"
    )
    last = ""
    for attempt in range(ATTEMPTS_PER_TILE):
        endpoint = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            r = requests.post(endpoint, data={"data": query}, headers=HEADERS,
                              timeout=TILE_TIMEOUT_S)
            if r.status_code == 200:
                return r.json().get("elements", [])
            last = f"HTTP {r.status_code}"
        except Exception as exc:  # noqa: BLE001 — any transport failure is a retry
            last = f"{type(exc).__name__}: {exc}"
        time.sleep(3 + attempt * 4 + random.random() * 2)
    raise RuntimeError(last or "unknown failure")


def harvest(city_id: str, tile: Tile, keep, label: str) -> list[dict]:
    """Fetch one tile, quartering it if Overpass will not serve it whole."""
    cache = tile_cache_path(city_id, tile)
    if os.path.exists(cache):
        with open(cache, encoding="utf-8") as fh:
            got = json.load(fh)
        print(f"   {label}  {len(got):6d} ways  (cached)", flush=True)
        return got

    started = time.time()
    try:
        got = request_tile(tile)
    except RuntimeError as exc:
        width = tile[2] - tile[0]
        if width / 2 < MIN_TILE_DEG:
            raise RuntimeError(f"tile {tile} unserved at minimum size — {exc}") from None
        print(f"   {label}  {exc}; splitting into 4", flush=True)
        out: list[dict] = []
        for i, part in enumerate(quarters(tile), 1):
            if not keep(part):
                continue
            out.extend(harvest(city_id, part, keep, f"{label}.{i}"))
        return out

    os.makedirs(TILE_DIR, exist_ok=True)
    with open(cache, "w", encoding="utf-8") as fh:
        json.dump(got, fh, separators=(",", ":"))
    print(f"   {label}  {len(got):6d} ways  {time.time() - started:5.1f}s", flush=True)
    time.sleep(1.5)
    return got


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


def plan(city_id: str) -> tuple[int, int]:
    city = CITIES[city_id]
    keep = district_filter(city_id)
    all_tiles = tiles(city.bbox)
    return len(all_tiles), sum(1 for t in all_tiles if keep(t))


def fetch_area(city_id: str, force: bool = False) -> None:
    city = CITIES.get(city_id)
    if city is None:
        print(f"!! unknown area '{city_id}'", flush=True)
        return

    path = os.path.join(DATA_DIR, f"{city_id}_streets.json")
    if os.path.exists(path) and not force:
        print(f"== {city_id}: already present, skipping", flush=True)
        return

    keep = district_filter(city_id)
    planned = [t for t in tiles(city.bbox) if keep(t)]
    total = len(tiles(city.bbox))
    print(f"== {city_id}: {len(planned)} tiles inside the district "
          f"(of {total} covering its bbox)", flush=True)

    started = time.time()
    elements: list[dict] = []
    for i, tile in enumerate(planned, 1):
        elements.extend(harvest(city_id, tile, keep, f"tile {i}/{len(planned)}"))

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
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    print(f"== {city_id}: {len(feats):,} streets in {time.time() - started:.0f}s "
          f"-> {path} ({os.path.getsize(path) / 1e6:.1f} MB)", flush=True)


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    ids = args or list(CITIES)

    if "--plan" in sys.argv:
        grand = kept = 0
        for city_id in ids:
            if city_id not in CITIES:
                continue
            a, k = plan(city_id)
            done = os.path.exists(os.path.join(DATA_DIR, f"{city_id}_streets.json"))
            grand += a
            kept += k
            print(f"{city_id:24s} {k:4d} tiles to fetch (bbox would be {a:4d})"
                  f"{'   [done]' if done else ''}")
        print(f"\n{kept} tiles total, {grand - kept} skipped as outside every district")
        return

    for city_id in ids:
        try:
            fetch_area(city_id, force=force)
        except Exception as exc:  # noqa: BLE001 — one area failing must not stop the rest
            print(f"!! {city_id} failed: {exc}", flush=True)


if __name__ == "__main__":
    main()
