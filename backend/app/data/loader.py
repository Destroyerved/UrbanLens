"""Loads the real city layers and builds the derived spatial structures.

Layers are read from web/data/engine — the same files the TypeScript engine
serves — so there is one copy of the real data in the repo and the two backends
cannot drift apart on inputs.

Everything here is cached per city: the raster and the facility distance fields
cost a couple of seconds to build and never change during a run.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

import numpy as np

from app.core.config import DATA_DIR, City, get_city
from app.data.normalise import decimate, normalise_facilities
from app.gis.raster import (
    PointIndex,
    PopulationGrid,
    build_population_grid,
)

FACILITY_TYPES = [
    "hospital", "clinic", "school", "college", "park",
    "fire_station", "police_station", "bus_stop", "metro_station", "government_office",
]


def _read(city_id: str, name: str) -> dict[str, Any] | None:
    path = DATA_DIR / f"{city_id}_{name}.json"
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=8)
def get_vegetation(city_id: str | None = None) -> dict:
    """Per-ward NDVI choropleth: the engine JSON is already a FeatureCollection."""
    city = get_city(city_id)
    doc = _read(city.id, "vegetation")
    if doc is None:
        raise FileNotFoundError(
            f"No vegetation layer for '{city.id}'. Run web/scripts/fetch-satellite.py first."
        )
    return doc


@lru_cache(maxsize=8)
def get_greenspace(city_id: str | None = None) -> dict:
    """Green-space polygons (parks + green landuse), clipped to the city."""
    city = get_city(city_id)
    doc = _read(city.id, "greenspace")
    if doc is None:
        raise FileNotFoundError(
            f"No greenspace layer for '{city.id}'. Run web/scripts/build-greenspace.py first."
        )
    return doc


@dataclass
class Dataset:
    city: City
    wards: list[dict]
    land: list[dict]
    facilities: list[dict]
    roads: list[dict]
    ward_meta: dict[str, Any]
    grid: PopulationGrid
    facility_index: dict[str, PointIndex] = field(default_factory=dict)
    road_index: PointIndex | None = None
    # Per-cell distance to the nearest facility of each type, computed lazily.
    _facility_distance: dict[str, np.ndarray] = field(default_factory=dict)

    def facility_distance_field(self, facility_type: str) -> np.ndarray:
        """Distance from every populated cell to the nearest facility of a type.

        Computed once per type and reused, which turns "how many people here are
        not already served?" into a windowed sum rather than a per-parcel scan of
        every facility.
        """
        cached = self._facility_distance.get(facility_type)
        if cached is not None:
            return cached

        idx = self.facility_index.get(facility_type)
        lng_g, lat_g = self.grid.cell_centres()
        if idx is None or len(idx) == 0:
            field_arr = np.full(lng_g.shape, np.inf)
        else:
            field_arr = idx.nearest_km_many(lng_g, lat_g)
            # Unpopulated cells never matter to a service question.
            field_arr = np.where(self.grid.pop > 0, field_arr, np.inf)
        self._facility_distance[facility_type] = field_arr
        return field_arr

    @property
    def population(self) -> int:
        return int(round(self.grid.total))


@lru_cache(maxsize=8)
def get_dataset(city_id: str | None = None) -> Dataset:
    city = get_city(city_id)

    wards_doc = _read(city.id, "wards")
    if wards_doc is None:
        raise FileNotFoundError(
            f"No ward layer for '{city.id}'. Run the data pipeline in web/ first "
            f"(npm run data:wards)."
        )
    wards = wards_doc["features"]
    land_doc = _read(city.id, "land")
    fac_doc = _read(city.id, "facilities")
    road_doc = _read(city.id, "roads")

    land = land_doc["features"] if land_doc else []
    # India's OSM over-tags hospitals; normalising here keeps this backend and
    # the TypeScript engine reporting the same facility counts.
    facilities = normalise_facilities(fac_doc["features"]) if fac_doc else []
    roads = road_doc["features"] if road_doc else []

    grid = build_population_grid(wards)

    by_type: dict[str, list[tuple[float, float]]] = {t: [] for t in FACILITY_TYPES}
    for f in facilities:
        t = f["properties"].get("facility_type")
        if t in by_type:
            lng, lat = f["geometry"]["coordinates"]
            by_type[t].append((lng, lat))
    facility_index = {t: PointIndex(pts) for t, pts in by_type.items()}

    # Distance-to-road uses nearest road vertex — a fast, city-scale-accurate
    # approximation that avoids per-segment projection. Rivers are excluded.
    verts: list[tuple[float, float]] = []
    for r in roads:
        if r["properties"].get("road_type") == "river":
            continue
        for c in decimate(r["geometry"]["coordinates"]):
            verts.append((c[0], c[1]))
    road_index = PointIndex(verts)

    return Dataset(
        city=city,
        wards=wards,
        land=land,
        facilities=facilities,
        roads=roads,
        ward_meta=wards_doc.get("meta", {}),
        grid=grid,
        facility_index=facility_index,
        road_index=road_index,
    )
