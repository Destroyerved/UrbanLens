"""Exercise every analytic against every Gujarat district.

The engine is developed against Ahmedabad, which is the one district with
digitised municipal wards, the densest OpenStreetMap coverage and the most
complete environmental layers. An analytic can pass there and still divide by
zero in Dang (two wards), time out in Kutch (131,000 parcels) or return an
empty distribution in a district whose green-space layer has no polygons.

    python scripts/verify-analytics.py                 # every district
    python scripts/verify-analytics.py kutch dang      # named districts only

Exit code is non-zero if any check fails, so this can gate a release.
"""

from __future__ import annotations

import sys
import time
import traceback
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.core.config import CITIES  # noqa: E402


def check_equity(city_id: str) -> str:
    from app.gis.analysis import equity

    r = equity(city_id)
    wards = r.get("wards") or []
    if not wards:
        return "no wards"
    dep = r["deprivation"]
    if not 0 <= dep["population_share_pct"] <= 100:
        return f"share out of range: {dep['population_share_pct']}"
    g = r["inequality"]["composite"]["gini"]
    if not 0 <= g <= 1:
        return f"gini out of range: {g}"
    if r["floor"] <= 0:
        return f"non-positive floor: {r['floor']}"
    # The priority list must discriminate even when nobody is below the floor.
    if len(wards) > 1 and len({w["priority"] for w in r["priorities"]}) == 1:
        return "priority list does not discriminate"
    return f"ok — {len(wards)} wards, floor {r['floor']}, {dep['population_share_pct']}% below"


def check_conservation(city_id: str) -> str:
    from app.gis.conservation import conservation

    r = conservation(city_id)
    cells = r.get("cells") or []
    if not cells:
        return "no prediction cells"
    s = r["summary"]
    if not 0 <= s["share_at_risk_pct"] <= 100:
        return f"share out of range: {s['share_at_risk_pct']}"
    for c in cells[:50]:
        if not 0 <= c["sensitivity"] <= 100:
            return f"sensitivity out of range: {c['sensitivity']}"
        if not 0 <= c["pressure"] <= 1:
            return f"pressure out of range: {c['pressure']}"
    return f"ok — {len(cells)} cells, {s['cells_at_risk']} at risk ({s['share_at_risk_pct']}%)"


def check_encroachment(city_id: str) -> str:
    from app.gis.conservation import encroachment

    r = encroachment(city_id)
    s = r.get("summary") or {}
    cands = r.get("candidates") or []
    for c in cands[:50]:
        if c["parcel_source"] == "modelled-fill":
            return f"modelled parcel reported: {c['parcel_id']}"
        if not 0 < c["overlap_pct"] <= 100:
            return f"overlap out of range: {c['overlap_pct']}"
        if c["confidence"] not in ("likely", "review"):
            return f"bad confidence: {c['confidence']}"
    return f"ok — {s.get('candidates', 0)} candidates ({s.get('total_overlap_ha', 0)} ha)"


def check_corridor(city_id: str) -> str:
    from app.core.config import get_city
    from app.gis.corridor import route

    from app.gis.corridor import cost_surface

    # Sample inside the cost surface, not the district bbox. The surface spans
    # the wards, which for several districts is far smaller than the bounding
    # box — bbox corners would land outside the study area and be snapped, so
    # the test would measure clamping rather than routing.
    surf = cost_surface(city_id)
    a = surf.centre(int(surf.rows * 0.3), int(surf.cols * 0.3))
    b = surf.centre(int(surf.rows * 0.7), int(surf.cols * 0.7))
    r = route(city_id, a, b)
    if not r.get("found"):
        return f"FAIL no route ({r.get('reason')})"
    if r["length_km"] <= 0:
        return f"non-positive length: {r['length_km']}"
    if r["length_km"] < r["straight_km"] * 0.95:
        return f"route shorter than straight line: {r['length_km']} < {r['straight_km']}"
    if r["clamped"]:
        return f"endpoints clamped ({r['snap_offset_km']}) — sampled outside the surface"
    if len(r["path"]) < 2:
        return "degenerate path"
    return f"ok — {r['length_km']} km ({r['detour_pct']}% detour), serves {r['impact']['population_served']:,}"


def check_provenance(city_id: str) -> str:
    from app.data.loader import get_dataset
    from app.api.routes import _sources

    layers = _sources(get_dataset(city_id))
    if not layers:
        return "no layers"
    for name, meta in layers.items():
        if not meta.get("source") or not meta.get("detail"):
            return f"layer {name} missing provenance"
    return f"ok — {len(layers)} layers described"


CHECKS = [
    ("equity", check_equity),
    ("conservation", check_conservation),
    ("encroachment", check_encroachment),
    ("corridor", check_corridor),
    ("provenance", check_provenance),
]


def main() -> None:
    wanted = [a for a in sys.argv[1:] if not a.startswith("-")]
    districts = [c for c in CITIES.values() if c.kind == "district"]
    if wanted:
        districts = [c for c in districts if c.id in wanted]
    districts.sort(key=lambda c: c.id)

    failures: list[tuple[str, str, str]] = []
    for city in districts:
        print(f"\n=== {city.id} ({city.population:,} people) ===", flush=True)
        for name, fn in CHECKS:
            t0 = time.perf_counter()
            try:
                msg = fn(city.id)
                bad = msg.startswith("FAIL") or not msg.startswith("ok")
            except Exception as exc:  # noqa: BLE001 — a crash is a failure, keep going
                msg = f"EXCEPTION {type(exc).__name__}: {exc}"
                traceback.print_exc(limit=3)
                bad = True
            secs = time.perf_counter() - t0
            mark = "x" if bad else "+"
            print(f"  {mark} {name:<14} {secs:6.1f}s  {msg}", flush=True)
            if bad:
                failures.append((city.id, name, msg))

    print("\n" + "=" * 70)
    if failures:
        print(f"{len(failures)} failure(s) across {len(districts)} districts:")
        for city_id, name, msg in failures:
            print(f"  {city_id:<18} {name:<14} {msg}")
        sys.exit(1)
    print(f"All {len(CHECKS)} analytics pass across all {len(districts)} districts.")


if __name__ == "__main__":
    main()
