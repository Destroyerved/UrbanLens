"""Build docs/UrbanLens-Team-Backlog.pdf — the work left, split five ways,
sequenced by what blocks what. Every task carries an acceptance test."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, SimpleDocTemplate, Spacer

from _pdfstyle import (ACCENT, BAD, GOOD, GOV, MARGIN, PAGE, WARN, callout,
                       code_block, make_footer, para, styles, table,
                       unsafe_report)

S = styles()
W = PAGE[0] - 2 * MARGIN
story = []
H = lambda t: story.append(para(t, S["h1"]))
H2 = lambda t: story.append(para(t, S["h2"]))
H3 = lambda t: story.append(para(t, S["h3"]))
P = lambda t: story.append(para(t, S["body"]))
SM = lambda t: story.append(para(t, S["small"]))
CODE = lambda t: story.append(code_block(t, S["code"]))
GAP = lambda h=6: story.append(Spacer(1, h))

# Column layout shared by every backlog table.
COLS = [15 * mm, 52 * mm, 14 * mm, 20 * mm, W - 101 * mm]
HEAD = ["ID", "Task", "Effort", "Blocked by", "Done when"]

story.append(para("UrbanLens — Team Backlog", S["title"]))
story.append(para(
    "Everything left to finish the app, split five ways and sequenced by what blocks what. "
    "Each task has an acceptance test, so “done” is not a matter of opinion. "
    "Built from the PRD conformance audit at commit <b>1991d15</b>.", S["subtitle"]))

story.extend(callout(
    "A note on the split",
    "You asked for five people but named six. I have written the frontend as <b>three independent "
    "groups</b> (FE-A map and layers, FE-B panels and workflows, FE-C quality and access). If Harshil, "
    "Krish and Dhruvya are three people, take one group each. If frontend is really two people, fold "
    "FE-C into the other two — the groups share no files, which is why they are cut this way.",
    S, ACCENT))

H("1. How to work through this")
story.append(table([
    ["Rule", "Why"],
    ["One task = one branch = one PR", "Keeps review small and lets two people work the same area without conflict"],
    ["<font face='Courier'>npm run demo</font> and <font face='Courier'>npm run verify:ui</font> must pass before merge", "These are the only safety net; a red harness means the demo is broken"],
    ["Never merge a task whose acceptance test you cannot run", "If it cannot be checked it is not finished"],
    ["Data tasks land first", "Rudra sits on the critical path — see §2. Anushka and FE-A are blocked until the real layers exist"],
    ["Anything modelled must say so in the API response", "PRD §30 and §70. This is the project's strongest quality; do not erode it"],
], [46 * mm, W - 46 * mm], S))

H("2. The critical path")
P("Read this before picking anything up. Two people are gated on Rudra, and one item is gated on nobody "
  "and must happen first.")
CODE(
    "  M0  DEMO-SAFE (this week)\n"
    "      FE-A1 remove fake NDVI/UHI  ---+\n"
    "      VD-1  deploy engine            +--> a demo you can show anyone\n"
    "      FE-B1 deploy web           ---+\n"
    "\n"
    "  M1  REAL OBSERVATION (2-3 weeks)\n"
    "      RD-1 GHSL built-up (2 dates) -----> AN-1 real temporal model\n"
    "      RD-2 Sentinel-2 + indices     -----> FE-A2 honest NDVI layer\n"
    "                                    -----> AN-4 land-cover segmentation\n"
    "      RD-3 Copernicus DEM           -----> VD-4 real slope + flood risk\n"
    "\n"
    "  M2  SCALE + FORECAST (4-6 weeks)\n"
    "      VD-2 PostGIS  ---> VD-3 vector tiles ---> FE-A4 tiled parcel layer\n"
    "      AN-1 --------------------------------> FE-B4 forecast UI\n"
    "\n"
    "  M3  PRODUCT POLISH (parallel, any time)\n"
    "      FE-B2 compare view   FE-B3 report export   FE-C* quality")

GAP(4)
story.extend(callout(
    "Do FE-A1 today",
    "Two map layers are labelled “Vegetation &amp; NDVI Canopy” and “Urban Heat Island (UHI)” but are "
    "computed from a radial distance formula. It is the only place the product claims something it does "
    "not do, and it is fifteen minutes of work. Until it is fixed, do not enable those layers in front "
    "of a judge.",
    S, BAD))

# ---------------------------------------------------------------- RUDRA
H("3. Rudra — Data &amp; Sourcing")
P("<b>You are the critical path.</b> Anushka cannot build a real forecast and the frontend cannot show "
  "honest vegetation until your layers land. Everything you produce goes into "
  "<font face='Courier'>refined/</font> or <font face='Courier'>web/data/engine/</font> with a "
  "provenance note that the API surfaces.")
story.append(table([
    HEAD,
    ["RD-1", "<b>GHSL built-up rasters for two dates</b> (e.g. 1990 + 2020). Clip to each study area, "
             "reduce to per-parcel built-up fraction, write a history file. PRD §35",
     "2 days", "—",
     "<font face='Courier'>/api/growth</font> reports built-up from observed data, and the response's source field says “GHSL”, not “modelled”"],
    ["RD-2", "<b>Sentinel-2 composite + NDVI / NDBI / NDWI.</b> Cloud-free seasonal composite, compute the "
             "three indices, aggregate per parcel and to a grid. PRD §31",
     "3 days", "—",
     "Per-parcel vegetation_percent and water_percent come from imagery; a grid layer of real NDVI exists for FE-A2"],
    ["RD-3", "<b>Copernicus DEM</b> — elevation and derived slope per parcel. PRD §36",
     "1 day", "—",
     "Parcel elevation_m is sampled, not modelled; slope available as a new field"],
    ["RD-4", "<b>Water bodies layer</b> from OSM natural=water + NDWI. PRD §7 lists it and it is missing",
     "0.5 day", "RD-2",
     "A water layer renders on the map and environmental scoring uses real water proximity"],
    ["RD-5", "<b>Ward-level Census PCA</b> — replace the area × road-density population model with real "
             "ward counts where published. PRD §34",
     "2 days", "—",
     "Population source flips from “derived” to “census” for wards that have real counts; the rest stay labelled derived"],
    ["RD-6", "<b>AUDA development plan / zoning</b> — georeference the DP sheets if obtainable. PRD §37",
     "3 days", "—",
     "Zoning conflicts become real findings rather than method demonstrations; the caveat text is removed"],
    ["RD-7", "<b>Bhuvan LULC</b> as an independent cross-check on land use. PRD §32",
     "1 day", "—",
     "A comparison report showing agreement rate between OSM land-use tags and Bhuvan LULC"],
    ["RD-8", "<b>Provenance manifest.</b> One machine-readable file recording every layer's source, licence, "
             "fetch date and known limits; serve it from <font face='Courier'>/api/layers</font>",
     "1 day", "—",
     "Every layer in the UI can show where it came from and when it was fetched"],
], COLS, S))

GAP(5)
SM("<b>Order:</b> RD-1 then RD-2 (they unblock other people), then RD-3, then the rest. RD-6 is the "
   "highest-risk item — start asking AUDA early, because it may simply not be obtainable, and if so "
   "that is a finding worth stating rather than a task worth chasing.")

# ---------------------------------------------------------------- VED
H("4. Ved — Backend &amp; Spatial Engine")
P("You own the engine and the API contract. Two themes: make the substitutions the audit flagged "
  "defensible or unnecessary, and prepare for more than one city.")
story.append(table([
    HEAD,
    ["VD-1", "<b>Deploy the engine</b> — container + Cloud Run or Railway, env-configured CORS origin. PRD §47",
     "0.5 day", "—",
     "A public URL answers <font face='Courier'>/api/health</font> and the deployed web app uses it"],
    ["VD-2", "<b>PostGIS migration</b> — schema per PRD §48–55, SQLAlchemy models, loader script from the "
             "current GeoJSON. Keep the in-memory path working as a fallback",
     "5 days", "VD-1",
     "Every route returns identical figures with the DB backend; <font face='Courier'>npm run demo</font> passes against both"],
    ["VD-3", "<b>Vector tiles + bbox queries</b> for parcels. The current <font face='Courier'>/api/parcels</font> "
             "returns everything in one response — about 290 MB at state scale",
     "3 days", "VD-2",
     "The map requests only the visible extent; initial payload for Ahmedabad drops below 500 KB"],
    ["VD-4", "<b>Real flood risk and slope</b> from the DEM, replacing the modelled elevation",
     "1 day", "RD-3",
     "Parcel flood_risk derives from elevation and water proximity; the “modelled” label is removed for it"],
    ["VD-5", "<b>OSRM routing</b> for the 15-minute analyzer, replacing straight-line distance. PRD §45",
     "1.5 days", "VD-1",
     "Accessibility uses real drive/walk time; the response states which engine produced it"],
    ["VD-6", "<b>Vectorise the population rasteriser.</b> It builds one shapely Point per cell in a Python "
             "loop; <font face='Courier'>STRtree.query(points, predicate)</font> is about 25x faster (measured)",
     "0.5 day", "—",
     "Grid build for the metro region drops from ~0.8 s to under 0.05 s; population total still conserved exactly"],
    ["VD-7", "<b>Unit tests</b> for scoring, raster and parcel enrichment. Two end-to-end harnesses exist; "
             "there is no unit layer",
     "2 days", "—",
     "pytest covers decay_score, norm, final_score, population conservation and nearest-facility lookups; CI runs it"],
    ["VD-8", "<b>Precompute pipeline</b> — move parcel enrichment offline into a cache artefact rather than "
             "startup warming",
     "2 days", "VD-2",
     "Engine startup is instant and enrichment is a build step, not a runtime cost"],
    ["VD-9", "<b>Report generation endpoint</b> — a parcel or site-selection result as a PDF the planner "
             "can file. PRD §46 mentions generated reports",
     "2 days", "—",
     "<font face='Courier'>POST /api/report</font> returns a PDF with the scores, the explanation and the provenance"],
], COLS, S))

# ---------------------------------------------------------------- ANUSHKA
H("5. Anushka — Machine Learning")
P("The current model is honest but limited: it scores <i>development pressure</i>, not a dated forecast, "
  "because the repo has no observed built-up extent at two dates. RD-1 removes that constraint. Until it "
  "lands, work on evaluation and explainability — both are things judges probe and neither is blocked.")
story.append(table([
    HEAD,
    ["AN-1", "<b>Real temporal growth model.</b> Label = “was open in year A, built-up in year B” from the "
             "GHSL pair. The feature pipeline is already correct — only the label changes. PRD §11",
     "3 days", "RD-1",
     "The model predicts urbanisation between two observed dates; the caveat in development_model.py is rewritten, and the layer can honestly be called a forecast"],
    ["AN-2", "<b>Baseline comparison.</b> Logistic regression and Random Forest against the same split, "
             "reported side by side. PRD §11 names all three",
     "1 day", "—",
     "A table of accuracy / ROC AUC / CV for all three models, with a written justification for the one shipped"],
    ["AN-3", "<b>Per-prediction explanations (SHAP).</b> Feature importance is global; a planner asking "
             "“why is <i>this</i> cell high risk?” needs a local answer. PRD §20",
     "2 days", "—",
     "<font face='Courier'>/api/growth/prediction</font> can return the top contributing features for a given cell"],
    ["AN-4", "<b>Land-cover segmentation on Sentinel-2.</b> The one place PRD §44 permits PyTorch — built-up "
             "/ vegetation / water / bare from imagery",
     "5 days", "RD-2",
     "A land-cover raster produced by the model, with accuracy reported against a held-out sample"],
    ["AN-5", "<b>Hyperparameter tuning + calibration.</b> Grid or Optuna search; check predicted "
             "probabilities are calibrated, since they are shown to users as percentages",
     "1.5 days", "—",
     "A calibration curve in the model report; tuned parameters committed with the metrics that justify them"],
    ["AN-6", "<b>Model card.</b> One page: intended use, training data, metrics, limitations, what would "
             "make it wrong",
     "0.5 day", "AN-1",
     "Committed at <font face='Courier'>docs/model-card.md</font> and linked from the growth panel"],
    ["AN-7", "<b>Retraining CLI + drift note.</b> Make retraining reproducible for a new city and record "
             "what changes when the input data does",
     "1 day", "—",
     "<font face='Courier'>python -m app.ml.train &lt;city&gt;</font> documented, and a note on how metrics vary across the four areas"],
], COLS, S))

GAP(5)
SM("<b>Start with AN-2 and AN-5.</b> They need no new data, they harden the answers to the questions "
   "judges actually ask, and AN-2 produces the comparison table the technical reference currently "
   "promises in prose.")

# ---------------------------------------------------------------- FE-A
H("6. Frontend A — Map, layers &amp; visual honesty")
SM("Suggested owner: Harshil. Files: <font face='Courier'>components/map/</font>, "
   "<font face='Courier'>config/layers.ts</font>, <font face='Courier'>lib/mapdata.ts</font>")
story.append(table([
    HEAD,
    ["FE-A1", "<b>Remove or relabel the fake NDVI and UHI layers.</b> They are radial formulas presented as "
              "satellite products. PRD §70",
     "15 min", "—",
     "Either the layers are gone, or their label and legend say “illustrative — not satellite-derived” and the API says the same"],
    ["FE-A2", "<b>Real NDVI / vegetation layer</b> from the imagery pipeline, with a legend showing the actual "
              "index range",
     "1 day", "RD-2",
     "The layer renders values from Sentinel-2 and its provenance chip reads “Sentinel-2”"],
    ["FE-A3", "<b>Water bodies + flood-risk layers</b> on the map. PRD §7 lists both",
     "0.5 day", "RD-4, VD-4",
     "Both layers toggle, have legends, and are used by the environmental constraint panel"],
    ["FE-A4", "<b>Switch the parcel layer to vector tiles</b> and load by viewport",
     "1.5 days", "VD-3",
     "Panning loads tiles on demand; time-to-interactive on first load improves measurably"],
    ["FE-A5", "<b>Satellite basemap comparison / swipe</b> between two years. PRD §61 asks for satellite comparison",
     "1.5 days", "RD-2",
     "A swipe or side-by-side control compares two imagery dates over the same extent"],
    ["FE-A6", "<b>Map legend completeness.</b> Every active layer needs a legend entry; several heat layers "
              "currently render with no scale shown",
     "0.5 day", "—",
     "Toggling any layer shows what its colours mean, including units"],
    ["FE-A7", "<b>Map performance pass</b> — verify layer add/remove does not leak sources, and that switching "
              "study area fully tears down the previous one",
     "1 day", "—",
     "Switching areas ten times does not grow memory or duplicate map sources"],
], COLS, S))

# ---------------------------------------------------------------- FE-B
H("7. Frontend B — Panels, workflows &amp; reporting")
SM("Suggested owner: Krish. Files: <font face='Courier'>components/panels/</font>, "
   "<font face='Courier'>components/parcels/</font>, <font face='Courier'>services/</font>")
story.append(table([
    HEAD,
    ["FE-B1", "<b>Deploy the web app</b> to Vercel, pointed at the deployed engine. PRD §47",
     "0.5 day", "VD-1",
     "A public URL loads the product and every panel shows real figures"],
    ["FE-B2", "<b>Compare candidates view.</b> PRD §64 lists “compare candidates” in the site-selection "
              "workflow and it does not exist",
     "2 days", "—",
     "Two or three candidates can be shown side by side with their factor breakdowns aligned for comparison"],
    ["FE-B3", "<b>Export a recommendation as PDF</b> — the parcel, its scores, the explanation and the "
              "provenance, as a filed document",
     "1.5 days", "VD-9",
     "A button on the parcel drawer and on a site-selection result produces a PDF"],
    ["FE-B4", "<b>Forecast UI</b> once the model is temporal — year selector, probability bands, and wording "
              "that matches what the model actually claims",
     "1.5 days", "AN-1",
     "The growth panel says “predicted urbanisation by &lt;year&gt;” only when the model supports it"],
    ["FE-B5", "<b>Per-cell explanation popover</b> on the prediction layer, using SHAP output",
     "1 day", "AN-3",
     "Clicking a prediction cell shows the top factors behind its score"],
    ["FE-B6", "<b>Scenario save / recall.</b> PRD §55 defines a planning_scenarios table; the simulator "
              "currently forgets everything on reload",
     "2 days", "VD-2",
     "A simulation can be named, saved and reopened with its before/after intact"],
    ["FE-B7", "<b>Empty and error states audit.</b> Every panel should say what went wrong and what to do, "
              "never sit on a spinner",
     "1 day", "—",
     "With the engine stopped, every panel shows an actionable message; no panel spins forever"],
    ["FE-B8", "<b>Copilot streaming + suggested follow-ups</b> so answers feel immediate and the planner "
              "learns what else they can ask",
     "1.5 days", "—",
     "Tokens stream as they arrive and each answer offers two relevant follow-up questions"],
], COLS, S))

# ---------------------------------------------------------------- FE-C
H("8. Frontend C — Quality, access &amp; demo readiness")
SM("Suggested owner: Dhruvya. If frontend is only two people, split this between A and B. "
   "Files: <font face='Courier'>app/</font>, <font face='Courier'>components/layout/</font>, "
   "<font face='Courier'>scripts/verify-ui.mjs</font>")
story.append(table([
    HEAD,
    ["FE-C1", "<b>Guided demo mode.</b> A scripted walkthrough of the PRD §74 story that a presenter can "
              "step through without hunting for controls",
     "2 days", "—",
     "A “Demo” control steps through all 12 beats of the story, each step landing on the right panel and map view"],
    ["FE-C2", "<b>Keyboard and screen-reader pass.</b> The map canvas currently has no ARIA role or label "
              "and no keyboard path; panels are reachable but unlabelled",
     "2 days", "—",
     "Every interactive control is reachable by keyboard with a visible focus ring; the map has a role, a label and keyboard pan/zoom"],
    ["FE-C3", "<b>Responsive layout.</b> The shell has zero breakpoints — fixed 336 px panels and absolute "
              "positioning. It is unusable below about 1200 px",
     "3 days", "—",
     "The product is usable on a 1024 px laptop and degrades sensibly on a tablet"],
    ["FE-C4", "<b>Extend verify-ui.mjs</b> to cover the new surfaces as they land — compare view, export, "
              "scenario save, demo mode",
     "ongoing", "—",
     "Every new feature ships with an assertion in the harness; the run stays green"],
    ["FE-C5", "<b>Loading and transition polish.</b> Skeletons that match final layout, so panels do not "
              "jump when data arrives. PRD §73 phase 10",
     "1 day", "—",
     "No layout shift between skeleton and loaded state"],
    ["FE-C6", "<b>Error boundary + offline state.</b> A thrown render error currently takes the whole "
              "product to a blank screen",
     "0.5 day", "—",
     "A component error shows a recoverable panel, not a white page; engine-unreachable is stated plainly"],
    ["FE-C7", "<b>Onboarding for a first-time planner</b> — a short overlay explaining the six modes",
     "1 day", "—",
     "First visit explains the rail; dismissible and remembered"],
], COLS, S))

H("9. Milestones")
story.append(table([
    ["Milestone", "Contains", "Ready when"],
    ["<b>M0 — Demo-safe</b><br/>this week",
     "FE-A1, VD-1, FE-B1, plus a full rehearsal of the §74 story",
     "A public URL shows the whole story, nothing on screen claims more than it does, and both harnesses are green"],
    ["<b>M1 — Real observation</b><br/>2–3 weeks",
     "RD-1, RD-2, RD-3, RD-4, VD-4, VD-6, FE-A2, FE-A3, AN-2, AN-5",
     "Built-up history, vegetation and elevation all come from observed data. “Modelled” disappears from four layers"],
    ["<b>M2 — Forecast + scale</b><br/>4–6 weeks",
     "AN-1, AN-3, AN-6, VD-2, VD-3, VD-8, FE-A4, FE-B4, FE-B5",
     "The 2030 layer is a genuine dated forecast, and the app serves more than one city without a 290 MB payload"],
    ["<b>M3 — Product</b><br/>parallel",
     "FE-B2, FE-B3, FE-B6, FE-C*, VD-7, VD-9, RD-5..8, AN-4, AN-7",
     "Compare, export, save, accessible, responsive, tested"],
], [30 * mm, 52 * mm, W - 82 * mm], S))

H("10. If you only finish three things")
story.append(table([
    ["Priority", "Task", "Why this one"],
    ["1", "FE-A1 — remove the fake NDVI/UHI layers", "It is the only dishonest thing in an otherwise scrupulous product, and it takes fifteen minutes. Everything else you build is worth less if a judge finds this first"],
    ["2", "VD-1 + FE-B1 — deploy", "A live URL removes every “works on my machine” risk and lets judges explore after you leave the room"],
    ["3", "RD-1 + AN-1 — GHSL and the temporal model", "This converts your headline ML claim from “development pressure” to a real dated forecast. It is the single biggest technical credibility gain available, and it is two people for about a week"],
], [16 * mm, 52 * mm, W - 68 * mm], S))

GAP(8)
SM("Generated from the PRD conformance audit · effort figures are working estimates, not commitments · "
   "regenerate with <font face='Courier'>python docs/build_backlog.py</font>")

leftover = unsafe_report()
if leftover:
    raise SystemExit(f"unrenderable characters reached the document: {sorted(leftover)}")

doc = SimpleDocTemplate(
    str(Path(__file__).parent / "UrbanLens-Team-Backlog.pdf"),
    pagesize=PAGE, leftMargin=MARGIN, rightMargin=MARGIN,
    topMargin=15 * mm, bottomMargin=18 * mm,
    title="UrbanLens — Team Backlog",
    author="UrbanLens team",
)
f = make_footer("UrbanLens — Team Backlog")
doc.build(story, onFirstPage=f, onLaterPages=f)
print("wrote UrbanLens-Team-Backlog.pdf")
