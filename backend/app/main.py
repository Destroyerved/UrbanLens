"""UrbanLens spatial backend (PRD §41).

Serves the same API contract as the TypeScript engine in web/, reading the same
real layers, so the frontend can be pointed at either by changing one base URL.
That overlap is deliberate during the migration: parity can be checked route by
route instead of trusting a big-bang cutover.

    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import routes

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


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {
        "service": "UrbanLens Spatial Engine",
        "docs": "/docs",
        "api": "/api/health",
    }
