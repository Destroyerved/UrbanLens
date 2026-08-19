"""Parcels, built from the real mapped land polygons.

WHAT IS REAL HERE: the boundary, its area, the land-use classification, the
mapped name, and ownership for the handful of polygons OSM tags as public.
These are surveyed blocks and estates, not cadastral title plots — GLIS records
are not public, which the UI states rather than glossing over.

WHAT IS MODELLED: tenure for everything else, the official planning designation,
and built-up/vegetation cover. Those cannot be sourced honestly, so they are
generated deterministically — seeded per polygon from its OSM id, so a parcel's
values never shift with file ordering.
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass, field
from functools import lru_cache

import numpy as np
from shapely.geometry import shape

from app.core.config import City
from app.gis.raster import haversine_km

from typing import Any

DATA_SEED = 20260814

# Built-up cover implied by a real land-use tag, as a [min, max] band. The tag is
# real; position within the band comes from local urban intensity, because OSM
# records what land is *for*, not how densely it is built.
BUILT_UP_BAND: dict[str, tuple[float, float]] = {
    "residential": (35, 92), "commercial": (45, 95), "industrial": (30, 85),
    "institutional": (20, 70), "mixed": (35, 88), "agriculture": (0, 10),
    "vacant": (0, 12), "green": (0, 8), "water": (0, 2),
}
VEGETATION_BAND: dict[str, tuple[float, float]] = {
    "residential": (4, 25), "commercial": (2, 15), "industrial": (2, 15),
    "institutional": (8, 35), "mixed": (3, 20), "agriculture": (55, 88),
    "vacant": (10, 45), "green": (45, 90), "water": (5, 30),
}

GOV_OWNERS = (
    "AUDA", "State Government of Gujarat", "Ahmedabad Municipal Corporation",
    "Indian Railways", "Revenue Department", "Forest Department",
)
PRIVATE_OWNERS = (
    "Private Individual", "Private Trust", "Cooperative Housing Society", "Corporate Entity",
)
def _official_zoning(rng, d_km: float, radius_km: float) -> str:
    """Modelled development-plan designation.

    Real DP sheets are not published machine-readably, so zoning is generated —
    but generated as concentric rings rather than uniformly at random, because
    Indian cities zone commercial cores, residential middles and agricultural
    fringes in that order. A uniform draw would scatter farmland zoning through
    the city centre and make every downstream zoning conflict meaningless.
    """
    ratio = d_km / max(radius_km, 1e-6)
    if ratio < 0.25:
        table = (("commercial", 3), ("residential", 4), ("mixed_use", 2), ("public_semi_public", 1))
    elif ratio < 0.55:
        table = (("residential", 5), ("mixed_use", 2), ("public_semi_public", 1),
                 ("commercial", 1), ("recreational", 1))
    elif ratio < 0.8:
        table = (("residential", 3), ("agricultural", 3), ("industrial", 2), ("recreational", 1))
    else:
        table = (("agricultural", 6), ("industrial", 2), ("residential", 1), ("recreational", 1))
    total = sum(w for _, w in table)
    roll = rng.random() * total
    acc = 0.0
    for name, weight in table:
        acc += weight
        if roll < acc:
            return name
    return table[-1][0]


CORRIDOR_HALF_WIDTH = 35.0


def _rng(seed_text: str) -> np.random.Generator:
    """Deterministic per-parcel generator, stable across runs and orderings."""
    digest = hashlib.blake2b(seed_text.encode("utf-8"), digest_size=8).digest()
    return np.random.default_rng(int.from_bytes(digest, "big") ^ DATA_SEED)


@dataclass
class Parcel:
    id: str
    parcel_id: str
    name: str | None
    survey_number: str
    centroid: tuple[float, float]
    geometry: dict
    area_sqm: float
    area_acres: float
    land_use: str
    zoning: str
    ownership: str
    owner_category: str
    ward: str
    built_up_percent: int
    vegetation_percent: int
    water_percent: int
    flood_risk: str
    elevation_m: int
    history: dict[int, int]
    osm_tag: str | None
    tenure_known: bool
    source: str = "osm"
    # Enrichment, filled once per dataset
    road_km: float = 0.0
    nearest: dict[str, float] = field(default_factory=dict)
    pop_3km: int = 0
    scores: dict[str, float] = field(default_factory=dict)


def _nearest_core(city: City, lng: float, lat: float) -> tuple[tuple[float, float], float]:
    best, best_km = city.urban_cores[0], float("inf")
    for c in city.urban_cores:
        d = float(haversine_km(c[0], c[1], lng, lat))
        if d < best_km:
            best, best_km = c, d
    return best, best_km


def _bearing_deg(from_pt: tuple[float, float], to_pt: tuple[float, float]) -> float:
    alng, alat = np.radians(from_pt[0]), np.radians(from_pt[1])
    blng, blat = np.radians(to_pt[0]), np.radians(to_pt[1])
    y = np.sin(blng - alng) * np.cos(blat)
    x = np.cos(alat) * np.sin(blat) - np.sin(alat) * np.cos(blat) * np.cos(blng - alng)
    return float((np.degrees(np.arctan2(y, x)) + 360) % 360)


def _ang_diff(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d


def _intensity(city: City, lng: float, lat: float) -> float:
    """Urban intensity: strongest core wins, so a twin-city region keeps two
    peaks instead of bulging in the empty corridor between them."""
    best = 0.0
    for cx, cy in city.urban_cores:
        d = float(haversine_km(cx, cy, lng, lat))
        best = max(best, 100.0 * np.exp(-((d / 9.0) ** 1.7)))
    return float(np.clip(best, 0, 100))


FILL_MIN_AREA_SQM = 10_000  # slivers smaller than 1 ha are dropped from the gap-fill
FILL_NEAR_EDGE_M = 400.0    # urban-fringe cell edge (~16 ha)
FILL_FAR_EDGE_M = 3000.0    # deep-rural cell edge (~9 km2)
FILL_KM_FULL = 30.0         # cell edge reaches the far size 30 km past a core
SIMPLIFY_TOLERANCE = 0.00025  # ~25 m Douglas-Peucker for payload/draw reduction


def _fill_cell_edge_m(ds, lng: float, lat: float) -> float:
    """Cell edge grows with distance from the nearest urban core, and shrinks
    again only in tight settlement cores near the road network — so a town away
    from the district capital gets fine parcels while open farmland stays coarse."""
    d = _nearest_core(ds.city, lng, lat)[1]
    t = min(d / FILL_KM_FULL, 1.0)
    edge = FILL_NEAR_EDGE_M + (FILL_FAR_EDGE_M - FILL_NEAR_EDGE_M) * t
    if ds.road_index:
        d_road = float(ds.road_index.nearest_km(lng, lat))
        if d_road < 0.5:
            edge = min(edge, 800.0)
        elif d_road < 3.0:
            edge = min(edge, 1500.0)
    return float(edge)


_risk_cache: dict[str, Any | None] = {}


def _flood_risk_for(ds):
    """The DEM-driven risk raster for this district, built once per city."""
    from app.gis import flood as floodmod

    if not floodmod.DEM_DIR.exists():
        return None
    risk = _risk_cache.get(ds.city.id, _sentinel)
    if risk is _sentinel:
        try:
            risk = floodmod.load_district(ds)
        except ImportError:
            # rasterio (and its GDAL wheels) drive the DEM read. Without it the
            # DEM-derived risk simply is not available, which the rest of this
            # module already handles as None. Letting the ImportError escape
            # took /api/health, /api/wards, /api/overview, /api/growth and
            # /api/zoning/conflicts to 500 — half the product dead because one
            # optional dependency was missing from requirements.txt.
            risk = None
        except Exception:  # noqa: BLE001 — a bad tile must not take the API down
            risk = None
        _risk_cache[ds.city.id] = risk
    return risk


_sentinel = object()


def _water_shapes(ds):
    """Polygons that should never be filled with a parcel: the land layer's
    water polygons plus any OSM river line buffered out."""
    from shapely.geometry import LineString

    out = []
    for f in ds.land:
        if f["properties"].get("land_use") == "water":
            out.append(shape(f["geometry"]))
    for r in ds.roads:
        if r["properties"].get("road_type") == "river":
            line = shape(r["geometry"])
            if isinstance(line, LineString):
                out.append(line.buffer(0.0025))  # ~275 m swath
    return out


def _fill_ward(
    ds, ward_geom, ward_code: str, covered: list, water: list, seq: int
) -> list:
    """Tessellate a ward's unmapped area into modelled parcels."""
    from shapely.geometry import Polygon, box
    from shapely.ops import unary_union

    if ward_geom.area <= 0 or not ward_geom.is_valid:
        return []
    leftover = ward_geom.difference(unary_union(covered))
    if leftover.is_empty or leftover.area <= 0:
        return []

    w, s, e, n = leftover.bounds
    out: list[Parcel] = []
    # Uniform grid per ward — take the finest edge over several sample points so
    # a small town anywhere inside the ward forces fine cells there.
    samples = [
        (w, s), (w, n), (e, s), (e, n),
        ((w + e) / 2, (s + n) / 2),
        ((w + e) / 2, s), ((w + e) / 2, n),
        (w, (s + n) / 2), (e, (s + n) / 2),
    ]
    cell = min(_fill_cell_edge_m(ds, max(w, min(x, e)), max(s, min(y, n))) for x, y in samples)
    # Scale cells finer when the leftover is small and urban-ish.
    if (e - w) < 0.05 and (n - s) < 0.05:
        cell = min(cell, 500.0)

    water_union = unary_union([u for u in water if not u.is_empty]) if water else None
    min_area = FILL_MIN_AREA_SQM
    mid_lat = (s + n) / 2
    m2_per_deg2 = (111320.0 * math.cos(math.radians(mid_lat))) * 110540.0

    lon_step = cell / (111320.0 * math.cos(math.radians(mid_lat)))
    lat_step = cell / 110540.0
    xi = w
    idx = 0
    while xi < e:
        yi = s
        while yi < n:
            x0, y0 = xi, yi
            x1, y1 = xi + lon_step, yi + lat_step
            cell_box = box(x0, y0, x1, y1).intersection(leftover)
            if not cell_box.is_empty:
                for part in cell_box.geoms if cell_box.geom_type == "MultiPolygon" else [cell_box]:
                    if not part.is_valid:
                        continue
                    part = part.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
                    if part.is_empty:
                        continue
                    if part.area * m2_per_deg2 < min_area:
                        continue
                    c = part.centroid
                    if water_union is not None and water_union.contains(c):
                        continue
                    parcel = _model_parcel(
                        ds, part, ward_code, f"{ward_code}-F{idx}", seq, modelled=True
                    )
                    out.append(parcel)
                    seq += 1
            idx += 1
            yi += lat_step
        xi += lon_step
    return out


