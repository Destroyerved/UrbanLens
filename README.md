# UrbanLens

**AI-powered urban planning & land intelligence** — SIH 2026, PS-SW-001.

> GLIS tells planners *what land exists*. UrbanLens helps them understand *what is happening
> there, what is likely to happen next, and what should be built where.*

One application. The UI, the spatial engine and the API all live in `web/`.

---

## Layout

```text
web/                  The application.
  app/                Landing page + AppShell (single-page product UI)
  app/api/            23 route handlers — the spatial engine's HTTP surface
  components/         Map, panels, copilot, command palette, shadcn/Radix UI
  lib/                UI-side analysis, map adapters, state
  lib/engine/         The GIS engine: scoring, population raster, spatial index,
                      suitability, simulation, city datasets
  data/engine/        Real source layers the engine serves (wards, land, OSM)
  data/real/          Engine output in the UI's shapes, refreshed by `sync:data`
  services/           Thin facades the UI calls
  scripts/            Data pipeline + sync + sanity checks

scripts/              Python pipeline — AMC GIS scraping, Census 2011, geocoding
raw/                  Source data as fetched (AMC GIS, OSM, census workbooks)
refined/              Processed datasets (ward boundaries, census CSVs, places)
datasets/             Training features for the growth model
preview/              Standalone data-preview map (no build step)

prd.md                The brief everything is measured against
```

---

## Running it

```bash
cd web
npm install
npm run dev          # → http://localhost:3000
```

That serves the landing page, the full product UI **and** the API. There is no second process.

```bash
curl localhost:3000/api/health?city=ahmedabad
curl localhost:3000/api/livability?city=ahmedabad-metro
```

---

## Study areas

Four, all on real boundaries. The API takes `?city=` on every route.

| id | Units | Extent | Parcels | Population |
|---|---|---|---|---|
| `ahmedabad` | 48 AMC wards | 441 km² | 2,566 | 7.20 M |
| `gandhinagar` | 11 GMC wards | 196 km² | 732 | 0.35 M |
| `ahmedabad-gandhinagar` | 59 wards | 637 km² | 3,297 | 7.55 M |
| `ahmedabad-metro` | 59 wards + 5 talukas | 2,915 km² | 4,273 | 8.65 M |

---

## How the UI gets its data

The UI's analysis functions are synchronous and read module-level arrays, so real data is pulled
in at build time rather than fetched per render. That keeps the map, gap analysis, site search,
simulator and copilot all running on real boundaries with no async plumbing.

```bash
cd web
npm run dev                          # in one terminal
npm run sync:data                    # in another — writes data/real/*.json
URBANLENS_CITY=ahmedabad-metro npm run sync:data
```

`data/*.ts` prefer those files when present and fall back to the seeded generators otherwise, so
the demo still runs if they are deleted. They are committed, so a fresh clone already has real data.

Moving a service from the local analysis engine to the API is a per-service change — the routes are
already live at the same origin. See the task list in `docs/`.

---

## Data pipeline

Everything is committed; this is only needed to refresh.

```bash
cd web
npm run data:wards                 # digitised ward maps → ward layers
npm run data:osm                   # Overpass → facilities, roads, land polygons
npm run data:region                # merge both cities
npm run data:talukas               # OSM admin boundaries
npm run data:metro                 # compose the metro region
npm run data:osm ahmedabad-metro   # peri-urban OSM coverage
```

---

## Where the data comes from

Layers are not uniformly real or uniformly synthetic, so each carries its own provenance, served
on `/api/health` and `/api/layers`. The weakest layer in play is what gets reported.

| Layer | Source |
|---|---|
| Ward boundaries | **Official** — digitised municipal ward maps |
| Land parcels | **OpenStreetMap** — real mapped land boundaries with their real land-use tag |
| Facilities, roads | **OpenStreetMap** — Overpass, de-duplicated and re-classified |
| Population | **Derived** — census municipal totals distributed by area × road density |
| Ownership | **Derived** — no public dataset records tenure; OSM confirms it for 10 of 2,566 parcels |
| Official zoning | **Synthetic** — DP sheets are not published machine-readably |
| Growth prediction | **Derived** — transparent weighted model |

Two things this project deliberately does **not** do: present synthetic data as official, and report
a score without its confidence. Where OpenStreetMap under-maps a facility type — 121 schools and 141
transport stops for a city of 7.2 M — the affected scores are labelled *thin data* with the counts
behind the caveat, rather than shipped as findings.

---

## Branches

`main` is the combined truth. The rest are kept for history: `VED` (engine), `rudra-darji` (data
pipeline), `frontend-main` and `frontend-landing-globe` (UI, developed as an unrelated history).

---

## Known gaps

- No satellite imagery. Built-up history for 2018/2022/2026 is modelled, not observed (PRD §31).
- The copilot is a deterministic intent router over the real engine, not an LLM (PRD §28). It
  satisfies §29 by construction — it never invents numbers.
- No Python/FastAPI/PostGIS backend (PRD §41–43). Turf.js runs server-side in route handlers.
- No trained growth model (PRD §44). The 2030 layer is a transparent weighted model.
- Elevation is modelled, not sampled from a DEM — it feeds flood risk.
- No automated tests beyond `npm run sanity`.
