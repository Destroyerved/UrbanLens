"""Scoring primitives, project specifications and source-data benchmarks.

Every score in the platform routes through these functions, so results are
deterministic and explainable — no random numbers, no black boxes (PRD §70).
"""

from __future__ import annotations

from dataclasses import dataclass, field


def clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def decay_score(x: float | None, good: float, bad: float) -> float:
    """Cost → score. 100 at or below `good`, 0 at or above `bad`, linear between.

    Used for "smaller is better" quantities such as distance-to-facility.
    """
    if x is None or not (isinstance(x, (int, float)) and x == x and x < float("inf")):
        return 0.0
    if x <= good:
        return 100.0
    if x >= bad:
        return 0.0
    return 100.0 * (bad - x) / (bad - good)


def norm(x: float, lo: float, hi: float) -> float:
    """Linear normalise into 0..100."""
    if hi == lo:
        return 0.0
    return clamp(100.0 * (x - lo) / (hi - lo))


# ---------------------------------------------------------------------------
# Urban Development Suitability weights (PRD §18–19, user-adjustable)
# ---------------------------------------------------------------------------

WEIGHT_KEYS = (
    "accessibility",
    "population_need",
    "transit",
    "infrastructure",
    "environment",
    "land_compatibility",
)

DEFAULT_WEIGHTS: dict[str, float] = {
    "accessibility": 0.25,
    "population_need": 0.20,
    "transit": 0.15,
    "infrastructure": 0.15,
    "environment": 0.15,
    "land_compatibility": 0.10,
}

WEIGHT_LABELS = {
    "accessibility": "Accessibility",
    "population_need": "Population Need",
    "transit": "Transit",
    "infrastructure": "Infrastructure",
    "environment": "Environment",
    "land_compatibility": "Land Compatibility",
}


def final_score(breakdown: dict[str, float], weights: dict[str, float]) -> float:
    """Weighted blend, normalised by total weight so any weights are valid."""
    total = sum(weights.get(k, 0.0) for k in WEIGHT_KEYS)
    if total <= 0:
        return 0.0
    acc = sum(breakdown.get(k, 0.0) * weights.get(k, 0.0) for k in WEIGHT_KEYS)
    return clamp(acc / total)


# ---------------------------------------------------------------------------
# Projects (PRD §16)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProjectSpec:
    key: str
    label: str
    min_area_ha: float
    prefers_government: bool
    preferred_zoning: tuple[str, ...]
    service_radius_km: float
    # Facility type whose scarcity defines population need, and which the
    # simulator adds. None for projects that are not services.
    need_facility: str | None = None
    adds_facility: str | None = None


PROJECTS: dict[str, ProjectSpec] = {
    "hospital": ProjectSpec(
        "hospital", "Public Hospital", 2.0, True,
        ("public_semi_public", "residential", "mixed_use"), 4.0, "hospital", "hospital",
    ),
    "school": ProjectSpec(
        "school", "School", 0.8, True,
        ("public_semi_public", "residential", "mixed_use"), 1.5, "school", "school",
    ),
    "park": ProjectSpec(
        "park", "Public Park", 0.5, True,
        ("recreational", "residential", "public_semi_public"), 1.2, "park", "park",
    ),
    "fire_station": ProjectSpec(
        "fire_station", "Fire Station", 0.4, True,
        ("public_semi_public", "commercial", "mixed_use"), 5.0, "fire_station", "fire_station",
    ),
    "government_office": ProjectSpec(
        "government_office", "Government Office", 0.5, True,
        ("public_semi_public", "commercial", "mixed_use"), 3.0, "government_office", "government_office",
    ),
    "residential": ProjectSpec(
        "residential", "Residential Development", 1.0, False,
        ("residential", "mixed_use"), 2.0,
    ),
    "affordable_housing": ProjectSpec(
        "affordable_housing", "Affordable Housing", 1.0, True,
        ("residential", "mixed_use", "public_semi_public"), 2.0,
    ),
    "commercial": ProjectSpec(
        "commercial", "Commercial Zone", 0.5, False,
        ("commercial", "mixed_use"), 2.0,
    ),
    "industrial": ProjectSpec(
        "industrial", "Industrial Zone", 2.0, False,
        ("industrial",), 3.0,
    ),
    "mixed_use": ProjectSpec(
        "mixed_use", "Mixed-Use Development", 0.8, False,
        ("mixed_use", "commercial", "residential"), 2.0,
    ),
}

# Enough people to justify a service facility, and enough to register in a
# simulation. Site selection treats this as a constraint rather than a weight:
# "nobody new is served" disqualifies a service facility, it is not a minor
# deduction (PRD §74 step 7 lists existing provision as a check).
DEFAULT_MIN_UNSERVED = 5_000


# ---------------------------------------------------------------------------
# Source-data completeness
# ---------------------------------------------------------------------------

# Rough count of each facility type per 100,000 people in a reasonably served
# Indian city. NOT service standards to plan against — these exist only to judge
# how completely OpenStreetMap has mapped a type, so the UI can flag scores
# resting on thin data.
#
# This matters: OSM maps ~121 schools and ~141 transport stops across Ahmedabad,
# a city of 7.2M. Distance scores from that read as zero for outer wards, which
# says more about the map than the ward.
EXPECTED_PER_100K: dict[str, float] = {
    "hospital": 2,
    "clinic": 15,
    "school": 25,
    "college": 2,
    "park": 8,
    "fire_station": 0.5,
    "police_station": 1.5,
    "bus_stop": 40,
    "metro_station": 0.5,
    "government_office": 3,
}


def confidence_of(ratio: float) -> str:
    if ratio >= 0.6:
        return "high"
    if ratio >= 0.25:
        return "medium"
    return "low"


# ---------------------------------------------------------------------------
# Urban Livability (PRD §15)
# ---------------------------------------------------------------------------

LIVABILITY_WEIGHTS: dict[str, float] = {
    "healthcare": 0.18,
    "education": 0.16,
    "green_space": 0.14,
    "transportation": 0.16,
    "public_services": 0.10,
    "road_connectivity": 0.10,
    "environmental_quality": 0.16,
}


def livability_band(score: float) -> str:
    if score >= 80:
        return "excellent"
    if score >= 65:
        return "good"
    if score >= 50:
        return "moderate"
    return "poor"
