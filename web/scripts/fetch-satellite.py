"""
Fetch real Sentinel-2 vegetation (NDVI) for a city and compute per-ward stats.

Pipeline:
  1. Read Copernicus Data Space credentials from .sat-credentials (repo root).
  2. Discover Sentinel-2 L2A scenes over the city bbox (via STAC), pick the
     lowest-cloud recent scene.
  3. Download only the bands needed for NDVI + cloud masking (B04, B08, SCL)
     using HTTP Range requests against the product files.
  4. Compute cloud-masked NDVI, clip to the city ward bounds, and write:
       - refined/ward_ndvi_<city>.csv        (per-ward zonal mean)
       - web/data/engine/<city>_vegetation.json  (ward polygons + ndvi)
  5. Also emits a preview raster refined/ndvi_<city>.tif for debugging.

The AHM+GNR region (~60 x 69 km) fits inside one Sentinel-2 tile, so no
mosaic step is required.
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import rasterio
import requests
from rasterio.features import rasterize
from rasterio.mask import mask as rio_mask
from rasterio.warp import Resampling
from shapely.geometry import mapping, shape

REPO = Path(r"C:\Users\Siddhi Patel\Desktop\Datasets")
CREDS = REPO / ".sat-credentials"
TOKEN_CACHE = REPO / "raw" / ".cdse_token"
RAW = REPO / "raw" / "satellite"
REFINED = REPO / "refined"
ENGINE = REPO / "UrbanLens-main" / "web" / "data" / "engine"
STAC = "https://stac.dataspace.copernicus.eu/v1"
AUTH = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
CLIENT = "cdse-public"
LOOKBACK_DAYS = 365
SESSION = requests.Session()


def read_creds() -> dict[str, str]:
    d: dict[str, str] = {}
    if not CREDS.exists():
        raise SystemExit(f"No {CREDS} - add CDSE_USER / CDSE_PASS.")
    for line in CREDS.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if "=" in line:
            k, v = line.split("=", 1)
            d[k.strip()] = v.strip()
    return d


def get_token() -> str:
    if TOKEN_CACHE.exists():
        tok = TOKEN_CACHE.read_text().strip()
        if tok:
            return tok
    c = read_creds()
    r = requests.post(
        AUTH,
        data={
            "grant_type": "password",
            "username": c["CDSE_USER"],
            "password": c["CDSE_PASS"],
            "client_id": CLIENT,
        },
        timeout=60,
    )
    if r.status_code != 200:
        raise SystemExit(
            f"Copernicus auth failed ({r.status_code}): "
            f"{r.json().get('error_description', r.text[:200])}"
        )
    tok = r.json()["access_token"]
    TOKEN_CACHE.write_text(tok)
    return tok


def auth_headers() -> dict:
    return {"Authorization": f"Bearer {get_token()}"}


def bbox_for(city: str) -> tuple[float, float, float, float]:
    ward_file = ENGINE / f"{city}_wards.json"
    if ward_file.exists():
        meta = json.loads(ward_file.read_text(encoding="utf-8")).get("meta", {})
        if meta.get("bbox"):
            return tuple(meta["bbox"])  # minLng, minLat, maxLng, maxLat
    return (72.30, 22.80, 72.85, 23.42)


def discover_scenes(west, south, east, north, start_date) -> list[dict]:
    """Search STAC for L2A scenes, sorted by recency."""
    url = (
        f"{STAC}/search?collections=sentinel-2-l2a"
        f"&bbox={west},{south},{east},{north}"
        f"&datetime={start_date}T00:00:00Z/.."
        f"&limit=60&sortby=-properties.datetime"
    )
    r = SESSION.get(url, headers=auth_headers(), timeout=60)
    if r.status_code != 200:
        raise SystemExit(f"STAC search failed {r.status_code}: {r.text[:200]}")
    out = []
    for f in r.json().get("features", []):
        props = f["properties"]
        assets = f.get("assets", {})
        picked = {}
        for k, v in assets.items():
            base = k.split("_")[0]
            res = k.split("_")[-1]
            if base == "SCL" and res in ("10m", "20m"):
                picked.setdefault(base, v.get("href", ""))
            elif base in ("B04", "B08") and res == "10m":
                picked.setdefault(base, v.get("href", ""))
        out.append(
            {
                "id": f["id"],
                "datetime": props.get("datetime", ""),
                "cloud": props.get("eo:cloud_cover", 100),
                "tile": f["id"].split("_")[5] if len(f["id"].split("_")) > 5 else "?",
                "assets": picked,
            }
        )
    return out


BAND_SUFFIX = {"B04": "_B04_10m.jp2", "B08": "_B08_10m.jp2", "SCL": "_SCL_20m.jp2"}
ODATA_CAT = "https://catalogue.dataspace.copernicus.eu/odata/v1"
ODATA_DL = "https://download.dataspace.copernicus.eu/odata/v1"


def local_band(scene_id: str, band: str) -> Path:
    return RAW / f"{scene_id}{BAND_SUFFIX[band]}"


def odata_uuid(scene_id: str) -> str:
    u = f"{ODATA_CAT}/Products?$filter=contains(Name,'{scene_id}')&$top=1"
    r = SESSION.get(u, timeout=60)
    r.raise_for_status()
    items = r.json().get("value", [])
    if not items:
        raise RuntimeError(f"product not found in OData: {scene_id}")
    return items[0]["Id"]


def odata_band_path(pid: str, scene_id: str, band: str) -> Path:
    """Find the OData node path for a band via the download host node tree."""
    suffix = BAND_SUFFIX[band]
    targets = [suffix]
    found: dict[str, tuple[list[str], str]] = {}

    def walk(path: list[str], depth: int = 0):
        if depth > 8 or not targets:
            return
        u = f"{ODATA_DL}/{'/'.join(path)}/Nodes"
        r = SESSION.get(u, headers=auth_headers(), timeout=90)
        if r.status_code != 200:
            raise RuntimeError(f"node listing failed {r.status_code}: {u}")
        for n in r.json().get("result", []):
            name = n["Name"]
            is_folder = n.get("ChildrenNumber", 0) > 0
            for t in list(targets):
                if name.endswith(t) and not is_folder:
                    found[t] = (path[:], name)
                    targets.remove(t)
            if is_folder:
                walk(path + [f"Nodes({name})"], depth + 1)

    walk([f"Products({pid})"])
    if suffix not in found:
        raise RuntimeError(f"band {band} not found in product {scene_id}")
    rel, name = found[suffix]
    return Path("/".join(rel[1:] + [name]))


def odata_download(scene_id: str, band: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    pid = odata_uuid(scene_id)
    rel = odata_band_path(pid, scene_id, band)
    u = f"{ODATA_DL}/Products({pid})/{rel}/$value"
    r = SESSION.get(u, headers=auth_headers(), timeout=600, stream=True)
    if r.status_code not in (200, 206):
        raise RuntimeError(f"OData download failed {r.status_code}: {u}")
    tmp = dest.with_suffix(dest.suffix + ".part")
    with open(tmp, "wb") as fh:
        for chunk in r.iter_content(1 << 20):
            fh.write(chunk)
    tmp.rename(dest)
    return dest


def download_asset(scene_id: str, band: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    local = local_band(scene_id, band)
    if local.exists() and local.stat().st_size > 0:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(local.read_bytes())
        print(f"  reused local {local.name}")
        return dest
    return odata_download(scene_id, band, dest)


def load_band(path: Path) -> tuple[np.ndarray, dict]:
    with rasterio.open(path) as src:
        return src.read(1), src.meta


def compute_ndvi(b04: Path, b08: Path, scl: Path, bounds_geom) -> tuple[np.ndarray, dict] | tuple[None, None]:
    """Clip B04/B08/SCL to the AOI (reprojected into the band CRS) and return
    cloud-masked NDVI plus raster meta. Returns (None, None) if the AOI does not
    intersect this tile."""
    from pyproj import Transformer
    from shapely.geometry import shape as shp_shape
    from shapely.ops import transform as shp_transform

    with rasterio.open(b04) as src:
        b = shp_shape(bounds_geom)
        trans = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True)
        b_utm = shp_transform(lambda x, y, *z: trans.transform(x, y), b)
        w, s_, e, n = rasterio.warp.transform_bounds("EPSG:4326", src.crs, *b.bounds)
        tile_box = {
            "type": "Polygon",
            "coordinates": [[[w, s_], [e, s_], [e, n], [w, n], [w, s_]]],
        }
        if not b_utm.intersects(shp_shape(tile_box)):
            return None, None
        red, red_t = rio_mask(src, [mapping(b_utm)], crop=True, nodata=0)
        red = red[0]
        meta = src.meta.copy()
        meta.update({"transform": red_t, "height": red.shape[0], "width": red.shape[1]})
    with rasterio.open(b08) as src:
        nir, _ = rio_mask(src, [mapping(b_utm)], crop=True, nodata=0)
        nir = nir[0]
    with rasterio.open(scl) as src:
        scl_arr, scl_t = rio_mask(src, [mapping(b_utm)], crop=True, nodata=0)
        scl_arr = scl_arr[0]
        scl_crs = src.crs
    # Resample the coarser SCL to the 10 m red/nir grid so the cloud mask aligns.
    if scl_arr.shape != red.shape:
        scl_arr = rasterio.warp.reproject(
            np.where(scl_arr == 0, 0, scl_arr),
            np.empty(red.shape, dtype=np.uint8),
            src_transform=scl_t,
            src_crs=scl_crs,
            dst_transform=meta["transform"],
            dst_crs=meta["crs"],
            src_nodata=0,
            dst_nodata=0,
            resampling=Resampling.nearest,
        )[0]

    red = red.astype(np.float32)
    nir = nir.astype(np.float32)
    # L2A bands are scaled 0..10000; SCL classes 4,5,6,7 = clear land/water.
    cloud_mask = ~np.isin(scl_arr, [4, 5, 6, 7])
    denom = nir + red
    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = np.where(denom > 0, (nir - red) / np.where(denom > 0, denom, 1), np.nan)
    ndvi = np.where(cloud_mask, np.nan, ndvi)
    return ndvi, meta


def zonal_stats(ndvi: np.ndarray, meta: dict, ward_feats: list[dict]) -> list[dict]:
    """Rasterize ward polygons to unique ids, then vectorized zonal mean."""
    height, width = ndvi.shape
    transform = meta["transform"]
    crs = meta["crs"]
    # Ward features are stored in lon/lat; reproject into the raster CRS.
    from pyproj import Transformer
    from shapely.geometry import shape as shp_shape
    from shapely.ops import transform as shp_transform

    trans = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    shapes = []
    for i, f in enumerate(ward_feats, start=1):
        g = shp_shape(f["geometry"])
        g = shp_transform(lambda x, y, *z: trans.transform(x, y), g)
        shapes.append((mapping(g), i))
    id_raster = rasterize(shapes, out_shape=(height, width), transform=transform, fill=0)
    flat_id = id_raster.ravel()
    flat_nv = ndvi.ravel()
    valid = (flat_id > 0) & ~np.isnan(flat_nv)
    sums = np.bincount(flat_id[valid], weights=flat_nv[valid], minlength=len(ward_feats) + 1)
    counts = np.bincount(flat_id[valid], minlength=len(ward_feats) + 1)
    rows = []
    for i, f in enumerate(ward_feats, start=1):
        props = dict(f["properties"])
        props["ward_id"] = props.get("ward_id") or props.get("id") or str(i)
        props["ndvi_mean"] = round(float(sums[i] / counts[i]), 4) if counts[i] else None
        props["cells"] = int(counts[i])
        rows.append(props)
    return rows


def main(cities):
    if not cities:
        cities = ["ahmedabad", "gandhinagar"]

    west = south = 1e9
    east = north = -1e9
    for c in cities:
        w, s, e, n = bbox_for(c)
        west, south = min(west, w), min(south, s)
        east, north = max(east, e), max(north, n)
    bounds_geom = {
        "type": "Polygon",
        "coordinates": [
            [[west, south], [east, south], [east, north], [west, north], [west, south]]
        ],
    }
    start = (date.today() - timedelta(days=LOOKBACK_DAYS)).isoformat()
    print(f"Discovering S2 L2A over [{west},{south},{east},{north}] since {start} ...")

    scenes = discover_scenes(west, south, east, north, start)
    print(f"  {len(scenes)} candidate scenes")
    if not scenes:
        sys.exit("No scenes found.")

    # The STAC search truncates to the 60 most recent scenes; anything cached
    # locally but older is invisible to it. Merge complete cached scenes back
    # in so a fresh AOI (e.g. the metro) can reuse bands already on disk.
    cached_scenes: dict[str, dict] = {}
    for path in RAW.glob("*.jp2"):
        m = re.match(r"^(S2[AB]_MSIL2A_\d{8}T\d{6}.*?)_(B04|B08|SCL)_\d+m\.jp2$", path.name)
        if not m:
            continue
        sid = m.group(1)
        entry = cached_scenes.setdefault(
            sid, {"id": sid, "datetime": "", "cloud": 0.0, "tile": "?", "assets": {}}
        )
        if entry["datetime"] == "" and len(sid) > 26:
            try:
                entry["datetime"] = f"{sid[10:18]}T{sid[19:25]}"
            except IndexError:
                pass
        parts = sid.split("_")
        if len(parts) > 5:
            entry["tile"] = parts[5]
        band = m.group(2)
        if band in ("B04", "B08"):
            entry["assets"][band] = str(path)
        else:
            entry["assets"]["SCL"] = str(path)
    merged_ids = {s["id"] for s in scenes}
    for sid, entry in cached_scenes.items():
        if sid not in merged_ids and all(k in entry["assets"] for k in ("B04", "B08", "SCL")):
            scenes.append(entry)

    # Group by tile, then pick the single lowest-cloud acquisition DATE. Both
    # tiles must come from the same date so the mosaic is one snapshot. Prefer a
    # date whose bands are already cached locally (no re-download, works offline).
    by_date: dict[str, dict] = {}
    for s in scenes:
        day = s["datetime"][:10]
        if day not in by_date or s["cloud"] < by_date[day]["cloud"]:
            by_date[day] = s

    def _cached(s: dict) -> bool:
        return local_band(s["id"], "B04").exists() and local_band(s["id"], "B08").exists()

    cached_dates = [d for d, s in by_date.items() if _cached(s)]
    if cached_dates:
        best_date = min(cached_dates, key=lambda d: by_date[d]["cloud"])
    else:
        best_date = min(by_date, key=lambda d: (by_date[d]["cloud"], d))
    best = by_date[best_date]
    print(f"  best clear date: {best_date} (cloud {best['cloud']:.1f}%)")
    print(f"  chosen: {best['id']}  tile={best['tile']}")

    # Collect every scene from the same date across all tiles.
    same_date = [s for s in scenes if s["datetime"][:10] == best_date]
    print(f"  {len(same_date)} scene(s) on {best_date} covering the box")
    selected: dict[str, dict] = {}
    for s in sorted(same_date, key=lambda x: (x["tile"], x["cloud"])):
        selected.setdefault(s["tile"], s)

    # A single low-cloud tile fully covering the AOI is enough and avoids
    # double-counting cells where adjacent tiles overlap. Pick the tile whose
    # UTM zone matches the AOI centre longitude (deterministic); fall back to
    # any single tile.
    from shapely.geometry import shape as _shape

    c_lon, c_lat = _shape(bounds_geom).centroid.coords[0]
    zone = int((c_lon + 180) // 6) + 1
    kept = None
    for t in sorted(selected):
        if f"T{zone:02d}" in t:
            kept = t
            break
    if kept is None and selected:
        kept = sorted(selected.keys())[0]
    print(f"  using tile: {kept}")
    selected = {kept: selected[kept]} if kept else {}

    for t, s in selected.items():
        print(f"    tile {t}: {s['id']}  cloud={s['cloud']:.1f}%")

    RAW.mkdir(parents=True, exist_ok=True)
    REFINED.mkdir(parents=True, exist_ok=True)

    # Download + compute NDVI for each selected tile, clipped to the union box.
    tile_ndvi = []
    for tile, s in selected.items():
        if not all(k in s["assets"] for k in ("B04", "B08", "SCL")):
            print(f"  ! tile {tile} missing bands, skipping")
            continue
        d = RAW / s["id"]
        b04 = download_asset(s["id"], "B04", d / "B04.jp2")
        b08 = download_asset(s["id"], "B08", d / "B08.jp2")
        scl = download_asset(s["id"], "SCL", d / "SCL.jp2")
        print(f"  computing NDVI for {tile} ...")
        ndvi, meta = compute_ndvi(b04, b08, scl, bounds_geom)
        if ndvi is None:
            print(f"  ! tile {tile} does not cover the AOI, skipping")
            continue
        tile_ndvi.append((ndvi, meta, s))

    if not tile_ndvi:
        sys.exit("no NDVI computed")

    # Mosaic: reproject each tile piece onto a common grid then mean-overlap.
    ref_meta = tile_ndvi[0][1]
    out_t = ref_meta["transform"]
    mosaic = np.full((ref_meta["height"], ref_meta["width"]), np.nan, dtype=np.float32)
    for ndvi, meta, s in tile_ndvi:
        if meta["height"] == ref_meta["height"] and meta["width"] == ref_meta["width"] and \
           meta["transform"] == out_t:
            good = ~np.isnan(ndvi)
            mosaic[good] = ndvi[good]
        else:
            # reproject to reference grid
            dst = np.empty((ref_meta["height"], ref_meta["width"]), dtype=np.float32)
            reproject(
                np.where(np.isnan(ndvi), 0, ndvi),
                dst,
                src_transform=meta["transform"],
                src_crs=meta["crs"],
                dst_transform=out_t,
                dst_crs=ref_meta["crs"],
                src_nodata=0,
                dst_nodata=np.nan,
                resampling=Resampling.bilinear,
            )
            mosaic = np.where(np.isnan(mosaic), dst, mosaic)
    ndvi = mosaic
    meta = ref_meta

    preview = REFINED / f"ndvi_{'_'.join(cities)}.tif"
    pmeta = meta.copy()
    pmeta.update({"driver": "GTiff", "count": 1, "dtype": "float32", "compress": "deflate"})
    with rasterio.open(preview, "w", **pmeta) as dst:
        dst.write(ndvi, 1)
    print(f"  wrote preview raster {preview} {ndvi.shape}")

    for city in cities:
        ward_file = ENGINE / f"{city}_wards.json"
        if not ward_file.exists():
            print(f"  ! no ward file for {city}, skipping")
            continue
        feats = json.loads(ward_file.read_text(encoding="utf-8"))["features"]
        rows = zonal_stats(ndvi, meta, feats)
        named = [r for r in rows if r.get("ndvi_mean") is not None]
        n_cov = len(named)
        cov = 100.0 * n_cov / len(rows) if rows else 0
        print(f"  {city}: {n_cov}/{len(rows)} wards covered ({cov:.0f}%)")

        out_csv = REFINED / f"ward_ndvi_{city}.csv"
        with open(out_csv, "w", encoding="utf-8") as fh:
            fh.write("ward_id,name,ndvi_mean,cells\n")
            for r in rows:
                fh.write(f'{r["ward_id"]},{r.get("name","")},{r["ndvi_mean"]},{r["cells"]}\n')
        print(f"  wrote {out_csv}")

        veg_feats = []
        for f, r in zip(feats, rows):
            veg_feats.append({"type": "Feature", "geometry": f["geometry"], "properties": r})
        veg_doc = {
            "type": "FeatureCollection",
            "features": veg_feats,
            "meta": {
                "source": "Copernicus Sentinel-2 L2A",
                "product": "NDVI (B8-B4)/(B8+B4), 10 m",
                "scene": best["id"],
                "acquisition": best_date,
                "cloud_cover": best["cloud"],
                "tiles": sorted(selected.keys()),
            },
        }
        out_engine = ENGINE / f"{city}_vegetation.json"
        out_engine.write_text(json.dumps(veg_doc), encoding="utf-8")
        print(f"  wrote {out_engine} ({len(veg_feats)} features)")


if __name__ == "__main__":
    main(sys.argv[1:])