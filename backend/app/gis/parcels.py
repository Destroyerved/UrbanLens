"""Parcels, cut from real land polygons along the real street network.

India publishes no bulk cadastral geometry — Bhu-Naksha serves one plot at a
time behind a captcha — so a downloadable parcel layer does not exist. What does
exist is OpenStreetMap's land-use polygons and its street centrelines, and a
parcel is very nearly the intersection of the two: a block bounded by streets,
carrying the land use of the area it sits in.

WHAT IS REAL HERE: every boundary. Each parcel edge is an OSM road or street
centreline, a municipal ward edge, or the edge of a mapped land polygon. So is
the land-use classification, the mapped name, and ownership for the handful of
polygons OSM tags as public.

WHAT IS MODELLED: the divisions inside a block that is still too large to be a
plot, which are bisected geometrically; tenure for everything OSM does not tag;
the official planning designation; and built-up/vegetation cover. Those cannot
be sourced honestly, so they are generated deterministically — seeded per piece
from its OSM id and position, so a parcel's values never shift between runs.

WHAT IS NOT HERE: water. A river is not land anyone can be allocated, so water
polygons are excluded from the parcel set entirely and rendered by the water
layer instead.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from dataclasses import asdict, dataclass, field
from functools import lru_cache

import numpy as np
from shapely.geometry import shape

from app.core.config import City
from app.core.cache import singleflight
from app.gis.raster import haversine_km

from typing import Any

DATA_SEED = 20260814

# Built-up cover implied by a real land-use tag, as a [min, max] band. The tag is
# real; position within the band comes from local urban intensity, because OSM
# records what land is *for*, not how densely it is built.
BUILT_UP_BAND: dict[str, tuple[float, float]] = {
    "residential": (35, 92), "commercial": (45, 95), "industrial": (30, 85),
    "institutional": (20, 70), "public": (20, 70), "mixed": (35, 88), "agriculture": (0, 10),
    "vacant": (0, 12), "green": (0, 8), "water": (0, 2),
}
VEGETATION_BAND: dict[str, tuple[float, float]] = {
    "residential": (4, 25), "commercial": (2, 15), "industrial": (2, 15),
    "institutional": (8, 35), "public": (8, 35), "mixed": (3, 20), "agriculture": (55, 88),
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
# Parcel engine version. Bump with any change to the parcelization algorithm;
# it invalidates every parcel cache.
FILL_VERSION = "v5-observed"

MIN_PARCEL_SQM = 500.0     # below a 500 m2 plot it is a sliver, not a parcel
MAX_BISECT_DEPTH = 14

# Plot-size ceiling per land use, in hectares. A residential block subdivides to
# housing-plot scale; farmland does not, and forcing it to would invent field
# boundaries that are not there.
CAP_HA: dict[str, float] = {
    "residential": 2.5, "commercial": 2.5, "mixed": 2.5,
    "industrial": 6.0, "institutional": 6.0,
    "vacant": 5.0, "green": 8.0, "agriculture": 12.0,
}
FILL_CAP_MIN_SQM = 4.0 * 10_000
FILL_CAP_MAX_SQM = 50.0 * 10_000

COORD_DP = 6  # ~0.11 m at this latitude — finer than any parcel boundary is known to


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
        risk = floodmod.load_district(ds)
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


def area_sqm(geom) -> float:
    """Ground area of a lon/lat geometry, in square metres.

    Shapely's `.area` on a WGS84 geometry is in *square degrees* — about 1.1e10
    times smaller than the answer at this latitude. Reading it as square metres
    is what made every gap-fill parcel report 0.00 ha and dragged the city-wide
    vacant-government-land total down with it.

    The conversion is a local equal-area scaling: metres per degree of latitude
    and of longitude, both evaluated at the geometry's own centroid with the
    standard WGS84 series. Over anything parcel- or district-sized the error
    against the geodesic answer is well under 0.1%, and it is about 13x cheaper.
    """
    phi = math.radians(geom.centroid.y)
    m_per_deg_lat = (
        111132.92
        - 559.82 * math.cos(2 * phi)
        + 1.175 * math.cos(4 * phi)
        - 0.0023 * math.cos(6 * phi)
    )
    m_per_deg_lng = (
        111412.84 * math.cos(phi)
        - 93.5 * math.cos(3 * phi)
        + 0.118 * math.cos(5 * phi)
    )
    return abs(geom.area) * m_per_deg_lat * m_per_deg_lng


def _block_faces(ds) -> list:
    """City blocks, formed by polygonising the real linework.

    Every edge of every face here comes from something that exists on the
    ground: an OSM road or street centreline, or a municipal ward boundary.
    That is what makes the parcels built from these faces defensible — their
    boundaries are streets, not an arbitrary grid laid over the district.

    `<city>_streets.json` (residential/service streets, fetched by
    scripts/fetch_streets.py) is used when present and simply absent otherwise;
    without it the faces are arterial super-blocks, which still beat a grid but
    are much coarser. The streets layer is never sent to the browser.
    """
    from shapely.ops import polygonize, unary_union

    lines = []
    for r in ds.roads:
        # A river is not a street. Buffered separately in _water_shapes.
        if r["properties"].get("road_type") == "river":
            continue
        lines.append(shape(r["geometry"]))
    for s in ds.streets:
        lines.append(shape(s["geometry"]))
    for w in ds.wards:
        # Ward edges close the outermost faces, so no block is unbounded.
        lines.append(shape(w["geometry"]).boundary)

    if not lines:
        return []
    faces = [f for f in polygonize(unary_union(lines)) if f.is_valid and not f.is_empty]
    return faces


def _cut_by_blocks(geom, faces: list, tree, prepared_faces: list) -> list:
    """Split one polygon along the block edges that cross it.

    A face wholly inside the polygon is already the answer for that block, so it
    is taken as-is; only the faces straddling the polygon's edge need a real
    intersection. With the full street network loaded most faces are interior,
    and that test is far cheaper than the intersection it replaces.
    """
    from shapely.prepared import prep

    hits = tree.query(geom)
    if len(hits) == 0:
        return [geom]
    inside = prep(geom)
    out = []
    for i in hits:
        face = faces[i]
        if prepared_faces[i].contains(geom):
            return [geom]
        if inside.contains(face):
            out.append(face)
            continue
        if not inside.intersects(face):
            continue
        try:
            inter = geom.intersection(face)
        except Exception:  # noqa: BLE001 — a single bad face must not kill the district
            continue
        if inter.is_empty:
            continue
        parts = inter.geoms if inter.geom_type in ("MultiPolygon", "GeometryCollection") else [inter]
        for part in parts:
            if part.geom_type == "Polygon" and not part.is_empty:
                out.append(part)
    return out or [geom]


def _bisect(geom, cap_sqm: float, out: list, depth: int = 0) -> list:
    """Halve a polygon across its shorter side until every piece is under `cap`.

    Cutting perpendicular to the longest axis keeps the pieces compact rather
    than shaving off slivers, which is how plots actually subdivide.
    """
    from shapely.geometry import LineString
    from shapely.ops import split

    a = area_sqm(geom)
    if a <= cap_sqm or depth >= MAX_BISECT_DEPTH or a < MIN_PARCEL_SQM * 2:
        if a >= MIN_PARCEL_SQM:
            out.append(geom)
        return out

    w, s, e, n = geom.bounds
    if (e - w) >= (n - s):
        mid = (w + e) / 2
        cutter = LineString([(mid, s - 1e-6), (mid, n + 1e-6)])
    else:
        mid = (s + n) / 2
        cutter = LineString([(w - 1e-6, mid), (e + 1e-6, mid)])

    try:
        parts = list(split(geom, cutter).geoms)
    except Exception:  # noqa: BLE001 — an unsplittable ring stays whole
        parts = []
    if len(parts) < 2:
        if a >= MIN_PARCEL_SQM:
            out.append(geom)
        return out
    for part in parts:
        if part.geom_type == "Polygon" and not part.is_empty:
            _bisect(part, cap_sqm, out, depth + 1)
    return out


def _fill_cap_sqm(ds, lng: float, lat: float) -> float:
    """Gap-fill ceiling, finer near an urban core and coarser out in farmland.

    Reuses the same distance curve the old grid used to size its cells, so the
    urban/rural gradient is unchanged — only the boundaries are real now.
    """
    edge = _fill_cell_edge_m(ds, lng, lat)
    return float(min(max(edge * edge, FILL_CAP_MIN_SQM), FILL_CAP_MAX_SQM))


def _rounded_mapping(geom) -> dict:
    """GeoJSON for a geometry, with coordinates rounded to COORD_DP.

    Subdivision produces intersection vertices at full float precision — the
    source polygons carry 6 decimals but a cut edge lands on values like
    72.48833204660801. Serialised, that is 17 characters to express a position
    to within an atom's width. Rounding is ~15% off the parcel payload for
    nothing anyone can measure on the ground.
    """
    from shapely.geometry import mapping

    def walk(node):
        if isinstance(node, (list, tuple)):
            if node and isinstance(node[0], (int, float)):
                return [round(float(v), COORD_DP) for v in node]
            return [walk(child) for child in node]
        return node

    doc = mapping(geom)
    return {"type": doc["type"], "coordinates": walk(doc["coordinates"])}


def _model_parcel(
    ds, geom, ward_code: str, seed_text: str, seq: int,
    props: dict | None = None, modelled: bool = False,
) -> Parcel:
    """Build a fully-modelled Parcel from a geometry. Real parcels pass their OSM
    properties; gap-fill parcels pass None and get land-use typed by real
    distance from the urban core. All attributes are seeded per geometry so a
    parcel's values never shift between runs."""
    c = geom.centroid
    lng, lat = float(c.x), float(c.y)
    city = ds.city
    rng = _rng(seed_text)
    # Measured from the geometry actually stored, so the reported area always
    # matches the polygon on the map. The OSM property was computed before
    # simplification, and gap-fill parcels have no property at all.
    parcel_area = area_sqm(geom)

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
        geometry=_rounded_mapping(geom),
        area_sqm=parcel_area,
        area_acres=round(parcel_area / 4046.86, 2),
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
    """Cut the district into parcels along its real street blocks.

    Three stages, in order of how much of each parcel is real:

    1. The block partition (`_block_faces`) — every edge is an OSM road, an OSM
       street, or a municipal ward boundary.
    2. Real OSM land polygons are cut at those block edges. The land-use tag and
       the outer boundary stay exactly as mapped; only the internal divisions
       are ours, and only where a piece is still too large to be a plot.
    3. Whatever the land layer never mapped is filled from the same blocks, so
       gap-fill parcels are bounded by streets too rather than by a grid.

    Water polygons are deliberately not parcels. A river or a lake is not land
    anyone can be allocated, and shipping the Sabarmati as a developable parcel
    with a survey number was both wrong and the most visible thing on the map.
    """
    from shapely.geometry import Point
    from shapely.prepared import prep
    from shapely.strtree import STRtree
    from shapely.ops import unary_union

    ward_geoms = [shape(w["geometry"]) for w in ds.wards]
    ward_codes = [w["properties"]["ward_code"] for w in ds.wards]
    ward_tree = STRtree(ward_geoms)
    ward_prepared = [prep(g) for g in ward_geoms]

    faces = _block_faces(ds)
    face_tree = STRtree(faces) if faces else None
    face_prepared = [prep(f) for f in faces]

    def ward_of(geom) -> str | None:
        c = geom.centroid
        pt = Point(float(c.x), float(c.y))
        for cand in ward_tree.query(pt):
            if ward_prepared[cand].contains(pt):
                return ward_codes[cand]
        return None

    def blocks(geom) -> list:
        if face_tree is None:
            return [geom]
        return _cut_by_blocks(geom, faces, face_tree, face_prepared)

    out: list[Parcel] = []
    seq = 1
    mapped: list = []

    for feat in sorted(ds.land, key=lambda f: f["properties"]["id"]):
        props = feat["properties"]
        land_use = props.get("land_use", "vacant")
        geom = shape(feat["geometry"])
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty:
            continue
        geom = geom.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)

        # Every mapped polygon still masks the gap-fill, water included — the
        # fill must not invent parcels on top of a lake.
        mapped.append(geom)
        if land_use == "water":
            continue

        # The OSM fetch bbox is padded beyond the municipal boundary; keep only
        # land that actually falls inside a ward.
        if ward_of(geom) is None:
            continue
        if float(props.get("area_sqm") or 0) < MIN_PARCEL_SQM:
            continue

        cap = CAP_HA.get(land_use, 5.0) * 10_000
        plots: list = []
        for piece in blocks(geom):
            _bisect(piece, cap, plots)

        # Sorted so the nth plot of a polygon is always the same plot, which is
        # what keeps every modelled attribute stable between runs.
        plots.sort(key=lambda g: (round(g.centroid.y, 7), round(g.centroid.x, 7)))
        subdivided = len(plots) > 1
        for k, plot in enumerate(plots):
            ward = ward_of(plot)
            if ward is None:
                continue
            parcel = _model_parcel(
                ds, plot, ward, f"{props['id']}#{k}", seq, props=props
            )
            if subdivided:
                parcel.source = "osm-subdivided"
            out.append(parcel)
            seq += 1

    # ---- gap fill: ward area the land layer never mapped ------------------
    water = _water_shapes(ds)
    water_union = unary_union([w for w in water if not w.is_empty]) if water else None
    mapped_union = unary_union(mapped) if mapped else None

    for ward_code, wg in zip(ward_codes, ward_geoms):
        leftover = wg if mapped_union is None else wg.difference(mapped_union)
        if leftover.is_empty:
            continue
        for piece in blocks(leftover):
            centre = piece.centroid
            lng, lat = float(centre.x), float(centre.y)
            if water_union is not None and water_union.contains(centre):
                continue
            plots: list = []
            _bisect(piece, _fill_cap_sqm(ds, lng, lat), plots)
            plots.sort(key=lambda g: (round(g.centroid.y, 7), round(g.centroid.x, 7)))
            for k, plot in enumerate(plots):
                if area_sqm(plot) < FILL_MIN_AREA_SQM:
                    continue
                if water_union is not None and water_union.contains(plot.centroid):
                    continue
                parcel = _model_parcel(
                    ds, plot, ward_code,
                    f"{ward_code}-F{round(lng, 5)},{round(lat, 5)}#{k}",
                    seq, modelled=True,
                )
                out.append(parcel)
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

    if not parcels:
        return

    # One tree query per facility type for the whole district, rather than one
    # per parcel per type. At metro scale that is 11 vectorised calls instead of
    # ~230,000 individual ones, and it was the single slowest stage of a build.
    lngs = np.fromiter((p.centroid[0] for p in parcels), dtype=float, count=len(parcels))
    lats = np.fromiter((p.centroid[1] for p in parcels), dtype=float, count=len(parcels))
    road_km = (
        ds.road_index.nearest_km_many(lngs, lats)
        if ds.road_index else np.full(lngs.shape, np.inf)
    )
    near_km = {t: ds.facility_index[t].nearest_km_many(lngs, lats) for t in FACILITY_TYPES}

    for i, p in enumerate(parcels):
        lng, lat = p.centroid
        p.road_km = float(road_km[i])
        p.nearest = {t: float(near_km[t][i]) for t in FACILITY_TYPES}
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

        # What the land already *is* matters more than how green it happens to
        # look. OSM's leisure=park / natural=grassland polygons were scoring
        # near-perfect environmental suitability and coming out top of the
        # opportunity list — the tool was recommending the city build a
        # hospital on its parks. Designated open space is the most
        # environmentally sensitive land in a city, not the least.
        if p.land_use == "water":
            env -= 90
        elif p.land_use == "green":
            env -= 60
        elif p.land_use == "agriculture":
            env -= 15  # productive land: convertible, but not free
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