def _model_parcel(
    ds, geom, ward_code: str, seed_text: str, seq: int,
    props: dict | None = None, modelled: bool = False,
) -> Parcel:
    """Build a fully-modelled Parcel from a geometry. Real parcels pass their OSM
    properties; gap-fill parcels pass None and get land-use typed by real
    distance from the urban core. All attributes are seeded per geometry so a
    parcel's values never shift between runs."""
    from shapely.geometry import mapping

    c = geom.centroid
    lng, lat = float(c.x), float(c.y)
    city = ds.city
    rng = _rng(seed_text)
    area_sqm = float(props.get("area_sqm") or 0) if props else geom.area

    if props is None:
        land_use = "vacant"
        _, d_core = _nearest_core(city, lng, lat)
        d_road = float(ds.road_index.nearest_km(lng, lat)) if ds.road_index else float("inf")
        if d_road < 0.5 or d_core < 8.0:
            # Town/settlement core — parcel land, not farmland.
            roll = rng.random()
            land_use = "residential" if roll < 0.50 else ("vacant" if roll < 0.80 else "commercial")
        elif d_road < 3.0:
            # Village fringe — a real mix of homes and fields.
            roll = rng.random()
            land_use = "residential" if roll < 0.35 else ("agriculture" if roll < 0.70 else "vacant")
        else:
            roll = rng.random()
            land_use = "agriculture" if roll < 0.72 else ("vacant" if roll < 0.92 else "green")
        name = None
        osm_tag = None
        tenure_known = False
    else:
        land_use = props.get("land_use", "vacant")
        if land_use not in BUILT_UP_BAND:
            land_use = "vacant"
        name = props.get("name")
        osm_tag = props.get("osm_tag")
        tenure_known = bool(props.get("government"))

    core, d_km = _nearest_core(city, lng, lat)
    local_it = float(np.clip(_intensity(city, lng, lat) + rng.uniform(-10, 10), 0, 100))

    b_min, b_max = BUILT_UP_BAND[land_use]
    built = int(round(np.clip(b_min + (b_max - b_min) * local_it / 100 + rng.uniform(-6, 6), b_min, b_max)))
    v_min, v_max = VEGETATION_BAND[land_use]
    veg = int(round(np.clip(v_max - (v_max - v_min) * local_it / 100 + rng.uniform(-5, 5), v_min, v_max)))
    water = int(round(rng.uniform(70, 96))) if land_use == "water" else int(round(rng.uniform(0, 4)))

    elevation = int(round(48 + (lng - city.center[0]) * 60 + rng.uniform(-4, 6)))
    flood = "high" if land_use == "water" else ("medium" if elevation < 44 else "low")

    # Replace the heuristic with the DEM-driven model when terrain is installed.
    risk = _flood_risk_for(ds)
    if risk is not None:
        sample = risk.at(lng, lat)
        if sample is not None:
            level, dem_elev = sample
            if land_use != "water":
                flood = level
            if dem_elev is not None:
                elevation = dem_elev

    gov_prob = (0.5 if land_use == "institutional" else 0.13) + (0.05 if d_km < 5 else 0.0)
    ownership = "government" if (tenure_known or rng.random() < gov_prob) else "private"

    zoning = _official_zoning(rng, d_km, city.radius_km)

    # Built-up history: fringe land urbanised fastest.
    fringe = float(np.exp(-(((local_it - 45) / 26) ** 2)))
    bearing = _bearing_deg(core, (lng, lat))
    strength = max(
        (float(np.exp(-((_ang_diff(bearing, c.bearing) / c.width) ** 2))) for c in city.corridors),
        default=0.0,
    )
    growth = int(round((fringe * 22 + strength * 11) * rng.uniform(0.5, 1.15)))
    b2026 = built
    b2018 = max(0, b2026 - growth)
    b2022 = max(b2018, int(round(b2018 + (b2026 - b2018) * 0.62)))

    pid = f"GJ-{city.code}-{seq:05d}"
    return Parcel(
        id=pid, parcel_id=pid,
        name=name,
        survey_number=f"{int(rng.integers(1, 999))}/{int(rng.integers(1, 40))}",
        centroid=(round(lng, 6), round(lat, 6)),
        geometry=mapping(geom),
        area_sqm=area_sqm,
        area_acres=round(area_sqm / 4046.86, 2),
        land_use=land_use, zoning=zoning,
        ownership=ownership,
        owner_category=(GOV_OWNERS if ownership == "government" else PRIVATE_OWNERS)[
            int(rng.integers(0, len(GOV_OWNERS if ownership == "government" else PRIVATE_OWNERS)))
        ],
        ward=ward_code,
        built_up_percent=built, vegetation_percent=veg, water_percent=water,
        flood_risk=flood, elevation_m=elevation,
        history={2018: b2018, 2022: b2022, 2026: b2026},
        osm_tag=osm_tag, tenure_known=tenure_known,
        source="modelled-fill" if modelled else "osm",
    )


