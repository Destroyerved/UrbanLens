# URBANLENS FRONTEND — HANDOFF

## 1. Project Status

**Mostly complete.** All six PRD MVP pillars are implemented and working against
deterministic demo data: interactive GLIS map, urban growth analysis + 2030 prediction,
infrastructure gap analysis, smart site selection, what-if simulator, AI copilot. Dark and
light themes both work with persistence. `npm run build`, `npm run lint`, TypeScript
(`tsc --noEmit`) and the analysis sanity suite (`npm run sanity`) all pass.

What keeps it from "complete": the build environment used to produce this had no display/
GPU libraries, so the UI was verified by production build + server smoke test + headless
DOM checks — **not by a human eyeball**. Expect to spend a first session in `npm run dev`
doing visual polish passes (spacing, panel heights on small laptops, etc.). See §5.

## 2. Technology Stack (all actually used)

```text
Next.js 14.2 (App Router)     React 18.3          TypeScript 5.6
Tailwind CSS 3.4              shadcn/ui-style components on Radix primitives
MapLibre GL JS 4.7            zustand 4           framer-motion 11
Recharts 2                    cmdk                sonner
next-themes                   lucide-react        class-variance-authority / tailwind-merge
tsx (scripts)                 playwright-core (optional headless UI check)
```

No deck.gl / Cesium — the 2D MapLibre stack covers every PRD interaction; add deck.gl
later only if a layer genuinely needs it.

## 3. Project Structure

```text
app/                  Root layout (fonts, themes, toaster) + single-page entry
components/layout/    AppShell (composition), TopBar, ModeRail, ThemeToggle
components/map/       MapCanvas (the persistent map: all sources/layers/interactions),
                      MapControls, LayerPanel (layer manager), Legend
components/panels/    One intelligence panel per mode + shared shell/loading/empty blocks
components/parcels/   ParcelDrawer (parcel intelligence)
components/copilot/   CopilotDrawer
components/search/    CommandPalette (⌘K)
components/shared/    SegmentedScoreBar (signature explainability component), AnimatedNumber
components/ui/        button, badge, slider, switch, tooltip (shadcn-style)
config/               city.ts (Ahmedabad config — add cities here), layers.ts (registry + mode presets)
data/                 wards, parcels, facilities, roads, grid (all seeded/deterministic)
lib/                  analysis.ts (ALL analytics), store.ts (zustand app state),
                      geo.ts (planar geo math), seeded.ts (PRNG), mapdata.ts (GeoJSON adapters)
services/             parcels, growth, infrastructure, suitability, simulation, copilot
types/                Domain types mirroring PRD §48–58 schema
scripts/              sanity.ts, verify-ui.mjs
docs/                 DEMO_SCRIPT.md
```

## 4. Implemented Features

```text
[x] Interactive Ahmedabad map (MapLibre, Carto dark/light raster basemaps, no API key)
[x] GLIS parcel visualization (135 parcels, land-use colours, hover states, tooltips)
[x] Parcel Intelligence drawer (attributes, land-use history, factor scores, recommended uses)
[x] Layer manager (categories, switches, opacity sliders, active count) + contextual legend
[x] Ward boundaries, road network, 50+ facilities with type filtering
[x] Population density heatmap (grid-based, ward-normalized)
[x] Dark mode + Light mode + persistence (next-themes), theme-aware basemap swap,
    theme change does NOT reset selection/mode/layers/year
[x] Urban Time Machine (2018/2022/2026 crossfade, transition cards, built-up chart)
[x] 2030 growth probability layer with 5 classes + "why" explainability
[x] Infrastructure gap analysis (5 categories, ward ranking, affected population, gap layer)
[x] 15-minute analyzer (click-anywhere accessibility report)
[x] Livability scoring (used by simulator before/after)
[x] Site Selection (project types, constraints, 6 weight sliders with LIVE re-ranking,
    ranked candidate cards, ranked map markers, "Why #1" strengths + honest concerns)
[x] What-If Simulator (choreographed run, pin drop, expanding coverage ring,
    corridor + citywide before/after, animated counters)
[x] AI Copilot (deterministic intent → analysis engine → phrased answer + map actions:
    fly-to, highlight wards, switch modes, enable prediction, run analysis)
[x] Global search / command palette (⌘K: parcels, wards, facilities, actions)
[x] Loading / empty / error states in every panel; toasts (sonner)
[x] Signature Segmented Explainability Bar used across parcel/candidates/simulator
```

## 5. Features Not Completed / known gaps

- **No human visual QA.** Verified via build + headless smoke only (sandbox had no GPU/X
  libraries). Screenshots could not be captured (`docs/screenshots/` intentionally absent).
- Mobile/tablet layouts: desktop-first per the brief; small screens are usable-ish but
  panels are not collapsed into bottom sheets.
