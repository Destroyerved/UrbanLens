"""Build the deployable SQLite + persistent parcel cache + FAISS index.

Examples:
  python scripts/build-fast-cache.py --city ahmedabad
  python scripts/build-fast-cache.py --city ahmedabad --city gandhinagar
"""
from __future__ import annotations

import argparse
import gzip
import os
import sys
import time
from pathlib import Path

import orjson

REPO = Path(__file__).resolve().parents[1]
BACKEND = REPO / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.data.database import ALL_LAYERS, ensure_database, import_layers  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", default=str(BACKEND / "urbanlens.db"))
    ap.add_argument("--city", action="append", default=[])
    args = ap.parse_args()
    cities = args.city or ["ahmedabad"]

    db = ensure_database(args.db)
    print(f"database: {db}")
    imported = import_layers(db, cities, ALL_LAYERS)
    for city in cities:
        print(f"{city}: layers -> {', '.join(imported.get(city, []))}")

    # Loader reads this at import time.
    os.environ["URBANLENS_DB"] = str(db)
    from app.gis.parcels import get_parcels
    from app.vector.search import get_vector_index
    from app.gis.analysis import infrastructure_gaps, livability
    from app.ml.prediction import growth_grid
    from app.api.fast_bootstrap import get_bootstrap_payload
    from app.data.loader import get_vegetation, get_greenspace

    for city in cities:
        t0 = time.perf_counter()
        parcels = get_parcels(city)
        t1 = time.perf_counter()
        idx = get_vector_index(city)
        t2 = time.perf_counter()
        gaps = infrastructure_gaps(city)
        live = livability(city)
        growth = growth_grid(city)
        raw, gz, _etag = get_bootstrap_payload(city)
        static_dir = REPO / "web" / "public" / "data" / "bootstrap"
        static_dir.mkdir(parents=True, exist_ok=True)
        (static_dir / f"{city}.json.gz").write_bytes(gz)

        # Optional visual layers also get a single CDN artifact. They stay out
        # of the critical bootstrap but no longer need two backend requests
        # when a user enables NDVI/green-space.
        optional_size = 0
        try:
            optional_raw = orjson.dumps({"v": get_vegetation(city), "g": get_greenspace(city)})
            optional_gz = gzip.compress(optional_raw, compresslevel=6, mtime=0)
            optional_dir = REPO / "web" / "public" / "data" / "optional"
            optional_dir.mkdir(parents=True, exist_ok=True)
            (optional_dir / f"{city}.json.gz").write_bytes(optional_gz)
            optional_size = len(optional_gz)
        except FileNotFoundError:
            pass

        t3 = time.perf_counter()
        print(
            f"{city}: {len(parcels):,} parcels cached in {t1-t0:.2f}s; "
            f"{len(idx.ids):,} vectors ({idx.backend}) in {t2-t1:.2f}s; "
            f"derived caches ({len(gaps)} gaps/{len(live)} livability/{len(growth.get('features', []))} growth cells); "
            f"static bootstrap {len(gz)/1024:.0f} KiB ({len(raw)/1024:.0f} KiB raw); "
            f"optional {optional_size/1024:.0f} KiB in {t3-t2:.2f}s"
        )


if __name__ == "__main__":
    main()