def build_parcels(ds) -> list[Parcel]:
    """Turn real land polygons into parcels, then gap-fill every unmapped ward
    area with modelled parcels so no corner of the district is left uncovered."""
    from shapely.geometry import Point
    from shapely.prepared import prep
    from shapely.strtree import STRtree

    ward_geoms = [shape(w["geometry"]) for w in ds.wards]
    ward_codes = [w["properties"]["ward_code"] for w in ds.wards]
    tree = STRtree(ward_geoms)
    prepared = [prep(g) for g in ward_geoms]
    by_ward: dict[str, list] = {code: [] for code in ward_codes}

    city = ds.city
    out: list[Parcel] = []
    seq = 1
    for feat in sorted(ds.land, key=lambda f: f["properties"]["id"]):
        props = feat["properties"]
        geom = shape(feat["geometry"])
        geom = geom.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
        c = geom.centroid
        pt = Point(float(c.x), float(c.y))

        # The OSM fetch bbox is padded beyond the municipal boundary; keep only
        # land that actually falls inside a ward.
        ward = None
        for cand in tree.query(pt):
            if prepared[cand].contains(pt):
                ward = ward_codes[cand]
                break
        if ward is None:
            continue

        area_sqm = float(props.get("area_sqm") or 0)
        if area_sqm < 500:
            continue

        parcel = _model_parcel(ds, geom, ward, props["id"], seq, props=props)
        out.append(parcel)
        seq += 1
        if ward in by_ward:
            by_ward[ward].append(geom)

    # Gap-fill: every ward minus its mapped land gets deterministic parcels.
    water = _water_shapes(ds)
    for ward_code, wg in zip(ward_codes, ward_geoms):
        fills = _fill_ward(ds, wg, ward_code, by_ward[ward_code], water, seq)
        if fills:
            out.extend(fills)
            seq += len(fills)
    return out


