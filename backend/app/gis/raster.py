"""Population raster and nearest-neighbour indexing.

Population queries are the hottest path in the platform — every parcel score,
every ward gap and every simulation runs them. Intersecting buffers against the
real ward polygons is far too slow for that: the digitised boundaries carry
hundreds of vertices each.

Wards are therefore rasterised once into a regular ~250 m grid (the WorldPop-style
representation PRD §34 / §72 asks for) and queries become an indexed sum over a
small window of cells. Population is conserved exactly: each ward's total is
redistributed across its own cells by area, so summing the whole grid returns the
city total.

numpy does the heavy lifting, so this is vectorised rather than looped per cell.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from shapely.geometry import shape
from shapely.prepared import prep
from shapely.strtree import STRtree

CELL_M = 250.0
M_PER_DEG_LAT = 111_320.0
R_EARTH_KM = 6371.0


def haversine_km(lng1: np.ndarray | float, lat1: np.ndarray | float,
                 lng2: float, lat2: float) -> np.ndarray | float:
    """Great-circle distance in km. Vectorised over the first pair."""
    rlat1 = np.radians(lat1)
    rlat2 = np.radians(lat2)
    dlat = rlat2 - rlat1
    dlng = np.radians(lng2 - lng1)
    a = np.sin(dlat / 2.0) ** 2 + np.cos(rlat1) * np.cos(rlat2) * np.sin(dlng / 2.0) ** 2
    return 2.0 * R_EARTH_KM * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


@dataclass
class PopulationGrid:
    min_lng: float
    min_lat: float
    cell_lng: float
    cell_lat: float
    cols: int
    rows: int
    pop: np.ndarray  # (rows, cols) people per cell
    density: np.ndarray  # (rows, cols) people per km²
    ward_idx: np.ndarray  # (rows, cols) int32, -1 outside every ward
    row_area_km2: np.ndarray  # (rows,) cell area varies with latitude only

    @property
    def total(self) -> float:
        return float(self.pop.sum())

    @property
    def populated_cells(self) -> int:
        return int((self.pop > 0).sum())

    def cell_centres(self) -> tuple[np.ndarray, np.ndarray]:
        """Meshgrid of cell-centre longitudes and latitudes."""
        lngs = self.min_lng + (np.arange(self.cols) + 0.5) * self.cell_lng
        lats = self.min_lat + (np.arange(self.rows) + 0.5) * self.cell_lat
        return np.meshgrid(lngs, lats)


def build_population_grid(wards: list[dict]) -> PopulationGrid:
    """Rasterise ward polygons, conserving each ward's population exactly."""
    geoms = [shape(w["geometry"]) for w in wards]
    populations = np.array([float(w["properties"]["population"]) for w in wards])

    bounds = np.array([g.bounds for g in geoms])  # minx, miny, maxx, maxy
    min_lng, min_lat = bounds[:, 0].min(), bounds[:, 1].min()
    max_lng, max_lat = bounds[:, 2].max(), bounds[:, 3].max()

    mid_lat = (min_lat + max_lat) / 2.0
    cell_lat = CELL_M / M_PER_DEG_LAT
    cell_lng = CELL_M / (M_PER_DEG_LAT * np.cos(np.radians(mid_lat)))
    cols = max(1, int(np.ceil((max_lng - min_lng) / cell_lng)))
    rows = max(1, int(np.ceil((max_lat - min_lat) / cell_lat)))

    lats = min_lat + (np.arange(rows) + 0.5) * cell_lat
    row_area_km2 = (cell_lng * M_PER_DEG_LAT * np.cos(np.radians(lats))) * (cell_lat * M_PER_DEG_LAT) / 1e6

    ward_idx = np.full((rows, cols), -1, dtype=np.int32)

    # Assign cells to wards. An STRtree over ward geometry plus a prepared
    # predicate keeps this near-linear instead of cells × wards.
    tree = STRtree(geoms)
    prepared = [prep(g) for g in geoms]
    lng_grid, lat_grid = np.meshgrid(
        min_lng + (np.arange(cols) + 0.5) * cell_lng,
        lats,
    )

    from shapely.geometry import Point

    flat_lng = lng_grid.ravel()
    flat_lat = lat_grid.ravel()
    points = [Point(x, y) for x, y in zip(flat_lng, flat_lat)]
    flat_idx = np.full(flat_lng.size, -1, dtype=np.int32)

    for i, pt in enumerate(points):
        for cand in tree.query(pt):
            if prepared[cand].contains(pt):
                flat_idx[i] = cand
                break
    ward_idx = flat_idx.reshape(rows, cols)

    # Redistribute each ward's population across the cells it actually owns, so
    # rasterisation error cannot lose or invent people.
    area_grid = np.repeat(row_area_km2[:, None], cols, axis=1)
    pop = np.zeros((rows, cols), dtype=float)
    for w in range(len(geoms)):
        mask = ward_idx == w
        owned = area_grid[mask].sum()
        if owned <= 0:
            continue
        pop[mask] = populations[w] * area_grid[mask] / owned

    with np.errstate(divide="ignore", invalid="ignore"):
        density = np.where(area_grid > 0, pop / area_grid, 0.0)

    return PopulationGrid(
        min_lng=float(min_lng),
        min_lat=float(min_lat),
        cell_lng=float(cell_lng),
        cell_lat=float(cell_lat),
        cols=cols,
        rows=rows,
        pop=pop,
        density=density,
        ward_idx=ward_idx,
        row_area_km2=row_area_km2,
    )


