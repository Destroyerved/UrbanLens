"""City configuration.

Mirrors web/lib/engine/config.ts so both backends describe the same study areas.
Ahmedabad is only the default; nothing else is hard-coded to it (PRD §38).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

# Layers are shared with the TypeScript engine rather than duplicated, so there
# is exactly one copy of the real data in the repo.
REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "web" / "data" / "engine"
MODEL_DIR = Path(__file__).resolve().parents[2] / "models"


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
    # Multiple urban cores: intensity takes the strongest, distances the
    # nearest. Without this a twin-city region peaks in the empty corridor
    # between its cities rather than at either one.
    cores: tuple[tuple[float, float], ...] = ()
    corridors: list[Corridor] = field(default_factory=lambda: list(DEFAULT_CORRIDORS))

    @property
    def urban_cores(self) -> tuple[tuple[float, float], ...]:
        return self.cores or (self.center,)


AHMEDABAD = City(
    id="ahmedabad",
    name="Ahmedabad",
    state="Gujarat",
    code="AHD",
    center=(72.5714, 23.0225),
    bbox=(72.4493, 22.9139, 72.7015, 23.1405),
    radius_km=14,
    population=7_200_000,
    zoom=11.2,
)

GANDHINAGAR = City(
    id="gandhinagar",
    name="Gandhinagar",
    state="Gujarat",
    code="GNR",
    center=(72.6369, 23.2231),
    bbox=(72.5408, 23.0883, 72.7008, 23.3113),
    radius_km=13,
    population=350_000,
    zoom=11.4,
)

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
    cores=(AHMEDABAD.center, GANDHINAGAR.center),
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
    cores=(AHMEDABAD.center, GANDHINAGAR.center),
    corridors=[GANDHINAGAR_AXIS, *DEFAULT_CORRIDORS],
)

CITIES: dict[str, City] = {c.id: c for c in (AHMEDABAD, GANDHINAGAR, AHMEDABAD_GANDHINAGAR, AHMEDABAD_METRO)}
DEFAULT_CITY = AHMEDABAD


def get_city(city_id: str | None) -> City:
    if city_id and city_id in CITIES:
        return CITIES[city_id]
    return DEFAULT_CITY
