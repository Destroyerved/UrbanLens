"""API routes (PRD §56).

Every route takes `?city=` and defaults to Ahmedabad.
"""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter, HTTPException, Query, Response, Request
from pydantic import BaseModel, Field

from app.core.config import CITIES, get_city
from app.data.loader import (
    FACILITY_TYPES,
    ACTIVE_DB_PATH,
    get_dataset,
    get_flood,
    get_greenspace,
    get_vegetation,
    get_water,
)
from app.gis import analysis
from app.gis import conservation as conservation_gis
from app.gis import corridor as corridor_gis
from app.gis.parcels import get_parcels
from app.gis.raster import population_within_km
from app.gis.report import build_report_pdf
from app.gis.scoring import DEFAULT_WEIGHTS, LIVABILITY_WEIGHTS, PROJECTS
from app.ml import development_model

router = APIRouter()


# --------------------------------------------------------------------------
# Request bodies
# --------------------------------------------------------------------------


class SiteSearchBody(BaseModel):
    project_type: str
    minimum_area_hectares: float | None = None
    government_land: bool = False
    low_flood_risk: bool = False
    max_road_distance_km: float | None = None
    # Minimum residents currently beyond reach of this service. Defaults for
    # facilities that provide one; pass 0 to rank purely on the weighted score.
    min_unserved_population: int | None = None
    weights: dict[str, float] | None = None
    limit: int = Field(default=12, ge=1, le=100)


class CalculateBody(BaseModel):
    parcel_id: str
    project_type: str
    weights: dict[str, float] | None = None


class ReportBody(BaseModel):
    parcel_id: str
    project_type: str | None = None


class SimulateBody(BaseModel):
    project_type: str
    lng: float
    lat: float


class CorridorBody(BaseModel):
    from_lng: float
    from_lat: float
    to_lng: float
    to_lat: float


class CopilotBody(BaseModel):
    query: str


class AnalyzeBody(BaseModel):
    points: list[dict] | None = None
    lng: float | None = None
    lat: float | None = None


def _dataset(city: str | None):
    try:
        return get_dataset(city)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _project_or_400(name: str):
    if name not in PROJECTS:
        raise HTTPException(status_code=400, detail=f"Unknown project type '{name}'")
    return PROJECTS[name]


# Frontend ProjectType aliases → engine project keys (report route only).
PROJECT_ALIASES = {
    "fire": "fire_station",
    "govt": "government_office",
    "affordable": "affordable_housing",
    "mixed": "mixed_use",
}


def _resolve_project(name: str | None, uses: list[dict]) -> str:
    """Resolve a (possibly frontend-aliased) project to a valid engine key."""
    if name:
        key = PROJECT_ALIASES.get(name, name)
        if key in PROJECTS:
            return key
    return uses[0]["project"]


def _find_parcel(city_id: str, parcel_id: str):
    key = parcel_id.lower()
    p = next(
        (x for x in get_parcels(city_id) if x.parcel_id.lower() == key or x.id.lower() == key),
        None,
    )
    if p is None:
        raise HTTPException(status_code=404, detail=f"Parcel {parcel_id} not found")
    return p


# --------------------------------------------------------------------------
# Service + catalogue
# --------------------------------------------------------------------------


@router.get("/health")
def health(
    city: str | None = Query(default=None),
    deep: bool = Query(default=False, description="Include dataset/parcel-derived checks"),
) -> dict:
    """Constant-time liveness by default; dataset diagnostics only on demand.

    Free hosts may call health endpoints repeatedly. Loading wards/roads and
    building spatial indexes just to answer a liveness probe burns CPU and can
    make a real user's first request contend with the probe.
    """
    from app.data.database import db_status

    cfg = get_city(city)
    base = {
        "ok": True,
        "engine": "python",
        "city": cfg.id,
        "city_name": cfg.name,
        "database": db_status(ACTIVE_DB_PATH),
        "deep": deep,
    }
    if not deep:
        return base

    ds = _dataset(cfg.id)
    by_type: dict[str, int] = {}
    for f in ds.facilities:
        t = f["properties"].get("facility_type", "?")
        by_type[t] = by_type.get(t, 0) + 1
    return {
        **base,
        "counts": {
            "wards": len(ds.wards),
            "land_polygons": len(ds.land),
            "facilities": len(ds.facilities),
            "roads": len(ds.roads),
            "population_cells": ds.grid.populated_cells,
            "parcels": len(get_parcels(ds.city.id)),
        },
        "population_total": ds.population,
        "facilities_by_type": by_type,
        "grid": {"cell_size_m": 250, "rows": ds.grid.rows, "cols": ds.grid.cols},
    }


