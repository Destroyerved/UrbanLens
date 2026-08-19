"""Build and cache every active study area's parcels ahead of time.

Parcel construction cuts a district's land polygons along its real street
network, which for Ahmedabad means 55,580 centrelines and 17,215 parcels. That
is a minute of work per district, cached to backend/.cache/parcels afterwards.
Running this once after a fresh clone (or after refetching a layer) means the
first person to open a district does not wait for it.

    python scripts/prebuild_parcels.py                 # every active area
    python scripts/prebuild_parcels.py ahmedabad ...   # named areas only
    python scripts/prebuild_parcels.py --force         # ignore existing caches

The cache is keyed on the source layers' fingerprints, so it invalidates itself
whenever a layer changes; --force is only for measuring a cold build.
"""
from __future__ import annotations

import os
import sys
import time

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, "backend")

from app.core.config import CITIES  # noqa: E402
from app.data.loader import layer_signature  # noqa: E402
from app.gis import parcels as P  # noqa: E402


def main() -> None:
    force = "--force" in sys.argv
    ids = [a for a in sys.argv[1:] if not a.startswith("--")] or list(CITIES)

    total = 0.0
    for city_id in ids:
        city = CITIES.get(city_id)
        if city is None:
            print(f"!! unknown area '{city_id}'", flush=True)
            continue
        if city.composite_of:
            print(f"-- {city_id}: composite of {len(city.composite_of)} members, "
                  "cached through them", flush=True)
            continue

        path = P._cache_path(city_id, layer_signature(city))
        if path.exists() and not force:
            print(f"== {city_id}: cached already ({path.stat().st_size / 1e6:.1f} MB)", flush=True)
            continue

        started = time.time()
        try:
            ps = P.build_and_enrich(city_id)
        except Exception as exc:  # noqa: BLE001 — one area failing must not stop the rest
            print(f"!! {city_id} failed: {type(exc).__name__}: {exc}", flush=True)
            continue
        P._cache_write(path, ps)
        elapsed = time.time() - started
        total += elapsed
        size = path.stat().st_size / 1e6 if path.exists() else 0.0
        print(f"== {city_id}: {len(ps):,} parcels in {elapsed:.1f}s -> {size:.1f} MB", flush=True)

    print(f"\nbuilt in {total:.0f}s total", flush=True)


if __name__ == "__main__":
    main()