def _parcel_to_row(p: Parcel) -> dict:
    return asdict(p)


def _largest_ring(geometry: dict) -> list[tuple[float, float]]:
    """The outer ring of the biggest polygon in a (possibly multi-)polygon."""
    coords = geometry.get("coordinates") or []
    gtype = geometry.get("type")
    polys = coords if gtype == "MultiPolygon" else ([coords] if coords else [])
    best: list = []
    best_area = -1.0
    for poly in polys:
        if not poly:
            continue
        outer = poly[0] if poly and isinstance(poly[0], list) else poly
        pts = [(float(x), float(y)) for x, y in outer]
        if len(pts) < 4:
            continue
        area = abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:]))) / 2
        if area > best_area:
            best_area, best = area, pts
    return best


_OBS_CACHE: dict[str, Any | None] = {}


def _observed_for(city_id: str):
    """Parsed observed built-up history file, or None when not built yet."""
    from app.core.config import DATA_DIR

    if city_id in _OBS_CACHE:
        return _OBS_CACHE[city_id]
    data = None
    p = Path(DATA_DIR) / f"{city_id}_observed.json"
    if p.exists():
        try:
            data = json.loads(p.read_text())
        except Exception:  # noqa: BLE001
            data = None
    _OBS_CACHE[city_id] = data
    return data


