"""UrbanLens spatial backend (PRD §41).

Every figure the UI shows is computed here, over real municipal boundaries,
OpenStreetMap land and infrastructure, and a census-grounded population raster.

    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import routes
from app.core.config import CITIES, DEFAULT_CITY

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

    threading.Thread(target=run, name="urbanlens-warmup", daemon=True).start()


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {
        "service": "UrbanLens Spatial Engine",
        "docs": "/docs",
        "api": "/api/health",
    }