def _sources(ds) -> dict:
    """Per-layer provenance. Layers are not uniformly real or uniformly
    modelled, so each states its own (PRD §30, §80.12)."""
    meta = ds.ward_meta
    parcels_all = get_parcels(ds.city.id)
    confirmed = sum(1 for p in parcels_all if p.tenure_known)
    total = len(parcels_all)
    mapped = sum(1 for p in parcels_all if p.source != "modelled-fill")
    return {
        "wards": {
            "source": "official",
            "label": f"{ds.city.name} municipal ward map",
            "detail": f"{len(ds.wards)} digitised ward boundaries ({meta.get('area_km2', '?')} km²) "
                      "with measured area, perimeter, compactness and OSM road density.",
        },
        "population": {
            "source": "derived",
            "label": "Modelled from census totals",
            "detail": meta.get("population_basis", "Census totals distributed across wards."),
        },
        "parcels": {
            "source": "osm",
            "label": "OpenStreetMap land polygons",
            "detail": f"{mapped:,} real mapped land boundaries with their real land-use tag. "
                      f"{total - mapped:,} modelled gap-fill parcels cover the remaining area "
                      "so no corner is left unmapped; fill boundaries follow the real ward edge "
                      "and exclude water. Surveyed blocks and estates, not cadastral title plots "
                      "— GLIS records are not public.",
        },
        "tenure": {
            "source": "derived",
            "label": "Ownership — mostly modelled",
            "detail": f"No public dataset records land tenure. OpenStreetMap confirms public "
                      f"ownership for only {confirmed} of {total:,} parcels; the rest is modelled.",
        },
        "zoning": {
            "source": "synthetic",
            "label": "Official zoning — modelled",
            "detail": "Development-plan sheets are not published machine-readably, so the official "
                      "designation is modelled. Zoning conflicts demonstrate the detection method; "
                      "they are not confirmed violations.",
        },
        "facilities": {
            "source": "osm",
            "label": "OpenStreetMap",
            "detail": f"{len(ds.facilities):,} facilities via the Overpass API, de-duplicated and "
                      "re-classified.",
        },
        "roads": {
            "source": "osm",
            "label": "OpenStreetMap",
            "detail": f"{len(ds.roads):,} major road segments via the Overpass API.",
        },
        "satellite": {
            "source": "satellite",
            "label": "Copernicus Sentinel-2 L2A",
            "detail": "Cloud-masked NDVI (B8−B4)/(B8+B4) at 10 m, zonal mean per ward. "
                      "Single acquisition, lowest-cloud day.",
        },
        "osm": {
            "source": "osm",
            "label": "OpenStreetMap + AMC",
            "detail": "Green-space polygons from OSM landuse/greenspace and AMC park records.",
        },
        "derived": {
            "source": "derived",
            "label": "Copernicus DEM 30 m + water layer",
            "detail": "Flood susceptibility modelled per 30 m cell from elevation and distance "
                      "to mapped water, thresholded into low/medium/high. Not an official "
                      "flood-hazard map.",
        },
    }




@router.get("/bootstrap", response_class=Response)
def ui_bootstrap(request: Request, city: str | None = Query(default=None)) -> Response:
    """One pre-gzipped, ETagged payload for the interactive map UI.

    It replaces eight blocking GeoJSON requests in the browser. The public
    layer endpoints remain unchanged for debugging/integrations.
    """
    from app.api.fast_bootstrap import get_bootstrap_payload

    cfg = get_city(city)
    raw, gz, etag = get_bootstrap_payload(cfg.id)
    headers = {
        "ETag": etag,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Vary": "Accept-Encoding",
        "X-UrbanLens-Fast-Path": "bootstrap-v4",
    }
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    if "gzip" in request.headers.get("accept-encoding", "").lower():
        headers["Content-Encoding"] = "gzip"
        return Response(content=gz, media_type="application/json", headers=headers)
    return Response(content=raw, media_type="application/json", headers=headers)


@router.get("/cities")
def cities() -> dict:
    return {
        "cities": [
            {
                "id": c.id, "name": c.name, "state": c.state,
                "center": list(c.center), "zoom": c.zoom,
                "corridors": [co.name for co in c.corridors],
            }
            for c in CITIES.values()
        ],
        "default": get_city(None).id,
    }


