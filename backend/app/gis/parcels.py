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
from dataclasses import dataclass, field
from functools import lru_cache

import numpy as np
from shapely.geometry import shape

from app.core.config import City
from app.gis.raster import haversine_km

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


def build_parcels(ds) -> list[Parcel]:
    """Turn real land polygons into parcels, dropping anything outside a ward."""
    from shapely.prepared import prep
    from shapely.strtree import STRtree

    ward_geoms = [shape(w["geometry"]) for w in ds.wards]
    ward_codes = [w["properties"]["ward_code"] for w in ds.wards]
    tree = STRtree(ward_geoms)
    prepared = [prep(g) for g in ward_geoms]

    from shapely.geometry import Point

    city = ds.city
    out: list[Parcel] = []
    seq = 1
    for feat in sorted(ds.land, key=lambda f: f["properties"]["id"]):
        props = feat["properties"]
        geom = shape(feat["geometry"])
        c = geom.centroid
        lng, lat = float(c.x), float(c.y)

        # The OSM fetch bbox is padded beyond the municipal boundary; keep only
        # land that actually falls inside a ward.
        pt = Point(lng, lat)
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

        rng = _rng(props["id"])
        land_use = props.get("land_use", "vacant")
        if land_use not in BUILT_UP_BAND:
            land_use = "vacant"  # never index the bands as None

        core, d_km = _nearest_core(city, lng, lat)
        local_it = float(np.clip(_intensity(city, lng, lat) + rng.uniform(-10, 10), 0, 100))

        b_min, b_max = BUILT_UP_BAND[land_use]
        built = int(round(np.clip(b_min + (b_max - b_min) * local_it / 100 + rng.uniform(-6, 6), b_min, b_max)))
        v_min, v_max = VEGETATION_BAND[land_use]
        veg = int(round(np.clip(v_max - (v_max - v_min) * local_it / 100 + rng.uniform(-5, 5), v_min, v_max)))
        water = int(round(rng.uniform(70, 96))) if land_use == "water" else int(round(rng.uniform(0, 4)))

        elevation = int(round(48 + (lng - city.center[0]) * 60 + rng.uniform(-4, 6)))
        flood = "high" if land_use == "water" else ("medium" if elevation < 44 else "low")

        gov_prob = (0.5 if land_use == "institutional" else 0.13) + (0.05 if d_km < 5 else 0.0)
        tenure_known = bool(props.get("government"))
        ownership = "government" if (tenure_known or rng.random() < gov_prob) else "private"

        zoning = _official_zoning(rng, d_km, city.radius_km)

        # Built-up history: fringe land urbanised fastest.
        fringe = float(np.exp(-(((local_it - 45) / 26) ** 2)))
        # Land along a declared growth corridor urbanised faster than fringe
        # land generally — without this term the history is direction-blind and
        # the corridor analysis has nothing to find.
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
        out.append(Parcel(
            id=pid, parcel_id=pid,
            name=props.get("name"),
            survey_number=f"{int(rng.integers(1, 999))}/{int(rng.integers(1, 40))}",
            centroid=(round(lng, 6), round(lat, 6)),
            geometry=feat["geometry"],
            area_sqm=area_sqm,
            area_acres=round(area_sqm / 4046.86, 2),
            land_use=land_use, zoning=zoning,
            ownership=ownership,
            owner_category=(GOV_OWNERS if ownership == "government" else PRIVATE_OWNERS)[
                int(rng.integers(0, len(GOV_OWNERS if ownership == "government" else PRIVATE_OWNERS)))
            ],
            ward=ward,
            built_up_percent=built, vegetation_percent=veg, water_percent=water,
            flood_risk=flood, elevation_m=elevation,
            history={2018: b2018, 2022: b2022, 2026: b2026},
            osm_tag=props.get("osm_tag"), tenure_known=tenure_known,
        ))
        seq += 1
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


@lru_cache(maxsize=8)
def get_parcels(city_id: str) -> list[Parcel]:
    from app.data.loader import get_dataset

    ds = get_dataset(city_id)
    ps = build_parcels(ds)
    enrich(ds, ps)
    return ps
