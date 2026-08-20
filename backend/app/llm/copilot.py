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

from app.gis import copilot as rules
from app.gis.analysis import infrastructure_gaps, search_sites, suitability, zoning_conflicts
from app.gis.parcels import get_parcels
from app.gis.scoring import PROJECTS
from app.llm import ollama


def _run_tool(city_id: str, intent: dict, question: str) -> dict | None:
    """Execute the tool the model chose. All numbers originate here."""
    tool = intent.get("tool")
    project = intent.get("project") if intent.get("project") in PROJECTS else None

    if tool == "site_search":
        spec = PROJECTS[project or "hospital"]
        res = search_sites(
            city_id, project or "hospital",
            government_land=spec.prefers_government, low_flood_risk=True, limit=5,
        )
        if not res["results"]:
            return {"tool": "site_search", "answer": f"No suitable parcels for a {spec.label.lower()}.",
                    "items": []}
        top = res["results"][0]
        return {
            "tool": "site_search",
            "evaluated": res["evaluated"], "eligible": res["eligible"],
            "top": {"parcel_id": top["parcel_id"], "score": top["final"],
                    "serves": top["pop"], "unserved": top["unserved"],
                    "reasons": top["explanation"]["pros"][:3],
                    "concerns": top["explanation"]["cons"][:2]},
            "items": [
                {"id": r["parcel_id"], "label": f"#{i + 1} {r['parcel_id']}",
                 "score": r["final"], "sub": f"serves ~{r['pop']:,}", "centroid": r["centroid"]}
                for i, r in enumerate(res["results"])
            ],
            "map": {"highlight_parcel_ids": [r["parcel_id"] for r in res["results"]],
                    "focus": {"lng": top["centroid"][0], "lat": top["centroid"][1], "zoom": 12.5}},
        }

    if tool == "explain_parcel" and intent.get("parcel_id"):
        from app.data.loader import get_dataset

        ds = get_dataset(city_id)
        target = str(intent["parcel_id"]).upper()
        parcel = next((p for p in get_parcels(city_id) if p.parcel_id.upper() == target), None)
        if parcel is None:
            return None
        s = suitability(ds, parcel, project or "hospital")
        return {
            "tool": "explain_parcel",
            "parcel_id": s["parcel_id"], "score": s["final"],
            "breakdown": s["breakdown"],
            "reasons": s["explanation"]["pros"], "concerns": s["explanation"]["cons"],
            "items": [{"label": p} for p in s["explanation"]["pros"]]
                     + [{"label": "⚠ " + c} for c in s["explanation"]["cons"]],
            "map": {"highlight_parcel_ids": [s["parcel_id"]],
                    "focus": {"lng": s["centroid"][0], "lat": s["centroid"][1], "zoom": 14}},
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
        items.sort(key=lambda p: -p.scores["development_potential"])
        top = items[:8]
        return {
            "tool": "government_land",
            "count": len(items), "min_hectares": min_ha,
            "items": [{"id": p.parcel_id, "label": p.parcel_id,
                       "sub": f"{p.area_acres} ac · {p.land_use}",
                       "score": round(p.scores["development_potential"]),
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

    prose = ollama.phrase(question, result)
    if prose is None:
        out = rules.route(city_id, question)
        out["llm"] = {"used": False, "reason": "Ollama failed while phrasing — deterministic routing"}
        return out

    return {
        **result,
        "answer": prose,
        "llm": {"used": True, "model": ollama.OLLAMA_MODEL, "intent": intent},
    }
