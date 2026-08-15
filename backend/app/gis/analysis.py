"""The analysis engine: suitability, gaps, livability, simulation, growth.

Ported from the TypeScript engine so there is one implementation of each idea.
Every number here comes from a deterministic formula over the real layers.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache

import numpy as np

from app.data.loader import get_dataset
from app.gis.parcels import Parcel, get_parcels
from app.gis.raster import (
    density_at,
    haversine_km,
    population_within_km,
    unserved_population_within_km,
)
from app.gis.scoring import (
    DEFAULT_MIN_UNSERVED,
    DEFAULT_WEIGHTS,
    EXPECTED_PER_100K,
    LIVABILITY_WEIGHTS,
    PROJECTS,
    ProjectSpec,
    clamp,
    confidence_of,
    decay_score,
    final_score,
    livability_band,
    norm,
)

# ---------------------------------------------------------------------------
# Suitability (PRD §16–20)
# ---------------------------------------------------------------------------


def _land_compatibility(p: Parcel, spec: ProjectSpec) -> float:
    area_ha = p.area_sqm / 10_000
    zoning_match = 100.0 if p.zoning in spec.preferred_zoning else (65.0 if p.zoning == "mixed_use" else 35.0)
    ownership = (100.0 if p.ownership == "government" else 45.0) if spec.prefers_government else 80.0
    if area_ha >= spec.min_area_ha:
        area_score = clamp(70 + (area_ha - spec.min_area_ha) * 6)
    else:
        area_score = clamp((area_ha / spec.min_area_ha) * 55)
    civic = spec.adds_facility is not None
    use_score = clamp(100 - p.built_up_percent * 0.9) if civic else clamp(
        60 + (25 if p.land_use in ("vacant", "agriculture") else -10)
    )
    return clamp(0.32 * zoning_match + 0.25 * ownership + 0.23 * area_score + 0.20 * use_score)


def _population_need(ds, p: Parcel, spec: ProjectSpec) -> tuple[float, int, int, float]:
    """Returns (score, catchment population, unserved population, nearest km).

    For a service facility, need means UNMET need — the people a new facility
    would actually start serving. Scoring raw catchment ranks dense, already
    well-served central land highest, which then simulates as zero improvement.
    """
    lng, lat = p.centroid
    pop = population_within_km(ds.grid, lng, lat, spec.service_radius_km)
    pop_score = norm(pop, 4_000, 130_000)
    if not spec.need_facility:
        return pop_score, pop, pop, -1.0

    field_arr = ds.facility_distance_field(spec.need_facility)
    unserved = unserved_population_within_km(
        ds.grid, field_arr, lng, lat, spec.service_radius_km, spec.service_radius_km
    )
    unserved_score = norm(unserved, 2_000, 80_000)
    nearest = p.nearest.get(spec.need_facility, float("inf"))
    gap = 100 - decay_score(nearest, spec.service_radius_km * 0.5, spec.service_radius_km * 2.2)
    return clamp(0.6 * unserved_score + 0.25 * gap + 0.15 * pop_score), pop, unserved, nearest


def suitability(ds, p: Parcel, project: str, weights: dict[str, float] | None = None) -> dict:
    spec = PROJECTS[project]
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    need_score, pop, unserved, nearest = _population_need(ds, p, spec)

    breakdown = {
        "accessibility": round(p.scores["accessibility"]),
        "population_need": round(need_score),
        "transit": round(p.scores["transit"]),
        "infrastructure": round(p.scores["infrastructure"]),
        "environment": round(p.scores["environment"]),
        "land_compatibility": round(_land_compatibility(p, spec)),
    }
    total = round(final_score(breakdown, w))

    pros: list[str] = []
    cons: list[str] = []
    if p.ownership == "government":
        pros.append("Government-owned land — no acquisition needed")
    else:
        cons.append("Privately owned — may require land acquisition")
    if p.road_km < 1.2:
        pros.append(f"{p.road_km:.1f} km from an arterial road")
    else:
        cons.append(f"{p.road_km:.1f} km from nearest arterial road")

    # Lead with unmet need rather than raw catchment, which flatters
    # already-covered central land.
    if spec.need_facility and unserved > 2_000:
        pros.append(
            f"Reaches ~{unserved:,} residents with no {spec.label.lower()} "
            f"within {spec.service_radius_km:g} km"
        )
    elif spec.need_facility:
        cons.append(
            f"Little unmet demand — almost everyone within {spec.service_radius_km:g} km "
            f"can already reach a {spec.label.lower()}"
        )
    if pop > 30_000:
        pros.append(f"Dense catchment — ~{pop:,} residents within {spec.service_radius_km:g} km")
    if p.flood_risk == "low":
        pros.append("Low flood exposure")
    else:
        cons.append(f"{'High' if p.flood_risk == 'high' else 'Moderate'} flood risk")
    if breakdown["transit"] < 45:
        cons.append(f"Limited public transport — {p.nearest['bus_stop']:.1f} km to nearest bus stop")
    else:
        pros.append("Well connected to public transport")
    if p.area_sqm / 10_000 >= spec.min_area_ha:
        pros.append(f"Adequate parcel size ({p.area_sqm / 10_000:.1f} ha)")
    else:
        cons.append(f"Below preferred size ({p.area_sqm / 10_000:.1f} ha < {spec.min_area_ha} ha)")
    if breakdown["environment"] < 55:
        cons.append("Environmental constraints reduce suitability")

    # A recommendation with nothing on the other side of the ledger invites more
    # trust than it has earned (PRD §20).
    if not cons:
        labels = {
            "accessibility": "road access", "population_need": "unmet demand",
            "transit": "public transport", "infrastructure": "surrounding infrastructure",
            "environment": "environmental suitability", "land_compatibility": "land-use fit",
        }
        weakest = min(breakdown, key=lambda k: breakdown[k])
        cons.append(f"Weakest factor is {labels[weakest]} at {breakdown[weakest]}/100")

    return {
        "parcel_id": p.parcel_id,
        "breakdown": breakdown,
        "final": total,
        "pop": pop,
        "unserved": unserved,
        "nearest_need_km": None if nearest < 0 else round(nearest, 2),
        "metrics": {
            "road_km": round(p.road_km, 2),
            "flood_risk": p.flood_risk,
            "ownership": p.ownership,
            "area_acres": p.area_acres,
        },
        "explanation": {"pros": pros, "cons": cons},
        "centroid": list(p.centroid),
    }


def search_sites(
    city_id: str,
    project: str,
    *,
    minimum_area_hectares: float | None = None,
    government_land: bool = False,
    low_flood_risk: bool = False,
    max_road_distance_km: float | None = None,
    min_unserved_population: int | None = None,
    weights: dict[str, float] | None = None,
    limit: int = 12,
) -> dict:
    ds = get_dataset(city_id)
    parcels = get_parcels(city_id)
    spec = PROJECTS[project]
    min_ha = spec.min_area_ha if minimum_area_hectares is None else minimum_area_hectares
    min_unserved = (
        (DEFAULT_MIN_UNSERVED if min_unserved_population is None else min_unserved_population)
        if spec.adds_facility else 0
    )

    scored: list[dict] = []
    for p in parcels:
        if p.area_sqm / 10_000 < min_ha:
            continue
        if government_land and p.ownership != "government":
            continue
        if low_flood_risk and p.flood_risk == "high":
            continue
        if max_road_distance_km is not None and p.road_km > max_road_distance_km:
            continue
        r = suitability(ds, p, project, weights)
        if min_unserved > 0 and r["unserved"] < min_unserved:
            continue
        scored.append(r)

    scored.sort(key=lambda r: -r["final"])
    return {
        "project": spec.label,
        "results": scored[:limit],
        "evaluated": len(parcels),
        "eligible": len(scored),
    }


# ---------------------------------------------------------------------------
# Infrastructure gaps + coverage confidence (PRD §13)
# ---------------------------------------------------------------------------

SERVICE_INPUTS: dict[str, tuple[str, ...]] = {
    "healthcare": ("hospital", "clinic"),
    "education": ("school", "college"),
    "parks": ("park",),
    "transportation": ("bus_stop", "metro_station"),
    "road_connectivity": (),
}


def coverage_report(city_id: str) -> list[dict]:
    ds = get_dataset(city_id)
    population = sum(w["properties"]["population"] for w in ds.wards)
    counts: dict[str, int] = {}
    for f in ds.facilities:
        t = f["properties"].get("facility_type")
        counts[t] = counts.get(t, 0) + 1

    out = []
    for service, types in SERVICE_INPUTS.items():
        if not types:
            out.append({
                "service": service, "confidence": "high",
                "mapped": len(ds.roads), "expected": len(ds.roads),
                "note": "Derived from the OSM road network, which is well mapped for major roads.",
            })
            continue
        mapped = sum(counts.get(t, 0) for t in types)
        expected = round(sum(EXPECTED_PER_100K[t] for t in types) * population / 100_000)
        ratio = mapped / expected if expected else 0.0
        conf = confidence_of(ratio)
        note = (
            f"{mapped:,} mapped — coverage looks broadly complete."
            if conf == "high"
            else (
                f"Only {mapped:,} mapped against roughly {expected:,} expected for this "
                "population. OpenStreetMap under-records this facility type here, so low "
                "scores may reflect missing map data rather than a real service gap."
            )
        )
        out.append({"service": service, "confidence": conf, "mapped": mapped, "expected": expected, "note": note})
    return out


def _ward_sample_points(ds, ward_index: int, max_samples: int = 12) -> list[tuple[tuple[float, float], float]]:
    """Population-weighted sample points inside a unit.

    A centroid represents a 9 km² city ward well and an 800 km² peri-urban
    taluka not at all — its centroid lands in open farmland and every service
    reads as unreachable. Sampling where the people are fixes that.
    """
    g = ds.grid
    rows, cols = np.where(g.ward_idx == ward_index)
    if rows.size == 0:
        return []
    weights = g.pop[rows, cols]
    order = np.argsort(-weights)
    rows, cols, weights = rows[order], cols[order], weights[order]
    if rows.size > max_samples:
        head = max_samples // 2
        stride = max(1, (rows.size - head) // (max_samples - head))
        keep = np.concatenate([np.arange(head), np.arange(head, rows.size, stride)])[:max_samples]
        rows, cols, weights = rows[keep], cols[keep], weights[keep]
    lngs = g.min_lng + (cols + 0.5) * g.cell_lng
    lats = g.min_lat + (rows + 0.5) * g.cell_lat
    return [((float(x), float(y)), float(w)) for x, y, w in zip(lngs, lats, weights)]


@lru_cache(maxsize=8)
def infrastructure_gaps(city_id: str) -> list[dict]:
    ds = get_dataset(city_id)
    out: list[dict] = []
    for i, w in enumerate(ds.wards):
        props = w["properties"]
        samples = _ward_sample_points(ds, i) or [(tuple(props["centroid"]), 1.0)]
        wsum = sum(s[1] for s in samples) or 1.0

        def per_cap(ftype: str, radius: float, good: float, bad: float) -> float:
            idx = ds.facility_index.get(ftype)
            acc = 0.0
            for (lng, lat), weight in samples:
                nearest = idx.nearest_km(lng, lat) if idx and len(idx) else float("inf")
                count = idx.count_within_km(lng, lat, radius) if idx and len(idx) else 0
                per100k = count / max(props["population"], 1) * 100_000
                acc += weight * clamp(0.6 * decay_score(nearest, good, bad) + 0.4 * norm(per100k, 0, 6))
            return acc / wsum

        healthcare = clamp(0.6 * per_cap("hospital", 6, 1.5, 7) + 0.4 * per_cap("clinic", 3, 0.6, 2.5))
        education = clamp(0.7 * per_cap("school", 3, 0.8, 3) + 0.3 * per_cap("college", 8, 2, 9))
        parks = per_cap("park", 2.5, 0.8, 2.5)
        transportation = clamp(0.6 * per_cap("bus_stop", 1.5, 0.3, 1.5) + 0.4 * per_cap("metro_station", 6, 0.8, 6))
        road_conn = sum(
            weight * decay_score(ds.road_index.nearest_km(lng, lat), 0.3, 2.5)
            for (lng, lat), weight in samples
        ) / wsum

        overall = clamp(
            0.30 * healthcare + 0.22 * education + 0.16 * parks
            + 0.22 * transportation + 0.10 * road_conn
        )
        out.append({
            "ward_code": props["ward_code"],
            "name": props["name"],
            "population": props["population"],
            "centroid": props["centroid"],
            "kind": props.get("kind", "ward"),
            "area_km2": round(props["area_sqm"] / 1e6, 1),
            "scores": {
                "healthcare": round(healthcare), "education": round(education),
                "parks": round(parks), "transportation": round(transportation),
                "road_connectivity": round(road_conn),
            },
            "overall": round(overall),
            "priority": round(props["population"] * (1 - overall / 100)),
        })
    out.sort(key=lambda w: -w["priority"])
    return out


# ---------------------------------------------------------------------------
# Livability (PRD §15)
# ---------------------------------------------------------------------------


@lru_cache(maxsize=8)
def livability(city_id: str) -> list[dict]:
    ds = get_dataset(city_id)
    parcels = get_parcels(city_id)
    gaps = {g["ward_code"]: g for g in infrastructure_gaps(city_id)}

    # Environmental quality per ward, from the parcels inside it.
    agg: dict[str, list[float]] = {}
    for p in parcels:
        agg.setdefault(p.ward, [0.0, 0.0, 0.0, 0.0])
        a = agg[p.ward]
        a[0] += p.vegetation_percent
        a[1] += p.built_up_percent
        a[2] += 2 if p.flood_risk == "high" else (1 if p.flood_risk == "medium" else 0)
        a[3] += 1
    env_by_ward = {
        ward: clamp(
            0.45 * norm(a[0] / a[3], 5, 55)
            + 0.30 * norm(100 - a[1] / a[3], 20, 90)
            + 0.25 * (100 - (a[2] / a[3]) * 50)
        )
        for ward, a in agg.items() if a[3]
    }
    median_env = float(np.median(list(env_by_ward.values()))) if env_by_ward else 60.0

    out = []
    for w in ds.wards:
        props = w["properties"]
        g = gaps.get(props["ward_code"])
        if not g:
            continue
        lng, lat = props["centroid"]
        public_services = clamp(
            0.4 * decay_score(ds.facility_index["government_office"].nearest_km(lng, lat), 1.5, 7)
            + 0.3 * decay_score(ds.facility_index["police_station"].nearest_km(lng, lat), 1.2, 5)
            + 0.3 * decay_score(ds.facility_index["fire_station"].nearest_km(lng, lat), 2.5, 9)
        )
        components = {
            "healthcare": g["scores"]["healthcare"],
            "education": g["scores"]["education"],
            "green_space": g["scores"]["parks"],
            "transportation": g["scores"]["transportation"],
            "public_services": round(public_services),
            "road_connectivity": g["scores"]["road_connectivity"],
            "environmental_quality": round(env_by_ward.get(props["ward_code"], median_env)),
        }
        score = round(clamp(sum(LIVABILITY_WEIGHTS[k] * components[k] for k in LIVABILITY_WEIGHTS)))
        out.append({
            "ward_code": props["ward_code"], "name": props["name"],
            "population": props["population"],
            "population_density": props["population_density"],
            "centroid": props["centroid"],
            "components": components, "score": score, "band": livability_band(score),
        })
    out.sort(key=lambda w: -w["score"])
    return out


# ---------------------------------------------------------------------------
# 15-minute city (PRD §14)
# ---------------------------------------------------------------------------

# Which livability component a new facility of each type improves.
SERVICE_FOR_FACILITY: dict[str, str] = {
    "hospital": "healthcare", "clinic": "healthcare",
    "school": "education", "college": "education",
    "park": "green_space",
    "bus_stop": "transportation", "metro_station": "transportation",
    "fire_station": "public_services", "police_station": "public_services",
    "government_office": "public_services",
}


def _ward_at(ds, lng: float, lat: float) -> int | None:
    """Index of the ward containing a point, or None."""
    from shapely.geometry import Point, shape

    pt = Point(lng, lat)
    for i, w in enumerate(ds.wards):
        if shape(w["geometry"]).contains(pt):
            return i
    return None


WALK_KMH, DRIVE_KMH = 4.8, 22.0
FIFTEEN_MIN = (
    ("hospital", "drive"), ("clinic", "walk"), ("school", "walk"), ("park", "walk"),
    ("bus_stop", "walk"), ("metro_station", "drive"), ("government_office", "drive"),
)


def fifteen_minute(city_id: str, lng: float, lat: float) -> dict:
    ds = get_dataset(city_id)
    items = []
    for ftype, mode in FIFTEEN_MIN:
        idx = ds.facility_index.get(ftype)
        dist = idx.nearest_km(lng, lat) if idx and len(idx) else float("inf")
        speed = WALK_KMH if mode == "walk" else DRIVE_KMH
        minutes = (dist / speed) * 60 if np.isfinite(dist) else 999
        items.append({
            "facility_type": ftype, "mode": mode,
            "distance_km": round(dist, 2) if np.isfinite(dist) else None,
            "minutes": round(minutes), "reachable": bool(minutes <= 15),
        })
    return {
        "point": [lng, lat], "items": items,
        "score": round(100 * sum(1 for i in items if i["reachable"]) / len(items)),
    }


# ---------------------------------------------------------------------------
# What-if simulator (PRD §26–27)
# ---------------------------------------------------------------------------


def _sample_disc(lng: float, lat: float, radius_km: float, n: int) -> list[tuple[float, float]]:
    """Deterministic golden-angle spiral over a disc."""
    golden = np.pi * (3 - np.sqrt(5))
    i = np.arange(n)
    r = radius_km * np.sqrt((i + 0.5) / n)
    theta = i * golden
    d_lat = r / 111.32
    d_lng = r / (111.32 * max(np.cos(np.radians(lat)), 0.01))
    return list(zip(lng + d_lng * np.cos(theta), lat + d_lat * np.sin(theta)))


def simulate(city_id: str, project: str, lng: float, lat: float) -> dict:
    ds = get_dataset(city_id)
    spec = PROJECTS[project]
    if not spec.adds_facility:
        return {
            "project_type": project, "label": spec.label, "site": [lng, lat],
            "applicable": False,
            "message": "Coverage simulation applies to service facilities (hospital, school, park, etc.).",
        }

    R = spec.service_radius_km
    idx = ds.facility_index[spec.adds_facility]
    # A window wider than one service radius, so before/after is a realistic
    # area figure rather than trivially 100%.
    analysis_radius = R * 1.8
    samples = _sample_disc(lng, lat, analysis_radius, 340)

    w_sum = covered_before = covered_after = dist_before = dist_after = 0.0
    for sx, sy in samples:
        dens = density_at(ds.grid, sx, sy)
        if dens <= 0:
            continue
        w_sum += dens
        nearest_existing = idx.nearest_km(sx, sy) if len(idx) else float("inf")
        nearest_after = min(nearest_existing, float(haversine_km(sx, sy, lng, lat)))
        dist_before += dens * min(nearest_existing, 50)
        dist_after += dens * min(nearest_after, 50)
        if nearest_existing <= R:
            covered_before += dens
        if nearest_after <= R:
            covered_after += dens

    before_pct = (covered_before / w_sum * 100) if w_sum else 0.0
    after_pct = (covered_after / w_sum * 100) if w_sum else 0.0
    window_pop = population_within_km(ds.grid, lng, lat, analysis_radius)
    newly = round(window_pop * ((covered_after - covered_before) / w_sum)) if w_sum else 0

    # Citywide figures alongside the local window. The window answers "does this
    # help here"; the citywide pair answers "does it move the city", and a
    # planner needs both — a large local gain can be a rounding error at city
    # scale, which is worth seeing rather than hiding.
    field_arr = ds.facility_distance_field(spec.adds_facility)
    pop_all = ds.grid.pop
    served_before = float(pop_all[(field_arr <= R) & (pop_all > 0)].sum())
    lng_g, lat_g = ds.grid.cell_centres()
    dist_new = haversine_km(lng_g, lat_g, lng, lat)
    served_after = float(pop_all[((field_arr <= R) | (dist_new <= R)) & (pop_all > 0)].sum())
    total_pop = float(pop_all.sum()) or 1.0

    # Accessibility at the site, before and after. `after` credits the proposed
    # facility as reachable, which is the only term that changes.
    acc_before = fifteen_minute(city_id, lng, lat)["score"]
    items_after = [
        {**i, "reachable": True if i["facility_type"] == spec.adds_facility else i["reachable"]}
        for i in fifteen_minute(city_id, lng, lat)["items"]
    ]
    acc_after = round(100 * sum(1 for i in items_after if i["reachable"]) / len(items_after))

    # Livability for the ward containing the site, before and after.
    #
    # The uplift is an estimate with a stated rule: the share of this ward's
    # population that the facility newly covers closes that fraction of the
    # remaining headroom on the matching livability component, which is then
    # re-blended with the published weights. It is not a re-run of the whole
    # ward analysis, and it is reported as an estimate rather than a measurement.
    live_before = live_after = None
    ward_name = None
    component = SERVICE_FOR_FACILITY.get(spec.adds_facility)
    if component:
        locator = _ward_at(ds, lng, lat)
        if locator is not None:
            ward_code = ds.wards[locator]["properties"]["ward_code"]
            ward_name = ds.wards[locator]["properties"]["name"]
            row = next((l for l in livability(city_id) if l["ward_code"] == ward_code), None)
            if row:
                live_before = row["score"]
                ward_pop = max(ds.wards[locator]["properties"]["population"], 1)
                share = min(1.0, newly / ward_pop)
                comps = dict(row["components"])
                headroom = 100 - comps[component]
                comps[component] = round(min(100, comps[component] + headroom * share))
                live_after = round(clamp(sum(LIVABILITY_WEIGHTS[k] * comps[k] for k in LIVABILITY_WEIGHTS)))

    return {
        "project_type": project, "label": spec.label, "site": [lng, lat],
        "applicable": True,
        "ward_name": ward_name,
        "livability_before": live_before,
        "livability_after": live_after,
        "service_radius_km": R,
        "analysis_radius_km": round(analysis_radius, 1),
        "window_population": window_pop,
        "catchment_population": population_within_km(ds.grid, lng, lat, R),
        "residents_newly_covered": newly,
        "coverage_before_pct": round(before_pct, 1),
        "coverage_after_pct": round(after_pct, 1),
        "avg_distance_before_km": round(dist_before / w_sum, 2) if w_sum else 0,
        "avg_distance_after_km": round(dist_after / w_sum, 2) if w_sum else 0,
        "citywide": {
            "coverage_before_pct": round(served_before / total_pop * 100, 1),
            "coverage_after_pct": round(served_after / total_pop * 100, 1),
            "covered_before": round(served_before),
            "covered_after": round(served_after),
            "total_population": round(total_pop),
        },
        "accessibility_before": acc_before,
        "accessibility_after": acc_after,
    }


# ---------------------------------------------------------------------------
# Zoning conflicts (PRD §21) and growth (PRD §9, §12)
# ---------------------------------------------------------------------------


def classify_zoning_conflict(p) -> tuple[str, str]:
    """The zoning-conflict rule, in one place.

    Both the Land panel's list and the map's conflict shading read this, so the
    highlighted parcels are always the same set the list enumerates.

    Official zoning is modelled — Gujarat's development-plan schedules are not
    published as machine-readable geometry — so a flagged parcel demonstrates the
    detection method rather than confirming a breach on the ground.

    Returns ("", "") when the parcel is not in conflict.
    """
    if p.zoning == "agricultural" and p.built_up_percent > 40:
        return "Agricultural land built-up", ("high" if p.built_up_percent > 65 else "medium")
    if p.zoning == "residential" and p.land_use == "industrial":
        return "Industrial use in residential zone", "high"
    if p.zoning == "recreational" and p.built_up_percent > 35:
        return "Encroachment on recreational land", "high"
    if p.zoning == "public_semi_public" and p.land_use == "commercial":
        return "Commercial use on public land", "medium"
    return "", ""


def zoning_conflicts(city_id: str) -> list[dict]:
    out = []
    for p in get_parcels(city_id):
        kind, severity = classify_zoning_conflict(p)
        if not kind:
            continue
        out.append({
            "parcel_id": p.parcel_id, "ward": p.ward,
            "official": p.zoning, "detected": p.land_use,
            "type": kind, "severity": severity, "centroid": list(p.centroid),
        })
    return out


def growth_summary(city_id: str) -> dict:
    ds = get_dataset(city_id)
    parcels = get_parcels(city_id)
    years = (2018, 2022, 2026)

    # Built-up AREA is estimated at ward resolution: mean built-up % of the
    # parcels in a ward × the ward's full area, so the figure reflects the whole
    # city rather than only the mapped parcel footprint.
    ward_area = {w["properties"]["ward_code"]: w["properties"]["area_sqm"] for w in ds.wards}
    agg: dict[str, list[float]] = {}
    urbanising = agri_to_built = 0
    for p in parcels:
        a = agg.setdefault(p.ward, [0.0, 0.0, 0.0, 0.0])
        for i, y in enumerate(years):
            a[i] += p.history.get(y, 0)
        a[3] += 1
        delta = p.history.get(2026, 0) - p.history.get(2018, 0)
        if delta > 25:
            urbanising += 1
            if p.land_use in ("residential", "mixed"):
                agri_to_built += 1

    built = {y: 0.0 for y in years}
    for ward, a in agg.items():
        if not a[3] or ward not in ward_area:
            continue
        for i, y in enumerate(years):
            built[y] += ward_area[ward] * (a[i] / a[3]) / 100
    km2 = {y: round(built[y] / 1e6) for y in years}
    growth_pct = round((km2[2026] - km2[2018]) / max(km2[2018], 1) * 100, 1)

    return {
        "built_up_km2": km2,
        "growth_pct_2018_2026": growth_pct,
        "parcels_urbanising": urbanising,
        "agri_to_built": agri_to_built,
        "corridors": _corridors(ds, parcels),
    }


def _bearing(from_pt: tuple[float, float], to_pt: tuple[float, float]) -> float:
    alng, alat = np.radians(from_pt[0]), np.radians(from_pt[1])
    blng, blat = np.radians(to_pt[0]), np.radians(to_pt[1])
    y = np.sin(blng - alng) * np.cos(blat)
    x = np.cos(alat) * np.sin(blat) - np.sin(alat) * np.cos(blat) * np.cos(blng - alng)
    return float((np.degrees(np.arctan2(y, x)) + 360) % 360)


def _ang_diff(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d


def _corridors(ds, parcels: list[Parcel]) -> list[dict]:
    # Bearings are measured from the primary core, which for a multi-core region
    # is the dominant city rather than the centre of the bounding box.
    origin = ds.city.urban_cores[0]

    # Mean model probability along each corridor, so the corridor cards report
    # the same surface the growth layer draws.
    try:
        from app.ml.prediction import growth_grid

        cells = [
            (
                _bearing(origin, (
                    f["geometry"]["coordinates"][0][0][0],
                    f["geometry"]["coordinates"][0][0][1],
                )),
                f["properties"]["growth_probability"],
            )
            for f in growth_grid(ds.city.id)["features"]
        ]
    except Exception:
        cells = []

    out = []
    for c in ds.city.corridors:
        hist = n = pop = 0
        for p in parcels:
            if _ang_diff(_bearing(origin, p.centroid), c.bearing) > 35:
                continue
            hist += p.history.get(2026, 0) - p.history.get(2018, 0)
            n += 1
        for w in ds.wards:
            if _ang_diff(_bearing(origin, tuple(w["properties"]["centroid"])), c.bearing) <= 35:
                pop += w["properties"]["population"]
        in_corridor = [p for b, p in cells if _ang_diff(b, c.bearing) <= 35]
        out.append({
            "name": c.name, "risk": c.risk,
            "historical_growth_pts": round(hist / n) if n else 0,
            "predicted_growth_pct": round(100 * sum(in_corridor) / len(in_corridor)) if in_corridor else 0,
            "population": pop,
        })
    return out


# ---------------------------------------------------------------------------
# City overview (PRD §6)
# ---------------------------------------------------------------------------


def city_overview(city_id: str) -> dict:
    ds = get_dataset(city_id)
    parcels = get_parcels(city_id)
    gaps = infrastructure_gaps(city_id)
    conflicts = zoning_conflicts(city_id)
    growth = growth_summary(city_id)

    govt = vacant_govt = high_potential = env_sensitive = 0
    vacant_area = 0.0
    for p in parcels:
        if p.ownership == "government":
            govt += 1
            if p.land_use in ("vacant", "agriculture") and p.built_up_percent < 25:
                vacant_govt += 1
                vacant_area += p.area_sqm
        if p.scores["development_potential"] >= 80:
            high_potential += 1
        if p.flood_risk == "high" or p.vegetation_percent > 75 or p.water_percent > 15:
            env_sensitive += 1

    return {
        "city": ds.city.id,
        "city_name": ds.city.name,
        "ward_count": len(ds.wards),
        "area_km2": round(sum(w["properties"]["area_sqm"] for w in ds.wards) / 1e6),
        "population": ds.population,
        "total_parcels": len(parcels),
        "government_parcels": govt,
        "private_parcels": len(parcels) - govt,
        "vacant_government_parcels": vacant_govt,
        "vacant_government_area_ha": round(vacant_area / 10_000),
        "built_up_area_km2": growth["built_up_km2"][2026],
        "urban_growth_pct": growth["growth_pct_2018_2026"],
        "infrastructure_deficit_wards": sum(1 for g in gaps if g["overall"] < 50),
        "high_potential_parcels": high_potential,
        "zoning_conflicts": len(conflicts),
        "environmentally_sensitive_parcels": env_sensitive,
    }
