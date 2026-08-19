"""UrbanLens spatial backend (PRD §41).

Every figure the UI shows is computed here, over real municipal boundaries,
OpenStreetMap land and infrastructure, and a census-grounded population raster.

    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import routes
from app.core.config import CITIES, DEFAULT_CITY
from app.thermal import refresh as refresh_thermal

# uvicorn configures "uvicorn.error" with a handler at INFO; a fresh logger of
# our own would inherit the root level (WARNING) and silently drop everything
# below it, which would make the failure path here invisible.
log = logging.getLogger("uvicorn.error")

app = FastAPI(
    title="UrbanLens Spatial Engine",
    version="0.1.0",
    description=(
        "Urban planning intelligence over real municipal boundaries, "
        "OpenStreetMap land and infrastructure, and a census-grounded population raster."
    ),
)

# GeoJSON is extremely repetitive text and compresses about 8:1, so this is the
# difference between a 12 MB parcel response and a 1.5 MB one. It applies to
# every JSON endpoint; the 1 KB floor keeps it off the small ones where the
# compression would cost more than it saves.
app.add_middleware(GZipMiddleware, minimum_size=1024)

# The Next.js app runs on another port in development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(routes.router, prefix="/api")

# Committed LST raster + metadata served to the map as a plain image source.
_STATIC_DIR = Path(__file__).resolve().parent / "static"
_STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")

# How often the in-process loop tries to refresh the LST layer. The first
# attempt happens at startup so a fresh deployment self-initialises; the loop
# then keeps the data fresh while the server is up.
THERMAL_REFRESH_HOURS = 24


def _thermal_loop() -> None:
    """Refresh the LST layer on startup and then every 24 h.

    This is the scheduler that works identically locally and when deployed
    live, because it lives inside the backend process. Failures are logged and
    never crash the server; ``refresh`` keeps the last good files on any error,
    so a bad day simply means the dashboard shows a slightly older date.
    """
    while True:
        try:
            result = refresh_thermal()
            log.info("thermal refresh -> %s", result)
        except Exception:  # noqa: BLE001 — a refresh must never take the server down
            log.exception("thermal refresh failed")
        time.sleep(THERMAL_REFRESH_HOURS * 60 * 60)


def _register_windows_task() -> None:
    """Best-effort daily Task Scheduler job on a local Windows machine.

    Live/container hosts never run this (no win32, or the task already exists),
    and failure here is logged and ignored: the in-process loop above is the
    primary mechanism and covers the job on its own.
    """
    if sys.platform != "win32":
        return
    task = "UrbanLensThermalRefresh"
    try:
        existing = subprocess.run(
            ["schtasks", "/query", "/tn", task],
            capture_output=True, text=True, timeout=30,
        )
        if existing.returncode == 0:
            return  # already registered — leave it alone
        python = sys.executable
        script = Path(__file__).resolve().parents[2] / "web" / "scripts" / "update-thermal.py"
        cmd = (
            f"schtasks /create /tn {task} /sc daily /st 05:00 /f "
            f'/tr "\\"{python}\\" \\"{script}\\""'
        )
        done = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if done.returncode == 0:
            log.info("registered Windows task %s", task)
        else:
            log.warning("could not register Windows task: %s", done.stderr.strip() or done.stdout.strip())
    except Exception:  # noqa: BLE001 — optional optimisation, never fatal
        log.exception("could not register Windows task")


def _warm_base(city_id: str) -> None:
    """Cache a study area's base dataset: wards, land, facilities, roads, the
    population grid and the point indexes. Every eager endpoint shares this, so
    warming it makes city switches instant without paying for parcels."""
    from app.data.loader import get_dataset

    get_dataset(city_id)


def _warm_parcels(city_id: str) -> None:
    """Cache parcel generation and the DEM-driven risk raster."""
    from app.gis.parcels import get_parcels

    get_parcels(city_id)


def _warm_all(cities: list[str], label: str, fn, workers: int = 4) -> None:
    """Warm a batch of cities in parallel so a slow district (e.g. Surat's
    parcel build) can't stall the queue for everyone else."""
    from concurrent.futures import ThreadPoolExecutor

    def safe(city_id: str) -> None:
        try:
            fn(city_id)
            log.info("warmed %s (%s)", city_id, label)
        except Exception:  # noqa: BLE001 — never let warming break the server
            log.exception("could not warm %s (%s)", city_id, label)

    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix=f"warm-{label}") as pool:
        list(pool.map(safe, cities))


