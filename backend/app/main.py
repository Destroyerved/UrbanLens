"""UrbanLens spatial backend (PRD §41).

Every figure the UI shows is computed here, over real municipal boundaries,
OpenStreetMap land and infrastructure, and a census-grounded population raster.

    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import subprocess
import sys
import threading
import time
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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


def _warm(city_id: str) -> None:
    """Build and cache a study area's layers, grid, indexes and parcel scores."""
    from app.data.loader import get_dataset
    from app.gis.parcels import get_parcels

    get_parcels(get_dataset(city_id).city.id)


@app.on_event("startup")
def prewarm() -> None:
    """Build the study areas in the background so the first request is not the
    one that pays for them.

    Everything downstream is `lru_cache`d, so the cost of an area is paid once —
    but it was being paid by whoever asked first. For the metro region that is
    ~15 s of enrichment across 4,274 parcels, during which the UI can only show
    "Loading Ahmedabad Metro Region…". A planner switching study areas mid-demo
    reads that as a hang.

    A daemon thread keeps startup instant and the server answering throughout;
    warming is strictly an optimisation, so a failure here is logged and
    dropped rather than taking the process down — the route would rebuild the
    dataset itself anyway.
    """

    def run() -> None:
        # Default area first: it is what the app opens on.
        for city_id in [DEFAULT_CITY.id, *(c for c in CITIES if c != DEFAULT_CITY.id)]:
            try:
                _warm(city_id)
                log.info("warmed %s", city_id)
            except Exception:  # noqa: BLE001 — never let warming break the server
                log.exception("could not warm %s", city_id)
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
