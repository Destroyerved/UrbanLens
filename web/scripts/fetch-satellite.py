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

Every tile on the chosen date that overlaps the AOI is fetched and merged into
one mosaic, so large districts that span several Sentinel-2 tiles get NDVI for
all of their wards, not just the tile containing the district centre.
"""
from __future__ import annotations

import json
import re
import sys
import threading
import time
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# Windows consoles default to cp1252, which cannot encode glyphs like ✓ in the
# progress prints — switch output to UTF-8 and never crash on a glyph.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001 — not every stream is reconfigurable
        pass

import numpy as np
import rasterio
import requests
from rasterio.features import rasterize
from rasterio.mask import mask as rio_mask
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, reproject
from shapely.geometry import mapping, shape

REPO = Path(__file__).resolve().parents[2]
CREDS = REPO / ".sat-credentials"
TOKEN_CACHE = REPO / "raw" / ".cdse_token"
# Bulk band/preview storage lives on D: (C: was nearly full). New downloads go
# to BULK_DIR; LEGACY_RAW (the old C: tree) is still read for cached bands so a
# rerun does not re-download work already on disk.
BULK_DIR = Path(r"D:\UrbanLens-data")
RAW = BULK_DIR / "satellite"
REFINED = BULK_DIR / "refined"
LEGACY_RAW = REPO / "raw" / "satellite"
ENGINE = REPO / "web" / "data" / "engine"
STAC = "https://stac.dataspace.copernicus.eu/v1"
AUTH = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
CLIENT = "cdse-public"
LOOKBACK_DAYS = 365
# Multi-date compositing: per tile, stack up to this many distinct-date scenes
# (each under MAX_SCENE_CLOUD cloud) so one date's cloud holes are filled by
# another date's clear pixels.
MAX_SCENES_PER_TILE = 3
MAX_SCENE_CLOUD = 20.0
MIN_TILE_VALID = 65.0  # if the best scene already covers this % of the AOI, skip extras
PARALLEL_DOWNLOADS = 3  # concurrent band streams per district (CDSE rate-limits harder past ~8 total)
MAX_MOSAIC_PIXELS = 60_000_000  # cap union-mosaic pixels; coarsen resolution above this (kutch OOM fix)
SESSION = requests.Session()
_thread_local = threading.local()


def _session() -> requests.Session:
    """requests.Session is not thread-safe — give every download thread its own."""
    sess = getattr(_thread_local, "sess", None)
    if sess is None:
        sess = requests.Session()
        _thread_local.sess = sess
    return sess


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
        if tok and _token_valid(tok):
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


def _token_valid(tok: str) -> bool:
    """A CDSE token is a JWT valid for ~60 min. Decode `exp`; refresh if expired
    or undecodable (the cached file can be a stale one that 401s on download)."""
    import base64

    try:
        payload = tok.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        exp = json.loads(base64.urlsafe_b64decode(payload))["exp"]
        return int(time.time()) < int(exp) - 120
    except Exception:  # noqa: BLE001 — treat undecodable as invalid, re-auth
        return False


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
    """Search STAC for L2A scenes, sorted by recency, paginated over the whole
    window. A year of monsoon + clear-season scenes exceeds one page, and the
    collection caps a page at 200 — so follow the next tokens."""
    out: list[dict] = []
    next_token = None
    for _ in range(12):
        url = (
            f"{STAC}/search?collections=sentinel-2-l2a"
            f"&bbox={west},{south},{east},{north}"
            f"&datetime={start_date}T00:00:00Z/.."
            f"&limit=200&sortby=-properties.datetime"
        )
        if next_token:
            url += f"&next={next_token}"
        r = SESSION.get(url, headers=auth_headers(), timeout=60)
        if r.status_code != 200:
            raise SystemExit(f"STAC search failed {r.status_code}: {r.text[:200]}")
        data = r.json()
        feats = data.get("features", [])
        for f in feats:
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
                    "geometry": f.get("geometry"),
                }
            )
        next_token = data.get("next")
        if not next_token or not feats:
            break
    return out


BAND_SUFFIX = {"B04": "_B04_10m.jp2", "B08": "_B08_10m.jp2", "SCL": "_SCL_20m.jp2"}
ODATA_CAT = "https://catalogue.dataspace.copernicus.eu/odata/v1"
ODATA_DL = "https://download.dataspace.copernicus.eu/odata/v1"


def local_band(scene_id: str, band: str) -> Path:
    p = RAW / f"{scene_id}{BAND_SUFFIX[band]}"
    if p.exists():
        return p
    return LEGACY_RAW / f"{scene_id}{BAND_SUFFIX[band]}"


def odata_uuid(scene_id: str, sess: requests.Session | None = None) -> str:
    sess = sess or SESSION
    u = f"{ODATA_CAT}/Products?$filter=contains(Name,'{scene_id}')&$top=1"
    r = sess.get(u, timeout=60)
    r.raise_for_status()
    items = r.json().get("value", [])
    if not items:
        raise RuntimeError(f"product not found in OData: {scene_id}")
    return items[0]["Id"]


def odata_band_path(pid: str, scene_id: str, band: str, sess: requests.Session | None = None) -> str:
    """Find the OData node path for a band via the download host node tree."""
    sess = sess or SESSION
    suffix = BAND_SUFFIX[band]
    targets = [suffix]
    found: dict[str, tuple[list[str], str]] = {}

    def walk(path: list[str], depth: int = 0):
        if depth > 8 or not targets:
            return
        u = f"{ODATA_DL}/{'/'.join(path)}/Nodes"
        r = sess.get(u, headers=auth_headers(), timeout=90)
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
    # Every path segment on the download host is a Nodes(...) node — folders AND
    # files alike. Return a plain forward-slash string: a Path would render with
    # backslashes on Windows and the host rejects that as "malformed OData path".
    return "/".join(rel[1:] + [f"Nodes({name})"])


def odata_download(
    scene_id: str, band: str, dest: Path, attempts: int = 4, sess: requests.Session | None = None
) -> Path:
    """Download a band, resuming a partial .part and retrying on the transient
    connection resets the CDSE host throws mid-stream."""
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    sess = sess or _session()
    dest.parent.mkdir(parents=True, exist_ok=True)
    pid = odata_uuid(scene_id, sess)
    rel = odata_band_path(pid, scene_id, band, sess)
    u = f"{ODATA_DL}/Products({pid})/{rel}/$value"
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(1, attempts + 1):
        try:
            resume = tmp.stat().st_size if tmp.exists() else 0
            headers = auth_headers()
            if resume:
                headers["Range"] = f"bytes={resume}-"
            r = sess.get(u, headers=headers, timeout=(15, 120), stream=True)
            if r.status_code == 401:
                # Stale cached token — purge it and retry once with a fresh one.
                TOKEN_CACHE.unlink(missing_ok=True)
                r = sess.get(u, headers=auth_headers(), timeout=600, stream=True)
                resume = 0
            if r.status_code == 416:
                # Range not satisfiable — the partial file is already complete.
                tmp.rename(dest)
                return dest
            if r.status_code == 429 or r.status_code == 503:
                # Rate-limited / throttled by the host under parallel streams —
                # back off harder and retry rather than dropping the band.
                if attempt >= attempts:
                    raise RuntimeError(f"OData download rate-limited {r.status_code}: {u}")
                wait = min(90, 15 * attempt)
                print(f"  ! download rate-limited ({r.status_code}), "
                      f"retry {attempt}/{attempts} in {wait}s", flush=True)
                time.sleep(wait)
                continue
            if r.status_code not in (200, 206):
                raise RuntimeError(f"OData download failed {r.status_code}: {u}")
            mode = "ab" if resume and r.status_code == 206 else "wb"
            with open(tmp, mode) as fh:
                for chunk in r.iter_content(1 << 20):
                    fh.write(chunk)
            tmp.rename(dest)
            return dest
        except (requests.ConnectionError, ConnectionResetError) as exc:  # noqa: BLE001
            if attempt >= attempts:
                raise
            wait = min(30, 5 * attempt)
            print(f"  ! download interrupted ({type(exc).__name__}), "
                  f"retry {attempt}/{attempts} in {wait}s", flush=True)
            time.sleep(wait)
        except requests.HTTPError as exc:
            # 429 rate-limit / 503 throttle from the CDSE host under parallel
            # streams — back off harder and retry rather than dropping the band.
            if getattr(exc.response, "status_code", None) not in (429, 503):
                raise
            if attempt >= attempts:
                raise
            wait = min(90, 15 * attempt)
            print(f"  ! download rate-limited ({exc.response.status_code}), "
                  f"retry {attempt}/{attempts} in {wait}s", flush=True)
            time.sleep(wait)
    return dest  # unreachable


def download_asset(scene_id: str, band: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    local = local_band(scene_id, band)
    if local.exists() and local.stat().st_size > 0:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(local.read_bytes())
        print(f"  reused local {local.name}")
        return dest
    return gcp_download(scene_id, band, dest)


GCP_BASE = "https://storage.googleapis.com/gcp-public-data-sentinel-2"


def _gcp_tile(scene_id: str) -> tuple[str, str, str]:
    """GCP organises L2A by UTM zone/letter/square, e.g. T43QCD -> (43, Q, CD)."""
    m = re.search(r"_T(\d{2})([A-Z])([A-Z]{2})_", scene_id)
    if not m:
        raise RuntimeError(f"cannot parse tile from scene id: {scene_id}")
    return m.group(1), m.group(2), m.group(3)


def gcp_band_url(scene_id: str, band: str) -> str:
    """Resolve the GCP storage URL for one band. The GRANULE folder name (which
    carries the A-frame number, absent from the scene id) is looked up by listing
    the product's GRANULE/ directory with the JSON API."""
    zone, lat, sq = _gcp_tile(scene_id)
    prod = f"{scene_id}.SAFE"
    prefix = f"L2/tiles/{zone}/{lat}/{sq}/{prod}/GRANULE/"
    u = ("https://storage.googleapis.com/storage/v1/b/gcp-public-data-sentinel-2/o"
         f"?prefix={prefix}&maxResults=5&delimiter=/")
    r = _session().get(u, timeout=30)
    r.raise_for_status()
    prefixes = r.json().get("prefixes") or []
    if not prefixes:
        raise RuntimeError(f"product not found on GCP: {scene_id}")
    granule = prefixes[0].split("/")[-2]
    acq = re.search(r"_(20\d{6}T\d{6})_", scene_id).group(1)
    tile = "".join(_gcp_tile(scene_id))
    res = "R20m" if band == "SCL" else "R10m"
    suffix = "SCL_20m" if band == "SCL" else f"{band}_10m"
    return f"{GCP_BASE}/L2/tiles/{zone}/{lat}/{sq}/{prod}/GRANULE/{granule}/IMG_DATA/{res}/T{tile}_{acq}_{suffix}.jp2"


