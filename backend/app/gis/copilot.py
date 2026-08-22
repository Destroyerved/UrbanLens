"""Natural-language routing to the GIS tools (PRD §28–29).

The copilot never computes a spatial answer itself. It interprets intent, picks
a tool, runs the real engine and explains the structured result — so every
number it reports came from the analysis, not from language.

Intent parsing here is deterministic pattern matching. Swapping in an LLM means
replacing only this file's `route()`; the tools below it, and the guarantee that
the model never invents a figure, stay exactly as they are.
"""

from __future__ import annotations

import re

from app.gis.analysis import (
    RAPID_CONVERSION_PTS,
    infrastructure_gaps,
    search_sites,
    suitability,
    zoning_conflicts,
)
from app.gis.parcels import get_parcels
from app.gis.scoring import PROJECTS

PROJECT_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("hospital", re.compile(r"hospital|health\s?care|clinic|medical", re.I)),
    ("school", re.compile(r"school|education", re.I)),
    ("park", re.compile(r"park|green\s?space|garden", re.I)),
    ("fire_station", re.compile(r"fire\s?station|fire", re.I)),
    ("government_office", re.compile(r"gov(ernment)?\s?office|civic", re.I)),
    ("affordable_housing", re.compile(r"affordable|low[-\s]?cost hous", re.I)),
    ("residential", re.compile(r"residential|housing", re.I)),
    ("commercial", re.compile(r"commercial|market|retail", re.I)),
    ("industrial", re.compile(r"industrial|factory|warehouse", re.I)),
    ("mixed_use", re.compile(r"mixed[-\s]?use", re.I)),
]

SERVICE_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("healthcare", re.compile(r"hospital|health", re.I)),
    ("education", re.compile(r"school|education|colleg", re.I)),
    ("parks", re.compile(r"park|green", re.I)),
    ("transportation", re.compile(r"transport|bus|metro|transit", re.I)),
    ("road_connectivity", re.compile(r"road", re.I)),
]

PARCEL_ID = re.compile(r"GJ-[A-Z]{2,4}-\d+", re.I)


def _detect_project(q: str) -> str:
    for key, pat in PROJECT_PATTERNS:
        if pat.search(q):
            return key
    return "hospital"


def _detect_service(q: str) -> str:
    for key, pat in SERVICE_PATTERNS:
        if pat.search(q):
            return key
    return "overall"