def _apply_observed(ds, ps: list[Parcel]) -> None:
    """Overwrite modelled built-up cover with observed satellite-derived values.

    When web/scripts/build-observed.py has run for this city, each parcel's
    built-up percentage and its 2018/2022 history come from the Esri land-cover
    rasters instead of the urbanisation model. When it has not run the modelled
    values are left in place, so a fresh clone still works.
    """
    obs = _observed_for(ds.city.id)
    if not obs or not obs.get("parcels"):
        return
    parcels = obs["parcels"]
    for p in ps:
        if p.land_use == "water":
            continue
        row = parcels.get(p.parcel_id) or parcels.get(p.id)
        if not row:
            continue
        y18 = int(round(float(row.get("2018", row.get("y2018", p.built_up_percent)))))
        y22 = int(round(float(row.get("2022", row.get("y2022", p.built_up_percent)))))
        y24 = int(round(float(row.get("2024", row.get("y2024", p.built_up_percent)))))
        p.history = {2018: y18, 2022: y22, 2024: y24, 2026: y24}
        p.built_up_percent = y24


def _apply_flood(ds, ps: list[Parcel]) -> None:
    """Replace centroid-sampled flood risk with footprint-aggregated values."""
    from app.gis import flood as floodmod

    if not floodmod.DEM_DIR.exists():
        return
    risk = _flood_risk_for(ds)
    if risk is None:
        return
    try:
        rings = [_largest_ring(p.geometry) for p in ps]
        stats = risk.polygon_stats(rings)
    except Exception:  # noqa: BLE001
        return
    for i, p in enumerate(ps):
        if p.land_use == "water":
            continue
        stat = stats.get(i)
        if not stat:
            continue
        level, elev = stat
        p.flood_risk = level
        if elev is not None:
            p.elevation_m = elev


