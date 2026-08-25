"""The copilot: LLM for language, GIS engine for every number (PRD §28–29).

Flow:

    question
       ↓  Ollama classifies intent and picks a tool          (language)
       ↓  the GIS engine runs that tool                       (all analysis)
       ↓  Ollama restates the structured result as prose      (language)
       ↓  the raw result is returned alongside the prose

If Ollama is unavailable at either step, the deterministic router in
app.gis.copilot answers instead. The tools are identical either way, so the
figures are identical either way — only the phrasing changes.
"""

from __future__ import annotations

import re

from app.gis import copilot as rules
from app.gis.analysis import infrastructure_gaps, search_sites, suitability, zoning_conflicts
from app.gis.parcels import get_parcels
from app.gis.scoring import PROJECTS
from app.llm import ollama


def _run_tool(city_id: str, intent: dict, question: str) -> dict | None:
    """Execute the tool the model chose. All numbers originate here."""
    tool = intent.get("tool")
    project = intent.get("project") if intent.get("project") in PROJECTS else None

    if tool == "locate_place":
        from app.gis.geocoding import search_locations
        loc_q = intent.get("location_query") or question
        clean_loc = re.sub(
            r"(?i)^(where is|search for|take me to|locate|find|navigate to|go to|fly to|show me)\s+",
            "",
            loc_q,
        ).strip()
        locs = search_locations(clean_loc or loc_q, city_id=city_id, limit=5)
        if not locs:
            return {
                "tool": "locate_place",
                "answer": f"Could not find geographic coordinates for **{clean_loc or loc_q}**.",
                "items": [],
            }
        top_loc = locs[0]
        coord = top_loc["coord"]
        target_city = top_loc.get("city_id")

        answer = (
            f"**Location Found:** **{top_loc['name']}**\n\n"
            f"- **Address/Area:** {top_loc['address']}\n"
            f"- **Category:** {top_loc['category_label']}\n"
            f"- **Coordinates:** `[{coord[0]:.4f}°E, {coord[1]:.4f}°N]`\n"
            f"- **Details:** {top_loc['description']}"
        )

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
            "answer": answer,
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

    if tool == "site_search":
        proj_key = project if (project and project in PROJECTS) else (
            "warehouse" if re.search(r"warehouse|storage|godown|logistics", question, re.I) else "hospital"
        )
        spec = PROJECTS.get(proj_key, PROJECTS["hospital"])
        res = search_sites(
            city_id, proj_key,
            government_land=spec.prefers_government, low_flood_risk=True, limit=5,
        )
        if not res["results"]:
            return {"tool": "site_search", "answer": f"No suitable parcels for a {spec.label.lower()}.",
                    "items": []}
        top = res["results"][0]
        ward_title = top.get("ward_name", "Study Area")
        acres = top.get("metrics", {}).get("area_acres", "")
        ownership = top.get("metrics", {}).get("ownership", "").title()
        road_dist = top.get("metrics", {}).get("road_km", 0.0)
        c_lat, c_lng = top["centroid"][1], top["centroid"][0]

        top_location = {
            "id": top["parcel_id"],
            "name": f"Recommended Site: {top['parcel_id']}",
            "coord": top["centroid"],
            "address": f"{ward_title} · {acres} acres · {ownership} Land",
            "category_label": f"Top Potential Site ({top['final']}/100)",
            "zoom": 15.5,
            "description": f"Suitability: {top['final']}/100 | Road Distance: {road_dist:.1f} km | {top['explanation']['pros'][0]}",
        }

        auto_actions = [
            {"type": "setMode", "mode": "sites"},
            {"type": "selectParcel", "parcelId": top["parcel_id"], "fly": True},
            {"type": "pinpointLocation", "location": top_location},
        ]

        actions = [
            {"label": f"📍 Pinpoint #{top['parcel_id']} ({top['final']}/100)", "action": {"type": "pinpointLocation", "location": top_location}},
            {"label": f"⚡ Simulate on {top['parcel_id']}", "action": {"type": "runSimulation", "parcelId": top["parcel_id"], "project": proj_key}},
        ]

        return {
            "tool": "site_search",
            "project": proj_key,
            "evaluated": res["evaluated"],
            "eligible": res["eligible"],
            "top_recommendation": {
                "parcel_id": top["parcel_id"],
                "ward_name": ward_title,
                "coordinates": f"{c_lat:.4f}°N, {c_lng:.4f}°E",
                "suitability_score": top["final"],
                "area_acres": acres,
                "ownership": top.get("metrics", {}).get("ownership"),
                "flood_risk": top.get("metrics", {}).get("flood_risk"),
                "road_distance_km": road_dist,
                "catchment_population": top.get("pop"),
                "unserved_population": top.get("unserved"),
                "key_strengths": top["explanation"]["pros"][:4],
                "concerns": top["explanation"]["cons"][:2],
            },
            "top": {
                "parcel_id": top["parcel_id"],
                "ward_name": ward_title,
                "coordinates": f"{c_lat:.4f}°N, {c_lng:.4f}°E",
                "score": top["final"],
                "serves": top["pop"],
                "unserved": top["unserved"],
                "reasons": top["explanation"]["pros"][:4],
                "concerns": top["explanation"]["cons"][:2],
            },
            "items": [
                {"id": r["parcel_id"], "label": f"#{i + 1} {r['parcel_id']}",
                 "score": r["final"], "sub": f"{r.get('ward_name', '')} · {r['metrics']['area_acres']} ac", "centroid": r["centroid"]}
                for i, r in enumerate(res["results"])
            ],
            "map": {"highlight_parcel_ids": [r["parcel_id"] for r in res["results"]],
                    "focus": {"lng": top["centroid"][0], "lat": top["centroid"][1], "zoom": 15.0}},
            "autoActions": auto_actions,
            "actions": actions,
        }

    if tool == "explain_parcel" and intent.get("parcel_id"):
        from app.data.loader import get_dataset

        ds = get_dataset(city_id)
        target = str(intent["parcel_id"]).upper()
        parcel = next((p for p in get_parcels(city_id) if p.parcel_id.upper() == target), None)
        if parcel is None:
            return None
        proj_key = project if (project and project in PROJECTS) else (
            "warehouse" if re.search(r"warehouse|storage|godown|logistics", question, re.I) else "hospital"
        )
        spec = PROJECTS.get(proj_key, PROJECTS["hospital"])
        s = suitability(ds, parcel, proj_key)
        ward_title = s.get("ward_name", "Study Area")
        acres = s.get("metrics", {}).get("area_acres", "")
        ownership = s.get("metrics", {}).get("ownership", "").title()
        road_dist = s.get("metrics", {}).get("road_km", 0.0)
        c_lat, c_lng = s["centroid"][1], s["centroid"][0]

        top_location = {
            "id": s["parcel_id"],
            "name": f"Parcel {s['parcel_id']}",
            "coord": s["centroid"],
            "address": f"{ward_title} · {acres} acres · {ownership} Land",
            "category_label": f"Suitability Score ({s['final']}/100)",
            "zoom": 15.5,
            "description": f"{spec.label} Suitability: {s['final']}/100 | Road Distance: {road_dist:.1f} km",
        }

        return {
            "tool": "explain_parcel",
            "parcel_id": s["parcel_id"],
            "ward_name": ward_title,
            "coordinates": f"{c_lat:.4f}°N, {c_lng:.4f}°E",
            "score": s["final"],
            "area_acres": acres,
            "ownership": s.get("metrics", {}).get("ownership"),
            "flood_risk": s.get("metrics", {}).get("flood_risk"),
            "road_distance_km": road_dist,
            "population_served": s.get("pop"),
            "unserved_population": s.get("unserved"),
            "breakdown": s["breakdown"],
            "reasons": s["explanation"]["pros"],
            "concerns": s["explanation"]["cons"],
            "items": [{"label": p} for p in s["explanation"]["pros"]]
                     + [{"label": "⚠ " + c} for c in s["explanation"]["cons"]],
            "map": {"highlight_parcel_ids": [s["parcel_id"]],
                    "focus": {"lng": s["centroid"][0], "lat": s["centroid"][1], "zoom": 15.0}},
            "autoActions": [
                {"type": "selectParcel", "parcelId": s["parcel_id"], "fly": True},
                {"type": "pinpointLocation", "location": top_location},
            ],
            "actions": [
                {"label": f"📍 Pinpoint {s['parcel_id']}", "action": {"type": "pinpointLocation", "location": top_location}},
                {"label": f"⚡ Simulate on {s['parcel_id']}", "action": {"type": "runSimulation", "parcelId": s["parcel_id"], "project": proj_key}},
            ],
        }

    if tool == "infrastructure_gaps":
        service = intent.get("service")
        gaps = infrastructure_gaps(city_id)
        ranked = sorted(gaps, key=lambda w: w["scores"][service]) if service in (
            "healthcare", "education", "parks", "transportation", "road_connectivity"
        ) else gaps
        worst = ranked[:6]
        return {
            "tool": "infrastructure_gaps",
            "service": service or "overall",
            "most_underserved_wards": [
                {"ward": w["name"], "ward_code": w["ward_code"],
                 "gap_score": w["scores"].get(service, w["overall"]),
                 "population": w["population"]}
                for w in worst
            ],
            "worst": [{"name": w["name"], "score": w["scores"].get(service, w["overall"]),
                       "population": w["population"]} for w in worst],
            "items": [{"id": w["ward_code"], "label": w["name"], "score": w["overall"],
                       "sub": f"{w['population']:,} residents", "centroid": w["centroid"]}
                      for w in worst],
            "map": {"ward_metric": "infrastructure"},
        }

    if tool == "government_land":
        items = [p for p in get_parcels(city_id) if p.ownership == "government"]
        min_ha = intent.get("min_hectares")
        if isinstance(min_ha, (int, float)) and min_ha > 0:
            items = [p for p in items if p.area_sqm / 10_000 >= min_ha]
        if intent.get("vacant_only"):
            items = [p for p in items if p.land_use in ("vacant", "agriculture") and p.built_up_percent < 25]
        items.sort(key=lambda p: -p.scores.get("development_potential", 0.0))
        top = items[:8]
        return {
            "tool": "government_land",
            "count": len(items), "min_hectares": min_ha,
            "items": [{"id": p.parcel_id, "label": p.parcel_id,
                       "sub": f"{p.area_acres} ac · {p.land_use}",
                       "score": round(p.scores.get("development_potential", 0.0)),
                       "centroid": list(p.centroid)} for p in top],
            "map": {"highlight_parcel_ids": [p.parcel_id for p in top]},
        }

    if tool == "zoning_conflicts":
        items = zoning_conflicts(city_id)
        return {
            "tool": "zoning_conflicts",
            "count": len(items),
            "caveat": "Official zoning is modelled, so these demonstrate the detection method "
                      "rather than reporting confirmed breaches.",
            "items": [{"id": c["parcel_id"], "label": c["parcel_id"],
                       "sub": f"{c['type']} (official: {c['official']})",
                       "centroid": c["centroid"]} for c in items[:8]],
            "map": {"highlight_parcel_ids": [c["parcel_id"] for c in items[:8]]},
        }

    if tool == "land_use_change":
        rows = sorted(
            ((p, p.history.get(2024, p.history.get(2026, 0)) - p.history.get(2018, 0)) for p in get_parcels(city_id)),
            key=lambda r: -r[1],
        )
        rows = [r for r in rows if r[1] > 25][:8]
        return {
            "tool": "land_use_change",
            "count": len(rows),
            "caveat": "Built-up history is observed from Esri satellite land-cover data (2018/2022/2024).",
            "items": [{"id": p.parcel_id, "label": p.parcel_id,
                       "sub": f"+{d} pts built-up · now {p.land_use}",
                       "centroid": list(p.centroid)} for p, d in rows],
            "map": {"highlight_parcel_ids": [p.parcel_id for p, _ in rows]},
        }

    if tool == "switch_mode":
        mode = intent.get("mode") or "overview"
        label = mode.replace("_", " ").title()
        return {
            "tool": "switch_mode",
            "mode": mode,
            "answer": f"**Switched Mode:** Activated **{label}** panel and analysis view.",
            "autoActions": [{"type": "setMode", "mode": mode}],
            "actions": [{"label": f"Open {label}", "action": {"type": "setMode", "mode": mode}}],
        }

    if tool == "toggle_layer":
        layer_id = intent.get("layer_id") or "thermal-heat"
        state = intent.get("layer_state")
        if state is None:
            state = True
        state_str = "enabled" if state else "disabled"
        layer_names = {
            "thermal-heat": "Urban Heat Island (LST Thermal)",
            "ndvi-heat": "Vegetation Index (NDVI)",
            "flood": "Flood Risk Zones",
            "roads": "Road Network",
            "facilities": "Public Facilities & POIs",
            "parcels": "Cadastral Parcels",
            "wards": "Ward Boundaries",
            "prediction": "2030 Growth Forecast Grid",
            "builtup": "Observed Built-up Surface",
            "greenspace": "Urban Greenspace & Tree Canopy",
            "gap-heat": "Infrastructure Gap Heatmap",
            "growth-heat": "Urban Growth Heatmap",
            "population": "Population Density Heatmap",
        }
        layer_name = layer_names.get(layer_id, layer_id.replace("-", " ").title())
        return {
            "tool": "toggle_layer",
            "layer_id": layer_id,
            "layer_state": state,
            "answer": f"**Layer Updated:** **{layer_name}** layer is now **{state_str}** on the map.",
            "autoActions": [{"type": "toggleLayer", "layerId": layer_id, "on": state}],
            "actions": [
                {"label": f"Turn {'Off' if state else 'On'} {layer_name}",
                 "action": {"type": "toggleLayer", "layerId": layer_id, "on": not state}}
            ],
        }

    if tool == "switch_basemap":
        basemap = intent.get("basemap") or "satellite"
        label = basemap.title()
        return {
            "tool": "switch_basemap",
            "basemap": basemap,
            "answer": f"**Basemap Changed:** Switched basemap style to **{label}**.",
            "autoActions": [{"type": "setBasemap", "basemap": basemap}],
            "actions": [{"label": f"Use {label} Basemap", "action": {"type": "setBasemap", "basemap": basemap}}],
        }

    if tool == "switch_city":
        new_city = intent.get("city_id") or "ahmedabad"
        label = new_city.replace("-", " ").title()
        return {
            "tool": "switch_city",
            "city_id": new_city,
            "answer": f"**Study Area Changed:** Switched active study area and GIS dataset to **{label}**.",
            "autoActions": [{"type": "setCity", "cityId": new_city}],
            "actions": [{"label": f"Switch to {label}", "action": {"type": "setCity", "cityId": new_city}}],
        }

    if tool == "run_simulation":
        proj = intent.get("project") or "hospital"
        pid = intent.get("parcel_id")
        parcel = None
        if pid:
            target = str(pid).upper()
            parcel = next((p for p in get_parcels(city_id) if p.parcel_id.upper() == target), None)
        if not parcel:
            res = search_sites(city_id, proj, limit=1)
            if res["results"]:
                pid = res["results"][0]["parcel_id"]
                target = str(pid).upper()
                parcel = next((p for p in get_parcels(city_id) if p.parcel_id.upper() == target), None)

        from app.gis.analysis import simulate
        centroid = list(parcel.centroid) if parcel else [72.50346, 23.076707]
        sim = simulate(city_id, proj, centroid[0], centroid[1])
        proj_label = PROJECTS.get(proj, PROJECTS["hospital"]).label

        if sim and sim.get("applicable"):
            newly = sim.get("residents_newly_covered", 0)
            b_dist = sim.get("avg_distance_before_km", 0.0)
            a_dist = sim.get("avg_distance_after_km", 0.0)
            b_cov = sim.get("coverage_before_pct", 0.0)
            a_cov = sim.get("coverage_after_pct", 0.0)
            ans = (
                f"**Simulation Triggered:** Simulated new **{proj_label}** on parcel **{pid}**.\n\n"
                f"- **Residents Reached:** **{newly:,}** residents newly within coverage radius.\n"
                f"- **Average Distance Reduction:** From **{b_dist:.2f} km** to **{a_dist:.2f} km**.\n"
                f"- **Service Window Coverage:** Increased from **{b_cov:.1f}%** to **{a_cov:.1f}%**."
            )
        else:
            ans = f"**Simulation Started:** Loaded simulation for **{proj_label}** on **{pid}**."

        return {
            "tool": "run_simulation",
            "project": proj,
            "parcel_id": pid,
            "simulation": sim,
            "answer": ans,
            "autoActions": [
                {"type": "setMode", "mode": "simulator"},
                {"type": "runSimulation", "parcelId": pid, "project": proj},
            ],
            "actions": [
                {"label": f"View Simulation ({pid})", "action": {"type": "runSimulation", "parcelId": pid, "project": proj}}
            ],
        }

    if tool == "time_machine":
        year = intent.get("year", 2024)
        if year == 2030:
            return {
                "tool": "time_machine",
                "year": 2030,
                "answer": "**2030 Growth Forecast Enabled:** Displaying spatial machine learning urban expansion probabilities.",
                "autoActions": [{"type": "setMode", "mode": "growth"}, {"type": "enablePrediction"}],
            }
        return {
            "tool": "time_machine",
            "year": year,
            "answer": f"**Time Machine Set:** Displaying Esri satellite observed built-up extent for **{year}**.",
            "autoActions": [{"type": "setMode", "mode": "growth"}, {"type": "setYear", "year": year}],
        }

    if tool == "reset_view":
        pitch = intent.get("pitch")
        if pitch:
            return {
                "tool": "reset_view",
                "pitch": pitch,
                "answer": f"**3D View Mode:** Tilted map camera to **{pitch}° 3D perspective**.",
                "autoActions": [{"type": "set3D", "pitch": pitch}],
            }
        return {
            "tool": "reset_view",
            "answer": "**Map View Reset:** Reset map camera orientation, pitch, and centered on city bounds.",
            "autoActions": [{"type": "resetView"}],
        }

    return None


