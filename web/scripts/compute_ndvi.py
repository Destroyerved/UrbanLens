import json
import os

import numpy as np
import rasterio
import rasterio.mask
from rasterio.transform import from_bounds
from rasterio.warp import reproject, Resampling
from rasterio.features import rasterize
from shapely.geometry import shape, mapping
from shapely.ops import transform as shp_transform
from pyproj import Transformer

BASE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(BASE, "..", "..", "raw")
SAT = os.path.join(RAW, "satellite")
REF = os.path.join(RAW, "..", "refined")

TILES = {
    "T43QBF": {
        "crs": "EPSG:32643",
        "bands": "S2B_MSIL2A_20260421T053639_N0512_R005_T43QBF_20260421T091905",
    },
}
TILES_ALL = {
    "T43QBF": {
        "crs": "EPSG:32643",
        "bands": "S2B_MSIL2A_20260421T053639_N0512_R005_T43QBF_20260421T091905",
    },
    "T42QZL": {
        "crs": "EPSG:32642",
        "bands": "S2B_MSIL2A_20260421T053639_N0512_R005_T42QZL_20260421T091905",
    },
}

SCL_KEEP = {4, 5, 6, 7}  # vegetation, non-veg, water, unclassified
SCL_MASK = {0, 1, 2, 3, 8, 9, 10, 11}  # nodata/sat/shadow/cloud/cirrus/etc


def load_wards(city_file):
    gj = json.load(open(city_file))
    feats = []
    for f in gj["features"]:
        feats.append({
            "id": f["properties"]["ward_id"],
            "name": f["properties"]["name"],
            "geom": shape(f["geometry"]),
        })
    return feats


def compute_tile(tile, wards4326, out_prefix, city_wards):
    meta = TILES[tile]
    crs_src = "EPSG:4326"
    crs_dst = meta["crs"]
    trans = Transformer.from_crs(crs_src, crs_dst, always_xy=True)
    inv = Transformer.from_crs(crs_dst, crs_src, always_xy=True)

    # reproject all wards for THIS city into tile CRS
    def to_tile(g):
        return shp_transform(lambda x, y, *z: trans.transform(x, y), g)

    wards_tile = [dict(w, geom=to_tile(w["geom"])) for w in wards4326]

    b4p = os.path.join(SAT, f"{meta['bands']}_B04_10m.jp2")
    b8p = os.path.join(SAT, f"{meta['bands']}_B08_10m.jp2")
    sclp = os.path.join(SAT, f"{meta['bands']}_SCL_20m.jp2")

    with rasterio.open(b4p) as b4, rasterio.open(b8p) as b8, rasterio.open(sclp) as scl:
        # union bbox of wards -> window in tile grid (10m)
        all_bounds = [
            w["geom"].bounds for w in wards_tile if not w["geom"].is_empty
        ]
        if not all_bounds:
            return None
        minx = min(b[0] for b in all_bounds)
        miny = min(b[1] for b in all_bounds)
        maxx = max(b[2] for b in all_bounds)
        maxy = max(b[3] for b in all_bounds)

        # add small padding for reprojection safety
        pad = 300
        minx -= pad; miny -= pad; maxx += pad; maxy += pad

        window = rasterio.windows.from_bounds(minx, miny, maxx, maxy, b4.transform)
        window = window.intersection(rasterio.windows.Window(0, 0, b4.width, b4.height))

        b4a = b4.read(1, window=window).astype("float32")
        b8a = b8.read(1, window=window).astype("float32")
        b4a[b4a == 0] = np.nan
        b8a[b8a == 0] = np.nan

        ndvi = (b8a - b4a) / (b8a + b4a)
        ndvi = np.clip(ndvi, -1, 1)

        # SCL at 20m -> resample to 10m grid (nearest)
        scl_win = rasterio.windows.from_bounds(minx, miny, maxx, maxy, scl.transform)
        scl_win = scl_win.intersection(rasterio.windows.Window(0, 0, scl.width, scl.height))
        scla = scl.read(1, window=scl_win)
        dst_transform = rasterio.windows.transform(window, b4.transform)
        scla_10 = np.zeros(ndvi.shape, dtype="uint8")
        reproject(
            source=scla.astype("uint8"),
            destination=scla_10,
            src_transform=rasterio.windows.transform(scl_win, scl.transform),
            src_crs=scl.crs,
            dst_transform=dst_transform,
            dst_crs=b4.crs,
            resampling=Resampling.nearest,
        )

        valid = ~np.isnan(ndvi) & np.isin(scla_10, list(SCL_KEEP))
        # also mask NDVI outside SCL coverage (nodata)
        valid &= scla_10 != 0

        # rasterize each ward id on the 10m grid
        out = np.zeros(ndvi.shape, dtype="int32")
        geoms = []
        for w in wards_tile:
            if not w["geom"].is_empty:
                geoms.append((mapping(w["geom"]), w["id"]))
        rasterize(
            geoms,
            out_shape=ndvi.shape,
            transform=dst_transform,
            fill=0,
            all_touched=False,
            out=out,
        )

        return {
            "tile": tile,
            "ward_ids": out,
            "ndvi": ndvi,
            "valid": valid,
            "transform": dst_transform,
            "crs": b4.crs,
            "meta": meta,
        }


def accumulate(acc, res):
    ids = res["ward_ids"]
    ndvi = res["ndvi"]
    valid = res["valid"]
    m = valid & (ids > 0)
    for wid in np.unique(ids[m]):
        sel = (ids == wid) & valid
        n = int(np.count_nonzero(sel))
        if n == 0:
            continue
        s = float(np.nansum(ndvi[sel]))
        if wid not in acc:
            acc[wid] = {"n": 0, "sum": 0.0}
        acc[wid]["n"] += n
        acc[wid]["sum"] += s


def main():
    cities = [
        ("ahmedabad", os.path.join(REF, "ahmedabad_wards.geojson")),
        ("gandhinagar", os.path.join(REF, "gandhinagar_wards.geojson")),
    ]
    os.makedirs(REF, exist_ok=True)

    all_rows = []
    for city, path in cities:
        wards = load_wards(path)
        acc = {}
        for tile in TILES:
            res = compute_tile(tile, wards, city, path)
            if res is not None:
                accumulate(acc, res)
        rows = []
        for w in wards:
            a = acc.get(w["id"], {"n": 0, "sum": 0.0})
            mean = (a["sum"] / a["n"]) if a["n"] else None
            rows.append({
                "ward_id": w["id"],
                "ward_name": w["name"],
                "city": city,
                "pixel_count": a["n"],
                "ndvi_mean": round(mean, 4) if mean is not None else None,
            })
        all_rows.extend(rows)
        import csv
        out = os.path.join(REF, f"{city}_ndvi_by_ward.csv")
        with open(out, "w", newline="") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            wr.writeheader()
            wr.writerows(rows)
        ok = sum(1 for r in rows if r["ndvi_mean"] is not None)
        print(f"[{city}] {ok}/{len(rows)} wards have NDVI")
        for r in rows[:3]:
            print("   ", r)

    # dump combined
    with open(os.path.join(REF, "ndvi_by_ward_all.json"), "w") as fh:
        json.dump(all_rows, fh, indent=1)
    print("DONE")


if __name__ == "__main__":
    main()