@router.get("/layers")
def layers(city: str | None = Query(default=None)) -> dict:
    ds = _dataset(city)
    sources = _sources(ds)

    def _count(loader, city_id: str) -> int:
        try:
            return len(loader(city_id).get("features", []))
        except FileNotFoundError:
            return 0

    entries = [
        ("wards", "Ward boundaries", "/api/wards", "polygon", len(ds.wards), "wards"),
        ("population", "Population density", "/api/population", "point", ds.grid.populated_cells, "population"),
        ("parcels", "Land parcels", "/api/parcels", "polygon", len(get_parcels(ds.city.id)), "parcels"),
        ("conflicts", "Zoning conflicts", "/api/zoning/conflicts", "point",
         len(analysis.zoning_conflicts(ds.city.id)), "zoning"),
        ("roads", "Roads", "/api/roads", "line", len(ds.roads), "roads"),
        ("facilities", "Public facilities", "/api/facilities", "point", len(ds.facilities), "facilities"),
        ("vegetation", "Vegetation & NDVI", "/api/vegetation", "polygon",
         _count(get_vegetation, ds.city.id), "satellite"),
        ("greenspace", "Green space", "/api/greenspace", "polygon",
         _count(get_greenspace, ds.city.id), "osm"),
        ("water", "Water bodies", "/api/water", "polygon",
         _count(get_water, ds.city.id), "osm"),
        ("flood", "Flood risk", "/api/flood", "polygon",
         _count(get_flood, ds.city.id), "derived"),
    ]
    return {
        "city": {"id": ds.city.id, "name": ds.city.name, "center": list(ds.city.center), "zoom": ds.city.zoom},
        "sources": sources,
        "layers": [
            {"key": k, "label": lbl, "endpoint": ep, "geometry": g, "features": n,
             "source": sources[prov]}
            for k, lbl, ep, g, n, prov in entries
        ],
    }


# --------------------------------------------------------------------------
# Layers
# --------------------------------------------------------------------------


@router.get("/wards")
def wards(
    city: str | None = Query(default=None),
    metrics: bool = Query(default=False, description="Attach infrastructure/livability metrics"),
) -> dict:
    ds = _dataset(city)
    gaps: dict[str, dict] = {}
    live: dict[str, dict] = {}
    if metrics:
        gaps = {g["ward_code"]: g for g in analysis.infrastructure_gaps(ds.city.id)}
        live = {l["ward_code"]: l for l in analysis.livability(ds.city.id)}
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": w["geometry"],
                "properties": {
                    **w["properties"],
                    **(
                        {
                            "infrastructure_score": gaps.get(w["properties"]["ward_code"], {}).get("overall"),
                            "livability_score": live.get(w["properties"]["ward_code"], {}).get("score"),
                            "priority": gaps.get(w["properties"]["ward_code"], {}).get("priority", 0),
                        }
                        if metrics else {}
                    ),
                },
            }
            for w in ds.wards
        ],
    }


@router.get("/boundary")
def boundary(city: str | None = Query(default=None)) -> dict:
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union

    ds = _dataset(city)
    merged = unary_union([shape(w["geometry"]) for w in ds.wards])
    return {"boundary": {"type": "Feature", "properties": {}, "geometry": mapping(merged)}}


@router.get("/roads")
def roads(city: str | None = Query(default=None)) -> dict:
    ds = _dataset(city)
    return {"type": "FeatureCollection", "features": ds.roads}


@router.get("/vegetation")
def vegetation(city: str | None = Query(default=None)) -> dict:
    """Per-ward vegetation choropleth (Sentinel-2 NDVI, 10 m)."""
    try:
        return get_vegetation(city)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/greenspace")
def greenspace(city: str | None = Query(default=None)) -> dict:
    """Green-space polygons (parks + green landuse)."""
    try:
        return get_greenspace(city)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/water")
def water(city: str | None = Query(default=None)) -> dict:
    """Water-body polygons (lakes, reservoirs, rivers)."""
    try:
        return get_water(city)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/flood")
def flood(city: str | None = Query(default=None)) -> dict:
    """Derived flood-susceptibility zones (high = water ±150 m, medium = 150–400 m)."""
    try:
        return get_flood(city)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/thermal/status")
