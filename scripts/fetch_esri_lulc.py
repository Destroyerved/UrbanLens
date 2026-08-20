"""Download Esri/Impact Observatory 10 m annual land-cover tiles (Gujarat).

Built Area is class 7 of the 9-class S2 LULC product, CC BY 4.0, hosted on AWS
Open Data (io-10m-annual-lulc, us-west-2). Tiles follow the Sentinel-2 UTM grid;
42Q/42R/43Q/43R cover the Gujarat bbox. Years are chosen for the Time Machine
anchor points (2018, 2022) plus the most recent observed year (2024 — the 2025
layer does not exist in the bucket, verified 404). The 2017 layer is
intentionally skipped — it was produced from fewer images and is documented as
less accurate.

Usage:
    python scripts/fetch_esri_lulc.py            # download everything missing
    python scripts/fetch_esri_lulc.py --dry-run
    python scripts/fetch_esri_lulc.py --year 2022

Output: datasets/esri/{year}_{tile}.tif (cloud-optimized GeoTIFF, UTM).
"""
from __future__ import annotations

import argparse
import shutil
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "datasets" / "esri"

BASE_URL = "https://io-10m-annual-lulc.s3.us-west-2.amazonaws.com/{TILE}_{YEAR}.tif"

YEARS = ["2018", "2022", "2024"]
TILES = ["42Q", "42R", "43Q", "43R"]

HEADERS = {"User-Agent": "urbanlens-dataset-prep/1.0"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--year", action="append", default=None)
    ap.add_argument("--tile", action="append", default=None)
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    years = [y for y in YEARS if y in (args.year or YEARS)] if args.year else YEARS
    tiles = [t for t in TILES if t in (args.tile or TILES)] if args.tile else TILES
    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)

    plan = [BASE_URL.format(TILE=t, YEAR=y) for y in years for t in tiles]
    total_mb = 0.0
    for url in plan:
        name = url.rsplit("/", 1)[-1]
        dest = out / name
        if dest.exists() and not args.force:
            continue
        try:
            req = urllib.request.Request(url, method="HEAD", headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as r:
                size = int(r.headers.get("Content-Length", 0))
        except Exception:
            size = 0
        total_mb += size / 1e6
        if args.dry_run:
            print(f"[dry-run] {name} ({size / 1e6:.1f} MB)")
            continue
        req = urllib.request.Request(url, headers=HEADERS)
        tmp = dest.with_suffix(dest.suffix + ".part")
        with urllib.request.urlopen(req, timeout=1800) as r, open(tmp, "wb") as fh:
            shutil.copyfileobj(r, fh)
        tmp.replace(dest)
        print(f"ok {name}")

    if args.dry_run:
        print(f"[dry-run] {len(plan)} files, ~{total_mb / 1024:.2f} GB")
    else:
        present = list(out.glob("*.tif"))
        print(f"done: {len(present)} tifs in {out} ({sum(f.stat().st_size for f in present) / 1e6:.0f} MB)")


if __name__ == "__main__":
    sys.exit(main())