"""Loads the real city layers and builds the derived spatial structures.

Layers are read from web/data/engine — the same files the TypeScript engine
serves — so there is one copy of the real data in the repo and the two backends
cannot drift apart on inputs.

Composites (gujarat) are views: they
carry no files of their own and are merged in memory from their member
districts, so nothing is ever stored twice (PRD §38).

── DB-READY ──────────────────────────────────────────────────────────────────
The filesystem is the default and only required backend. Pointing URBANLENS_DB
at a SQLite file makes every read go through the same Source interface instead;
imports/import-to-db.py populates that file, so the app runs unchanged either
way (PRD §41).

Everything here is cached per city: the raster and the facility distance fields
cost a couple of seconds to build and never change during a run.
"""

from __future__ import annotations

import json

try:
    import orjson
except ImportError:  # pragma: no cover
    orjson = None
import os
import sqlite3
import threading
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Protocol

import numpy as np

from app.core.config import DATA_DIR, REPO_ROOT, City, get_city
from app.core.cache import singleflight
from app.data.database import ensure_database
from app.data.normalise import decimate, normalise_facilities
from app.gis.raster import (
    PointIndex,
    PopulationGrid,
    build_population_grid,
)

FACILITY_TYPES = [
    "hospital", "clinic", "school", "college", "park",
    "fire_station", "police_station", "bus_stop", "metro_station", "government_office",
    "shop",
]

# Composites larger than this never merge the heavy detail layers: a 34-district
# merge would ship tens of MB to the browser and freeze it. Vegetation is exempt —
# it is a lightweight per-ward choropleth (all 34 districts merge to ~5 MB) and
# is what powers the statewide "Gujarat" view.
MAX_MERGE_MEMBERS = 4
HEAVY_LAYERS = {"land", "facilities", "roads", "greenspace", "water", "flood"}


class Source(Protocol):
    """A place layer documents come from: the filesystem or a database."""

    def load(self, city_id: str, name: str) -> dict[str, Any] | None: ...

    def fingerprint(self, city_id: str, name: str) -> str | float | None:
        """A value that changes whenever the layer content changes (file mtime,
        DB updated_at). Drives the cache key so a refresh is served immediately
        without a restart."""
        ...


class FilesystemSource:
    def load(self, city_id: str, name: str) -> dict[str, Any] | None:
        path = DATA_DIR / f"{city_id}_{name}.json"
        if not path.exists():
            return None
        if orjson is not None:
            return orjson.loads(path.read_bytes())
        with path.open("r", encoding="utf-8") as fh:
            return json.load(fh)

    def fingerprint(self, city_id: str, name: str) -> float | None:
        path = DATA_DIR / f"{city_id}_{name}.json"
        return path.stat().st_mtime if path.exists() else None


class SqliteSource:
    """SQLite layer source with cheap in-memory fingerprints.

    Fingerprints used to open a new SQLite connection for every cached request.
    Here they are refreshed in one query only when the DB file mtime changes.
    """

    def __init__(self, path: str | Path):
        requested = Path(path)
        try:
            self.path = ensure_database(requested)
        except (sqlite3.Error, OSError):
            # A prebuilt DB may live on a read-only deployment filesystem. It is
            # still perfectly usable as a source/cache; only future cache writes
            # are skipped. A missing read-only DB, however, is a real error.
            if not requested.exists():
                raise
            self.path = requested
        self._fp_lock = threading.RLock()
        self._fp_revision: tuple[int, int, int, int] | None = None
        self._fingerprints: dict[tuple[str, str], str] = {}

    def load(self, city_id: str, name: str) -> dict[str, Any] | None:
        conn = sqlite3.connect(f"file:{self.path}?mode=ro", uri=True, timeout=15)
        try:
            row = conn.execute(
                "SELECT data FROM layers WHERE city = ? AND layer = ?",
                (city_id, name),
            ).fetchone()
        finally:
            conn.close()
        return (orjson.loads(row[0]) if orjson is not None else json.loads(row[0])) if row else None

    def _revision(self) -> tuple[int, int, int, int]:
        def stat_pair(path: Path) -> tuple[int, int]:
            try:
                st = path.stat()
                return st.st_mtime_ns, st.st_size
            except OSError:
                return 0, 0
        main_mtime, main_size = stat_pair(self.path)
        wal_mtime, wal_size = stat_pair(Path(str(self.path) + "-wal"))
        return main_mtime, main_size, wal_mtime, wal_size

    def _refresh_fingerprints(self) -> None:
        revision = self._revision()
        if revision == self._fp_revision:
            return
        with self._fp_lock:
            revision = self._revision()
            if revision == self._fp_revision:
                return
            conn = sqlite3.connect(f"file:{self.path}?mode=ro", uri=True, timeout=15)
            try:
                rows = conn.execute("SELECT city, layer, updated_at FROM layers").fetchall()
            finally:
                conn.close()
            self._fingerprints = {(c, l): u for c, l, u in rows}
            self._fp_revision = revision

    def fingerprint(self, city_id: str, name: str) -> str | None:
        self._refresh_fingerprints()
        return self._fingerprints.get((city_id, name))


