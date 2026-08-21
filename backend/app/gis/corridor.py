"""Least-cost corridor routing for linear infrastructure.

The rest of the engine sites *point* facilities — a hospital, a school, a fire
station. Roads, transmission lines and canals are chosen differently: there is
no single best cell, only a best path between two of them, and the cost of that
path is dominated by what it has to cross.

This builds a cost surface over the study area and runs a shortest-path search
across it, so the answer is an alignment plus the price of that alignment in
the terms a planner argues about: length, people displaced, water crossed,
green space taken, flood plain traversed.

WHAT THE COST SURFACE IS MADE OF (all measured layers, none modelled)
    water        real OSM water bodies — a crossing means a bridge
    greenspace   real OSM + AMC parks, gardens, forest
    flood        DEM elevation + water proximity, high and medium classes only
    population   Census ward totals rasterised by app.gis.raster — proxy for
                 acquisition and displacement cost
    roads        real OSM alignments — reusing one is cheaper than cutting new

Deliberately excluded: parcels, ownership and zoning. Parcels are largely
modelled gap fill, ownership is modelled for all but a handful of records, and
zoning is modelled outright. A route that claimed to avoid private land would
be routing around invented owners.

RESOLUTION
The population raster is 250 m, which is finer than a regional alignment needs
and would make a statewide district like Kutch a 620,000-cell search. Cells are
pooled by DOWNSAMPLE into roughly 1 km, which is the scale a corridor is
actually decided at and keeps every district in the state searchable in under a
second. Coverage is sampled at each coarse cell's centre rather than by area
intersection: at 1 km the difference is small, and it keeps the build linear in
the number of cells rather than quadratic against every polygon.
"""

from __future__ import annotations

import heapq
import math

import numpy as np
from shapely.geometry import Point, box, shape
from shapely.strtree import STRtree

from app.core.cache import singleflight
from app.data.loader import (
    data_signature,
    get_dataset,
    get_flood,
    get_greenspace,
    get_water,
)

# Pooling factor over the 250 m population raster → ~1 km corridor cells.
DOWNSAMPLE = 4

# Relative cost of crossing each surface, as multiples of open buildable ground.
# Water is highest because it means a structure, not just a harder alignment;
# population is next because acquisition and rehousing dominate real corridor
# budgets in Indian cities.
# Ordering matters more than the absolute numbers: bridging a reservoir is
# genuine engineering, routing around a settlement is land acquisition, and the
# first is far dearer than the second.
#
# population was 6.0 and that was too near water's 12.0. Costs stack additively
# on BASE_COST, so a line between two town centres averaged 6.33 per cell while
# a road cell costs 0.70 -- a 9x ratio, which let Dijkstra accept a road route
# nine times longer before length mattered again. Morbi routed 120.66 km
# between ward centres 45.62 km apart (164.5% detour) while crossing water in
# exactly 1 of 38 cells: it was fleeing people, not obstacles. At 2.5 the same
# route is 6.5%, Ahmedabad 17.0% -> 3.1%, and Narmada holds at ~30% because
# there the detour is real terrain.
#
# There is a tension worth naming: route() reports population_served as a
# benefit while the surface charges population as a cost. That is right for
# infrastructure -- serve people without displacing them -- but only while the
# penalty stays small enough not to overwhelm the thing it is trading against.
COST_WEIGHTS = {
    "water": 12.0,
    "population": 2.5,
    "green": 4.0,
    "flood": 3.0,
}

# Following an existing alignment is cheaper than cutting a new one: the land is
# already public, already cleared and already disturbed. This is a multiplier on
# the assembled cost, not a subtraction, so it can never drive a cell negative.
#
# The value also influences how far the router will go out of its way. Note the
# bound is NOT 1/d as this comment once claimed: that holds only if the discount
# is the sole variation in cost, and the weights above stack additively on top,
# so the real ratio is (BASE + penalties) / (BASE * d). Getting detours under
# control was a matter of the population weight, not of this number.
ROAD_DISCOUNT = 0.7

BASE_COST = 1.0

# Bumped whenever weights, resolution or output shape change — the persisted
# cache is keyed on the source-layer signature, which will not move for a code
# edit on its own.
ANALYTIC_VERSION = "v2-cost-weights"

_M_PER_DEG_LAT = 110_574.0


def _valid(geom):
    try:
        g = shape(geom)
        if g.is_empty:
            return None
        return g if g.is_valid else g.buffer(0)
    except Exception:  # noqa: BLE001 — a bad polygon is skipped, not fatal
        return None


def _geoms(fc, keep=None) -> list:
    feats = fc.get("features", []) if isinstance(fc, dict) else (fc or [])
    out = []
    for f in feats:
        if keep is not None and not keep(f.get("properties", {}) or {}):
            continue
        g = _valid(f.get("geometry"))
        if g is not None:
            out.append(g)
    return out


