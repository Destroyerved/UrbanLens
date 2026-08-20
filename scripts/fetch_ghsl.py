"""Download GHSL Built-up Surface R2023A tiles for the Gujarat bbox.

Epochs E1975..E2020 are observed by JRC; E2025/E2030 are model projections and
are intentionally excluded — forecasts built on this data must extrapolate
themselves, never train on another group's projection.

Usage:
    python scripts/fetch_ghsl.py            # download everything missing
    python scripts/fetch_ghsl.py --dry-run  # print what would be fetched
    python scripts/fetch_ghsl.py --epoch E2015
    python scripts/fetch_ghsl.py --force    # re-download even if present

Output: datasets/ghsl/{epoch}_{tile}.tif (unzipped, EPSG:54009 Mollweide).
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "datasets" / "ghsl"

BASE_URL = (
    "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/"
    "GHS_BUILT_S_GLOBE_R2023A/"
    "GHS_BUILT_S_E{EPOCH}_GLOBE_R2023A_54009_100/V1-0/tiles/"
    "GHS_BUILT_S_E{EPOCH}_GLOBE_R2023A_54009_100_V1_0_{TILE}.zip"
)

EPOCHS = ["1975", "1980", "1985", "1990", "1995",
          "2000", "2005", "2010", "2015", "2020"]

# Tiles covering the Gujarat bbox (68.3-74.6 E, 20.0-24.8 N) in the R2023A
# 100 m grid. Verified against E2020 tile extents in EPSG:4326:
#   R6_C25: 63.05-77.47 E, 24.55-33.06 N  (north-Gujarat margin, e.g. Banaskantha)
#   R7_C25: 66.04-73.63 E, 20.38-24.55 N  (main Gujarat body)
#   R7_C26: ~73.6-84.5 E                  (eastern Gujarat: Surat, Dahod, ...)
TILES = ["R6_C25", "R7_C25", "R7_C26"]

HEADERS = {"User-Agent": "urbanlens-dataset-prep/1.0"}


def url_for(epoch: str, tile: str) -> str:
    return BASE_URL.format(EPOCH=epoch, TILE=tile)


def download(url: str, dest: Path, timeout_sec: int = 300) -> None:
    req = urllib.request.Request(url, headers=HEADERS)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(req, timeout=timeout_sec) as r, open(tmp, "wb") as fh:
        shutil.copyfileobj(r, fh)
    tmp.replace(dest)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--epoch", action="append", default=None,
                    help="limit to a specific epoch (repeatable)")
    ap.add_argument("--tile", action="append", default=None,
                    help="limit to a specific tile (repeatable)")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    epochs = [e for e in EPOCHS if e in (args.epoch or EPOCHS)] if args.epoch else EPOCHS
    tiles = [t for t in TILES if t in (args.tile or TILES)] if args.tile else TILES
    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)

    plan = [url_for(e, t) for e in epochs for t in tiles]
    total_mb = 0.0
    for url in plan:
        name = url.rsplit("/", 1)[-1]
        stem = name.replace("GHS_BUILT_S_", "").replace(".zip", "")
        tif = out / f"{stem}.tif"
        if tif.exists() and not args.force:
            continue
        try:
            req = urllib.request.Request(url, method="HEAD", headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as r:
                size = int(r.headers.get("Content-Length", 0))
        except Exception:
            size = 0
        total_mb += size / 1e6
        if args.dry_run:
            print(f"[dry-run] {stem} ({size / 1e6:.1f} MB)")
            continue
        zip_path = out / name
        download(url, zip_path)
        try:
            with zipfile.ZipFile(zip_path) as z:
                member = next(
                    m for m in z.namelist() if m.lower().endswith(".tif")
                )
                with z.open(member) as src, open(tif, "wb") as dst:
                    shutil.copyfileobj(src, dst)
        finally:
            zip_path.unlink(missing_ok=True)
        print(f"ok {stem} -> {tif.name}")

    if args.dry_run:
        print(f"[dry-run] {len(plan)} files, ~{total_mb / 1024:.2f} GB")
    else:
        present = list(out.glob("*.tif"))
        print(f"done: {len(present)} tifs in {out} ({sum(f.stat().st_size for f in present) / 1e6:.0f} MB)")


if __name__ == "__main__":
    sys.exit(main())