def thermal_status() -> dict:
    """State of the committed LST raster (NASA GIBS MODIS, refreshed daily).

    Reads only the atomically-published metadata, so it can never describe a
    half-fetched image. ``ok: true`` means the raster is current; ``ok: false``
    with a ``date`` means the last refresh failed and the dashboard should keep
    showing that date flagged stale; no ``date`` at all means the first fetch
    has not succeeded yet.
    """
    from app.thermal import read_meta

    meta = read_meta()
    if meta is None:
        return {
            "ok": False,
            "date": None,
            "updated_at": None,
            "bounds": None,
            "reason": "no thermal data published yet — the first refresh runs at startup",
        }
    return meta


@router.get("/facilities")
def facilities(
    city: str | None = Query(default=None),
    facility_type: str | None = Query(default=None),
) -> dict:
    ds = _dataset(city)
    feats = ds.facilities
    if facility_type:
        if facility_type not in FACILITY_TYPES:
            raise HTTPException(status_code=400, detail=f"Unknown facility type '{facility_type}'")
        feats = [f for f in feats if f["properties"].get("facility_type") == facility_type]
    return {"type": "FeatureCollection", "features": feats}


@router.get("/population")
def population(city: str | None = Query(default=None), step: int = Query(default=1, ge=1, le=8)) -> dict:
    """Population raster as points — the density heatmap layer (PRD §7, §68)."""
    ds = _dataset(city)
    g = ds.grid
    lng_g, lat_g = g.cell_centres()
    rows, cols = np.where(g.pop > 0)
    keep = (rows % step == 0) & (cols % step == 0)
    rows, cols = rows[keep], cols[keep]
    return {
        "type": "FeatureCollection",
        "properties": {
            "cell_size_m": 250, "cells": int(rows.size),
            "max_density": round(float(g.density.max())),
            "total_population": ds.population, "source": "derived",
        },
        "features": [
            {
                "type": "Feature",
                "properties": {"density": round(float(g.density[r, c])),
                               "population": round(float(g.pop[r, c]))},
                "geometry": {"type": "Point",
                             "coordinates": [round(float(lng_g[r, c]), 5), round(float(lat_g[r, c]), 5)]},
            }
            for r, c in zip(rows, cols)
        ],
    }


@router.get("/population/within")
def population_within(
    lng: float, lat: float,
    radius_km: float = Query(default=3.0, gt=0, le=50),
    city: str | None = Query(default=None),
) -> dict:
    ds = _dataset(city)
    return {"point": [lng, lat], "radius_km": radius_km,
            "population": population_within_km(ds.grid, lng, lat, radius_km)}


@router.get("/parcels")
def parcels(
    city: str | None = Query(default=None),
    ownership: str | None = Query(default=None),
    vacant: bool = Query(default=False),
    detail: str | None = Query(default=None),
) -> dict:
    """Parcels as GeoJSON. `?detail=full` adds the enriched per-parcel
    measurements — proximities, catchment population, factor scores. They are
    already computed and cached, so the only cost is payload; the map omits them
    to stay light."""
    ds = _dataset(city)
    items = get_parcels(ds.city.id)
    if ownership:
        items = [p for p in items if p.ownership == ownership]
    if vacant:
        items = [p for p in items if p.land_use in ("vacant", "agriculture") and p.built_up_percent < 25]
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": p.geometry,
                "properties": {
                    "id": p.id, "parcel_id": p.parcel_id, "name": p.name,
                    "ownership": p.ownership, "land_use": p.land_use, "zoning": p.zoning,
                    "area_acres": p.area_acres, "built_up_percent": p.built_up_percent,
                    "flood_risk": p.flood_risk, "ward": p.ward, "source": p.source,
                    "development_potential": round(p.scores["development_potential"]),
                    "zoning_conflict": bool(analysis.classify_zoning_conflict(p)[0]),
                    "h2018": p.history.get(2018, 0), "h2022": p.history.get(2022, 0),
                    "h2024": p.history.get(2024, p.history.get(2026, 0)),
                    **(
                        {
                            "survey_number": p.survey_number,
                            "area_sqm": p.area_sqm,
                            "vegetation_percent": p.vegetation_percent,
                            "water_percent": p.water_percent,
                            "elevation_m": p.elevation_m,
                            "centroid": list(p.centroid),
                            "road_km": round(p.road_km, 2),
                            "hospital_km": round(p.nearest["hospital"], 2),
                            "school_km": round(p.nearest["school"], 2),
                            "park_km": round(p.nearest["park"], 2),
                            "transit_km": round(min(p.nearest["bus_stop"], p.nearest["metro_station"]), 2),
                            "population_3km": p.pop_3km,
                            "accessibility": round(p.scores["accessibility"]),
                            "infrastructure_readiness": round(p.scores["infrastructure"]),
                            # Consumers express this as sensitivity, the engine as suitability.
                            "environmental_sensitivity": round(100 - p.scores["environment"]),
                        }
                        if detail == "full" else {}
                    ),
                },
            }
            for p in items
        ],
    }


