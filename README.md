# GUGUGAGA - Main

**AI-powered urban planning & land intelligence** — SIH 2026, PS-SW-001.

> GLIS tells planners *what land exists*. UrbanLens helps them understand *what is happening
> there, what is likely to happen next, and what should be built where.*

Two processes. The Python spatial engine computes; the Next app renders.

---

## Layout

```text
backend/              The spatial engine (FastAPI). Every figure originates here.
  app/api/            Route handlers — the engine's HTTP surface (PRD §56)
  app/gis/            Analysis: scoring, parcels, population raster, copilot tools
  app/ml/             Development model — training, prediction grid
  app/llm/            Ollama client + the LLM/GIS split the PRD §29 requires
  app/data/           Layer loading and normalisation
  models/             Trained models, committed so the ML layer is real on clone

web/                  The application.
  app/                Landing page + AppShell (single-page product UI)
  components/         Map, panels, copilot, command palette, shadcn/Radix UI
  lib/                Engine client, map adapters, state
  data/engine/        Real source layers the engine serves (wards, land, OSM)
  services/           Thin facades the UI calls
  scripts/            Data pipeline + the PRD §74 demo walkthrough

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
npm run setup        # once — installs web deps + Python requirements
npm run dev          # → http://localhost:3000
```

`npm run dev` starts both processes: the Python spatial engine on `:8000` and the Next app on
`:3000`, with their output interleaved and prefixed. Open <http://localhost:3000>, click the globe
(or **Get Started**), and you are in the product. No query strings, no second terminal.

The app is useless without the engine — every figure it shows is computed there — which is why one
command starts both. To run them separately:

```bash
npm run engine       # python -m uvicorn app.main:app --port 8000
npm run web          # next dev
```

```bash
curl localhost:8000/api/health?city=ahmedabad
curl localhost:8000/api/livability?city=ahmedabad-metro
```

### Checking it works

```bash
npm run demo         # PRD §74 story through the engine, 12 steps
npm run verify:ui    # drives the real UI headlessly, 31 assertions
```

`verify:ui` needs both processes running and a Chromium to drive — pass the path, or set
`CHROME_PATH`:

```bash
npm run verify:ui -- http://localhost:3000 "C:/Program Files/Google/Chrome/Application/chrome.exe"
```

It runs with reduced motion, which is also the accessibility path the app honours via
`MotionConfig` — without it the mode rail's perpetual float means no control is ever a settled
click target.

### Optional deep links

Not needed for normal use — they exist so a view can be shared or scripted.

| Link | Opens |
|---|---|
| `/?app=1` | Straight into the product, skipping the landing sequence |
| `/?city=gandhinagar` | A specific study area |
| `/?mode=infrastructure` | A specific panel |

---

## Study areas

Four, all on real boundaries. The API takes `?city=` on every route.

| id | Units | Extent | Parcels | Population |
|---|---|---|---|---|
| `ahmedabad` | 48 AMC wards | 441 km² | 2,567 | 7.20 M |
| `gandhinagar` | 11 GMC wards | 196 km² | 734 | 0.35 M |
| `ahmedabad-gandhinagar` | 59 wards | 637 km² | 3,299 | 7.55 M |
| `ahmedabad-metro` | 59 wards + 5 talukas | 2,915 km² | 4,274 | 8.65 M |

All four are reachable from the switcher in the top bar.

---

## How the UI gets its data

Every number comes from the Python engine. The UI holds no analysis of its own — the TypeScript
engine that used to duplicate it was deleted, along with the build-time sync that fed it.

Map layers (parcels, wards, roads, facilities, population grid) are fetched per study area at
runtime by `web/lib/dataset.ts` and swapped into the layer modules in `web/data/`. That is what
makes the study-area switcher possible: four areas baked into the bundle would be ~14 MB of
JavaScript. Switching area re-fetches the layers and re-runs every panel's queries.

The seeded generators in `web/data/*.ts` remain as the offline fallback, so the shell still renders
with no engine running — but the panels will say the engine is unreachable rather than invent
figures.

Two things are still computed client-side, and neither re-derives any analysis: suitability weight
sliders re-blend factor scores the engine already returned (only the user's own weighting is
applied), and land-use transitions pivot the parcel layer already in memory.

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
| Ownership | **Derived** — no public dataset records tenure; OSM confirms it for 10 of 2,567 parcels |
| Official zoning | **Synthetic** — DP sheets are not published machine-readably |
| Growth prediction | **Modelled** — XGBoost classifier trained on real OSM land-use labels |

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
- The copilot uses Ollama when it is running and a deterministic intent router when it is not
  (PRD §28). Either way the engine produces every number, so §29 holds by construction. Without
  Ollama the answers are identical but fixed in wording.
- No PostGIS (PRD §42). Layers are GeoJSON and the spatial work is shapely + pyproj + numpy, which
  keeps the install working without GDAL. The ST_* operations the PRD lists have direct
  equivalents in what is used; nothing in the analysis is blocked by the absence.
- The growth model is a development-*pressure* classifier, not a dated forecast (PRD §11, §44). It
  is trained on real OSM land-use labels and scores 0.955–0.962 ROC AUC across the four areas, but
  a true "will this urbanise by 2030" model needs observed built-up extent at two dates (GHSL or
  Sentinel-2), which this repo does not hold. `app/ml/development_model.py` states this at length.
- Elevation is modelled, not sampled from a DEM — it feeds flood risk.
- No unit tests. Verification is two end-to-end harnesses: `npm run demo` walks the PRD §74 story
  through the engine against all four study areas, and `npm run verify:ui` drives the real
  interface in a headless browser and asserts each panel renders engine-computed content, failing
  on any console error or failed request.
