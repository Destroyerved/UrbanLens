"""UrbanLens spatial backend (PRD §41).

Every figure the UI shows is computed here, over real municipal boundaries,
OpenStreetMap land and infrastructure, and a census-grounded population raster.

    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import ORJSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import routes
from app.core.config import DEFAULT_CITY
from app.thermal import refresh as refresh_thermal

# uvicorn configures "uvicorn.error" with a handler at INFO; a fresh logger of
# our own would inherit the root level (WARNING) and silently drop everything
# below it, which would make the failure path here invisible.
log = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    startup_tasks()
    yield


app = FastAPI(
    title="UrbanLens Spatial Engine",
    lifespan=lifespan,
    version="0.1.0",
    default_response_class=ORJSONResponse,
    description=(
        "Urban planning intelligence over real municipal boundaries, "
        "OpenStreetMap land and infrastructure, and a census-grounded population raster."
    ),
)

# Deployment-safe CORS. For a private deployment set URBANLENS_CORS_ORIGINS
# to a comma-separated allowlist; public read-only demos can keep the default *.
_cors_raw = os.environ.get("URBANLENS_CORS_ORIGINS", "*")
_cors_origins = [x.strip() for x in _cors_raw.split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins or ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=3)

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


def _warm_all(cities: list[str], label: str, fn) -> None:
    """Warm a batch of cities in parallel so a slow district (e.g. Surat's
    parcel build) can't stall the queue for everyone else."""
    from concurrent.futures import ThreadPoolExecutor

    def safe(city_id: str) -> None:
        try:
            fn(city_id)
            log.info("warmed %s (%s)", city_id, label)
        except Exception:  # noqa: BLE001 — never let warming break the server
            log.exception("could not warm %s (%s)", city_id, label)

    with ThreadPoolExecutor(max_workers=4, thread_name_prefix=f"warm-{label}") as pool:
        list(pool.map(safe, cities))


def startup_tasks() -> None:
    """Initialise storage and do only bounded, opt-in warm-up work.

    The previous implementation spawned four workers across every Gujarat
    district and built parcels during startup. On small free hosts that created
    CPU/RAM contention with the first real user.
    """
    from app.data.database import has_city_layers, import_layers
    from app.data.loader import ACTIVE_DB_PATH

    if ACTIVE_DB_PATH is not None:
        # SqliteSource already creates/upgrades the schema during import. Seed
        # only the default city if the DB is empty/partial; other cities safely
        # fall back to engine files through HybridSource.
        if os.environ.get("URBANLENS_DB_AUTO_SEED", "1") == "1" and not has_city_layers(
            ACTIVE_DB_PATH, DEFAULT_CITY.id
        ):
            try:
                imported = import_layers(ACTIVE_DB_PATH, [DEFAULT_CITY.id])
                log.info("seeded SQLite for %s: %s", DEFAULT_CITY.id, imported.get(DEFAULT_CITY.id, []))
            except Exception:
                log.exception("SQLite auto-seed failed; filesystem fallback remains available")

    def warm_default() -> None:
        try:
            if os.environ.get("URBANLENS_PREWARM_BASE", "0") == "1":
                _warm_base(DEFAULT_CITY.id)
                log.info("warmed default base dataset (%s)", DEFAULT_CITY.id)
            if os.environ.get("URBANLENS_PREWARM_PARCELS", "0") == "1":
                _warm_parcels(DEFAULT_CITY.id)
                log.info("warmed default parcels (%s)", DEFAULT_CITY.id)
        except Exception:
            log.exception("default warmup failed")
        _register_windows_task()

    threading.Thread(target=warm_default, name="urbanlens-warmup", daemon=True).start()
    if os.environ.get("URBANLENS_THERMAL_REFRESH", "0") == "1":
        threading.Thread(target=_thermal_loop, name="urbanlens-thermal", daemon=True).start()


@app.middleware("http")
async def cache_headers(request, call_next):
    response = await call_next(request)
    if request.method == "GET" and response.status_code == 200:
        path = request.url.path
        if path.startswith("/api/") and path not in {"/api/health", "/api/thermal/status"}:
            response.headers.setdefault("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
    return response


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {
        "service": "UrbanLens Spatial Engine",
        "docs": "/docs",
        "api": "/api/health",
    }
