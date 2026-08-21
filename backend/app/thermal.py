"""Land-surface temperature (LST) layer, refreshed automatically.

NASA's GIBS WMTS tile cache is missing z6+ tiles over parts of India, but the
GIBS WMS service returns real data there in EPSG:3857. So instead of depending
on tiles we can't rely on, we fetch ONE georeferenced raster over the whole
state of Gujarat (covers every district and composite), validate it, and
publish it atomically as `latest.png` + `meta.json`. The frontend draws it as a
MapLibre `image` source. Nothing is published unless every check passes — a
failed refresh keeps the last good files.

District views are cut locally from that one master scene: `city_scene()`
crops the georeferenced raster to the selected district's ward extent and
re-stretches contrast within the crop, so each district reads on its own
colour scale instead of the state-pooled one. Crops are disk-cached per
district + date; no additional NASA downloads ever happen.
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
import time
import urllib.request
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

import numpy as np

from app.core.config import get_city

log = logging.getLogger("uvicorn.error")

GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi"
GIBS_DOMAINS = (
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/"
    "MODIS_Terra_Land_Surface_Temp_Day/default/GoogleMapsCompatible_Level7/all/all.xml"
)
LAYER = "MODIS_Terra_Land_Surface_Temp_Day"
UA = "Mozilla/5.0 UrbanLens"

# Where the committed thermal files live, next to the FastAPI app.
THERMAL_DIR = Path(__file__).resolve().parent / "static" / "thermal"
PNG_PATH = THERMAL_DIR / "latest.png"
META_PATH = THERMAL_DIR / "meta.json"
LOCK_PATH = THERMAL_DIR / ".lock"
LOG_PATH = THERMAL_DIR / "update.log"
# Raw georeferenced master scene, kept alongside the rendered PNG so district
# crops can re-stretch contrast on their own pixels instead of inheriting the
# state-pooled stretch (which saturates hot districts into flat red).
TIFF_PATH = THERMAL_DIR / "latest.tiff"

# District crops are padded slightly beyond the ward envelope so edge wards are
# not clipped mid-polygon.
CITY_PAD_DEG = 0.02
# A crop must contain at least this much opaque coverage to be worth showing.
# MODIS LST Day is optical, so monsoon cloud punches uneven holes: a June pass
# can leave Kutch 87% clear and Surat 1%. Below this bar a "district view" is
# visually empty and reads as a broken feature, so it is refused — first in
# favour of a previous day's clearer pass, then the statewide scene.
MIN_CITY_ALPHA_FRAC = 0.15
# Coverage a pass needs before the district view looks solid rather than
# moth-eaten. Today's crop is served as-is above this; below it the scene
# walks back through previous days looking for a cleaner one.
GOOD_COVERAGE_FRAC = 0.75
# How many previous daily passes the last-clear-pass fallback may probe (small
# per-district fetches, ~100 KB each) before settling for the best day seen.
CLEAR_PASS_LOOKBACK_DAYS = 30
# Pixel size of a per-district probe window. ~512 px over one district keeps
# each probe well under a quarter megabyte while comfortably exceeding the
# district's ward-envelope pixel count at native ~1 km resolution.
CLEAR_PASS_SIZE = 512

# One statewide raster covers every district and composite — there is no
# per-city thermal file (PRD §38). The bbox comes from the same generated
# config the engine uses, so the map and this fetch can never disagree.
def _statewide_bbox() -> tuple[float, float, float, float]:
    city = get_city("gujarat")
    return tuple(city.bbox)  # (west, south, east, north)

SIZE = 4096
STALE_LOCK_MIN = 3  # steal a lock this old (crashed process)


def _lonlat_to_3857(lon: float, lat: float) -> tuple[float, float]:
    x = lon * 20037508.342789244 / 180
    y = math.log(math.tan((90 + lat) * math.pi / 360)) / (math.pi / 180)
    y = y * 20037508.342789244 / 180
    return x, y


def bounds_3857() -> tuple[float, float, float, float]:
    w, s, e, n = _statewide_bbox()
    x0, y0 = _lonlat_to_3857(w, s)
    x1, y1 = _lonlat_to_3857(e, n)
    return x0, y0, x1, y1


def _3857_to_lonlat(x: float, y: float) -> tuple[float, float]:
    lon = x * 180.0 / 20037508.342789244
    lat = math.degrees(2.0 * math.atan(math.exp(y * math.pi / 20037508.342789244)) - math.pi / 2.0)
    return lon, lat


def _log(msg: str) -> None:
    line = f"{datetime.now(timezone.utc).isoformat()} {msg}"
    try:
        THERMAL_DIR.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass
    log.info(line)


def read_meta() -> dict | None:
    """The committed metadata, or None before the first successful publish."""
    try:
        with META_PATH.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def latest_available_date() -> str:
    """Freshest date GIBS has for the LST layer (from DescribeDomains)."""
    req = urllib.request.Request(GIBS_DOMAINS, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        xml = resp.read().decode("utf-8", "replace")
    m = re.search(r"<Domain>([^<]+)</Domain>", xml)
    if not m:
        raise RuntimeError("DescribeDomains returned no time domain")
    ranges = m.group(1).split(",")
    return ranges[-1].split("/")[1]


def _date_range() -> list[str]:
    """Every date GIBS advertises for the LST layer, newest first."""
    req = urllib.request.Request(GIBS_DOMAINS, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        xml = resp.read().decode("utf-8", "replace")
    m = re.search(r"<Domain>([^<]+)</Domain>", xml)
    if not m:
        raise RuntimeError("DescribeDomains returned no time domain")
    out: list[str] = []
    for rng in m.group(1).split(","):
        start, end, step = rng.split("/")
        from datetime import date as _date, timedelta

        d = _date.fromisoformat(start)
        last = _date.fromisoformat(end)
        step_days = int(step.lstrip("P").rstrip("D") or 1)
        while d <= last:
            out.append(d.isoformat())
            d += timedelta(days=step_days)
    out.sort(reverse=True)
    return out


def _find_valid_date(meta: dict | None, max_lag_days: int = 200) -> str | None:
    """Most recent GIBS date with usable data, skipping the empty recent ones.

    GIBS advertises dates whose rasters are still empty over parts of India, so
    the freshest advertised date is not always usable. A coarse→fine walk keeps
    the first-run cost small: probe every 14 days newest→oldest until a usable
    bucket is found, then fine-scan those 14 days. ``meta`` guards the loop — we
    never look older than the date already published, so a failed scan returns
    the published date unchanged (stale-but-good).
    """
    floor = meta.get("date") if meta else None
    dates = _date_range()[:max_lag_days]
    if not dates:
        return floor

    # Coarse pass: newest usable 14-day bucket.
    bucket: list[str] = []
    for i in range(0, len(dates), 14):
        window = dates[i : i + 14]
        if floor and window[-1] <= floor:
            break  # everything older than what we already have
        if _probe(window[0]):
            bucket = window
            break
    if not bucket:
        return floor

    # Fine pass: newest usable date inside that bucket.
    for date in bucket:
        if floor and date <= floor:
            break
        if _probe(date):
            return date
    return floor


def _wms(
    date: str,
    size: int,
    fmt: str,
    bbox_3857: tuple[float, float, float, float] | None = None,
) -> bytes:
    """GetMap over a 3857 bbox (statewide by default). ``fmt`` is e.g.
    'image/png' or 'image/tiff'."""
    x0, y0, x1, y1 = bbox_3857 if bbox_3857 is not None else bounds_3857()
    url = (
        f"{GIBS_WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS={LAYER}"
        f"&STYLES=&FORMAT={fmt}&TRANSPARENT=TRUE&TIME={date}"
        f"&SRS=EPSG:3857&WIDTH={size}&HEIGHT={size}"
        f"&BBOX={x0},{y0},{x1},{y1}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def _fetch_tiff(date: str) -> bytes:
    """Download a georeferenced 3857 TIFF of the LST layer over the state."""
    return _wms(date, SIZE, "image/tiff")


def _probe(date: str, size: int = 256) -> bool:
    """Cheap check that a date actually has data over the state (fast PNG).

    GIBS advertises dates whose rasters are still empty over parts of India;
    a 256px probe returns in a second or two and avoids pulling a 16 MB TIFF
    for every candidate date while hunting for the newest usable one.
    """
    try:
        png = _wms(date, size, "image/png")
    except Exception:  # noqa: BLE001 — an unreachable date is just not usable
        return False
    import io

    import numpy as np
    import rasterio

    try:
        with rasterio.io.MemoryFile(png) as mf:
            with mf.open() as ds:
                arr = ds.read()
        if arr.ndim != 3 or arr.shape[0] < 3:
            return False
        if arr.shape[0] >= 4 and float((arr[3] > 0).mean()) < 0.5:
            return False
        return float(arr[:3].astype(np.int16).std()) >= 2.0
    except Exception:  # noqa: BLE001
        return False


def _validate(tiff: bytes) -> str:
    """Return 'ok' or a reason the raster is unusable."""
    import io

    import numpy as np
    import rasterio

    try:
        with rasterio.io.MemoryFile(tiff) as mf:
            with mf.open() as ds:
                if ds.width != SIZE or ds.height != SIZE:
                    return f"unexpected size {ds.width}x{ds.height}"
                if ds.crs is None or (ds.crs.to_epsg() not in (3857, None)):
                    return f"unexpected crs {ds.crs}"
                arr = ds.read()
    except Exception as exc:  # noqa: BLE001 — any decode failure is a failure
        return f"decode failed: {exc}"
    if arr.ndim != 3 or arr.shape[0] < 3:
        return f"not an RGBA/RGB raster ({arr.shape})"
    # Transparent pixels are holes; count a raster only if it mostly has data.
    if arr.shape[0] >= 4:
        alpha = arr[3]
        opaque = float((alpha > 0).mean())
        if opaque < 0.5:
            return f"mostly transparent ({opaque:.0%} opaque)"
    # A real render has colour variance; a blank/white tile does not.
    rgb = arr[:3].astype(np.int16)
    spread = float(rgb.std())
    if spread < 2.0:
        return f"blank/constant raster (std {spread:.1f})"
    return "ok"


def _stretch_rgb(arr: np.ndarray, lo: float = 2, hi: float = 98) -> np.ndarray:
    """Per-channel percentile contrast stretch (alpha untouched).

    GIBS renders LST with a fixed colormap, so a uniformly hot region saturates
    into a single flat colour (e.g. pure red: R=255, B=0, only G varies). A
    pooled RGB stretch is a no-op then because one channel is pinned at 0 and
    another at 255, so the whole [0, 255] range already appears covered.
    Stretching each channel independently exposes whatever gradient survives.
    Colors are relative thermal intensity, not absolute °C.
    """
    out = arr.copy()
    rgb = out[:3].astype(np.float32)
    if out.shape[0] >= 4:
        mask = out[3] > 0
    else:
        mask = np.ones(rgb[0].shape, dtype=bool)
    for ch in range(3):
        band = rgb[ch][mask]
        lo_v, hi_v = np.percentile(band, [lo, hi])
        if not np.isfinite(lo_v) or not np.isfinite(hi_v) or hi_v <= lo_v:
            continue
        scale = 255.0 / (hi_v - lo_v)
        rgb[ch] = np.where(mask, (rgb[ch] - lo_v) * scale, rgb[ch])
    out[:3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return out


def _convert_to_png(tiff: bytes, dest: Path) -> None:
    import rasterio

    with rasterio.io.MemoryFile(tiff) as mf:
        with mf.open() as ds:
            profile = ds.profile.copy()
            profile.update(driver="PNG", count=ds.count, compress=None)
            arr = _stretch_rgb(ds.read())
            with rasterio.io.MemoryFile() as out:
                with out.open(**profile) as dst:
                    dst.write(arr)
                with dest.open("wb") as fh:
                    fh.write(out.read())


# ---------------------------------------------------------------------------
# District scenes — local crops of the master raster, no extra downloads
# ---------------------------------------------------------------------------


def _ward_geometry(city_id: str):
    """Unary union of the district's ward/taluka polygons in lon/lat, or None.

    This is the true administrative shape of the study area — used both for
    the padded crop envelope and, via rasterization, to alpha-mask crops so
    the overlay only ever appears inside the district's boundaries.
    """
    from shapely.geometry import shape
    from shapely.ops import unary_union

    from app.data.loader import get_dataset

    try:
        ds = get_dataset(city_id)
    except Exception:  # noqa: BLE001 — no wards means the caller falls back
        return None
    polys = []
    for f in getattr(ds, "wards", None) or []:
        geom = f.get("geometry") if isinstance(f, dict) else None
        if not geom:
            continue
        try:
            polys.append(shape(geom))
        except Exception:  # noqa: BLE001 — one bad polygon must not sink the union
            continue
    if not polys:
        return None
    return unary_union(polys)


def _ward_bbox(city_id: str) -> tuple[float, float, float, float] | None:
    """Lon/lat envelope of the district's ward polygons (the study area shown
    on the map), padded slightly. Falls back to the config bbox upstream."""
    geom = _ward_geometry(city_id)
    if geom is None:
        return None
    w, s, e, n = geom.bounds
    return (
        w - CITY_PAD_DEG,
        s - CITY_PAD_DEG,
        e + CITY_PAD_DEG,
        n + CITY_PAD_DEG,
    )


def _mask_to_district(
    arr: np.ndarray,
    bounds: tuple[float, float, float, float],
    geom,
):
    """Zero the alpha channel outside the district's polygons.

    The map renders these PNGs as plain image overlays; anything transparent
    shows the basemap instead. Rasterizing the ward union onto the crop's own
    affine keeps the mask pixel-registered with the data — the layer is then
    physically confined to the district's shape, at ~150 m/px edge fidelity.
    Applied before the contrast stretch so per-district statistics describe
    district pixels only.
    """
    if geom is None or arr.ndim != 3 or arr.shape[0] < 4:
        return arr
    try:
        import rasterio
        from rasterio.features import rasterize
        from rasterio.transform import from_bounds as tf_from_bounds

        w, s, e, n = bounds
        tr = tf_from_bounds(w, s, e, n, width=arr.shape[2], height=arr.shape[1])
        mask = rasterize(
            [(geom, 1)],
            out_shape=(arr.shape[1], arr.shape[2]),
            transform=tr,
            fill=0,
            default_value=1,
            dtype="uint8",
            all_touched=True,
        )
        arr = arr.copy()
        arr[3] = (arr[3].astype(np.uint8) * mask).astype(np.uint8)
    except Exception:  # noqa: BLE001 — an unmaskable crop still serves, square but honest
        pass
    return arr


def _crop_master(bbox: tuple[float, float, float, float]):
    """Cut a lon/lat window out of the master scene.

    Prefers the georeferenced TIFF (windowed read, pixel-exact); falls back to
    slicing the rendered PNG by its known statewide geometry. Returns
    ``(arr, bounds)`` where arr is a (bands, h, w) uint8 array and bounds is
    the exact lon/lat extent of what was cut — snapped to real pixel edges so
    the overlay can never drift relative to the data.
    """
    w, s, e, n = bbox
    x0, y0 = _lonlat_to_3857(w, s)
    x1, y1 = _lonlat_to_3857(e, n)

    arr = None
    tb = None
    if TIFF_PATH.exists():
        try:
            import rasterio
            from rasterio.windows import Window, from_bounds as win_from_bounds

            with rasterio.open(TIFF_PATH) as ds:
                win = win_from_bounds(x0, y0, x1, y1, ds.transform)
                # Snap to whole pixels: the reported bounds then describe the
                # pixels actually read, not an idealised fraction of them.
                win = Window(
                    round(win.col_off), round(win.row_off),
                    max(8, round(win.width)), max(8, round(win.height)),
                )
                arr = ds.read(window=win)
                # Corner-map through the window's own affine — deliberately
                # not array_bounds(), whose (height, width) argument order is
                # an easy silent swap that skews the overlay half a district.
                tw = ds.window_transform(win)
                west, north = tw * (0.0, 0.0)
                east, south = tw * (float(win.width), float(win.height))
                tb = (west, south, east, north)
        except Exception:  # noqa: BLE001 — fall through to the PNG path
            arr = None

    if arr is None:
        if not PNG_PATH.exists():
            return None, None
        try:
            import rasterio

            with rasterio.open(PNG_PATH) as ds:
                full = ds.read()
        except Exception:  # noqa: BLE001
            return None, None
        sx0, sy0, sx1, sy1 = bounds_3857()
        px = (sx1 - sx0) / full.shape[2]
        py = (sy1 - sy0) / full.shape[1]
        c0 = max(0, int(math.floor((x0 - sx0) / px)))
        c1 = min(full.shape[2], int(math.ceil((x1 - sx0) / px)))
        r0 = max(0, int(math.floor((sy1 - y1) / py)))
        r1 = min(full.shape[1], int(math.ceil((sy1 - y0) / py)))
        if c1 - c0 < 8 or r1 - r0 < 8:
            return None, None
        arr = full[:, r0:r1, c0:c1]
        tb = (
            sx0 + c0 * px,
            sy1 - r1 * py,
            sx0 + c1 * px,
            sy1 - r0 * py,
        )

    lw, ls = _3857_to_lonlat(tb[0], tb[1])
    le, ln = _3857_to_lonlat(tb[2], tb[3])
    return arr, (lw, ls, le, ln)


def _write_png(arr: np.ndarray, dest: Path) -> None:
    import rasterio

    with rasterio.io.MemoryFile() as out:
        with out.open(
            driver="PNG", width=arr.shape[2], height=arr.shape[1],
            count=arr.shape[0], dtype="uint8",
        ) as dst:
            dst.write(arr)
        tmp = dest.with_suffix(".tmp")
        with tmp.open("wb") as fh:
            fh.write(out.read())
    os.replace(tmp, dest)


def _fetch_district_window(
    probe_date: str, bbox: tuple[float, float, float, float]
):
    """Small georeferenced GIBS fetch over one district for one date.

    Used by the last-clear-pass fallback: instead of pulling the 64 MB
    statewide master for an older date, request just this district's padded
    bbox at ~512 px (a couple hundred KB). The response TIFF carries its own
    georeferencing, which is trusted directly — no snapping math to get wrong.
    Returns ``(arr, lonlat_bounds)`` or ``(None, None)``.
    """
    w, s, e, n = bbox
    x0, y0 = _lonlat_to_3857(w, s)
    x1, y1 = _lonlat_to_3857(e, n)
    try:
        import rasterio

        raw = _wms(probe_date, CLEAR_PASS_SIZE, "image/tiff", bbox_3857=(x0, y0, x1, y1))
        with rasterio.io.MemoryFile(raw) as mem:
            with mem.open() as ds:
                if ds.count < 4 or ds.width < 8 or ds.height < 8:
                    return None, None
                arr = ds.read()
                b = ds.bounds
                tb = (b.left, b.bottom, b.right, b.top)
    except Exception:  # noqa: BLE001 — a failed probe just means "not this day"
        return None, None
    lw, ls = _3857_to_lonlat(tb[0], tb[1])
    le, ln = _3857_to_lonlat(tb[2], tb[3])
    return arr, (lw, ls, le, ln)


def _clear_pass_scene(
    city_id: str,
    bbox: tuple[float, float, float, float],
    meta: dict,
    geom,
) -> dict | None:
    """Best-recent-pass fallback: walk back day by day for a cleaner view of
    this district than today's pass provides.

    Cloud is per-day and per-district; a monsoon hole over one district does
    not mean it has no heat data at all. Each probe is a tiny district-sized
    fetch (~200 KB), cached under the same ``city_<id>_<date>`` names as
    ordinary crops. The first probed day at GOOD_COVERAGE_FRAC wins outright;
    otherwise the clearest day seen is kept. Every payload keeps ``date`` at
    the pass actually shown and says so in ``note``/``master_date`` — old data
    never poses as today's. Returns None when nothing clears the floor.
    """
    master_date = meta["date"]
    try:
        from datetime import date as _date, timedelta

        d0 = _date.fromisoformat(master_date)
    except ValueError:
        return None

    best = None  # (coverage, payload)
    for offset in range(1, CLEAR_PASS_LOOKBACK_DAYS + 1):
        probe_date = (d0 - timedelta(days=offset)).isoformat()
        png = THERMAL_DIR / f"city_{city_id}_{probe_date}.png"
        sidecar = THERMAL_DIR / f"city_{city_id}_{probe_date}.json"

        payload: dict | None = None
        if png.exists() and sidecar.exists():
            try:
                with sidecar.open("r", encoding="utf-8") as fh:
                    cached = json.load(fh)
                # Self-heal: pre-masking crops regenerate so boundaries appear.
                if cached.get("masked") and cached.get("ok"):
                    payload = cached
            except (OSError, ValueError):
                payload = None

        if payload is None:
            arr, bounds = _fetch_district_window(probe_date, bbox)
            if arr is None or bounds is None:
                continue
            if arr.ndim != 3 or arr.shape[0] < 4:
                continue
            # Some days GIBS answers with an image whose georeferencing does
            # not match the requested window; such a crop describes the wrong
            # area entirely and must not be served as this district.
            rw, rs, re_, rn = bounds
            ew, es, ee, en = bbox
            if any(abs(a - b) > 0.25 for a, b in ((rw, ew), (rs, es), (re_, ee), (rn, en))):
                continue
            coverage = float((arr[3] > 0).mean())
            if coverage < MIN_CITY_ALPHA_FRAC:
                continue
            if float(arr[:3].astype(np.int16).std()) < 1.0:
                continue
            arr = _mask_to_district(arr, bounds, geom)
            if not bool((arr[3] > 0).any()):
                continue  # mask emptied the frame — bounds/geometry disagree
            _write_png(_stretch_rgb(arr), png)
            payload = {
                "ok": True,
                "date": probe_date,
                "updated_at": meta.get("updated_at"),
                "master_date": master_date,
                "bounds": [round(v, 6) for v in bounds],
                "city": city_id,
                "scope": "district",
                "coverage": round(coverage, 4),
                "masked": True,
                "resolution_note": "MODIS Terra LST (day), ~1 km native resolution; colours are relative thermal intensity",
                "note": (
                    f"today's pass ({master_date}) is clouded here — showing this "
                    f"district's most recent clear pass"
                ),
            }
            tmp = sidecar.with_suffix(".tmp")
            try:
                with tmp.open("w", encoding="utf-8") as fh:
                    json.dump(payload, fh)
                os.replace(tmp, sidecar)
            except OSError:
                pass

        cov = float(payload["coverage"])
        if best is None or cov > best[0]:
            best = (cov, payload)
        if cov >= GOOD_COVERAGE_FRAC:
            return payload
    return best[1] if best and best[0] >= MIN_CITY_ALPHA_FRAC else None


def city_scene(city_id: str) -> dict | None:
    """District-scoped LST status: crop of the master scene over this
    district's ward extent, contrast-stretched on its own pixels.

    Every payload carries ``coverage`` — the fraction of the district the
    raster actually has data for — because MODIS LST Day is optical and monsoon
    cloud punches uneven holes. Crops are alpha-masked to the district's ward
    boundaries so the overlay can never render outside them. Quality ladder:
    today's pass at GOOD_COVERAGE_FRAC or better serves directly; a weaker one
    triggers small dated probes over the last CLEAR_PASS_LOOKBACK_DAYS days,
    keeping the clearest reading found; only when nothing clears the floor does
    the view degrade to the statewide scene with an honest note. Returns
    ``None`` only when no district view can be framed at all.
    """
    meta = read_meta()
    if not meta or not meta.get("ok") or not meta.get("date"):
        return None
    # Unknown ids must fall back to the statewide scene, not silently inherit
    # whatever district the config resolver defaults to.
    from app.core.config import CITIES

    if city_id not in CITIES:
        return None
    if city_id == "gujarat":
        return {**meta, "city": city_id, "scope": "state"}

    date = meta["date"]

    def state_fallback(reason: str) -> dict:
        # A district view we cannot produce honestly degrades to the statewide
        # scene — but says so, instead of silently pretending nothing happened.
        return {
            **meta,
            "city": city_id,
            "scope": "state",
            "note": f"{city_id}: {reason} — showing the statewide scene",
        }

    geom = _ward_geometry(city_id)

    from app.core.cache import singleflight

    with singleflight(("thermal-city", city_id, date)):
        png = THERMAL_DIR / f"city_{city_id}_{date}.png"
        sidecar = THERMAL_DIR / f"city_{city_id}_{date}.json"

        if png.exists() and sidecar.exists():
            try:
                with sidecar.open("r", encoding="utf-8") as fh:
                    cached = json.load(fh)
                # Self-heal: pre-masking square crops regenerate on demand so
                # every district eventually gains its true boundary shape.
                if cached.get("masked") and cached.get("ok"):
                    return cached
            except (OSError, ValueError):
                pass  # regenerate below

        bbox = _ward_bbox(city_id)
        if bbox is None:
            try:
                bbox = tuple(get_city(city_id).bbox)
            except Exception:  # noqa: BLE001
                return state_fallback("district geometry unavailable")
            if not bbox:
                return state_fallback("district geometry unavailable")

        arr, bounds = _crop_master(bbox)
        if arr is None or bounds is None:
            return state_fallback("district lies outside the master scene")
        if arr.ndim != 3 or arr.shape[0] < 3:
            return state_fallback("master scene unreadable")

        coverage = float((arr[3] > 0).mean()) if arr.shape[0] >= 4 else None
        solid_today = coverage is not None and coverage >= GOOD_COVERAGE_FRAC
        weak_today = coverage is not None and coverage < MIN_CITY_ALPHA_FRAC

        alt = None
        if coverage is not None and not solid_today:
            alt = _clear_pass_scene(city_id, bbox, meta, geom)
            if weak_today and alt is None:
                lookback = CLEAR_PASS_LOOKBACK_DAYS
                return state_fallback(
                    f"only {coverage:.0%} clear on {date} and none of the last "
                    f"{lookback} days had a usable reading either (cloud)"
                )
            if alt is not None and coverage is not None:
                alt_cov = float(alt.get("coverage") or 0.0)
                if alt_cov > coverage:
                    # The clearest recent day beats today's patchy pass — serve
                    # it, honestly dated, and keep its cache for tomorrow.
                    return alt

        if float(arr[:3].astype(np.int16).std()) < 1.0:
            return state_fallback("scene has no usable temperature variation")

        arr = _mask_to_district(arr, bounds, geom)
        if not bool((arr[3] > 0).any()):
            arr = _crop_master(bbox)[0]  # mask/geometry disagreed; serve unmasked
        arr = _stretch_rgb(arr)
        _write_png(arr, png)

        payload = {
            "ok": True,
            "date": date,
            "updated_at": meta.get("updated_at"),
            "master_date": date,
            "bounds": [round(v, 6) for v in bounds],
            "city": city_id,
            "scope": "district",
            "coverage": round(coverage, 4) if coverage is not None else None,
            "masked": True,
            "resolution_note": "MODIS Terra LST (day), ~1 km native resolution; colours are relative thermal intensity",
        }
        if not solid_today:
            payload["note"] = (
                f"today's pass ({date}) is patchy here "
                f"({coverage:.0%} clear) — the clearest of the last "
                f"{CLEAR_PASS_LOOKBACK_DAYS} days shown"
            )

        tmp = sidecar.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh)
        os.replace(tmp, sidecar)

        # Prune crops from earlier scenes so the directory cannot grow one file
        # per district per day forever — but only after a solid today crop:
        # while a district rides its historical passes, those dated caches are
        # exactly what tomorrow's ladder will reuse.
        if solid_today:
            for old in THERMAL_DIR.glob(f"city_{city_id}_*"):
                if old.name not in (png.name, sidecar.name):
                    try:
                        old.unlink()
                    except OSError:
                        pass

        return payload


def city_raster_path(city_id: str) -> Path | None:
    """The district's cached crop PNG, generating it first if needed."""
    scene = city_scene(city_id)
    if not scene or scene.get("scope") != "district":
        return None
    png = THERMAL_DIR / f"city_{city_id}_{scene['date']}.png"
    return png if png.exists() else None


