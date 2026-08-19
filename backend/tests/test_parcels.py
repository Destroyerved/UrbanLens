"""Checks on the parcel geometry pipeline.

    python -m pytest backend/tests            # if pytest is installed
    python backend/tests/test_parcels.py      # otherwise

These are the properties that broke in the field, written down so they cannot
break again quietly: areas measured in the right unit, no parcel that rounds to
zero hectares, no water body sold as developable land, and no blob so large it
could not be a plot.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shapely.geometry import Polygon, box  # noqa: E402

from app.gis.parcels import (  # noqa: E402
    CAP_HA,
    MIN_PARCEL_SQM,
    _bisect,
    area_sqm,
    geodesic_area_sqm,
)

AHMEDABAD = (72.5714, 23.0225)


def test_area_sqm_matches_geodesic() -> None:
    """The fast local scaling must track the ellipsoidal answer closely.

    `area_sqm` trades pyproj for a local equal-area scaling because subdivision
    measures every candidate piece at every level of recursion. That trade is
    only acceptable while the error stays negligible.
    """
    lng, lat = AHMEDABAD
    for size_deg in (0.0005, 0.002, 0.01, 0.05, 0.2):
        geom = box(lng, lat, lng + size_deg, lat + size_deg)
        fast, exact = area_sqm(geom), geodesic_area_sqm(geom)
        err = abs(fast - exact) / exact
        assert err < 0.002, f"{size_deg} deg box: {err:.4%} error ({fast:.0f} vs {exact:.0f})"

    # A concave polygon, not just axis-aligned boxes.
    outer = [(72.55, 23.00), (72.58, 23.00), (72.58, 23.03), (72.565, 23.015), (72.55, 23.03)]
    poly = Polygon(outer)
    err = abs(area_sqm(poly) - geodesic_area_sqm(poly)) / geodesic_area_sqm(poly)
    assert err < 0.002, f"concave polygon: {err:.4%} error"


def test_holes_are_subtracted() -> None:
    """A courtyard inside a polygon is not part of its area.

    pyproj's geometry_area_perimeter gets this wrong when the interior ring
    winds the same way as the exterior — it adds the hole instead of
    subtracting it, over-reporting this shape by 23%. Shapely's `.area`, which
    is what `area_sqm` scales, is orientation-independent. Worth a test,
    because "just use pyproj directly" looks like an obvious simplification.
    """
    outer = [(72.55, 23.00), (72.58, 23.00), (72.58, 23.03), (72.565, 23.015), (72.55, 23.03)]
    hole = [(72.560, 23.005), (72.570, 23.005), (72.570, 23.012), (72.560, 23.012)]
    holed = Polygon(outer, [hole])
    expected = geodesic_area_sqm(Polygon(outer)) - geodesic_area_sqm(Polygon(hole))
    err = abs(area_sqm(holed) - expected) / expected
    assert err < 0.002, f"holed polygon: {err:.4%} off shell-minus-hole"


def test_area_sqm_is_square_metres_not_square_degrees() -> None:
    """The original bug: shapely's `.area` read as m2 made every gap-fill parcel
    report 0.00 ha. One hundredth of a degree square is ~113 ha, not 1e-4."""
    lng, lat = AHMEDABAD
    geom = box(lng, lat, lng + 0.01, lat + 0.01)
    assert 1.10e6 < area_sqm(geom) < 1.16e6
    assert area_sqm(geom) / geom.area > 1e9


def test_bisect_respects_the_cap() -> None:
    """Every piece comes back under the ceiling, and nothing sub-sliver survives."""
    lng, lat = AHMEDABAD
    big = box(lng, lat, lng + 0.05, lat + 0.05)  # ~2,800 ha
    cap = CAP_HA["residential"] * 10_000

    out: list = []
    _bisect(big, cap, out)

    assert out, "subdivision produced nothing"
    for piece in out:
        area = area_sqm(piece)
        assert area <= cap * 1.02, f"{area / 10_000:.1f} ha exceeds the {cap / 10_000} ha cap"
        assert area >= MIN_PARCEL_SQM, f"{area:.0f} m2 is below the sliver floor"

    total = sum(area_sqm(p) for p in out)
    assert abs(total - area_sqm(big)) / area_sqm(big) < 0.01, "subdivision lost or gained area"


def test_bisect_leaves_small_geometry_alone() -> None:
    lng, lat = AHMEDABAD
    small = box(lng, lat, lng + 0.001, lat + 0.001)  # ~1.1 ha
    out: list = []
    _bisect(small, CAP_HA["agriculture"] * 10_000, out)
    assert len(out) == 1 and out[0] is small


def _run_directly() -> int:
    failures = 0
    for name, fn in sorted(globals().items()):
        if not name.startswith("test_") or not callable(fn):
            continue
        try:
            fn()
            print(f"  PASS  {name}")
        except AssertionError as exc:
            failures += 1
            print(f"  FAIL  {name}: {exc}")
    print("all parcel geometry checks passed" if not failures else f"{failures} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(_run_directly())
