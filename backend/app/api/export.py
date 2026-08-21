"""Data export helpers — CSV and GeoJSON serialisation of analysis results.

Planners need to take numbers out of the dashboard and into spreadsheets, GIS
tools, and council-paper appendices.  Every function here returns bytes ready
for a ``Response(content=…)``.
"""

from __future__ import annotations

import csv
import io
import json
from typing import Any

import numpy as np

from app.gis import analysis
from app.gis.parcels import Parcel, get_parcels


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe(v: Any) -> Any:
    """Coerce ``inf`` / ``nan`` / ``None`` to a CSV-friendly blank."""
    if v is None:
        return ""
    if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
        return ""
    return v


def _csv_bytes(header: list[str], rows: list[list[Any]]) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    for row in rows:
        w.writerow([_safe(v) for v in row])
    return buf.getvalue().encode("utf-8-sig")  # BOM so Excel auto-detects


# ---------------------------------------------------------------------------
# Parcel inventory
# ---------------------------------------------------------------------------

_PARCEL_HEADER = [
    "parcel_id", "id", "ward", "area_sqm", "area_ha",
    "ownership", "zoning", "land_use", "built_up_pct", "vegetation_pct",
    "flood_risk", "elevation_m", "centroid_lng", "centroid_lat",
    "road_km", "hospital_km", "school_km", "park_km", "transit_km",
    "pop_3km", "infra_readiness", "env_sensitivity", "development_potential",
]


def _parcel_row(p: Parcel) -> list:
    return [
        p.parcel_id, p.id, p.ward,
        round(p.area_sqm, 1), round(p.area_sqm / 10_000, 2),
        p.ownership, p.zoning, p.land_use,
        p.built_up_percent, p.vegetation_percent,
        p.flood_risk, p.elevation_m,
        round(p.centroid[0], 6), round(p.centroid[1], 6),
        _safe(p.road_km),
        _safe(p.nearest.get("hospital")),
        _safe(p.nearest.get("school")),
        _safe(p.nearest.get("park")),
        _safe(p.nearest.get("bus_stop") or p.nearest.get("metro_station")),
        p.pop_3km,
        _safe(p.scores.get("infra_readiness")),
        _safe(p.scores.get("env_sensitivity")),
        _safe(p.scores.get("development")),
    ]


def export_parcels_csv(city_id: str) -> bytes:
    parcels = get_parcels(city_id)
    return _csv_bytes(_PARCEL_HEADER, [_parcel_row(p) for p in parcels])


def _parcel_geojson_feature(p: Parcel) -> dict:
    props = dict(zip(_PARCEL_HEADER, _parcel_row(p)))
    # Remove centroid from props — it's in the geometry
    props.pop("centroid_lng", None)
    props.pop("centroid_lat", None)
    return {
        "type": "Feature",
        "properties": props,
        "geometry": p.geometry,
    }


def export_parcels_geojson(city_id: str) -> bytes:
    parcels = get_parcels(city_id)
    fc = {
        "type": "FeatureCollection",
        "features": [_parcel_geojson_feature(p) for p in parcels],
    }
    return json.dumps(fc, ensure_ascii=False).encode("utf-8")


# ---------------------------------------------------------------------------
# Site selection candidates
# ---------------------------------------------------------------------------

_SITE_HEADER = [
    "rank", "parcel_id", "ward", "score",
    "land_compatibility", "population_need", "accessibility",
    "infrastructure", "transit", "environment",
    "area_ha", "ownership", "land_use", "flood_risk",
    "strengths", "concerns",
]


def export_sites_csv(results: list[dict]) -> bytes:
    rows = []
    for r in results:
        factors = {f["key"]: f["score"] for f in r.get("factors", [])}
        rows.append([
            r.get("rank", ""),
            r.get("parcel_id", ""),
            r.get("ward", ""),
            r.get("score", ""),
            factors.get("land_compatibility", ""),
            factors.get("population_need", ""),
            factors.get("accessibility", ""),
            factors.get("infrastructure", ""),
            factors.get("transit", ""),
            factors.get("environment", ""),
            r.get("area_ha", ""),
            r.get("ownership", ""),
            r.get("land_use", ""),
            r.get("flood_risk", ""),
            "; ".join(r.get("strengths", [])),
            "; ".join(r.get("concerns", [])),
        ])
    return _csv_bytes(_SITE_HEADER, rows)


# ---------------------------------------------------------------------------
# Infrastructure gaps
# ---------------------------------------------------------------------------

_GAPS_HEADER = [
    "ward_code", "name", "population", "kind", "area_km2",
    "healthcare", "education", "parks", "transportation", "safety",
    "overall", "priority",
]


def export_gaps_csv(city_id: str) -> bytes:
    gaps = analysis.infrastructure_gaps(city_id)
    rows = []
    for g in gaps:
        scores = g.get("scores", {})
        rows.append([
            g.get("ward_code", ""),
            g.get("name", ""),
            g.get("population", ""),
            g.get("kind", ""),
            g.get("area_km2", ""),
            scores.get("healthcare", ""),
            scores.get("education", ""),
            scores.get("parks", ""),
            scores.get("transportation", ""),
            scores.get("road_connectivity", scores.get("safety", "")),
            g.get("overall", ""),
            g.get("priority", ""),
        ])
    return _csv_bytes(_GAPS_HEADER, rows)


# ---------------------------------------------------------------------------
# Equity
# ---------------------------------------------------------------------------

_EQUITY_HEADER = [
    "ward_code", "name", "population", "score", "band",
    "shortfall", "weakest_component", "weakest_score",
    "people_below_floor", "priority",
]


def export_equity_csv(city_id: str) -> bytes:
    report = analysis.equity(city_id)
    rows = []
    for w in report.get("wards", []):
        rows.append([
            w.get("ward_code", ""),
            w.get("name", ""),
            w.get("population", ""),
            w.get("score", ""),
            w.get("band", ""),
            w.get("shortfall", ""),
            w.get("weakest_component", ""),
            w.get("weakest_score", ""),
            w.get("people_below_floor", ""),
            w.get("priority", ""),
        ])
    return _csv_bytes(_EQUITY_HEADER, rows)
