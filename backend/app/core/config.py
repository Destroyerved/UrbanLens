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
import os
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
    risk: str


DEFAULT_CORRIDORS: list[Corridor] = [
    Corridor("North-West Corridor", 320, 40, 12.5, "Very High"),
    Corridor("SP Ring Road South", 190, 38, 11.0, "High"),
    Corridor("Eastern Industrial Corridor", 95, 34, 11.0, "High"),
]

GANDHINAGAR_AXIS = Corridor("Gandhinagar Corridor", 8, 26, 26.0, "Very High")


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

    return cities


GUJARAT_CITIES = _cities_from_config()


# ---------------------------------------------------------------------------
# Active study areas
# ---------------------------------------------------------------------------
#
# The generated config describes all 34 Gujarat districts, but serving them all
# is what made the product unusable: 226,650 parcels, 150 MB of layers, and a
# startup that pinned the CPU for tens of minutes building districts nobody had
# asked for. The analysis is scoped to the Ahmedabad–Gandhinagar metropolitan
# region and the districts that physically border it.
#
# Widening this is a one-line change — every id below exists in the generated
# config and its layer files are already committed — so the limit is editorial,
# not technical. Set URBANLENS_AREAS to a comma-separated list of district ids
# (or "all") to override without touching code.

CORE_DISTRICTS = ("ahmedabad", "gandhinagar")

# The five districts whose boundaries touch Ahmedabad or Gandhinagar. Measured
# from the bounding boxes in the generated config, not assumed.
NEIGHBOUR_DISTRICTS = ("kheda", "mahesana", "sabarkantha", "aravalli", "patan")

ACTIVE_DISTRICTS = CORE_DISTRICTS + NEIGHBOUR_DISTRICTS


# The two metropolitan views. Both carry their own committed layer files
# (ahmedabad-gandhinagar_*.json, ahmedabad-metro_*.json) built on real ward and
# taluka boundaries, so they load like any other area rather than being merged
# at request time. AMR extends past the corporation limits into the peri-urban
# talukas, which is where the growth actually is.
AHMEDABAD_GANDHINAGAR = City(
    id="ahmedabad-gandhinagar",
    name="Ahmedabad–Gandhinagar",
    state="Gujarat",
    code="AGR",
    center=(72.58, 23.11),
    bbox=(72.4493, 22.9139, 72.7015, 23.3113),
    radius_km=26,
    population=7_550_000,
    zoom=10.2,
    kind="region",
    cores=((72.5714, 23.0225), (72.6369, 23.2231)),
    corridors=[GANDHINAGAR_AXIS, *DEFAULT_CORRIDORS],
)

AHMEDABAD_METRO = City(
    id="ahmedabad-metro",
    name="Ahmedabad Metro Region",
    state="Gujarat",
    code="AMR",
    center=(72.55, 23.08),
    bbox=(72.0893, 22.7706, 72.8426, 23.4355),
    radius_km=45,
    population=8_651_395,
    zoom=9.3,
    kind="region",
    cores=((72.5714, 23.0225), (72.6369, 23.2231)),
    corridors=[GANDHINAGAR_AXIS, *DEFAULT_CORRIDORS],
)

REGIONS: dict[str, City] = {c.id: c for c in (AHMEDABAD_GANDHINAGAR, AHMEDABAD_METRO)}


def _active_ids() -> tuple[str, ...]:
    raw = os.environ.get("URBANLENS_AREAS", "").strip()
    if not raw:
        return ACTIVE_DISTRICTS
    if raw.lower() == "all":
        return tuple(GUJARAT_CITIES)
    wanted = tuple(x.strip() for x in raw.split(",") if x.strip())
    return tuple(x for x in wanted if x in GUJARAT_CITIES) or ACTIVE_DISTRICTS


# Order matters: it is the order the switcher shows. Core cities first, then the
# two regional views, then the bordering districts.
_ids = _active_ids()
CITIES: dict[str, City] = {}
for _cid in _ids:
    if _cid in CORE_DISTRICTS:
        CITIES[_cid] = GUJARAT_CITIES[_cid]
CITIES.update(REGIONS)
for _cid in _ids:
    if _cid not in CITIES:
        CITIES[_cid] = GUJARAT_CITIES[_cid]

DEFAULT_CITY = CITIES.get("ahmedabad", next(iter(CITIES.values())))


def get_city(city_id: str | None) -> City:
    if city_id and city_id in CITIES:
        return CITIES[city_id]
    return DEFAULT_CITY