def _parcel_from_row(row: dict) -> Parcel:
    row = dict(row)
    row["centroid"] = tuple(row.get("centroid", (0.0, 0.0)))
    row["history"] = {int(k): int(v) for k, v in row.get("history", {}).items()}
    return Parcel(**row)


@lru_cache(maxsize=48)
def _get_parcels_cached(city_id: str, source_signature: str) -> list[Parcel]:
    from app.data.database import load_parcel_cache, store_parcel_cache
    from app.data.loader import ACTIVE_DB_PATH, get_dataset
    from app.core.config import get_city

    city = get_city(city_id)
    if city.composite_of:
        members = city.composite_of if len(city.composite_of) <= 4 else city.composite_of[:4]
        out: list[Parcel] = []
        for member in members:
            out.extend(get_parcels(member))
        return out

    # Persistent cache makes process restarts cheap. A signature mismatch means
    # source GIS changed, so stale rows are never served.
    if ACTIVE_DB_PATH is not None:
        rows = load_parcel_cache(ACTIVE_DB_PATH, city.id, source_signature)
        if rows is not None:
            return [_parcel_from_row(r) for r in rows]

    ds = get_dataset(city_id)
    ps = build_parcels(ds)
    # Observed built-up history and the DEM flood model are applied before the
    # scoring pass, so scores reflect the real signals and are persisted into
    # the parcel cache.
    _apply_observed(ds, ps)
    _apply_flood(ds, ps)
    enrich(ds, ps)

    if ACTIVE_DB_PATH is not None:
        store_parcel_cache(ACTIVE_DB_PATH, city.id, source_signature, [_parcel_to_row(p) for p in ps])
    return ps


def parcel_signature(city_id: str) -> str:
    from app.core.config import DATA_DIR
    from app.data.loader import data_signature
    # Parcels depend on exactly the base Dataset layers. DEM-backed flood risk is
    # treated as deployment data; replacing DEM files requires a process restart.
    sig = data_signature(city_id)
    # Observed built-up history is part of the parcel fill; new observation data
    # must invalidate every parcel cache just like a source layer change.
    p = DATA_DIR / f"{city_id}_observed.json"
    if p.exists():
        stat = p.stat()
        sig += f"|observed={stat.st_mtime_ns:x}:{stat.st_size}"
    # The street network and building footprints live outside the base layers;
    # touching either must invalidate every parcel cache too.
    for name in ("streets", "buildings"):
        p = DATA_DIR / f"{city_id}_{name}.json"
        if p.exists():
            stat = p.stat()
            sig += f"|{name}={stat.st_mtime_ns:x}:{stat.st_size}"
    return f"{sig}|fill={FILL_VERSION}"


def get_parcels(city_id: str) -> list[Parcel]:
    signature = parcel_signature(city_id)
    with singleflight(("parcels", city_id, signature)):
        return _get_parcels_cached(city_id, signature)