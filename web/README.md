# UrbanLens — AI-Powered Urban Planning & Land Intelligence

> GLIS tells planners *what land exists*. UrbanLens helps them understand *what is happening there, what is likely to happen next, and what should be built where.*

UrbanLens turns land records, satellite-derived layers, population and infrastructure into an
interactive, explainable urban-planning decision-support system. The demo city is **Ahmedabad,
Gujarat**, but the architecture is city-agnostic (add a city in `lib/config.ts`).

**One convincing workflow, end to end:**
`Detect Growth → Find Infrastructure Gap → Identify Land → Recommend Site → Simulate Impact → Explain Decision`

---

## Quick start

```bash
npm install
npm run dev
# open http://localhost:3000  (redirects to /overview)
```

Requires Node 18+. No database, no API keys, no external services required to run.

---

## What's built (the six MVP features)

| # | Feature | Page | What it actually does |
|---|---------|------|-----------------------|
| 1 | **Interactive GLIS map** | `/overview` | ~800 parcels, wards, roads, facilities, boundary on a dark MapLibre map. Click any parcel → full intelligence profile. Colour by ownership / potential / land-use / flood. |
| 2 | **Urban growth + prediction** | `/growth` | "Urban Time Machine" (2018→2026 built-up intensity) + a 2030 growth-probability grid from an explainable logistic model. Built-up-area chart and growth-corridor cards. |
| 3 | **Infrastructure gap analysis** | `/infrastructure` | Per-ward healthcare/education/parks/transport/road scores, choropleth, ranked underserved wards, and a click-anywhere **15-minute-city** analyzer. |
| 4 | **Smart site selection** | `/site-selection` | Multi-criteria suitability engine with constraints + **live customizable planning weights** → ranked parcels with self-explaining pros/cons. |
| 5 | **What-if simulator** | `/simulator` | Place a proposed facility → real before/after service coverage, residents newly covered, and average-distance change over a population-weighted catchment. |
| 6 | **AI planning copilot** | `/copilot` | Natural-language questions routed to real GIS tools. The assistant interprets intent, calls the engine, and explains structured results — it never invents numbers. It also drives the map (focus / highlight / enable layers). |

Plus **Land Intelligence** (`/land`) — parcel search, government/vacant filters, opportunity ranking.

---

## Architecture

```
Browser (Next.js App Router, MapLibre GL, deck.gl, Recharts)
        │  fetch GeoJSON + POST analysis requests
        ▼
Next.js Route Handlers  (/app/api/**)
        │  call
        ▼
Spatial engine  (lib/gis/*)  ──  real geodesic math via Turf.js
        │  reads
        ▼
Deterministic city dataset  (lib/data/generate.ts, cached on globalThis)
```

**Spatial engine note.** The original spec calls for Python + FastAPI + PostGIS. Because the build
machine has no PostgreSQL/PostGIS/Docker (and a bleeding-edge Python), the spatial layer is
implemented with **Turf.js run server-side inside Next.js route handlers** — real distance, buffer,
within, intersect, area and centroid operations (the `ST_*` equivalents). It sits behind a small
service layer so a PostGIS backend can be dropped in later without touching callers. This keeps the
spec's core principles intact: geospatial calculations stay server-side, scores come from
deterministic formulas/models, and the LLM never invents analytics.

### Key modules

- `lib/data/generate.ts` — deterministic Ahmedabad generator: radial urban-intensity field with
  anisotropic **growth corridors**, a Sabarmati-style river, arterials + ring road, wards, ~800
  parcels (ownership, zoning, land-use, built-up history 2018/2022/2026, flood risk), facilities
  clustered toward built-up areas (so real gaps emerge in the fringe), and a 2030 prediction grid.
- `lib/gis/engine.ts` — nearest-facility, road distance, **population catchment via areal
  interpolation**, per-parcel enrichment (accessibility / transit / infrastructure / environment /
  development potential), suitability + site search, infrastructure gaps, 15-minute city, growth
  summary + corridors, zoning conflicts, and the what-if simulator.
- `lib/scoring.ts` — normalization primitives, the customizable **UDS weighted formula**, and
  project specifications.
- `lib/gis/copilot.ts` — intent router that maps natural language to GIS tools.

## Data provenance

**All datasets are synthetic, generated deterministically for demonstration.** They are realistic in
structure and spatial behaviour but are **not** official GLIS records — the UI labels this as
`DEMO DATA` throughout. Real GLIS / Sentinel-2 / Bhuvan / OSM / Census / WorldPop / GHSL sources can
be substituted behind the same API shapes.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · MapLibre GL JS 5 · deck.gl · Turf.js
7 · Recharts · Zustand · lucide-react.
