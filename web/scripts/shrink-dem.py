"""Shrink the Copernicus DEM tile cache to Gujarat only, at a coarser
resolution, so the ~1.1 GB full-state 30 m tiles become a ~77 MB 90 m dataset
that lives inside the repo (datasets/dem) and can be shared with the project.

Clipping keeps parcel elevation / flood-risk working unchanged: the backend
(backend/app/gis/flood.py) reads the same N{lat}_E{lon}.tif filenames at
DEM_DIR (default datasets/dem) and degrades gracefully when the folder is
absent.

Run once, after web/scripts/fetch-dem.py:
    python web/scripts/shrink-dem.py                           # shrink in place
    python web/scripts/shrink-dem.py --source D:\\UrbanLens-data\\dem   # shrink + move

Do not re-run fetch-dem.py afterwards: any tile smaller than its 1 MB skip
threshold would be re-downloaded at full size.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from shapely.geometry import shape
from shapely.ops import unary_union

REPO_ROOT = Path(__file__).resolve().parents[2]
DEM_DIR = REPO_ROOT / "datasets" / "dem"
BOUNDARIES = REPO_ROOT / "web" / "data" / "engine" / "gujarat_boundaries.json"

# 90 m cell: 1/1200 of a degree (the model merges at 1/3600 = 30 m and is fed
# these via nearest-neighbour, which keeps flood bands intact).
RES = 1 / 1200
NODATA = -32767.0
BUFFER_DEG = 0.03


def gujarat_shape() -> "object":
    import rasterio
    from rasterio.features import geometry_mask

    fc = json.loads(BOUNDARIES.read_text(encoding="utf-8"))
    polys = [shape(f["geometry"]).buffer(0) for f in fc["features"] if f["geometry"]]
    union = unary_union(polys).buffer(BUFFER_DEG)
    return union


def shrink_tile(src: Path, dest: Path, union) -> bool:
    import rasterio
    from rasterio import mask as rio_mask
    from rasterio.warp import reproject, Resampling

    with rasterio.Env():
        with rasterio.open(src) as ds:
            clipped, transform = rio_mask.mask(
                ds, [union], crop=True, nodata=NODATA, filled=True, indexes=1
            )
            arr = clipped.astype(np.float32)
            arr = np.where(arr == NODATA, np.nan, arr)

        # All-nodata (pure sea / fully outside Gujarat) -> nothing to keep.
        if not np.isfinite(arr).any():
            return False

        height, width = arr.shape
        west, north = transform.c, transform.f
        east = west + width * transform.a
        south = north + height * transform.e
        dst_w = int(np.ceil((east - west) / RES))
        dst_h = int(np.ceil((north - south) / RES))
        new_transform = rasterio.transform.from_origin(west, north, RES, RES)
        dst = np.empty((dst_h, dst_w), dtype=np.float32)

        reproject(
            source=np.nan_to_num(arr, nan=NODATA),
            destination=dst,
            src_transform=transform,
            src_crs=ds.crs,
            src_nodata=NODATA,
            dst_transform=new_transform,
            dst_crs=ds.crs,
            dst_nodata=NODATA,
            resampling=Resampling.average,
        )

        profile = {
            "driver": "GTiff",
            "height": dst_h,
            "width": dst_w,
            "count": 1,
            "dtype": "float32",
            "crs": ds.crs,
            "transform": new_transform,
            "nodata": NODATA,
            "compress": "deflate",
            "tiled": True,
            "blockxsize": 256,
            "blockysize": 256,
        }
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(".tmp.tif")
        with rasterio.open(tmp, "w", **profile) as out:
            out.write(dst, 1)
        tmp.replace(dest)
        return True


def main() -> None:
    ap = argparse.ArgumentParser(description="Clip + coarsen the Gujarat DEM cache.")
    ap.add_argument("--source", default=None, help="Read tiles here (default: same as dest).")
    args = ap.parse_args()

    source_dir = Path(args.source) if args.source else DEM_DIR
    if not source_dir.is_dir():
        print(f"DEM dir not found: {source_dir}", file=sys.stderr)
        sys.exit(1)

    import rasterio

    union = gujarat_shape()
    tiles = sorted(source_dir.glob("N*_E*.tif"))
    if not tiles:
        print("No N*_E*.tif tiles found.")
        return

    before = sum(t.stat().st_size for t in tiles)
    kept = 0
    for t in tiles:
        dest = DEM_DIR / t.name
        try:
            if shrink_tile(t, dest, union):
                kept += 1
                print(f"OK  {t.name}  {t.stat().st_size/1e6:5.1f}MB -> {dest.stat().st_size/1e6:5.1f}MB")
            else:
                print(f"SKIP {t.name} (no Gujarat land)")
        except Exception as exc:  # noqa: BLE001
            print(f"ERR {t.name}: {exc}", file=sys.stderr)
            continue
        if args.source and dest.exists() and dest != t:
            t.unlink(missing_ok=True)

    after = sum(p.stat().st_size for p in DEM_DIR.glob("N*_E*.tif"))
    print(f"\n{kept}/{len(tiles)} tiles kept")
    print(f"{before/1e6:.0f} MB -> {after/1e6:.0f} MB  ({after/before*100:.0f}%)  in {DEM_DIR}")


if __name__ == "__main__":
    main()