FACILITY_TYPES = (
    "hospital", "clinic", "school", "college", "park",
    "fire_station", "police_station", "bus_stop", "metro_station", "government_office",
)


def enrich(ds, parcels: list[Parcel]) -> None:
    """Attach proximities, catchment population and factor scores to each parcel."""
    from app.gis.raster import population_within_km
    from app.gis.scoring import clamp, decay_score, norm

    for p in parcels:
        lng, lat = p.centroid
        p.road_km = ds.road_index.nearest_km(lng, lat) if ds.road_index else float("inf")
        p.nearest = {t: ds.facility_index[t].nearest_km(lng, lat) for t in FACILITY_TYPES}
        p.pop_3km = population_within_km(ds.grid, lng, lat, 3.0)
        _, d_centre = _nearest_core(ds.city, lng, lat)

        transit = 0.6 * decay_score(p.nearest["bus_stop"], 0.25, 1.5) + \
                  0.4 * decay_score(p.nearest["metro_station"], 0.6, 5.0)
        accessibility = 0.65 * decay_score(p.road_km, 0.25, 2.5) + \
                        0.35 * decay_score(d_centre, 2.0, 13.0)
        utilities = norm(p.built_up_percent, 8, 80)  # built-up implies serviced
        infrastructure = clamp(
            0.25 * decay_score(p.nearest["hospital"], 1.5, 8.0)
            + 0.25 * decay_score(p.nearest["school"], 0.8, 3.0)
            + 0.20 * decay_score(p.nearest["clinic"], 0.6, 2.5)
            + 0.30 * utilities
        )

        env = 100.0
        if p.flood_risk == "high":
            env -= 55
        elif p.flood_risk == "medium":
            env -= 28
        env -= 40 if p.water_percent > 20 else p.water_percent * 0.8
        if p.vegetation_percent > 78:
            env -= 12  # ecologically sensitive
        env = clamp(env)

        developable = norm(100 - p.built_up_percent, 10, 90)
        p.scores = {
            "accessibility": accessibility,
            "transit": transit,
            "infrastructure": infrastructure,
            "environment": env,
            "development_potential": clamp(
                0.32 * accessibility + 0.12 * infrastructure + 0.24 * env
                + 0.22 * developable + 0.10 * transit
            ),
        }