class HybridSource:
    """Prefer SQLite, fall back to canonical engine files per layer.

    A partially seeded DB therefore cannot hide water/flood or a newly-added
    district. This also makes a small demo DB safe to bundle with the project.
    """

    def __init__(self, primary: SqliteSource, fallback: FilesystemSource):
        self.primary = primary
        self.fallback = fallback

    def load(self, city_id: str, name: str) -> dict[str, Any] | None:
        return self.primary.load(city_id, name) or self.fallback.load(city_id, name)

    def fingerprint(self, city_id: str, name: str) -> str | float | None:
        fp = self.primary.fingerprint(city_id, name)
        return fp if fp is not None else self.fallback.fingerprint(city_id, name)


_DEFAULT_DB = REPO_ROOT / "backend" / "urbanlens.db"
_DB_ENV = os.environ.get("URBANLENS_DB")
ACTIVE_DB_PATH: Path | None = Path(_DB_ENV) if _DB_ENV else (_DEFAULT_DB if _DEFAULT_DB.exists() else None)

if ACTIVE_DB_PATH is not None:
    SOURCE: Source = HybridSource(SqliteSource(ACTIVE_DB_PATH), FilesystemSource())
else:
    SOURCE = FilesystemSource()



def _read(city_id: str, name: str) -> dict[str, Any] | None:
    return SOURCE.load(city_id, name)


def _as_number(v) -> float | None:
    """Coerce a numeric-able meta value to float. String numbers ('441.1')
    are accepted too — some member docs ship area_km2 as text."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v)
        except (TypeError, ValueError):
            return None
    return None


def _merge_docs(docs: list[dict[str, Any]]) -> dict[str, Any]:
    """Concatenate a member district's layer documents into one composite."""
    merged: dict[str, Any] = {"type": "FeatureCollection", "features": [], "meta": {}}
    for doc in docs:
        merged["features"].extend(doc.get("features", []))
        meta = doc.get("meta", {})
        for key, value in meta.items():
            num = _as_number(value)
            if num is not None:
                current = _as_number(merged["meta"].get(key))
                merged["meta"][key] = (current + num) if current is not None else value
            elif key not in merged["meta"]:
                merged["meta"][key] = value
    return merged


def _resolve_layer(city: City, name: str) -> dict[str, Any] | None:
    """Fetch a layer for a city: a single document for districts, an in-memory
    merge of every member district for composites.

    Heavy layers (land, facilities, roads, vegetation, greenspace) are skipped
    for composites wider than MAX_MERGE_MEMBERS — a 34-district merge would ship
    tens of MB to the browser and freeze it. Such composites are not offered as
    selectable datasets; the empty result here is defence-in-depth.
    """
    if not city.composite_of:
        return _read(city.id, name)
    if len(city.composite_of) > MAX_MERGE_MEMBERS and name in HEAVY_LAYERS:
        return None
    docs = [_read(m, name) for m in city.composite_of]
    docs = [d for d in docs if d is not None]
    if not docs:
        return None
    return _merge_docs(docs) if len(docs) > 1 else docs[0]


def _fingerprint(city: City, name: str) -> str:
    """A content fingerprint (file mtime / DB updated_at) so caches drop the
    moment a layer refreshes — no restart needed."""
    if not city.composite_of:
        return str(SOURCE.fingerprint(city.id, name))
    return "|".join(str(SOURCE.fingerprint(m, name)) for m in city.composite_of)


# Layer docs are FAT in RAM: a 12 MB parcels JSON becomes ~60-100 MB of Python
# dicts. Caching every district's every layer (34 x ~11) blew past Render free
# tier's 512 MB and OOM-restarted the service. 16 entries keeps the ACTIVE
# district's layers plus change; older districts reload from SQLite on demand.
@lru_cache(maxsize=16)
def _layer(name: str, city_id: str, fingerprint: str) -> dict[str, Any] | None:
    """Layer document, keyed by content fingerprint."""
    return _resolve_layer(get_city(city_id), name)


def _layer_doc(name: str, city_id: str | None) -> dict[str, Any] | None:
    city = get_city(city_id)
    return _layer(name, city.id, _fingerprint(city, name))