@router.get("/parcels/{parcel_id}")
def parcel_detail(parcel_id: str, city: str | None = Query(default=None)) -> dict:
    ds = _dataset(city)
    p = _find_parcel(ds.city.id, parcel_id)
    recommended = analysis.recommended_uses(ds, p)
    return {
        "parcel_id": p.parcel_id, "survey_number": p.survey_number, "name": p.name,
        "area_acres": p.area_acres, "area_sqm": p.area_sqm,
        "ownership": p.ownership, "owner_category": p.owner_category,
        "source": p.source, "osm_tag": p.osm_tag, "tenure_known": p.tenure_known,
        "zoning": p.zoning, "land_use": p.land_use, "ward": p.ward,
        "built_up_percent": p.built_up_percent, "vegetation_percent": p.vegetation_percent,
        "water_percent": p.water_percent, "flood_risk": p.flood_risk,
        "elevation_m": p.elevation_m, "history": p.history, "centroid": list(p.centroid),
        "distances": {
            "road_km": round(p.road_km, 2),
            "hospital_km": round(p.nearest["hospital"], 2),
            "school_km": round(p.nearest["school"], 2),
            "park_km": round(p.nearest["park"], 2),
            "bus_stop_km": round(p.nearest["bus_stop"], 2),
            "metro_km": round(p.nearest["metro_station"], 2),
        },
        "population_3km": p.pop_3km,
        "scores": {
            "accessibility": round(p.scores["accessibility"]),
            "infrastructure_readiness": round(p.scores["infrastructure"]),
            "environmental_suitability": round(p.scores["environment"]),
            "development_potential": round(p.scores["development_potential"]),
            "transit": round(p.scores["transit"]),
        },
        "recommended_uses": recommended,
    }


@router.get("/parcels/{parcel_id}/similar")
def parcel_similarity(
    parcel_id: str,
    city: str | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
) -> dict:
    """Find parcels with a similar multidimensional planning profile via FAISS."""
    from app.vector.search import similar_parcels

    ds = _dataset(city)
    try:
        return similar_parcels(ds.city.id, parcel_id, limit)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Parcel {parcel_id} not found") from exc


@router.get("/vector/status")
def vector_status(city: str | None = Query(default=None)) -> dict:
    from app.vector.search import FEATURE_NAMES, get_vector_index

    ds = _dataset(city)
    idx = get_vector_index(ds.city.id)
    return {
        "city": ds.city.id,
        "backend": idx.backend,
        "dimensions": len(FEATURE_NAMES),
        "indexed_parcels": len(idx.ids),
        "feature_names": list(FEATURE_NAMES),
    }


@router.post("/report")
def generate_report(body: ReportBody, city: str | None = Query(default=None)) -> Response:
    """Render a parcel recommendation as a fileable PDF (VD-9 / FE-B3)."""
    ds = _dataset(city)
    p = _find_parcel(ds.city.id, body.parcel_id)
    uses = analysis.recommended_uses(ds, p)
    project = _resolve_project(body.project_type, uses)
    suit = analysis.suitability(ds, p, project)
    pdf = build_report_pdf(ds, p, project, suit, uses, _sources(ds))
    filename = f"urbanlens-recommendation-{p.parcel_id}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --------------------------------------------------------------------------
# Analysis
# --------------------------------------------------------------------------


@router.get("/overview")
def overview(city: str | None = Query(default=None)) -> dict:
    ds = _dataset(city)
    return {**analysis.city_overview(ds.city.id), "sources": _sources(ds)}


@router.get("/infrastructure/gaps")
def gaps(city: str | None = Query(default=None)) -> dict:
    ds = _dataset(city)
    return {"wards": analysis.infrastructure_gaps(ds.city.id),
            "coverage": analysis.coverage_report(ds.city.id)}