_HEAT_TARGET_SAMPLES = 6000


@lru_cache(maxsize=64)
def _heat_geojson_cached(
    city_id: str, date: str, bounds: tuple[float, float, float, float]
) -> dict:
    """Memoized build of the district's heat surface GeoJSON.

    Points are sampled straight from the cached crop PNG — the stretch is a
    monotone per-channel rescale, so brightness rank of the rendered pixels is
    the honest ordering of the underlying readings. The district's ward-union
    polygon rides along as a Polygon feature so the client can outline it.
    """
    png = THERMAL_DIR / f"city_{city_id}_{date}.png"
    if not png.exists():
        raise FileNotFoundError(png)

    from PIL import Image

    img = np.asarray(Image.open(png).convert("RGBA"), dtype=np.uint8)
    h, w = img.shape[:2]
    opaque = img[..., 3] > 0
    if not opaque.any():
        raise ValueError("crop has no opaque pixels")

    lum = (
        img[..., 0].astype(np.float32) * 0.299
        + img[..., 1].astype(np.float32) * 0.587
        + img[..., 2].astype(np.float32) * 0.114
    )
    vals = lum[opaque]
    order = np.argsort(vals, kind="stable")
    ranks = np.empty(vals.shape[0], dtype=np.float32)
    ranks[order] = np.linspace(0.0, 1.0, vals.shape[0], dtype=np.float32)

    # Uniform stride over the row-major opaque pixel list keeps sampling
    # spatially even while capping payload size (~_HEAT_TARGET_SAMPLES points).
    step = max(2, int(round(vals.shape[0] / _HEAT_TARGET_SAMPLES)))

    import rasterio
    from rasterio.transform import xy as tf_xy

    w_, s_, e_, n_ = bounds
    tr = rasterio.transform.from_bounds(w_, s_, e_, n_, width=w, height=h)

    features: list[dict] = []
    ys, xs = np.nonzero(opaque)
    for k in range(0, ys.shape[0], step):
        yy = int(ys[k])
        xx = int(xs[k])
        lon, lat = tf_xy(tr, xx + 0.5, yy + 0.5)
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [round(float(lon), 6), round(float(lat), 6)],
                },
                "properties": {"v": round(float(ranks[k]), 3)},
            }
        )

    geom = _ward_geometry(city_id)
    if geom is not None and not geom.is_empty:
        try:
            from shapely.geometry import mapping

            features.append(
                {
                    "type": "Feature",
                    "geometry": mapping(geom.simplify(0.0015)),
                    "properties": {"boundary": True},
                }
            )
        except Exception:  # noqa: BLE001 — outline is cosmetic, never fatal
            pass

    return {"type": "FeatureCollection", "features": features}