@app.on_event("startup")
def prewarm() -> None:
    """Build the study areas in the background so the first request is not the
    one that pays for them.

    Everything downstream is `lru_cache`d, so the cost of an area is paid once —
    but it was being paid by whoever asked first. For the metro region that is
    ~15 s of enrichment across 4,274 parcels, during which the UI can only show
    "Loading Ahmedabad Metro Region…". A planner switching study areas mid-demo
    reads that as a hang.

    Warming is two-phase so the UI is usable everywhere quickly:
      1. base datasets (wards/facilities/roads/grid/indexes) for every district,
         in parallel — the eager endpoints all share this build;
      2. parcels + DEM risk rasters, also in parallel.

    A daemon thread keeps startup instant and the server answering throughout;
    warming is strictly an optimisation, so a failure here is logged and
    dropped rather than taking the process down — the route would rebuild the
    dataset itself anyway.
    """

    def run() -> None:
        others = [c for c in CITIES if c != DEFAULT_CITY.id]
        every = [DEFAULT_CITY.id, *others]

        # The district the app opens on comes first and alone. Warming all 34
        # base datasets up front reads 150 MB of GeoJSON and builds 34
        # population grids and index sets, and while that ran the default
        # district was queued behind it — /api/health did not answer for 88 s on
        # a cold start. Getting the default ready first makes the app usable in
        # a couple of seconds; the rest can trickle in behind it.
        _warm_all([DEFAULT_CITY.id], "base", _warm_base)

        # Parcels are not cheap. Enrichment is ~1.8 ms per parcel and the state
        # holds 226,650 of them across 34 districts — Kutch alone is 22,311 and
        # takes over three minutes. Warming all of them saturates the CPU for
        # tens of minutes and holds gigabytes, and because the work is
        # numpy/shapely under the GIL it competes with every request the server
        # is trying to answer. That made the whole product feel broken: the
        # engine was busy pre-building districts nobody had asked for.
        #
        # So warm the district the app opens on, and let the rest build on first
        # request — they are lru_cached, so that cost is paid once either way.
        # Set URBANLENS_WARM=all to restore eager warming (useful for a demo
        # machine that can be started well in advance).
        # Parcels now persist to backend/.cache/parcels, so "warm the district
        # the app opens on" is no longer the whole story: an area that is
        # already cached costs ~0.2 s to warm rather than a minute, and there is
        # no reason to make the first visitor wait for a file read. So the
        # default warms every cached area plus the opening district — which
        # after `python scripts/prebuild_parcels.py` is all of them, and on a
        # fresh clone is just the one.
        from app.gis.parcels import is_cached

        scope = os.environ.get("URBANLENS_WARM", "default").strip().lower()
        if scope == "all":
            targets = every
        elif scope == "none":
            targets = []
        else:
            targets = [DEFAULT_CITY.id] + [
                c for c in every if c != DEFAULT_CITY.id and is_cached(c)
            ]
        if targets:
            _warm_all(targets, "parcels", _warm_parcels)

        # Everything else, behind the default and at low concurrency so it never
        # competes with a request the user is actually waiting on.
        _warm_all(others, "base", _warm_base, workers=2)
        log.info("warmed base dataset for %d districts", len(every))
        remaining = len(every) - len(targets)
        log.info(
            "warmed parcels for %d of %d districts (URBANLENS_WARM=%s)%s",
            len(targets), len(every), scope,
            f"; the other {remaining} build on first request" if remaining else "",
        )
        _register_windows_task()

    threading.Thread(target=run, name="urbanlens-warmup", daemon=True).start()
    threading.Thread(target=_thermal_loop, name="urbanlens-thermal", daemon=True).start()


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {
        "service": "UrbanLens Spatial Engine",
        "docs": "/docs",
        "api": "/api/health",
    }