def gcp_download(scene_id: str, band: str, dest: Path, attempts: int = 3) -> Path:
    """Stream a band from the Google public bucket — no auth, no rate limits,
    much faster than the CDSE host. Falls back to CDSE via download_asset's caller."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    url = gcp_band_url(scene_id, band)
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(1, attempts + 1):
        try:
            resume = tmp.stat().st_size if tmp.exists() else 0
            headers = {"Range": f"bytes={resume}-"} if resume else {}
            r = _session().get(url, headers=headers, timeout=(15, 90), stream=True)
            if r.status_code == 416:
                tmp.rename(dest)
                return dest
            if r.status_code not in (200, 206):
                raise RuntimeError(f"GCP download failed {r.status_code}: {url}")
            mode = "ab" if resume and r.status_code == 206 else "wb"
            with open(tmp, mode) as fh:
                last_advance = time.time()
                for chunk in r.iter_content(1 << 20):
                    fh.write(chunk)
                    if time.time() - last_advance > 45:
                        # Stream stalled — abort so the Range-resume retry restarts it.
                        raise ConnectionResetError("stalled stream")
                    last_advance = time.time()
            tmp.rename(dest)
            return dest
        except (requests.ConnectionError, ConnectionResetError) as exc:  # noqa: BLE001
            if attempt >= attempts:
                raise
            wait = min(30, 5 * attempt)
            print(f"  ! GCP interrupted ({type(exc).__name__}), retry {attempt}/{attempts} in {wait}s", flush=True)
            time.sleep(wait)
    return dest  # unreachable


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
        # A tile counts if it has a real overlap with the AOI bbox, not just the
        # one containing its centre — large districts span several tiles. Grazing
        # slivers (< 2% of the AOI) are dropped; rio_mask would otherwise clip
        # to an empty window and crash rasterio.
        ov = b_utm.intersection(shp_shape(tile_box)).area
        if ov < 0.02 * b_utm.area:
            return None, None
        try:
            red, red_t = rio_mask(src, [mapping(b_utm)], crop=True, nodata=0)
            red = red[0]
            meta = src.meta.copy()
            meta.update({"transform": red_t, "height": red.shape[0], "width": red.shape[1]})
        except Exception:  # noqa: BLE001 — empty window / decode error → not covered
            return None, None
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
    """Per-ward zonal mean of the NDVI mosaic.

    Each ward is rasterized on its own (not into one shared id-raster), because
    taluka/ward polygons nest and overlap — a last-wins id-raster lets big
    envelopes silently overwrite smaller contained wards to 0 cells.
    """
    height, width = ndvi.shape
    transform = meta["transform"]
    crs = meta["crs"]
    # Ward features are stored in lon/lat; reproject into the raster CRS.
    from pyproj import Transformer
    from shapely.geometry import shape as shp_shape
    from shapely.ops import transform as shp_transform

    trans = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    rows = []
    for i, f in enumerate(ward_feats, start=1):
        g = shp_transform(lambda x, y, *z: trans.transform(x, y), shp_shape(f["geometry"]))
        mask = rasterize([(mapping(g), 1)], out_shape=(height, width), transform=transform, fill=0).astype(bool)
        vals = ndvi[mask]
        vals = vals[~np.isnan(vals)]
        props = dict(f["properties"])
        props["ward_id"] = props.get("ward_id") or props.get("id") or str(i)
        props["ndvi_mean"] = round(float(vals.mean()), 4) if vals.size else None
        props["cells"] = int(vals.size)
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
    for root in (RAW, LEGACY_RAW):
        if not root.exists():
            continue
        for path in root.glob("*.jp2"):
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

    from shapely.geometry import shape as _shape, box as _sbox

    centre = _shape(bounds_geom).centroid
    aoi_box = _sbox(west, south, east, north)

    def overlaps_aoi(s: dict) -> bool:
        g = s.get("geometry")
        if not g:
            return False
        try:
            return _shape(g).intersection(aoi_box).area >= 0.02 * aoi_box.area
        except Exception:  # noqa: BLE001 — a malformed footprint is just not overlapping
            return False

    def _cached(s: dict) -> bool:
        return local_band(s["id"], "B04").exists() and local_band(s["id"], "B08").exists()

    # Per-tile scene stack: every tile overlapping the AOI picks up to
    # MAX_SCENES_PER_TILE least-cloudy acquisitions (one per date) across the
    # whole window. A single monsoon date is never clear everywhere, so compositing
    # a few acquisitions fills one date's cloud holes with another's clear pixels.
    by_tile: dict[str, list[dict]] = {}
    for s in scenes:
        if overlaps_aoi(s):
            by_tile.setdefault(s["tile"], []).append(s)
    if not by_tile:
        sys.exit("no scene in the window overlaps the AOI — widen LOOKBACK_DAYS")

    def _scene_key(x: dict) -> tuple:
        return (x["cloud"], -1 if _cached(x) else 0, x["datetime"])

    selected: dict[str, list[dict]] = {}
    for tile, candidates in by_tile.items():
        per_date = {s["datetime"][:10]: s for s in candidates}
        stack = sorted(per_date.values(), key=_scene_key)
        # Always keep the least-cloudy acquisition as the base — a partly cloudy
        # scene beats no scene. Only the fill extras must be clear enough that
        # they actually patch cloud holes.
        primary, extras = stack[0], stack[1:]
        selected[tile] = [primary] + [s for s in extras if s["cloud"] <= MAX_SCENE_CLOUD][:MAX_SCENES_PER_TILE - 1]

    c_lon, c_lat = centre.coords[0]
    zone = int((c_lon + 180) // 6) + 1
    ordered = sorted(selected.keys(), key=lambda t: (0 if f"T{zone:02d}" in t else 1, t))
    print(
        "  covering tiles: "
        + "; ".join(
            f"{t}=" + ",".join(f"{s['datetime'][:10]}@{s['cloud']:.0f}%" for s in selected[t])
            for t in ordered
        )
    )

    RAW.mkdir(parents=True, exist_ok=True)
    REFINED.mkdir(parents=True, exist_ok=True)

    # Download + compute NDVI for every tile that overlaps the AOI on the best
    # date. Bands are cached per scene, so a reused tile costs nothing the
    # second time.
    tile_ndvi = []
    # Collect every band this district needs (all tiles x scene stack) and pull
    # them in parallel — the CDSE host handles concurrent streams fine and this
    # is the long pole of the run.
    dl_tasks: list[tuple[str, str, Path]] = []
    for tile in ordered:
        for s in selected[tile]:
            if not all(k in s["assets"] for k in ("B04", "B08", "SCL")):
                continue
            d = RAW / s["id"]
            for band in ("B04", "B08", "SCL"):
                dest = d / f"{band}.jp2"
                if not (dest.exists() and dest.stat().st_size > 0):
                    dl_tasks.append((s["id"], band, dest))
    if dl_tasks:
        print(f"  downloading {len(dl_tasks)} bands in parallel ({PARALLEL_DOWNLOADS} streams) ...", flush=True)
        with ThreadPoolExecutor(max_workers=PARALLEL_DOWNLOADS) as ex:
            futs = {ex.submit(download_asset, sid, band, dest): (sid, band) for sid, band, dest in dl_tasks}
            for fut in as_completed(futs):
                sid, band = futs[fut]
                try:
                    fut.result()
                except Exception as exc:  # noqa: BLE001 — one bad band shouldn't kill the district
                    print(f"  ! download failed {sid} {band}: {exc}", flush=True)
    else:
        print("  all bands cached, no downloads needed")

    for tile in ordered:
        stack = [s for s in selected[tile] if all(k in s["assets"] for k in ("B04", "B08", "SCL"))]
        if not stack:
            print(f"  ! tile {tile} missing bands, skipping")
            continue
        # Best (least cloudy) scene first; only composite the extra acquisitions
        # if it still leaves cloud holes over the AOI.
        s0 = stack[0]
        d = RAW / s0["id"]
        print(f"  computing NDVI for {tile} {s0['datetime'][:10]} ...")
        ndvi, meta = compute_ndvi(d / "B04.jp2", d / "B08.jp2", d / "SCL.jp2", bounds_geom)
        if ndvi is None:
            print(f"  ! tile {tile} has no real overlap with the AOI, skipping")
            continue
        merged = ndvi
        cover = 100.0 * (1 - np.isnan(merged).mean())
        for s in stack[1:]:
            if cover >= MIN_TILE_VALID:
                break
            d = RAW / s["id"]
            print(f"  computing NDVI for {tile} {s['datetime'][:10]} (fill) ...")
            extra, meta2 = compute_ndvi(d / "B04.jp2", d / "B08.jp2", d / "SCL.jp2", bounds_geom)
            if extra is None or extra.shape != merged.shape:
                continue
            fill = np.isnan(merged) & ~np.isnan(extra)
            merged[fill] = extra[fill]
            cover = 100.0 * (1 - np.isnan(merged).mean())
        tile_ndvi.append((merged, meta, s0))
        print(f"  ✓ tile {tile} contributes ({merged.shape}, {cover:.0f}% covered)")

    if not tile_ndvi:
        sys.exit("no tile overlaps the AOI — try another date or run per-district")

    # Mosaic: project every tile piece onto one grid spanning the union of all
    # contributing tiles. Adjacent Sentinel-2 tiles do not overlap, so the
    # reference grid must cover them all — not just the first tile.
    ref_meta = tile_ndvi[0][1]
    ref_crs = ref_meta["crs"]
    from pyproj import Transformer as _PT

    minx = miny = 1e18
    maxx = maxy = -1e18
    for _nd, m, _s in tile_ndvi:
        tr = _PT.from_crs(m["crs"], ref_crs, always_xy=True)
        x0, y0 = m["transform"] * (0, 0)  # top-left
        x1, y1 = m["transform"] * (m["width"], m["height"])  # bottom-right
        for px, py in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
            x, y = tr.transform(px, py)
            minx, miny = min(minx, x), min(miny, y)
            maxx, maxy = max(maxx, x), max(maxy, y)
    res = ref_meta["transform"].a
    out_w = max(1, int(round((maxx - minx) / res)))
    out_h = max(1, int(round((maxy - miny) / res)))
    # Huge districts (kutch spans ~3° of longitude) produce a multi-GB union grid
    # that OOMs the machine. Cap the pixel budget and coarsen the resolution so
    # the mosaic still covers the whole AOI — wards are large enough that zonal
    # stats stay meaningful at 20-30m.
    while out_w * out_h > MAX_MOSAIC_PIXELS:
        res *= 1.25
        out_w = max(1, int(round((maxx - minx) / res)))
        out_h = max(1, int(round((maxy - miny) / res)))
    out_t = from_bounds(minx, miny, maxx, maxy, out_w, out_h)
    print(f"  mosaic grid: {out_w} x {out_h} over {len(tile_ndvi)} tile(s) (res {res:.0f}m)")

    mosaic = np.full((out_h, out_w), np.nan, dtype=np.float32)
    for ndvi, meta, s in tile_ndvi:
        # Fast path only when the tile already sits exactly on the union grid
        # (same CRS, transform AND shape) — otherwise the boolean mask would
        # not line up with the mosaic and the copy below would crash.
        if (
            meta["crs"] == ref_crs
            and meta["transform"] == out_t
            and meta["height"] == out_h
            and meta["width"] == out_w
        ):
            good = ~np.isnan(ndvi)
            mosaic[good] = ndvi[good]
            continue
        dst = np.empty((out_h, out_w), dtype=np.float32)
        reproject(
            np.where(np.isnan(ndvi), 0, ndvi),
            dst,
            src_transform=meta["transform"],
            src_crs=meta["crs"],
            dst_transform=out_t,
            dst_crs=ref_crs,
            src_nodata=0,
            dst_nodata=np.nan,
            resampling=Resampling.bilinear,
        )
        good = ~np.isnan(dst)
        mosaic[good] = dst[good]
    ndvi = mosaic
    meta = ref_meta.copy()
    meta.update(
        {
            "transform": out_t,
            "height": out_h,
            "width": out_w,
            "bounds": (minx, miny, maxx, maxy),
        }
    )

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
        anchor = tile_ndvi[0][2]
        veg_doc = {
            "type": "FeatureCollection",
            "features": veg_feats,
            "meta": {
                "source": "Copernicus Sentinel-2 L2A",
                "product": "NDVI (B8-B4)/(B8+B4), 10 m",
                "scene": anchor["id"],
                "acquisition": anchor["datetime"][:10],
                "cloud_cover": anchor["cloud"],
                "tiles": sorted({s["tile"] for _, _, s in tile_ndvi}),
            },
        }
        out_engine = ENGINE / f"{city}_vegetation.json"
        out_engine.write_text(json.dumps(veg_doc), encoding="utf-8")
        print(f"  wrote {out_engine} ({len(veg_feats)} features)")


if __name__ == "__main__":
    main(sys.argv[1:])