- Expansion-corridor auto-detection (PRD §12) is narrated via ward momentum + prediction
  layer rather than a dedicated corridor-polygon feature.
- Copilot is pattern-matching over the real engine (per PRD §29 the LLM layer comes with
  the backend). It never invents numbers, but phrasing variety is limited.
- Ward polygons are a jittered lattice, not real AMC boundaries.

## 6. Mock Data

All in `data/` — generated deterministically at module load (seeded mulberry32, no
Math.random for analytics). Wards (12, lattice with real locality names), parcels (135,
GLIS-style attributes + 3 seeded flagship parcels incl. GJ-AHD-1028), facilities (~55,
approximate real institution names), roads (8 arterials incl. S.G. Highway, SP Ring Road),
analysis grid (~530 cells: population, growth probability, hospital distance), built-up
rings per year. **Demo/synthetic data — NOT an official government or GLIS legal record**
(the UI displays this disclaimer). Replace by pointing the service layer at real APIs; the
GeoJSON adapters in `lib/mapdata.ts` isolate the map from data shape changes.

## 7. Calculation Logic (temporary stand-ins for backend GIS/ML)

All in `lib/analysis.ts`, pure + documented + reproducible (`npm run sanity` proves
determinism and prints the headline numbers):

```text
computeSuitability()        6-factor weighted score (PRD §18) + strengths/concerns text
searchSites()               constraint filter → score → rank (site selection + copilot)
computeCoverage()           pop-weighted service coverage over the grid (citywide/corridor)
uncoveredPopulationNear()   underserved residents feeding "population need"
simulateIntervention()      before/after coverage, newly covered, accessibility, livability
computeWardGaps()           per-ward 5-category gap scores + affected population
computeAccessibility()      15-minute analyzer (18 km/h assumption)
calculateLivability()       component scores + simulated-facility uplift
computeTransitions()        land-use change matrices between years
growthSummary()/explainGrowth()  built-up trajectory + prediction explainability
detectZoningConflicts()     official designation vs detected use
computeCityKpis()           overview KPIs
```

Growth probability is computed in `data/grid.ts` (frontier distance + road proximity +
ward momentum) — swap for the XGBoost model later.

## 8. Future Backend Integration

Each service file is a thin async facade with the target endpoint noted in its docblock —
swap the body for `fetch`, keep the signature:

```text
services/parcels.ts         → GET  /api/parcels · /api/parcels/{id}
services/growth.ts          → GET  /api/growth/history · /api/growth/prediction
services/infrastructure.ts  → GET  /api/infrastructure/gaps · /api/livability
                              POST /api/accessibility/analyze
services/suitability.ts     → POST /api/suitability/search · /api/suitability/calculate
                              (keep reRankSites client-side OR debounce API calls for live sliders)
services/simulation.ts      → POST /api/scenarios/simulate
services/copilot.ts         → POST /api/copilot/query (LLM + tool layer replaces pattern matching)
```

Components never touch `data/` directly except read-only registries (PARCELS for the
palette/land panel) — migrate those to service calls when the API exists. Types in
`types/index.ts` already mirror the PRD schema.

## 9. How to Run

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run build && npm start    # production verification
npm run lint                  # eslint (next/core-web-vitals)
npm run sanity                # analysis engine verification
```

## 10. Environment Variables

**No required secret environment variables for the mock frontend.** Basemap tiles are
CARTO's free raster endpoints; fonts are Google Fonts with system fallbacks.

## 11. Deployment (Vercel)

Push the folder to a Git repo → import in Vercel → framework auto-detected as Next.js →
deploy. No env vars, no build flags. Internet access is needed at runtime for basemap
tiles + fonts (the app still functions on the overlay data without them, on a dark
background).

## 12. Known Limitations

Planar distance math (equirectangular, fine at city scale, not PostGIS-grade) · straight-
line distances, not road-network routing (PRD allows this for prototype) · synthetic ward
geometry · candidate markers capped at 5 · single city wired up (config is multi-city
ready) · `verify-ui.mjs` needs a chromium binary path.

## 13. Recommended Next Steps (priority order)

1. `npm install && npm run dev`, walk `docs/DEMO_SCRIPT.md` end-to-end, fix any visual
   nits (this is the un-verified surface).
2. Move into the team repo's frontend branch as-is (folder is self-contained,
   `.gitignore` correct, lockfile committed).
3. Rehearse the demo flow; tune copy/numbers in `data/` seeds if the story needs it.
4. When FastAPI lands, swap service bodies (§8) starting with parcels → suitability →
   simulation.
5. Optional polish: bottom-sheet layout under ~1100px, real ward boundaries GeoJSON,
   corridor-polygon detection, deck.gl for large-parcel performance if parcel count grows 100×.