def route(city_id: str, query: str) -> dict:
    q = query.lower().strip()
    parcel_match = PARCEL_ID.search(query)

    # 1 — explain a named parcel, or the top site for a project
    if parcel_match or (re.search(r"why", q) and re.search(r"rank|best|site|parcel|location", q)):
        from app.data.loader import get_dataset

        ds = get_dataset(city_id)
        project = _detect_project(q)
        if parcel_match:
            target = parcel_match.group(0).upper()
            parcel = next((p for p in get_parcels(city_id) if p.parcel_id.upper() == target), None)
            if parcel:
                s = suitability(ds, parcel, project)
                return {
                    "tool": "explain_parcel",
                    "answer": (
                        f"Parcel {s['parcel_id']} scores {s['final']}/100 for a "
                        f"{PROJECTS[project].label.lower()}. "
                        + "; ".join(s["explanation"]["pros"][:3]) + "."
                    ),
                    "items": (
                        [{"label": p} for p in s["explanation"]["pros"]]
                        + [{"label": "⚠ " + c} for c in s["explanation"]["cons"]]
                    ),
                    "map": {
                        "highlight_parcel_ids": [s["parcel_id"]],
                        "focus": {"lng": s["centroid"][0], "lat": s["centroid"][1], "zoom": 14},
                    },
                }
        res = search_sites(city_id, project, low_flood_risk=True, limit=1)
        if res["results"]:
            top = res["results"][0]
            return {
                "tool": "explain_top_site",
                "answer": (
                    f"The top-ranked {PROJECTS[project].label.lower()} site is "
                    f"{top['parcel_id']} ({top['final']}/100). "
                    + "; ".join(top["explanation"]["pros"][:3]) + "."
                ),
                "items": [{"label": p} for p in top["explanation"]["pros"]],
                "map": {
                    "highlight_parcel_ids": [top["parcel_id"]],
                    "focus": {"lng": top["centroid"][0], "lat": top["centroid"][1], "zoom": 14},
                },
            }

    # 2 — site selection
    if re.search(r"where|best|site|locate|build|recommend|new", q) and any(
        pat.search(q) for _, pat in PROJECT_PATTERNS
    ):
        project = _detect_project(q)
        spec = PROJECTS[project]
        res = search_sites(
            city_id, project,
            government_land=bool(re.search(r"gov(ernment)?", q)) or spec.prefers_government,
            low_flood_risk=True, limit=5,
        )
        if not res["results"]:
            return {
                "tool": "site_search",
                "answer": f"No suitable parcels found for a {spec.label.lower()} under these constraints.",
            }
        top = res["results"][0]
        return {
            "tool": "site_search",
            "answer": (
                f"Evaluated {res['eligible']:,} eligible parcels. The best site for a "
                f"{spec.label.lower()} is {top['parcel_id']} ({top['final']}/100), "
                f"serving ~{top['pop']:,} residents. {top['explanation']['pros'][0]}."
            ),
            "items": [
                {
                    "id": r["parcel_id"], "label": f"#{i + 1} {r['parcel_id']}",
                    "sub": f"serves ~{r['pop']:,} · {r['metrics']['ownership']}",
                    "score": r["final"], "centroid": r["centroid"],
                }
                for i, r in enumerate(res["results"])
            ],
            "map": {
                "highlight_parcel_ids": [r["parcel_id"] for r in res["results"]],
                "focus": {"lng": top["centroid"][0], "lat": top["centroid"][1], "zoom": 12.5},
            },
        }

    # 3 — government / vacant land
    if re.search(r"gov(ernment)?", q) and re.search(
        r"land|parcel|plot|larger|vacant|hectare|acre|potential|opportunit", q
    ):
        num = re.search(r"(\d+(?:\.\d+)?)", q)
        wants_ha = bool(re.search(r"hectare|\bha\b", q))
        min_ha = (float(num.group(1)) * (1 if wants_ha else 0.4047)) if num else 0.0
        want_vacant = bool(re.search(r"vacant|empty|undeveloped|open", q))

        items = [p for p in get_parcels(city_id) if p.ownership == "government"]
        if min_ha:
            items = [p for p in items if p.area_sqm / 10_000 >= min_ha]
        if want_vacant:
            items = [p for p in items if p.land_use in ("vacant", "agriculture") and p.built_up_percent < 25]
        items.sort(key=lambda p: -p.scores.get("development_potential", 0.0))
        top = items[:8]
        return {
            "tool": "government_land",
            "answer": (
                f"Found {len(items)} government parcel{'' if len(items) == 1 else 's'}"
                + (f" larger than {min_ha:.1f} ha" if min_ha else "")
                + (" that are vacant / developable" if want_vacant else "")
                + ". Ranked by development potential below."
            ),
            "items": [
                {
                    "id": p.parcel_id, "label": p.parcel_id,
                    "sub": f"{p.area_acres} ac · {p.land_use}",
                    "score": round(p.scores.get("development_potential", 0.0)),
                    "centroid": list(p.centroid),
                }
                for p in top
            ],
            "map": {"highlight_parcel_ids": [p.parcel_id for p in top]},
        }

    # 4 — infrastructure gaps
    if re.search(r"ward|underserved|infrastructure|deficit|stress|lack|poor access|access to|shortage", q):
        service = _detect_service(q)
        gaps = infrastructure_gaps(city_id)
        ranked = gaps if service == "overall" else sorted(gaps, key=lambda w: w["scores"][service])
        worst = ranked[:6]
        label = "overall infrastructure" if service == "overall" else service.replace("_", " ")
        score_of = (lambda w: w["overall"]) if service == "overall" else (lambda w: w["scores"][service])
        return {
            "tool": "infrastructure_gaps",
            "answer": (
                f"{len(worst)} wards have the weakest {label} coverage. "
                f"{worst[0]['name']} is the most underserved ({score_of(worst[0])}/100, "
                f"{worst[0]['population']:,} residents)."
            ),
            "items": [
                {
                    "id": w["ward_code"], "label": w["name"],
                    "sub": f"{w['population']:,} residents",
                    "score": score_of(w), "centroid": w["centroid"],
                }
                for w in worst
            ],
            "map": {"ward_metric": "infrastructure"},
        }

    # 5 — zoning conflicts
    if re.search(r"zoning|violation|conflict|mismatch|encroach|illegal", q):
        conflicts = zoning_conflicts(city_id)
        top = conflicts[:8]
        return {
            "tool": "zoning_conflicts",
            "answer": (
                f"Detected {len(conflicts)} potential zoning conflicts where actual land use "
                "diverges from the official designation. Note that the official designation is "
                "modelled — development-plan sheets are not published machine-readably — so these "
                "demonstrate the detection method rather than reporting confirmed breaches."
            ),
            "items": [
                {
                    "id": c["parcel_id"], "label": c["parcel_id"],
                    "sub": f"{c['type']} (official: {c['official']})",
                    "centroid": c["centroid"],
                }
                for c in top
            ],
            "map": {"highlight_parcel_ids": [c["parcel_id"] for c in top]},
        }

    # 6 — land-use change
    if re.search(r"agricultur|conversion|converting|land[-\s]?use change|built[-\s]?up|urbanis|urbaniz", q):
        rows = [
            (p, p.history.get(2024, p.history.get(2026, 0)) - p.history.get(2018, 0))
            for p in get_parcels(city_id)
        ]
        rows = sorted(
            [r for r in rows if r[1] > RAPID_CONVERSION_PTS], key=lambda r: -r[1]
        )[:8]
        return {
            "tool": "land_use_change",
            "answer": (
                f"{len(rows)} parcels show rapid conversion to built-up land since 2018"
                + (f" (up to +{rows[0][1]} points)." if rows else ".")
                + " Built-up history is observed from Esri satellite land-cover data (2018/2022/2024)."
            ),
            "items": [
                {
                    "id": p.parcel_id, "label": p.parcel_id,
                    "sub": f"+{d} pts built-up · now {p.land_use}",
                    "centroid": list(p.centroid),
                }
                for p, d in rows
            ],
            "map": {"highlight_parcel_ids": [p.parcel_id for p, _ in rows]},
        }

    # 7 — landmarks & location geocoding
    if re.search(r"where is|locate|search for|take me to|find|navigate|institute of advanced research|\biar\b|gift city|science city|stadium|ashram|kankaria|sachivalaya|high court|iit|iim|cept|nid|daiict|pdpu|nirma|gnlu|nfsu", q):
        from app.gis.geocoding import search_locations
        clean_loc = re.sub(
            r"(?i)^(where is|search for|take me to|locate|find|navigate to|go to|fly to|show me)\s+",
            "",
            query,
        ).strip()
        locs = search_locations(clean_loc or query, city_id=city_id, limit=5)
        if locs:
            top_loc = locs[0]
            coord = top_loc["coord"]
            target_city = top_loc.get("city_id")
            auto_actions = []
            if target_city and target_city != city_id:
                auto_actions.append({"type": "setCity", "cityId": target_city})
            auto_actions.append({
                "type": "pinpointLocation",
                "location": top_loc,
            })
            return {
                "tool": "locate_place",
                "location": top_loc,
                "answer": (
                    f"**Location Found:** **{top_loc['name']}**\n\n"
                    f"- **Address/Area:** {top_loc['address']}\n"
                    f"- **Category:** {top_loc['category_label']}\n"
                    f"- **Coordinates:** `[{coord[0]:.4f}°E, {coord[1]:.4f}°N]`\n"
                    f"- **Details:** {top_loc['description']}"
                ),
                "items": [
                    {"id": l["id"], "label": l["name"], "sub": l["address"], "centroid": l["coord"]}
                    for l in locs
                ],
                "map": {
                    "focus": {"lng": coord[0], "lat": coord[1], "zoom": top_loc.get("zoom", 15.0)},
                },
                "autoActions": auto_actions,
                "actions": [
                    {"label": f"Pinpoint {top_loc['name']}", "action": {"type": "pinpointLocation", "location": top_loc}}
                ],
            }

    # 8 — basemap switching
    if re.search(r"basemap|satellite|dark\s?mode|streets|terrain|hybrid|light\s?mode", q):
        basemap = "satellite"
        if "dark" in q:
            basemap = "dark"
        elif "light" in q:
            basemap = "light"
        elif "street" in q:
            basemap = "streets"
        elif "terrain" in q:
            basemap = "terrain"
        elif "hybrid" in q:
            basemap = "hybrid"
        return {
            "tool": "switch_basemap",
            "answer": f"**Basemap Changed:** Switched basemap style to **{basemap.title()}**.",
            "autoActions": [{"type": "setBasemap", "basemap": basemap}],
        }

    # 8 — city / study area switching
    for c_id in ("ahmedabad", "gandhinagar", "surat", "vadodara", "rajkot", "aravalli"):
        if c_id in q:
            return {
                "tool": "switch_city",
                "answer": f"**Study Area Changed:** Switched active study area and GIS dataset to **{c_id.title()}**.",
                "autoActions": [{"type": "setCity", "cityId": c_id}],
            }

    # 9 — layer toggles
    if re.search(r"thermal|heat\s?island|lst", q):
        return {
            "tool": "toggle_layer",
            "answer": "**Layer Updated:** **Urban Heat Island (LST Thermal)** layer is now enabled.",
            "autoActions": [{"type": "toggleLayer", "layerId": "thermal-heat", "on": True}],
        }
    if re.search(r"ndvi|vegetation|green\s?cover", q):
        return {
            "tool": "toggle_layer",
            "answer": "**Layer Updated:** **Vegetation Index (NDVI)** layer is now enabled.",
            "autoActions": [{"type": "toggleLayer", "layerId": "ndvi-heat", "on": True}],
        }
    if re.search(r"flood|flood\s?risk", q):
        return {
            "tool": "toggle_layer",
            "answer": "**Layer Updated:** **Flood Risk Zones** layer is now enabled.",
            "autoActions": [{"type": "toggleLayer", "layerId": "flood", "on": True}],
        }

    # 10 — mode switching
    for m in ("overview", "growth", "infrastructure", "land", "sites", "simulator", "equity", "corridor", "conservation", "encroachment"):
        if m in q:
            return {
                "tool": "switch_mode",
                "answer": f"**Switched Mode:** Activated **{m.title()}** panel and analysis view.",
                "autoActions": [{"type": "setMode", "mode": m}],
            }

    # 11 — 3D & camera
    if re.search(r"3d|tilt|pitch|perspective", q):
        return {
            "tool": "reset_view",
            "answer": "**3D View Mode:** Tilted map camera to **55° 3D perspective**.",
            "autoActions": [{"type": "set3D", "pitch": 55}],
        }
    if re.search(r"reset|center", q) and re.search(r"map|view|camera", q):
        return {
            "tool": "reset_view",
            "answer": "**Map View Reset:** Reset map camera orientation, pitch, and centered on city bounds.",
            "autoActions": [{"type": "resetView"}],
        }

    example = next((p.parcel_id for p in get_parcels(city_id)), "GJ-AHD-00001")
    return {
        "tool": "help",
        "answer": (
            "I route your commands and questions to the spatial engine. Try:\n"
            "- “Where should we build a new hospital?”\n"
            "- “Turn on the urban heat island layer”\n"
            "- “Switch basemap to satellite”\n"
            "- “Switch city to Gandhinagar”\n"
            "- “Open equity panel”\n"
            f"- “Why is parcel {example} a good site?”\n"
            "- “Tilt map to 3D”"
        ),
    }