@lru_cache(maxsize=48)
def get_parcels(city_id: str) -> list[Parcel]:
    from app.data.loader import get_dataset
    from app.core.config import get_city

    city = get_city(city_id)
    if city.composite_of:
        # Merge pre-computed & enriched parcels from member districts
        # For huge composites (e.g. state-level Gujarat), limit to avoid browser memory overload
        members = city.composite_of if len(city.composite_of) <= 4 else city.composite_of[:4]
        out: list[Parcel] = []
        for m in members:
            out.extend(get_parcels(m))
        return out

    ds = get_dataset(city_id)
    ps = build_parcels(ds)
    enrich(ds, ps)
    return ps


# ---------------------------------------------------------------------------
# Viewport scoping
# ---------------------------------------------------------------------------
#
# A district is not a city. Kutch has 22,311 parcels and serving them as one
# GeoJSON response is 20.5 MB, of which 15.1 MB is properties — the browser then
# parses that into JS objects and hands it to MapLibre. Statewide there are
# 226,650 parcels. Nothing about that gets faster by tuning the engine; it is a
# delivery problem, so the fix is to send only what the viewport actually shows.
#
# The index is the same STRtree the rest of the module uses, so a bbox lookup is
# O(log n) rather than a scan. Simplification is deliberately NOT applied:
# parcels average 7 vertices, so geometry is only 30% of the payload and there
# is nothing to win there.


@lru_cache(maxsize=8)
def _bbox_index(city_id: str):
    """STRtree over parcel geometries, plus the parcels in tree order."""
    from shapely.geometry import shape
    from shapely.strtree import STRtree

    items = get_parcels(city_id)
    geoms = [shape(p.geometry) for p in items]
    return STRtree(geoms), items


def parcels_in_bbox(
    city_id: str,
    bbox: tuple[float, float, float, float] | None,
    limit: int | None = None,
) -> list[Parcel]:
    """Parcels intersecting `bbox`, largest first, capped at `limit`.

    Ordering by area matters at low zoom: an arbitrary cap would drop parcels at
    random and the map would flicker as the viewport moved. Largest-first means
    a capped response is a coherent picture of the significant land rather than
    a sample of it.
    """
    items = get_parcels(city_id)
    if bbox is not None:
        from shapely.geometry import box

        tree, indexed = _bbox_index(city_id)
        hits = tree.query(box(*bbox))
        items = [indexed[i] for i in hits]
    if limit is not None and len(items) > limit:
        items = sorted(items, key=lambda p: -p.area_sqm)[:limit]
    return items
