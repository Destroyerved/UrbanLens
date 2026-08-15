"""Build docs/UrbanLens-PRD-Conformance.pdf — what the PRD asked for, what
exists, and what is left. Every claim traced to a file or a measured figure."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from reportlab.lib.units import mm
from reportlab.platypus import (KeepTogether, PageBreak, SimpleDocTemplate,
                                Spacer)

from _pdfstyle import (unsafe_report, BAD, GOOD, MARGIN, PAGE, WARN, callout, make_footer,
                       para, styles, table)

S = styles()
W = PAGE[0] - 2 * MARGIN
story = []
H = lambda t: story.append(para(t, S["h1"]))
H2 = lambda t: story.append(para(t, S["h2"]))
P = lambda t: story.append(para(t, S["body"]))
SM = lambda t: story.append(para(t, S["small"]))
GAP = lambda h=6: story.append(Spacer(1, h))

# ---------------------------------------------------------------- cover
story.append(para("UrbanLens — PRD Conformance Report", S["title"]))
story.append(para(
    "What the brief asked for, what the code actually does, and what is left. "
    "Audited against <b>prd.md</b> section by section on 15 August 2026, at commit "
    "<b>d54406e</b> (branch <font face='Courier'>fix/ui-backend-wiring-and-bugs</font>). "
    "SIH 2026 · PS-SW-001.", S["subtitle"]))

P("Every status below was checked against the source, an API response, or a measured "
  "run — not against intention. Where the implementation deliberately departs from the "
  "brief, it is marked <b>Substituted</b> and the reason is given, because a defensible "
  "substitution and an unmet requirement are different things and judges will ask which "
  "is which.")

H("1. Headline")
story.append(table([
    ["Area", "Status", "Evidence"],
    ["The six required MVP features (§69)", "Built", "6 of 6 working end to end; <font face='Courier'>npm run demo</font> passes 12/12 steps on all four study areas"],
    ["MVP priorities 1–12 (§68)", "Built", "12 of 12 present"],
    ["API surface (§56)", "Built", "All 13 named routes implemented, plus 14 more"],
    ["Explainable scoring (§18–20)", "Built", "Weights match the brief exactly; every result carries pros and cons"],
    ["ML growth model (§11, §44)", "Partial", "XGBoost trained on real labels, ROC AUC 0.955–0.962 — but it scores development <i>pressure</i>, not a dated 2030 forecast"],
    ["Satellite imagery (§31)", "Missing", "No Sentinel-2. NDVI/NDBI/NDWI never computed"],
    ["PostGIS (§42)", "Substituted", "GeoJSON + shapely/pyproj/numpy; no database at all"],
    ["Data-honesty rule (§30, §70)", "Caveat", "Mostly excellent — two layers breach it, see §6"],
], [46 * mm, 22 * mm, W - 68 * mm], S))

GAP(9)
story.extend(callout(
    "One item to fix before you demo",
    "Two toggleable map layers are labelled <b>“Vegetation &amp; NDVI Canopy”</b> and "
    "<b>“Urban Heat Island (UHI)”</b>. NDVI and UHI are real satellite-derived indices, but these "
    "values come from a radial distance formula plus a character code from the cell id "
    "(<font face='Courier'>web/lib/mapdata.ts:155–182</font>). That is precisely what PRD §70 forbids — "
    "“fake GIS calculations… completely random scores” — and §30 forbids presenting synthetic data as real. "
    "Everything else in the product is scrupulous about provenance, which makes these two stand out. "
    "Remove them, or relabel as “illustrative — not satellite-derived”. Details in §6.",
    S, BAD))

H("2. The six required MVP features (§69)")
P("The brief says these six must be demonstrated <i>extremely well</i>. All six work.")
story.append(table([
    ["#", "Feature", "Status", "What actually happens"],
    ["1", "Interactive GLIS Map", "Built", "MapLibre GL; 15 toggleable layers; pan, zoom, click-to-select, hover tooltips, layer opacity, basemap switcher, ⌘K search"],
    ["2", "Urban Growth + Prediction", "Built", "2018/2022/2026 timeline, built-up trajectory chart, corridor cards, 2030 probability grid from the trained model"],
    ["3", "Infrastructure Gap Analysis", "Built", "Per-ward scores across 5 services, population-weighted ranking, deficit heatmap, 15-minute analyzer"],
    ["4", "Smart Site Selection", "Built", "10 project types, constraint filtering, 6-factor weighted score, live weight sliders, ranked candidates"],
    ["5", "What-If Simulator", "Built", "Place an intervention, recompute coverage from the population raster, before/after comparison"],
    ["6", "AI Urban Planning Copilot", "Built", "7 tools over the real engine; Ollama for language, engine for every number"],
], [8 * mm, 33 * mm, 18 * mm, W - 59 * mm], S))

H("3. Module-by-module conformance")

H2("Core analysis")
story.append(table([
    ["PRD §", "Requirement", "Status", "Notes"],
    ["§6", "City Overview KPIs (12 listed)", "Built", "All 12 served by <font face='Courier'>/api/overview</font>; 6 surfaced on the panel, rest in Land/Infra panels"],
    ["§7", "Interactive GLIS map + 18 layers", "Partial", "15 layers built. Missing: true satellite-derived vegetation, water bodies as a layer, and a real land-use raster"],
    ["§8", "Parcel Intelligence Profile", "Built", "Every field in the brief's example exists, plus ranked recommended uses"],
    ["§9", "Urban Growth Analysis", "Partial", "Built-up change, growth %, direction and corridors — all modelled, not observed from imagery"],
    ["§10", "Urban Time Machine", "Built", "Year slider 2018→2026 redraws the built-up layer"],
    ["§11", "Growth Prediction (2030)", "Partial", "Probability grid with the brief's 5 risk bands. Scores present-day development pressure, not a dated forecast"],
    ["§12", "Expansion Corridors", "Built", "3–4 named corridors per area with growth, population, risk"],
    ["§13", "Infrastructure Gap Analysis", "Built", "Matches the brief's example output shape"],
    ["§14", "15-Minute City Analyzer", "Built", "8 facility types, per-point score. Straight-line distance at 4.8 km/h walk / 22 km/h drive"],
    ["§15", "Urban Livability Score", "Built", "7 weighted components, population-weighted city score"],
], [13 * mm, 40 * mm, 19 * mm, W - 72 * mm], S))

H2("Land intelligence, decision support and AI")
story.append(table([
    ["PRD §", "Requirement", "Status", "Notes"],
    ["§16", "Smart Site Selection", "Built", "All 10 project types from the brief"],
    ["§17", "Parcel Ranking", "Built", "Ranked list, click to locate on map"],
    ["§18", "Urban Development Suitability", "Built", "Weights are exactly the brief's: 0.25 / 0.20 / 0.15 / 0.15 / 0.15 / 0.10"],
    ["§19", "Customisable planning weights", "Built", "Sliders re-rank live, client-side re-blend of engine factor scores"],
    ["§20", "Explainable recommendations", "Built", "Every candidate carries pros and cons, in the brief's tick / warning form"],
    ["§21", "Zoning Conflict Detection", "Built", "293 flagged for Ahmedabad — but official zoning is modelled, so these demonstrate the method, not real breaches"],
    ["§22", "Land-Use Change Detection", "Built", "Transitions pivoted from the parcel layer's history"],
    ["§23", "Vacant Government Land Finder", "Built", "Ownership + built-up + risk + access filters"],
    ["§24", "Land Opportunity Score", "Built", "Development-potential score per government parcel"],
    ["§25", "Environmental Constraints", "Partial", "Flood risk, water, vegetation modelled. No DEM, no real flood-zone data"],
    ["§26", "What-If Simulator", "Built", "7 intervention types"],
    ["§27", "Before vs After", "Built", "Coverage, distance, accessibility, livability, population covered"],
    ["§28", "AI Copilot", "Built", "Handles all 7 example questions from the brief"],
    ["§29", "LLM never computes spatial results", "Built", "Enforced structurally: the LLM picks a tool and phrases the result, the engine computes every figure. Without Ollama a deterministic router answers identically"],
], [13 * mm, 40 * mm, 19 * mm, W - 72 * mm], S))


H("4. Data sources (§30–37)")
P("This is where the brief is most ambitious and the build is most partial. The project is "
  "unusually honest about it — every layer carries its own provenance on "
  "<font face='Courier'>/api/health</font> and <font face='Courier'>/api/layers</font>, and the weakest "
  "layer in play is what the UI reports.")
story.append(table([
    ["PRD §", "Source asked for", "Status", "What is actually used"],
    ["§30", "GLIS land records", "Substituted", "GLIS is not public. OpenStreetMap land polygons — real boundaries, real land-use tags — stand in. Labelled as such, never called cadastral"],
    ["§31", "Sentinel-2 + NDVI/NDBI/NDWI", "Missing", "No imagery pipeline. Built-up history for 2018/2022/2026 is modelled"],
    ["§32", "ISRO Bhuvan", "Missing", "Not integrated"],
    ["§33", "OpenStreetMap roads + POIs", "Built", "Overpass API. 1,252 facilities across 10 types, 2,480 road segments (Ahmedabad)"],
    ["§34", "Census of India + WorldPop", "Partial", "Census 2011 municipal totals projected to 2026, distributed by area × road density. No WorldPop raster"],
    ["§35", "GHSL historical built-up", "Missing", "This is the single blocker for a genuine temporal forecast"],
    ["§36", "Copernicus DEM", "Missing", "Elevation is modelled; it feeds flood risk"],
    ["§37", "AUDA planning data", "Missing", "Development-plan sheets are not published machine-readably; zoning is modelled"],
    ["—", "Ward boundaries", "Built", "Official — digitised municipal ward maps, 48 AMC + 11 GMC"],
], [13 * mm, 34 * mm, 21 * mm, W - 68 * mm], S))

H("5. Technology stack (§39–47)")
story.append(table([
    ["PRD §", "Asked for", "Status", "Reality"],
    ["§39", "Next.js, TypeScript, React, Tailwind, shadcn/ui", "Built", "Next 14.2.15, React 18.3, TS 5.6, Tailwind 3.4, Radix primitives"],
    ["§40", "MapLibre GL JS", "Built", "maplibre-gl 4.7"],
    ["§40", "deck.gl for large data", "Missing", "Not needed at current scale; MapLibre handles 2,567 parcels"],
    ["§40", "CesiumJS 3D (explicitly optional)", "Missing", "Brief says do not make it mandatory; 2D was prioritised as instructed"],
    ["§41", "Python, FastAPI, Pydantic, SQLAlchemy", "Partial", "FastAPI 0.135, Pydantic 2.12. No SQLAlchemy — there is no database"],
    ["§42", "PostgreSQL + PostGIS (“mandatory”)", "Substituted", "The largest single departure. Layers are GeoJSON; spatial work is shapely 2.1 + pyproj + numpy. See note below"],
    ["§43", "GeoPandas, Shapely, Rasterio, GDAL, pyproj", "Partial", "Shapely + pyproj only. GeoPandas/GDAL deliberately avoided so the install works without system GDAL"],
    ["§44", "scikit-learn, XGBoost", "Built", "XGBoost 3.4.1 classifier, scikit-learn 1.8 for split/CV/metrics"],
    ["§45", "OSRM / GraphHopper routing", "Substituted", "Brief permits “network-distance or drive-time approximations” for the prototype. Straight-line haversine at fixed speeds"],
    ["§46", "R2 / S3 object storage", "Missing", "No large binaries to store yet"],
    ["§47", "Vercel / Railway / Supabase deploy", "Missing", "Runs locally only"],
    ["§48–55", "9-table database schema", "Substituted", "No DB. The same entities exist as in-memory dataclasses and cached derivations"],
], [13 * mm, 42 * mm, 21 * mm, W - 76 * mm], S))

GAP(8)
story.extend(callout(
    "How to answer “where is your PostGIS?”",
    "Do not pretend it is there. The honest answer is strong: <i>“Every ST_* operation the brief lists has a "
    "direct equivalent in what we use — ST_Contains is shapely's prepared predicate, ST_DWithin is our "
    "indexed raster window, ST_Distance is haversine. We index with an STRtree, which is the same R-tree "
    "PostGIS builds. At 2,567 parcels the whole city fits in memory and every query is sub-second, so a "
    "database would have added an ops dependency without changing a single number. It becomes necessary "
    "the moment we scale past one city — that is exactly where we would add it.”</i> "
    "Then show the scaling analysis in the technical reference.",
    S, WARN))

H("6. Where the build breaks its own honesty rule")
P("PRD §70 is unambiguous: mock datasets are acceptable, <i>fake analytics are not</i>. The project "
  "honours this almost everywhere — provenance per layer, confidence bands on thin data, explicit "
  "caveats on modelled zoning. Two things fall outside it.")

story.append(table([
    ["Item", "Severity", "What is wrong", "Fix"],
    ["“Vegetation &amp; NDVI Canopy” layer", "High",
     "Values are <font face='Courier'>0.2 + (radius/14)×0.6 + (charCodeAt(5)%10)×0.02</font>. NDVI is a specific "
     "satellite formula the brief spells out in §31. A judge who asks how it was computed will get an answer "
     "that contradicts the label.",
     "Remove the layer, or rename to “Modelled green-cover gradient (illustrative)”"],
    ["“Urban Heat Island (UHI)” layer", "High",
     "Values are <font face='Courier'>1.0 − (radius/12)×0.72</font> — a pure radial gradient with no thermal input.",
     "Same: remove, or relabel as illustrative"],
    ["Ownership / tenure", "Low — already handled",
     "Modelled for all but 10 of 2,567 parcels.",
     "Already disclosed on /api/health and in the UI. No action"],
    ["Official zoning", "Low — already handled",
     "Modelled, so zoning conflicts are method demonstrations.",
     "Already disclosed in the conflicts response. No action"],
], [32 * mm, 22 * mm, W - 108 * mm, 54 * mm], S))

GAP(4)
P("The bottom two rows are worth rehearsing as a <i>strength</i>: being able to say “this layer is modelled, "
  "here is the confidence, here is what would make it real” is more convincing to a technical judge than "
  "a dashboard that claims everything is authoritative.")

H("7. What is left, in priority order")
P("Ordered by demo value per hour of work.")
story.append(table([
    ["#", "Task", "Effort", "Why it matters"],
    ["1", "Remove or relabel the NDVI and UHI layers", "15 min", "Closes the only place the product overstates itself. Highest value per minute in the list"],
    ["2", "Deploy — Vercel + Railway/Cloud Run (§47)", "2–4 h", "A live URL is worth a great deal to judges and removes “it works on my machine” risk"],
    ["3", "Rehearse the §74 demo script end to end", "1–2 h", "The story is the product. <font face='Courier'>npm run demo</font> proves the data holds; the humans need the same rehearsal"],
    ["4", "GHSL built-up rasters for 2 dates (§35)", "1–2 days", "The one change that converts the growth model from “pressure” to a real dated forecast. Biggest technical credibility win available"],
    ["5", "Sentinel-2 NDVI/NDBI/NDWI (§31)", "2–3 days", "Would make §31 real and let the two flagged layers return honestly"],
    ["6", "PostGIS + vector tiles (§42)", "1–2 weeks", "Not needed for this demo; required for anything past one city"],
    ["7", "OSRM routing (§45)", "1 day", "Upgrades 15-minute analysis from straight-line to real drive time"],
    ["8", "Unit tests", "ongoing", "Two end-to-end harnesses exist; there is no unit layer"],
], [8 * mm, 52 * mm, 18 * mm, W - 78 * mm], S))

H("8. Verification as it stands")
story.append(table([
    ["Check", "Command", "Result"],
    ["PRD §74 demo story", "npm run demo", "12/12 steps, all four study areas"],
    ["UI against real engine", "npm run verify:ui", "31 assertions, clean console and network"],
    ["Types", "npx tsc --noEmit", "clean"],
    ["Lint", "npx next lint", "clean"],
    ["Production build", "npm run build", "succeeds"],
    ["ML quality", "/api/ml/model", "ROC AUC 0.955–0.962, 5-fold CV 0.920–0.940"],
], [40 * mm, 44 * mm, W - 84 * mm], S))
GAP(8)
SM("Prepared for the UrbanLens team · figures measured on the commit named on page 1 · "
   "statuses reflect code, not intent.")

doc = SimpleDocTemplate(
    str(Path(__file__).parent / "UrbanLens-PRD-Conformance.pdf"),
    pagesize=PAGE, leftMargin=MARGIN, rightMargin=MARGIN,
    topMargin=15 * mm, bottomMargin=18 * mm,
    title="UrbanLens — PRD Conformance Report",
    author="UrbanLens team",
)
f = make_footer("UrbanLens — PRD Conformance Report")
# Fail rather than emit a document with blank glyphs where a character the
# standard-14 fonts cannot draw used to be.
leftover = unsafe_report()
if leftover:
    raise SystemExit(f"unrenderable characters reached the document: {sorted(leftover)}")

doc.build(story, onFirstPage=f, onLaterPages=f)
print("wrote UrbanLens-PRD-Conformance.pdf")