def _window(grid: PopulationGrid, lng: float, lat: float, radius_km: float) -> tuple[slice, slice]:
    d_lat = radius_km / 111.32
    d_lng = radius_km / (111.32 * max(np.cos(np.radians(lat)), 0.01))
    r0 = max(0, int(np.floor((lat - d_lat - grid.min_lat) / grid.cell_lat)))
    r1 = min(grid.rows, int(np.ceil((lat + d_lat - grid.min_lat) / grid.cell_lat)) + 1)
    c0 = max(0, int(np.floor((lng - d_lng - grid.min_lng) / grid.cell_lng)))
    c1 = min(grid.cols, int(np.ceil((lng + d_lng - grid.min_lng) / grid.cell_lng)) + 1)
    return slice(r0, r1), slice(c0, c1)


def population_within_km(grid: PopulationGrid, lng: float, lat: float, radius_km: float) -> int:
    rs, cs = _window(grid, lng, lat, radius_km)
    if rs.start >= rs.stop or cs.start >= cs.stop:
        return 0
    sub_pop = grid.pop[rs, cs]
    lngs = grid.min_lng + (np.arange(cs.start, cs.stop) + 0.5) * grid.cell_lng
    lats = grid.min_lat + (np.arange(rs.start, rs.stop) + 0.5) * grid.cell_lat
    lng_g, lat_g = np.meshgrid(lngs, lats)
    within = haversine_km(lng_g, lat_g, lng, lat) <= radius_km
    return int(round(float(sub_pop[within].sum())))


def unserved_population_within_km(
    grid: PopulationGrid,
    facility_distance: np.ndarray,
    lng: float,
    lat: float,
    radius_km: float,
    service_radius_km: float,
) -> int:
    """People nearby who are NOT already within reach of this facility type.

    This is what a new facility here would actually start serving. Scoring raw
    catchment population instead ranks dense, already-well-served central land
    highest, which then simulates as zero improvement.
    """
    rs, cs = _window(grid, lng, lat, radius_km)
    if rs.start >= rs.stop or cs.start >= cs.stop:
        return 0
    sub_pop = grid.pop[rs, cs]
    sub_dist = facility_distance[rs, cs]
    lngs = grid.min_lng + (np.arange(cs.start, cs.stop) + 0.5) * grid.cell_lng
    lats = grid.min_lat + (np.arange(rs.start, rs.stop) + 0.5) * grid.cell_lat
    lng_g, lat_g = np.meshgrid(lngs, lats)
    mask = (haversine_km(lng_g, lat_g, lng, lat) <= radius_km) & (sub_dist > service_radius_km)
    return int(round(float(sub_pop[mask].sum())))


def density_at(grid: PopulationGrid, lng: float, lat: float) -> float:
    c = int(np.floor((lng - grid.min_lng) / grid.cell_lng))
    r = int(np.floor((lat - grid.min_lat) / grid.cell_lat))
    if not (0 <= c < grid.cols and 0 <= r < grid.rows):
        return 0.0
    return float(grid.density[r, c])


class PointIndex:
    """Nearest-neighbour over a point set, via shapely's STRtree."""

    def __init__(self, coords: list[tuple[float, float]]):
        from shapely.geometry import Point

        self.coords = np.asarray(coords, dtype=float) if coords else np.zeros((0, 2))
        self._points = [Point(x, y) for x, y in coords]
        self._tree = STRtree(self._points) if self._points else None

    def __len__(self) -> int:
        return len(self._points)

    def nearest_km(self, lng: float, lat: float) -> float:
        if self._tree is None:
            return float("inf")
        from shapely.geometry import Point

        idx = self._tree.nearest(Point(lng, lat))
        x, y = self.coords[idx]
        return float(haversine_km(x, y, lng, lat))

    def nearest_km_many(self, lngs: np.ndarray, lats: np.ndarray) -> np.ndarray:
        """Nearest distance for a whole array of query points.

        STRtree.nearest is vectorised in Shapely 2, so the whole query set goes
        down to GEOS in one call. The previous Python loop built one Point
        object per query and re-entered the tree each time, which is what made
        per-parcel enrichment the slowest stage of a district build.
        """
        if self._tree is None:
            return np.full(lngs.shape, np.inf)
        import shapely

        flat_lng = np.ascontiguousarray(np.ravel(lngs), dtype=float)
        flat_lat = np.ascontiguousarray(np.ravel(lats), dtype=float)
        if flat_lng.size == 0:
            return np.empty(np.shape(lngs), dtype=float)
        idx = self._tree.nearest(shapely.points(flat_lng, flat_lat))
        idx = np.asarray(idx, dtype=int).ravel()
        near = self.coords[idx]
        out = haversine_km(near[:, 0], near[:, 1], flat_lng, flat_lat)
        return np.asarray(out, dtype=float).reshape(np.shape(lngs))

    def count_within_km(self, lng: float, lat: float, radius_km: float) -> int:
        if len(self.coords) == 0:
            return 0
        d = haversine_km(self.coords[:, 0], self.coords[:, 1], lng, lat)
        return int((d <= radius_km).sum())