def get_vegetation(city_id: str | None = None) -> dict:
    """Per-ward NDVI choropleth: the engine JSON is already a FeatureCollection."""
    doc = _layer_doc("vegetation", city_id)
    if doc is None:
        city = get_city(city_id)
        raise FileNotFoundError(
            f"No vegetation layer for '{city.id}'. Run web/scripts/fetch-satellite.py first."
        )
    return doc


def get_greenspace(city_id: str | None = None) -> dict:
    """Green-space polygons (parks + green landuse), clipped to the city."""
    doc = _layer_doc("greenspace", city_id)
    if doc is None:
        city = get_city(city_id)
        raise FileNotFoundError(
            f"No greenspace layer for '{city.id}'. Run web/scripts/build-greenspace.py first."
        )
    return doc


def get_water(city_id: str | None = None) -> dict:
    """Water-body polygons (lakes, reservoirs, rivers), clipped to the city."""
    doc = _layer_doc("water", city_id)
    if doc is None:
        city = get_city(city_id)
        raise FileNotFoundError(
            f"No water layer for '{city.id}'. Run web/scripts/build-water-flood.py first."
        )
    return doc


def get_flood(city_id: str | None = None) -> dict:
    """Derived flood-susceptibility zones (high = water ±150 m, medium = 150–400 m)."""
    doc = _layer_doc("flood", city_id)
    if doc is None:
        city = get_city(city_id)
        raise FileNotFoundError(
            f"No flood layer for '{city.id}'. Run web/scripts/build-water-flood.py first."
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
    # Engine-only parcel-build geometry: the full street network (incl.
    # residential/service — the lines that actually bound blocks) and building
    # footprints around urban cores. Fetched by scripts/fetch_streets.py and
    # scripts/fetch_buildings.py; never served to the browser.
    streets: list[dict] = field(default_factory=list)
    buildings: list[dict] = field(default_factory=list)
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


# Datasets hold references into the _layer cache, so their own footprint is
# mostly the grid arrays + shells; 2 covers the active city and a mid-switch
# transition without letting every visited district pile up in RAM.
@lru_cache(maxsize=2)
def _dataset_build(city_id: str, signature: str) -> Dataset:
    city = get_city(city_id)

    wards_doc = _layer_doc("wards", city.id)
    if wards_doc is None:
        raise FileNotFoundError(
            f"No ward layer for '{city.id}'. Run the data pipeline in web/ first "
            f"(npm run data:wards)."
        )
    wards = wards_doc["features"]
    land_doc = _layer_doc("land", city.id)
    fac_doc = _layer_doc("facilities", city.id)
    road_doc = _layer_doc("roads", city.id)

    land = land_doc["features"] if land_doc else []
    # India's OSM over-tags hospitals; normalising here keeps this backend and
    # the TypeScript engine reporting the same facility counts.
    facilities = normalise_facilities(fac_doc["features"]) if fac_doc else []
    roads = road_doc["features"] if road_doc else []

    streets_doc = _layer_doc("streets", city.id)
    buildings_doc = _layer_doc("buildings", city.id)
    streets = streets_doc["features"] if streets_doc else []
    buildings = buildings_doc["features"] if buildings_doc else []

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
        streets=streets,
        buildings=buildings,
    )


DATASET_LAYERS = ("wards", "land", "facilities", "roads")

# Bump when the *derivation* changes rather than the source layers — parcel
# geometry/attribute logic, scoring, the bootstrap row format. Without this the
# signature only tracks input files, so a code fix keeps serving the values it
# was meant to correct out of the persisted SQLite caches.
#   2 — parcel area for gap-fill parcels was square degrees, not square metres
#   3 — rapid-conversion threshold lowered to a value the history model can reach
DERIVATION_VERSION = "3"


def data_signature(city_id: str | None = None, layers: tuple[str, ...] = DATASET_LAYERS) -> str:
    """Stable content signature used by every derived cache."""
    city = get_city(city_id)
    parts = [*(_fingerprint(city, name) for name in layers), f"d{DERIVATION_VERSION}"]
    # Observed built-up history depends on the downloaded raster floors, not just
    # the base GIS layers — re-fetching/updating rasters must invalidate the
    # parcel history and every downstream forecast cache.
    for d in (REPO_ROOT / "datasets" / "ghsl", REPO_ROOT / "datasets" / "esri"):
        if d.is_dir():
            files = sorted(d.glob("*.tif"))
            if files:
                parts.append("r" + str(abs(sum(f.stat().st_size for f in files))))
    return "|".join(parts)


def get_dataset(city_id: str | None = None) -> Dataset:
    city = get_city(city_id)
    signature = data_signature(city.id)
    with singleflight(("dataset", city.id, signature)):
        return _dataset_build(city.id, signature)