@router.post("/corridor")
def corridor(body: CorridorBody, city: str | None = Query(default=None)) -> dict:
    """Least-cost alignment for linear infrastructure between two points.

    Sites for roads, transmission lines and canals are not chosen the way a
    hospital is: there is no single best cell, only a best path, and its cost
    is dominated by what it has to cross. The straight line is returned
    alongside so the detour — and what the detour avoided — can be argued with.
    """
    ds = _dataset(city)
    return corridor_gis.route(
        ds.city.id,
        (body.from_lng, body.from_lat),
        (body.to_lng, body.to_lat),
    )


@router.get("/provenance")
def provenance(city: str | None = Query(default=None)) -> dict:
    """Where every layer on screen came from, and how much of it is measured.

    Layers are not uniformly real: ward boundaries are official, facilities and
    roads are OpenStreetMap, NDVI is satellite, and zoning is modelled outright.
    Presenting them identically is what lets a modelled figure be mistaken for
    a surveyed one, so the split is reported rather than left implicit.
    """
    ds = _dataset(city)
    layers = _sources(ds)
    # "Measured" means somebody observed it — surveyed, mapped or sensed.
    # "Derived" is computed from something measured. "Modelled" is generated.
    kind = {
        "official": "measured", "osm": "measured", "satellite": "measured",
        "derived": "derived", "synthetic": "modelled",
    }
    counts: dict[str, int] = {"measured": 0, "derived": 0, "modelled": 0}
    for meta in layers.values():
        counts[kind.get(meta.get("source", ""), "derived")] += 1
    total = sum(counts.values()) or 1
    return {
        "city": ds.city.id,
        "layers": layers,
        "rollup": {
            **counts,
            "total": total,
            "measured_pct": round(counts["measured"] / total * 100, 1),
        },
    }


@router.get("/conservation")
def conservation(city: str | None = Query(default=None)) -> dict:
    """Ecologically sensitive land ranked by the development pressure on it.

    Sensitivity comes only from measured layers (OSM green space and water,
    Sentinel-2 NDVI, DEM flood); pressure is the trained development model's
    own output. The product, not the sum — land already protected by having no
    pressure on it is not a conservation priority.
    """
    ds = _dataset(city)
    return conservation_gis.conservation(ds.city.id)


@router.get("/encroachment")
def encroachment(city: str | None = Query(default=None)) -> dict:
    """Built land overlapping mapped water bodies and green space.

    Real geometry against real geometry: only parcels traced from a mapped OSM
    boundary are tested, never the modelled gap-fill grid, and never against
    ownership or zoning — both are modelled here and would turn a screening
    result into an accusation the data cannot support.
    """
    ds = _dataset(city)
    return conservation_gis.encroachment(ds.city.id)


@router.get("/equity")
def equity(city: str | None = Query(default=None)) -> dict:
    """Distribution of service provision across the city's population.

    /livability ranks wards; this reports how unequally that provision is
    spread, how many people fall below the service floor, and where an
    intervention reaches the most of them.
    """
    ds = _dataset(city)
    return analysis.equity(ds.city.id)


@router.get("/livability")
def livability(city: str | None = Query(default=None)) -> dict:
    ds = _dataset(city)
    wards = analysis.livability(ds.city.id)
    pop = sum(w["population"] for w in wards) or 1
    return {
        "city_score": round(sum(w["score"] * w["population"] for w in wards) / pop),
        "weights": LIVABILITY_WEIGHTS,
        "coverage": analysis.coverage_report(ds.city.id),
        "wards": wards,
    }


@router.get("/growth")
def growth(city: str | None = Query(default=None)) -> dict:
    ds = _dataset(city)
    return analysis.growth_summary(ds.city.id)


@router.get("/growth/prediction")
def growth_prediction(city: str | None = Query(default=None)) -> dict:
    """Growth-probability surface from the trained model (PRD §11)."""
    from app.ml.prediction import growth_grid

    ds = _dataset(city)
    return growth_grid(ds.city.id)


@router.get("/growth/history")
def growth_history(city: str | None = Query(default=None)) -> dict:
    return growth(city)