def heat_featurecollection(
    city_id: str, date: str, bounds: tuple[float, float, float, float]
) -> dict:
    """Public wrapper — see ``_heat_geojson_cached``."""
    return _heat_geojson_cached(city_id, date, tuple(bounds))


def _acquire_lock() -> bool:
    """Try to take the refresh lock; steal if it is stale. One writer at a time."""
    THERMAL_DIR.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(LOCK_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)
        return True
    except FileExistsError:
        try:
            age = time.time() - LOCK_PATH.stat().st_mtime
        except OSError:
            age = 0
        if age > STALE_LOCK_MIN * 60:
            try:
                LOCK_PATH.unlink()
                return _acquire_lock()
            except OSError:
                return False
        return False
    except OSError:
        return False


def _release_lock() -> None:
    try:
        LOCK_PATH.unlink()
    except OSError:
        pass


def refresh(force: bool = False) -> dict:
    """Fetch, validate and atomically publish the latest LST raster.

    Idempotent: if the committed date already matches GIBS's freshest date and
    ``force`` is false, nothing is downloaded and this returns the current
    status. Safe to call from the in-process loop, a Task Scheduler job, or
    both — the lock makes concurrent calls harmless.
    """
    THERMAL_DIR.mkdir(parents=True, exist_ok=True)
    meta = read_meta()

    if not force:
        try:
            latest = latest_available_date()
        except Exception as exc:  # noqa: BLE001 — network/DNS failures are routine
            _log(f"thermal: could not check latest date: {exc}")
            if meta:
                return {**meta, "ok": False, "reason": f"could not check GIBS: {exc}"}
            return {"ok": False, "reason": f"could not check GIBS: {exc}", "bounds": list(_statewide_bbox())}
        if meta and meta.get("date") == latest:
            _log(f"thermal: up to date ({latest}), skipping")
            return {**meta, "ok": True}

    if not _acquire_lock():
        _log("thermal: lock held by another process, skipping this cycle")
        return {**meta, "ok": bool(meta), "reason": "lock held"} if meta else {"ok": False, "reason": "lock held"}
    try:
        try:
            date = _find_valid_date(meta)
        except Exception as exc:  # noqa: BLE001
            _log(f"thermal: date lookup failed: {exc}")
            return {**meta, "ok": bool(meta), "reason": str(exc)} if meta else {"ok": False, "reason": str(exc)}
        if not force and meta and date and meta.get("date") == date:
            _log(f"thermal: up to date ({date}), skipping")
            return {**meta, "ok": True}
        if not date:
            reason = "no usable LST date found on GIBS"
            _log(f"thermal: {reason}; keeping previous data")
            return {**meta, "ok": bool(meta), "reason": reason} if meta else {"ok": False, "reason": reason}

        _log(f"thermal: fetching LST for {date}")
        tiff = _fetch_tiff(date)
        reason = _validate(tiff)
        if reason != "ok":
            _log(f"thermal: validation failed ({reason}); keeping previous data")
            return {**meta, "ok": bool(meta), "reason": reason, "date": meta.get("date") if meta else None} if meta else {"ok": False, "reason": reason}

        # Publish: raw TIFF first (district crops re-stretch from it), then
        # PNG, metadata last (metadata is the commit marker).
        tiff_tmp = TIFF_PATH.with_suffix(".tiff.tmp")
        with tiff_tmp.open("wb") as fh:
            fh.write(tiff)
        os.replace(tiff_tmp, TIFF_PATH)
        png_tmp = PNG_PATH.with_suffix(".png.tmp")
        meta_tmp = META_PATH.with_suffix(".json.tmp")
        _convert_to_png(tiff, png_tmp)
        stamp = datetime.now(timezone.utc).isoformat()
        payload = {"ok": True, "date": date, "updated_at": stamp, "bounds": list(_statewide_bbox()), "stretch": "2-98 percentile"}
        with meta_tmp.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh)
        os.replace(png_tmp, PNG_PATH)
        os.replace(meta_tmp, META_PATH)
        _log(f"thermal: published LST {date}")
        return payload
    except Exception as exc:  # noqa: BLE001 — never let a refresh crash a caller
        _log(f"thermal: refresh failed: {exc}")
        for tmp in (PNG_PATH.with_suffix(".png.tmp"), META_PATH.with_suffix(".json.tmp")):
            try:
                tmp.unlink()
            except OSError:
                pass
        return {**meta, "ok": bool(meta), "reason": str(exc)} if meta else {"ok": False, "reason": str(exc)}
    finally:
        _release_lock()