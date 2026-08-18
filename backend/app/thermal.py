"""Land-surface temperature (LST) layer, refreshed automatically.

NASA's GIBS WMTS tile cache is missing z6+ tiles over parts of India, but the
GIBS WMS service returns real data there in EPSG:3857. So instead of depending
on tiles we can't rely on, we fetch ONE georeferenced raster over the whole
state of Gujarat (covers every district and composite), validate it, and
publish it atomically as `latest.png` + `meta.json`. The frontend draws it as a
MapLibre `image` source. Nothing is published unless every check passes — a
failed refresh keeps the last good files.
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


def _wms(date: str, size: int, fmt: str) -> bytes:
    """GetMap over the metro bbox. ``fmt`` is e.g. 'image/png' or 'image/tiff'."""
    x0, y0, x1, y1 = bounds_3857()
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
    """Download a georeferenced 3857 TIFF of the LST layer over the metro."""
    return _wms(date, SIZE, "image/tiff")


def _probe(date: str, size: int = 256) -> bool:
    """Cheap check that a date actually has data over the metro (fast PNG).

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

        # Publish: PNG first, metadata last (metadata is the commit marker).
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