@router.get("/zoning/conflicts")
def conflicts(city: str | None = Query(default=None)) -> dict:
    ds = _dataset(city)
    items = analysis.zoning_conflicts(ds.city.id)
    by_sev = {"high": 0, "medium": 0}
    for c in items:
        by_sev[c["severity"]] += 1
    return {
        "type": "FeatureCollection",
        "properties": {
            "count": len(items), **by_sev,
            "note": "Official zoning is modelled; these demonstrate the detection method "
                    "rather than reporting confirmed breaches.",
        },
        "features": [
            {"type": "Feature", "id": c["parcel_id"],
             "properties": {k: v for k, v in c.items() if k != "centroid"},
             "geometry": {"type": "Point", "coordinates": c["centroid"]}}
            for c in items
        ],
    }


@router.get("/accessibility")
def accessibility(lng: float, lat: float, city: str | None = Query(default=None)) -> dict:
    ds = _dataset(city)
    return analysis.fifteen_minute(ds.city.id, lng, lat)


@router.post("/accessibility/analyze")
def accessibility_analyze(body: AnalyzeBody, city: str | None = Query(default=None)) -> dict:
    ds = _dataset(city)
    points = body.points or (
        [{"lng": body.lng, "lat": body.lat}] if body.lng is not None and body.lat is not None else []
    )
    if not points:
        raise HTTPException(status_code=400, detail="Provide `points: [{lng, lat}]` or `lng` and `lat`")
    if len(points) > 50:
        raise HTTPException(status_code=400, detail="At most 50 points per request")
    results = [
        {"label": p.get("label"), **analysis.fifteen_minute(ds.city.id, p["lng"], p["lat"])}
        for p in points
    ]
    return {"count": len(results),
            "mean_score": round(sum(r["score"] for r in results) / len(results)),
            "results": results}


@router.post("/suitability/search")
def suitability_search(body: SiteSearchBody, city: str | None = Query(default=None)) -> dict:
    ds = _dataset(city)
    _project_or_400(body.project_type)
    return analysis.search_sites(
        ds.city.id, body.project_type,
        minimum_area_hectares=body.minimum_area_hectares,
        government_land=body.government_land,
        low_flood_risk=body.low_flood_risk,
        max_road_distance_km=body.max_road_distance_km,
        min_unserved_population=body.min_unserved_population,
        weights=body.weights, limit=body.limit,
    )


@router.post("/suitability/calculate")
def suitability_calculate(body: CalculateBody, city: str | None = Query(default=None)) -> dict:
    ds = _dataset(city)
    _project_or_400(body.project_type)
    p = _find_parcel(ds.city.id, body.parcel_id)
    weights = {**DEFAULT_WEIGHTS, **(body.weights or {})}
    return {"project": PROJECTS[body.project_type].label, "weights": weights,
            **analysis.suitability(ds, p, body.project_type, weights)}


@router.post("/scenarios/simulate")
def simulate(body: SimulateBody, city: str | None = Query(default=None)) -> dict:
    ds = _dataset(city)
    _project_or_400(body.project_type)
    return analysis.simulate(ds.city.id, body.project_type, body.lng, body.lat)


@router.post("/copilot/query")
def copilot_query(body: CopilotBody, city: str | None = Query(default=None)) -> dict:
    """Answer a planning question.

    An LLM picks the tool and phrases the answer; the GIS engine produces every
    figure (PRD §29). Falls back to deterministic routing when Ollama is not
    running, which answers the same questions in fixed wording.
    """
    from app.llm.copilot import ask

    ds = _dataset(city)
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="query is required")
    return ask(ds.city.id, body.query)


@router.get("/copilot/status")
def copilot_status() -> dict:
    """Whether the LLM is usable, and what to run if not."""
    from dataclasses import asdict

    from app.llm.ollama import status

    return asdict(status())


# --------------------------------------------------------------------------
# ML
# --------------------------------------------------------------------------


@router.get("/ml/model")
def ml_model(city: str | None = Query(default=None)) -> dict:
    ds = _dataset(city)
    report = development_model.load_report(ds.city.id)
    if report is None:
        raise HTTPException(
            status_code=404,
            detail=f"No trained model for '{ds.city.id}'. Run: python -m app.ml.train {ds.city.id}",
        )
    return report


@router.post("/ml/train")
def ml_train(city: str | None = Query(default=None)) -> dict:
    from dataclasses import asdict

    ds = _dataset(city)
    try:
        return asdict(development_model.train(ds))
    except ImportError as exc:  # xgboost is the only optional dependency here
        raise HTTPException(
            status_code=503,
            detail=f"Training needs xgboost, which is not installed ({exc}). "
                   "Run: pip install -r backend/requirements.txt",
        ) from exc