def ask(city_id: str, question: str) -> dict:
    intent = ollama.classify(question)
    if intent is None:
        out = rules.route(city_id, question)
        out["llm"] = {"used": False, "reason": "Ollama unavailable — deterministic routing"}
        return out

    result = _run_tool(city_id, intent, question)
    if result is None:
        out = rules.route(city_id, question)
        out["llm"] = {"used": False, "reason": f"model chose '{intent.get('tool')}' but the tool "
                                               "could not run; fell back to deterministic routing"}
        return out

    # If the tool already constructed an exact direct command response (e.g. layer/mode/basemap/city/locate),
    # use it directly without an unnecessary second LLM roundtrip.
    if result.get("answer") and intent.get("tool") in (
        "locate_place", "switch_mode", "toggle_layer", "switch_basemap", "switch_city", "time_machine", "reset_view", "run_simulation"
    ):
        return {
            **result,
            "llm": {"used": True, "model": ollama.get_active_model(), "intent": intent},
        }

    prose = ollama.phrase(question, result)
    if prose is None:
        out = rules.route(city_id, question)
        out["llm"] = {"used": False, "reason": "Ollama failed while phrasing — deterministic routing"}
        return out

    return {
        **result,
        "answer": prose,
        "llm": {"used": True, "model": ollama.get_active_model(), "intent": intent},
    }
