"""Convert downloaded built-up rasters (GHSL + Esri) into per-city artefacts.

Runs observed-history + per-epoch built-up extent layers for every district
(and the two metro composites), mirroring the app's city registry. Re-runs are
safe: cities that already have an extent layer are skipped (--skip-done, and
every write is an UPSERT).

Examples:
  python scripts/build-observed.py --all-districts --kind ghsl --deg 0.001
  python scripts/build-observed.py --cities ahmedabad surat --skip-done
  python scripts/build-observed.py --all-districts --kind esri --skip-done
"""
from __future__ import annotations

import argparse
import os
import sqlite3
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
BACKEND = REPO / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.core.config import GUJARAT_CITIES  # noqa: E402
import app.data.ghsl as ghsl  # noqa: E402
from app.data.loader import ACTIVE_DB_PATH  # noqa: E402
from app.gis.parcels import get_parcels  # noqa: E402

MARKER = {"ghsl": "builtup_ghsl_1975", "esri": "builtup_esri_2018", "all": "builtup_ghsl_1975"}


def _is_done(db: Path, city: str, kind: str) -> bool:
    marker = MARKER[kind]
    try:
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=10)
        try:
            return con.execute(
                "SELECT 1 FROM layers WHERE city=? AND layer=? LIMIT 1",
                (city, marker),
            ).fetchone() is not None
        finally:
            con.close()
    except sqlite3.Error:
        return False


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--all-districts", action="store_true")
    ap.add_argument("--cities", nargs="*", default=[])
    ap.add_argument("--kind", choices=["ghsl", "esri", "all"], default="all")
    ap.add_argument("--deg", type=float, default=0.001,
                    help="target grid spacing in degrees (~111 m); 0.0005 = ~55 m")
    ap.add_argument("--extent-deg", type=float, default=None,
                    help="coarser display grid for extent layers (default: same as --deg)")
    ap.add_argument("--skip-done", action="store_true")
    args = ap.parse_args()

    if args.all_districts:
        cities = [
            c.id
            for c in GUJARAT_CITIES.values()
            if c.kind == "district"
        ]
    else:
        cities = args.cities or ["ahmedabad"]

    ghsl.WARP_DEG = args.deg
    ghsl.EXTENT_DEG = args.extent_deg or args.deg
    db = ACTIVE_DB_PATH or BACKEND / "urbanlens.db"

    for city in cities:
        if args.skip_done and _is_done(db, city, args.kind):
            print(f"[build-observed] {city}: already done, skipping", flush=True)
            continue
        t0 = time.time()
        try:
            parcels = get_parcels(city)
            print(f"[build-observed] {city}: {len(parcels)} parcels ({args.kind}, {args.deg} deg)",
                  flush=True)
            hist = ghsl.observed_history(city, parcels, args.kind)
            extents = ghsl.extract_extents(city, args.kind)
            ghsl.store_artifacts(city, hist, extents)
            for name, fc in extents.items():
                print(
                    f"[build-observed] {city} {name}: {len(fc)} polys, "
                    f"{ghsl.count_extent_km2(fc):.1f} km2 ({time.time()-t0:.0f}s)",
                    flush=True,
                )
        except Exception as exc:
            print(f"[build-observed] {city}: FAILED {type(exc).__name__}: {exc}", flush=True)
            continue


if __name__ == "__main__":
    main()