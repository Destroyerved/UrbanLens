"""City configuration.

Study areas are loaded from web/data/engine/gujarat_config.json — a single
machine-readable source generated from real OSM boundary data + Census 2011
populations (see web/scripts/generate-gujarat-config.mjs). The two legacy
composites below are views over the same district data and resolve in the
loader, so nothing is ever stored twice (PRD §38: nothing hard-coded to a city).

Ahmedabad is only the default; nothing else is hard-coded to it.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

# Layers are shared with the TypeScript engine rather than duplicated, so there
# is exactly one copy of the real data in the repo.
REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "web" / "data" / "engine"
MODEL_DIR = Path(__file__).resolve().parents[2] / "models"

GUJARAT_CONFIG_PATH = DATA_DIR / "gujarat_config.json"


@dataclass(frozen=True)
class Corridor:
    name: str
    bearing: float  # degrees, 0 = N
    width: float  # angular half-width for falloff
    reach_km: float


DEFAULT_CORRIDORS: list[Corridor] = [
    Corridor("North-West Corridor", 320, 40, 12.5),
    Corridor("SP Ring Road South", 190, 38, 11.0),
    Corridor("Eastern Industrial Corridor", 95, 34, 11.0),
]


@dataclass(frozen=True)
class City:
    id: str
    name: str
    state: str
    code: str
    center: tuple[float, float]  # lng, lat
    bbox: tuple[float, float, float, float]
    radius_km: float
    population: int
    zoom: float
    # District configs carry their kind; composites carry the district ids they
    # merge (the loader resolves them in memory — no duplicated files).
    kind: str = "district"
    composite_of: tuple[str, ...] = ()
    # Multiple urban cores: intensity takes the strongest, distances the
    # nearest. Without this a twin-city region peaks in the empty corridor
    # between its cities rather than at either one.
    cores: tuple[tuple[float, float], ...] = ()
    corridors: list[Corridor] = field(default_factory=lambda: list(DEFAULT_CORRIDORS))

    @property
    def urban_cores(self) -> tuple[tuple[float, float], ...]:
        return self.cores or (self.center,)


def _load_gujarat_config() -> dict:
    if not GUJARAT_CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"Missing {GUJARAT_CONFIG_PATH} — run web/scripts/fetch-talukas.mjs, "
            "filter-gujarat.mjs and generate-gujarat-config.mjs first."
        )
    with GUJARAT_CONFIG_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _cities_from_config() -> dict[str, City]:
    cfg = _load_gujarat_config()
    cities: dict[str, City] = {}

    for d in cfg.get("districts", []):
        cities[d["id"]] = City(
            id=d["id"],
            name=d["name"],
            state="Gujarat",
            code=d.get("code", d["id"][:3].upper()),
            center=tuple(d["center"]),
            bbox=tuple(d["bbox"]),
            radius_km=d.get("radius_km", 30),
            population=d["population"],
            zoom=d.get("zoom", 8.0),
            kind=d.get("kind", "district"),
        )

    # The Gujarat composite is a view over every district.
    if "gujarat" in cfg:
        g = cfg["gujarat"]
        cities["gujarat"] = City(
            id=g["id"],
            name=g["name"],
            state="Gujarat",
            code=g.get("code", "GJT"),
            center=tuple(g["center"]),
            bbox=tuple(g["bbox"]),
            radius_km=250,
            population=g["population"],
            zoom=g.get("zoom", 6.8),
            kind="composite",
            composite_of=tuple(g.get("composite_of", list(cities))),
        )

    return cities


GUJARAT_CITIES = _cities_from_config()

CITIES: dict[str, City] = dict(GUJARAT_CITIES)
DEFAULT_CITY = CITIES.get("ahmedabad", next(iter(CITIES.values())))


def get_city(city_id: str | None) -> City:
    if city_id and city_id in CITIES:
        return CITIES[city_id]
    return DEFAULT_CITY