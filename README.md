# UrbanLens

**AI-powered urban planning & land intelligence** — SIH 2026, PS-SW-001.

> GLIS tells planners *what land exists*. UrbanLens helps them understand *what is happening
> there, what is likely to happen next, and what should be built where.*

This is the combined repository. Three streams of work that were developed on separate branches
now live together on `main`.

---

## What is in here

```text
frontend/     The product UI — Next.js 14, shadcn/Radix, framer-motion.
              Landing page, map, six analysis modes, copilot, ⌘K palette,
              dark + light themes. Runs standalone.

web/          The spatial engine — Next.js 16 + Turf.js, 23 API routes.
              Real ward boundaries, real land parcels, population raster,
              suitability, simulation, four study areas.

scripts/      Python data pipeline — official AMC GIS scraping, Census 2011
              processing, OSM fetching, geocoding.
raw/          Source data as fetched (AMC GIS, OSM, census workbooks).
refined/      Processed datasets (ward boundaries + attributes, census CSVs,
              land-use by ward, geocoded places).
datasets/     Training features for the growth model.
preview/      Standalone data-preview map (no build step).

prd.md        The brief everything is measured against.
```

`frontend/` and `web/` are two separate Next.js apps. They are **not** duplicates any more:
the engine produces the data, the frontend consumes it.

---

## Running it

Two apps, two terminals. The frontend works without the engine — it just falls back to seeded
demo data.

```bash
# 1 — the spatial engine (also serves the API)
cd web && npm install && npm run dev          # → http://localhost:3000

# 2 — the product UI
cd frontend && npm install && npm run dev     # → http://localhost:4000
```

`npm install` in `web/` also stages the self-hosted CesiumJS build for the optional 3D view.

### Refreshing the frontend's data from the engine

The frontend's analysis functions are synchronous and read module-level arrays, so real data is
pulled in at build time rather than fetched at runtime — which keeps the whole app (map, gap
analysis, site search, simulator, copilot) running unchanged on real boundaries and real parcels.

```bash
cd frontend
npm run sync:data                                        # engine on :3000, Ahmedabad
URBANLENS_API=http://localhost:3000 \
URBANLENS_CITY=ahmedabad-metro npm run sync:data         # any study area
```

This writes `frontend/data/real/*.json`, which `data/*.ts` prefer when present. Delete that folder
to fall back to the seeded generators. The generated files are committed, so a fresh clone already
has real data.

---

## Study areas

The engine ships four, switchable from its top bar. `sync:data` can target any of them.

| Area | Units | Extent | Parcels | Population |
|---|---|---|---|---|
| Ahmedabad | 48 AMC wards | 441 km² | 2,566 | 7.20 M |
| Gandhinagar | 11 GMC wards | 196 km² | 732 | 0.35 M |
| Ahmedabad–Gandhinagar | 59 wards | 637 km² | 3,297 | 7.55 M |
| Ahmedabad Metro Region | 59 wards + 5 talukas | 2,915 km² | 4,273 | 8.65 M |

---

## Where the data comes from

Layers are not uniformly real or uniformly synthetic, so each one carries its own provenance,
surfaced in the engine's **Data provenance** panel. The badge always reflects the *least*
authoritative layer in play.

| Layer | Source |
|---|---|
| Ward boundaries | **Official** — digitised municipal ward maps |
| Land parcels | **OpenStreetMap** — real mapped land boundaries with their real land-use tag |
| Facilities, roads | **OpenStreetMap** — Overpass, de-duplicated and re-classified |
| Population | **Derived** — census municipal totals distributed by area × road density |
| Ownership | **Derived** — no public dataset records tenure; OSM confirms it for 10 of 2,566 parcels |
| Official zoning | **Synthetic** — DP sheets are not published machine-readably |
| Growth prediction | **Derived** — transparent weighted model |

Two things this project deliberately does **not** do: present synthetic data as official, and
report a score without its confidence. Where OpenStreetMap under-maps a facility type — 121
schools and 141 transport stops for a city of 7.2 M — the affected scores are labelled *thin data*
with the counts behind the caveat, rather than shipped as findings.

---

## Data pipeline

Run in order. Everything is committed, so this is only needed to refresh.

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

## Branches

`main` is the combined truth. The others are kept for history:

- `VED` — the spatial engine's development branch
- `rudra-darji` — the data pipeline
- `frontend-main`, `frontend-landing-globe` — the UI, developed as an unrelated history

---

## Known gaps

Stated plainly, and tracked in the handover:

- No satellite imagery. Built-up history for 2018/2022/2026 is modelled, not observed (PRD §31).
- The copilot is a deterministic intent router over the real engine, not an LLM (PRD §28). It
  satisfies §29 by construction — it never invents numbers.
- No Python/FastAPI/PostGIS backend (PRD §41–43). Turf.js runs server-side in route handlers.
- No trained growth model (PRD §44). The 2030 layer is a transparent weighted model.
- Elevation is modelled, not sampled from a DEM — it feeds flood risk.
- No automated tests.
