"""Download the Copernicus DEM 30 m COG tiles covering Gujarat into
datasets/dem (pipeline-only storage, inside the repo so it can be shared).

Tiles are 1-degree and named <lat><lon>, e.g. N23_E072. Only missing tiles are
fetched, in parallel, to /tmp then renamed — a re-run is cheap. Source is the
public AWS Open Data bucket, no credentials required.

After downloading, run web/scripts/shrink-dem.py to clip to Gujarat and
coarsen the tiles to 90 m (~77 MB instead of ~1.1 GB).
"""
from __future__ import annotations

import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen

REPO_ROOT = Path(__file__).resolve().parents[2]
DEM_DIR = REPO_ROOT / "datasets" / "dem"

# Gujarat extent, floored to 1-degree tiles.
LAT_MIN, LAT_MAX = 20, 24
LON_MIN, LON_MAX = 68, 74

BASE = "https://copernicus-dem-30m.s3.amazonaws.com"


def tile_url(lat: int, lon: int) -> str:
    tag = f"N{lat:02d}_00_E{lon:03d}_00"
    return f"{BASE}/Copernicus_DSM_COG_10_{tag}_DEM/Copernicus_DSM_COG_10_{tag}_DEM.tif"


def fetch(lat: int, lon: int) -> Path:
    DEM_DIR.mkdir(parents=True, exist_ok=True)
    dest = DEM_DIR / f"N{lat:02d}_E{lon:03d}.tif"
    if dest.exists() and dest.stat().st_size > 1_000_000:
        return dest
    url = tile_url(lat, lon)
    tmp = dest.with_suffix(".part")
    try:
        with urlopen(url, timeout=120) as src, tmp.open("wb") as out:
            while True:
                chunk = src.read(1 << 20)
                if not chunk:
                    break
                out.write(chunk)
        tmp.replace(dest)
        print(f"OK  {dest.name}  {dest.stat().st_size/1e6:.1f} MB", flush=True)
    except Exception as exc:  # noqa: BLE001
        tmp.unlink(missing_ok=True)
        if getattr(exc, "code", None) == 404:
            print(f"SEA {dest.name} (no land in this tile, skipped)", flush=True)
        else:
            print(f"ERR {dest.name}: {exc}", flush=True)
    return dest


def main() -> None:
    tiles = [(lat, lon) for lat in range(LAT_MIN, LAT_MAX + 1) for lon in range(LON_MIN, LON_MAX + 1)]
    workers = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(lambda t: fetch(*t), tiles))
    done = [p for p in DEM_DIR.glob("N*_E*.tif") if p.stat().st_size > 1_000_000]
    print(f"\n{done} tiles ready, {sum(p.stat().st_size for p in done)/1e6:.0f} MB in {DEM_DIR}")


if __name__ == "__main__":
    main()