class CostSurface:
    """Pooled cost grid plus the geography needed to map cells back to ground."""

    def __init__(self, city_id: str):
        ds = get_dataset(city_id)
        grid = ds.grid
        self.rows = max(1, grid.rows // DOWNSAMPLE)
        self.cols = max(1, grid.cols // DOWNSAMPLE)
        self.cell_lng = grid.cell_lng * DOWNSAMPLE
        self.cell_lat = grid.cell_lat * DOWNSAMPLE
        self.min_lng = grid.min_lng
        self.min_lat = grid.min_lat

        # Pool population by summing the fine cells inside each coarse cell.
        usable = grid.pop[: self.rows * DOWNSAMPLE, : self.cols * DOWNSAMPLE]
        self.pop = usable.reshape(self.rows, DOWNSAMPLE, self.cols, DOWNSAMPLE).sum(axis=(1, 3))

        water = _geoms(get_water(city_id))
        green = _geoms(get_greenspace(city_id))
        flood = _geoms(
            get_flood(city_id),
            keep=lambda p: str(p.get("level", "")).lower() in ("high", "medium"),
        )
        roads = [
            g for g in (_valid(r.get("geometry")) for r in ds.roads) if g is not None
        ]

        self.water_mask = self._sample(water)
        self.green_mask = self._sample(green)
        self.flood_mask = self._sample(flood)
        self.road_mask = self._sample_lines(roads)

        # Population is normalised against its own 95th percentile: an absolute
        # people-per-cell scale would make every rural district effectively
        # costless and every dense one uniformly maximal.
        pop_ref = float(np.percentile(self.pop[self.pop > 0], 95)) if (self.pop > 0).any() else 0.0
        pop_norm = np.clip(self.pop / pop_ref, 0.0, 1.0) if pop_ref > 0 else np.zeros_like(self.pop)

        cost = (
            BASE_COST
            + COST_WEIGHTS["water"] * self.water_mask
            + COST_WEIGHTS["green"] * self.green_mask
            + COST_WEIGHTS["flood"] * self.flood_mask
            + COST_WEIGHTS["population"] * pop_norm
        )
        cost = np.where(self.road_mask > 0, cost * ROAD_DISCOUNT, cost)
        self.cost = cost.astype(np.float64)

    # -- geometry helpers ---------------------------------------------------

    def centre(self, r: int, c: int) -> tuple[float, float]:
        return (
            self.min_lng + (c + 0.5) * self.cell_lng,
            self.min_lat + (r + 0.5) * self.cell_lat,
        )

    def cell_of(self, lng: float, lat: float) -> tuple[int, int]:
        c = int((lng - self.min_lng) / self.cell_lng)
        r = int((lat - self.min_lat) / self.cell_lat)
        return max(0, min(self.rows - 1, r)), max(0, min(self.cols - 1, c))

    def _sample(self, polys: list) -> np.ndarray:
        """Binary coverage by centre-point test against a polygon set."""
        mask = np.zeros((self.rows, self.cols), dtype=np.float64)
        if not polys:
            return mask
        tree = STRtree(polys)
        for r in range(self.rows):
            for c in range(self.cols):
                lng, lat = self.centre(r, c)
                pt = Point(lng, lat)
                for idx in tree.query(pt):
                    if polys[int(idx)].contains(pt):
                        mask[r, c] = 1.0
                        break
        return mask

    def _sample_lines(self, lines: list) -> np.ndarray:
        """Cells a road alignment passes through."""
        mask = np.zeros((self.rows, self.cols), dtype=np.float64)
        if not lines:
            return mask
        tree = STRtree(lines)
        for r in range(self.rows):
            for c in range(self.cols):
                lng, lat = self.centre(r, c)
                cell = box(
                    lng - self.cell_lng / 2, lat - self.cell_lat / 2,
                    lng + self.cell_lng / 2, lat + self.cell_lat / 2,
                )
                for idx in tree.query(cell):
                    if lines[int(idx)].intersects(cell):
                        mask[r, c] = 1.0
                        break
        return mask


_SURFACE_CACHE: dict[str, tuple[str, CostSurface]] = {}


def cost_surface(city_id: str) -> CostSurface:
    """Cost surface for a city, rebuilt only when its source layers change."""
    signature = f"{data_signature(city_id)}|{ANALYTIC_VERSION}"
    hit = _SURFACE_CACHE.get(city_id)
    if hit and hit[0] == signature:
        return hit[1]
    with singleflight(("corridor-surface", city_id, signature)):
        hit = _SURFACE_CACHE.get(city_id)
        if hit and hit[0] == signature:
            return hit[1]
        surface = CostSurface(city_id)
        _SURFACE_CACHE[city_id] = (signature, surface)
        return surface


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    dx = (a[0] - b[0]) * 111.320 * math.cos(math.radians((a[1] + b[1]) / 2))
    dy = (a[1] - b[1]) * 110.574
    return math.hypot(dx, dy)


def _dijkstra(surface: CostSurface, start: tuple[int, int], goal: tuple[int, int]) -> list[tuple[int, int]]:
    """8-connected least-cost path. Edge weight is mean cell cost × ground distance.

    Weighting by distance as well as cost matters on a lat/lng grid: a diagonal
    step covers ~1.4 cells of ground, and without it the search would treat
    diagonals as a free shortcut and produce a staircase that is cheap on paper
    and longer to build.
    """
    rows, cols = surface.rows, surface.cols
    cost = surface.cost
    lat_scale = surface.cell_lat * _M_PER_DEG_LAT / 1000.0
    lng_scale = (
        surface.cell_lng * 111.320 * math.cos(math.radians(surface.min_lat + rows * surface.cell_lat / 2))
    )

    dist = np.full((rows, cols), np.inf)
    prev = np.full((rows, cols, 2), -1, dtype=np.int32)
    dist[start] = 0.0
    heap = [(0.0, start[0], start[1])]
    steps = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]

    while heap:
        d, r, c = heapq.heappop(heap)
        if (r, c) == goal:
            break
        if d > dist[r, c]:
            continue
        for dr, dc in steps:
            nr, nc = r + dr, c + dc
            if not (0 <= nr < rows and 0 <= nc < cols):
                continue
            ground = math.hypot(dr * lat_scale, dc * lng_scale)
            step = (cost[r, c] + cost[nr, nc]) / 2.0 * ground
            nd = d + step
            if nd < dist[nr, nc]:
                dist[nr, nc] = nd
                prev[nr, nc] = (r, c)
                heapq.heappush(heap, (nd, nr, nc))

    if not np.isfinite(dist[goal]):
        return []
    path = [goal]
    cur = goal
    while cur != start:
        pr, pc = prev[cur[0], cur[1]]
        if pr < 0:
            return []
        cur = (int(pr), int(pc))
        path.append(cur)
    path.reverse()
    return path


def route(city_id: str, start: tuple[float, float], end: tuple[float, float]) -> dict:
    """Least-cost alignment between two points, with what it costs to build.

    The straight line is reported alongside it. A corridor tool that only
    returns its own answer cannot be checked; showing the detour it chose, and
    what that detour avoided, is what makes the recommendation arguable.
    """
    surface = cost_surface(city_id)
    s = surface.cell_of(*start)
    g = surface.cell_of(*end)
    if s == g:
        return {"city": city_id, "found": False, "reason": "start and end fall in the same cell"}

    cells = _dijkstra(surface, s, g)
    if not cells:
        return {"city": city_id, "found": False, "reason": "no route across the study area"}

    coords = [list(surface.centre(r, c)) for r, c in cells]
    length_km = sum(_km(tuple(coords[i]), tuple(coords[i + 1])) for i in range(len(coords) - 1))

    # The cost surface spans the wards, which is the study area — a request
    # outside it is snapped to the nearest cell rather than refused. The detour
    # must then be measured against the route actually attempted, not against
    # the line the caller asked for: comparing a snapped 28 km route to an
    # unsnapped 38 km straight line reports a corridor shorter than the
    # straight line between its own endpoints, which is impossible.
    snapped_start = tuple(coords[0])
    snapped_end = tuple(coords[-1])
    straight_km = _km(snapped_start, snapped_end)
    start_offset = _km(start, snapped_start)
    end_offset = _km(end, snapped_end)
    # Half a cell diagonal is ordinary rounding onto the grid; beyond that the
    # point lay outside the study area and the caller should be told.
    snap_tolerance = surface.cell_lat * _M_PER_DEG_LAT / 1000.0
    clamped = start_offset > snap_tolerance or end_offset > snap_tolerance

    water_cells = sum(1 for r, c in cells if surface.water_mask[r, c] > 0)
    green_cells = sum(1 for r, c in cells if surface.green_mask[r, c] > 0)
    flood_cells = sum(1 for r, c in cells if surface.flood_mask[r, c] > 0)
    road_cells = sum(1 for r, c in cells if surface.road_mask[r, c] > 0)

    # People the corridor would serve: population of every cell it touches plus
    # its immediate neighbours, which at ~1 km cells is roughly a 1.5 km catchment.
    served = 0.0
    seen: set[tuple[int, int]] = set()
    for r, c in cells:
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                nr, nc = r + dr, c + dc
                if 0 <= nr < surface.rows and 0 <= nc < surface.cols and (nr, nc) not in seen:
                    seen.add((nr, nc))
                    served += float(surface.pop[nr, nc])

    return {
        "city": city_id,
        "found": True,
        "path": coords,
        "cells": len(cells),
        "length_km": round(length_km, 2),
        "straight_km": round(straight_km, 2),
        "requested": {"start": list(start), "end": list(end)},
        "snapped": {"start": list(snapped_start), "end": list(snapped_end)},
        "clamped": bool(clamped),
        "snap_offset_km": {"start": round(start_offset, 2), "end": round(end_offset, 2)},
        "detour_pct": round((length_km / straight_km - 1) * 100, 1) if straight_km > 0 else 0.0,
        "cell_km": round(surface.cell_lat * _M_PER_DEG_LAT / 1000.0, 2),
        "weights": COST_WEIGHTS,
        "impact": {
            "population_served": int(round(served)),
            "water_crossings": water_cells,
            "green_cells": green_cells,
            "flood_cells": flood_cells,
            "existing_road_cells": road_cells,
            "reuse_pct": round(road_cells / len(cells) * 100, 1),
        },
    }
