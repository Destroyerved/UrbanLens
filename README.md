# UrbanLens

**AI-powered urban planning & land intelligence for Gujarat**

**Team Billota** · Smart India Hackathon 2026 · Problem Statement **PS-SW-001**

> GLIS tells planners *what land exists*. UrbanLens helps them understand
> *what is happening there, what is likely to happen next, and what should be
> built where.*

---

## The problem

Urban local bodies hold land records but not land *intelligence*. A planner can
see a parcel's boundary and its owner, and still cannot answer the questions
that decide a budget: which ward is furthest from a hospital, which green belt
is about to be built over, where a new corridor should run, and whether any of
it is defensible when challenged.

UrbanLens answers those across all **34 districts of Gujarat** — 72.3 million
people — from real municipal boundaries, OpenStreetMap infrastructure, Census
2011 totals and four satellite/elevation sources. It covers the five themes the
problem statement names:

| Theme | In the product |
|---|---|
| **Urban Planning** | Growth detection, 2030 development-pressure model, scenario simulator |
| **Infrastructure Development** | Service-gap analysis per ward, site suitability, least-cost corridor routing |
| **Environmental Conservation** | Conservation priority, encroachment detection, urban heat island, NDVI, flood risk |
| **Land Management / Governance** | Parcel intelligence, tenure, zoning conflicts, vacant government land |
| **Socio-economic Analysis** | Ward Equity Index with population-weighted Gini and deprivation share |

---

## Running it

```bash
npm run setup
```

```bash
npm run dev
```

`npm run dev` starts **both** processes — the Python spatial engine on `:8000`
and the Next app on `:3000` — with their output interleaved and prefixed. If
either exits, the other is stopped: a live UI over a dead engine looks like a
frontend bug rather than a missing backend, which is a slow thing to diagnose.

Open <http://localhost:3000>, click the globe, and you are in the product.

To run the halves separately:

```bash
npm run engine
```

```bash
npm run web
```

### Verifying it works

```bash
npm run demo
```

```bash
npm run verify:ui -- http://localhost:3000 "C:/Program Files/Google/Chrome/Application/chrome.exe"
```

```bash
python -m pytest backend -q
```

```bash
python scripts/verify-analytics.py
```

Four harnesses, all passing on `main`: the demo walks the planning story
through the engine in 12 steps, `verify:ui` drives the real interface headlessly
with 32 checks and fails on any console error or unexplained request, pytest
covers 9 engine tests, and the analytics verifier exercises 5 analytics against
every one of the 34 districts. The last one exits non-zero on any failure, so it
can gate a release.

---

## Architecture

Two processes. The Python engine computes; the Next app renders. **The UI holds
no analysis of its own** — every figure on screen originates in the engine, so
there is one implementation of each idea rather than two that drift apart.

```text
backend/                 FastAPI spatial engine — 47 endpoints
  app/api/routes.py      The HTTP surface
  app/gis/               analysis · parcels · conservation · corridor · copilot
  app/ml/                XGBoost development-pressure model
  app/data/              Layer loading, SQLite/filesystem sources
  app/vector/            FAISS index for similar-parcel search
  models/                Trained models, committed so ML is real on clone

web/                     Next 14 · React 18 · MapLibre GL · Zustand
  app/                   Landing sequence + AppShell
  components/panels/     One panel per mode
  components/map/        MapCanvas, layers, legend, basemap
  lib/api.ts             The single engine client
  data/engine/           Source layers the engine reads (547 MB)
  services/              Thin facades the UI calls

datasets/                DEM, GHSL, Esri land-cover tiles
scripts/                 Python pipeline + verify-analytics.py
docs/                    Deployment guides
```

Layers are fetched per district at runtime and swapped in, which is what makes
34 districts possible — baking them into the bundle would be hundreds of
megabytes of JavaScript.

---

## The nine modes

| Mode | Answers |
|---|---|
| **Overview** | What is the state of this district right now |
| **Urban Growth** | Where has built-up area expanded, and where is pressure highest |
| **Infrastructure** | Which wards are underserved, and by which service |
| **Land Intelligence** | Which parcels are opportunities, and what is their land use |
| **Site Selection** | Where should this facility go, scored and explained |
| **Simulator** | What changes if I build it — before vs after |
| **Service Equity** | Who is underserved, by how much, and who to prioritise |
| **Conservation** | Which ecology is under the most development pressure |
| **Corridor** | Where should a linear route run at least cost |

Plus an **AI Copilot** answering in natural language, a **command palette**
(Ctrl/Cmd+K) over parcels, wards and actions, PDF report export, and CSV/GeoJSON
data export.

### How the newer analytics work

**Ward Equity Index** scores seven services per ward, then measures the spread
with a **population-weighted Gini** (Brown's formula, people as the unit rather
than wards, so a 350,000-person ward does not count the same as a 20,000-person
one). The deprivation floor is *relative* — 60% of the population-weighted
median — because a fixed threshold calibrated on Ahmedabad is meaningless in a
rural district. Priority ranks by the gap to the weighted **P90**, not the
median, so the list still discriminates when nobody is below the floor.

**Conservation priority** is `sensitivity × pressure` — a product, not a sum, so
a place scores high only when it is *both* ecologically valuable and genuinely
threatened. Sensitivity combines green space, water, NDVI and flood exposure;
pressure comes from the growth model.

**Encroachment detection** finds built-up land intruding into real OSM water and
green-space polygons, plus NDVI decline inside green polygons. It is
deliberately **not** built on ownership: only 27 of 9,168 parcels carry real
tenure, so an ownership-based accusation would be an accusation grounded in
modelled data. Candidates on gap-filled parcels are excluded entirely, and each
one carries a `likely` or `review` confidence.

**Corridor routing** is an 8-connected Dijkstra least-cost path over a cost
surface weighting water (12.0), green space (4.0), flood (3.0) and population
(2.5), with a discount for existing road corridors. The ordering is deliberate:
bridging a reservoir is real engineering, routing around a settlement is land
acquisition, and the first is far dearer.

---

## Where the data comes from

Layers are **not uniformly real**, so each carries its own provenance, served on
`/api/provenance` and shown in the UI. The weakest layer in play is what gets
reported.

| Layer | Source | Standing |
|---|---|---|
| Ward boundaries | Digitised municipal ward maps | **Official** |
| Parcels, land use | OpenStreetMap land polygons | **Measured** |
| Facilities, roads | OpenStreetMap via Overpass | **Measured** |
| Water, green space | OpenStreetMap | **Measured** |
| Vegetation (NDVI) | Copernicus Sentinel-2 L2A | **Measured** |
| Land cover / built-up | Esri 10 m annual land cover | **Measured** |
| Heat island (LST) | NASA GIBS MODIS Terra | **Measured** |
| Flood risk | Copernicus DEM 30 m + water layer | **Derived** |
| Population | Census 2011 totals × area × road density | **Derived** |
| Ownership / tenure | Mostly modelled — OSM confirms a small minority | **Derived** |
| Official zoning | DP sheets are not published machine-readably | **Modelled** |
| Growth prediction | XGBoost on real OSM land-use labels | **Modelled** |

Two things this project deliberately does **not** do: present modelled data as
official, and report a score without its confidence. Where OpenStreetMap
under-maps a facility type — 121 schools mapped against roughly 1,944 expected
for Ahmedabad's 7.2 M — the affected scores are labelled *thin data* with the
counts behind the caveat, rather than shipped as findings.

---

## Coverage

All 34 districts of Gujarat, 72,286,928 people. Ahmedabad is the reference
district, the one with digitised municipal wards and the densest OSM coverage:

| | |
|---|---|
| Wards | 48 |
| Area | 441 km² |
| Population (2026 est.) | 7,200,002 |
| Parcels tracked | 17,215 |
| Government parcels | 2,415 |
| Vacant government land | 415 ha |
| Built-up 2018 → 2024 | 307 → 349 km² (+13.7%) |

---

## Deployment

Frontend on Vercel, engine on a host with real memory. Sizing is measured, not
guessed — peak RSS on a cold process building parcels from street geometry:

| District | Peak RSS | Parcels |
|---|---|---|
| Ahmedabad | 556 MB | 17,215 |
| Kutch | **2,956 MB** | 131,125 |

That rules out 512 MB free tiers. See:

- **[docs/CLOUD_RUN.md](docs/CLOUD_RUN.md)** — Google Cloud Run at 4 GiB, one command
- **[docs/DEMO_HOSTING.md](docs/DEMO_HOSTING.md)** — serve the engine from your own machine through a TLS tunnel
- **[docs/HF_SPACES.md](docs/HF_SPACES.md)** — Hugging Face Docker Space (now requires PRO)

The browser calls the engine directly rather than through Next's rewrite: a cold
engine takes up to a minute to answer, and an edge proxy returns a gateway
timeout well before it does — which surfaces in the console as a CORS error and
sends you hunting in the wrong place.

---

## Stack

**Engine** — FastAPI, shapely, pyproj, rasterio, numpy, scipy, scikit-learn,
XGBoost, FAISS, reportlab. No PostGIS and no GDAL: layers are GeoJSON and the
spatial work is shapely + pyproj + numpy, which keeps the install working
everywhere.

**App** — Next 14.2, React 18, MapLibre GL 4.7, Zustand, Framer Motion,
Three.js, Tailwind.

---

## Known limitations

Stated plainly, because a planning tool that hides its own uncertainty is worse
than one that has none.

- **Equity banding is calibrated for municipal wards.** In rural districts the
  "wards" are talukas of 150k–300k people scored against thresholds tuned for
  Ahmedabad's 48 municipal wards, so most read as "poor". The arithmetic is
  correct; the banding is not yet district-class aware.
- **Corridor detours are large where terrain is genuinely expensive.** Narmada
  routes 194.7% longer than straight line — but that straight line crosses 37 of
  80 sampled cells of protected green space plus water and flood zone, at 5.1×
  the mean cost of the chosen route. That is the conservation weighting working,
  not a routing fault.
- **Ownership is mostly modelled.** 27 of 9,168 parcels carry real tenure. No
  feature accuses anyone on that basis.
- **Zoning is modelled.** Development-plan sheets are not published in a
  machine-readable form, so zoning-conflict counts indicate where to *look*, not
  what to enforce.
- **The growth model is a pressure classifier, not a dated forecast.** It scores
  0.955–0.962 ROC AUC on real OSM land-use labels, but "will this urbanise by
  2030" needs observed built-up extent at two dates at a finer resolution than
  this repo holds.
- **The copilot uses Ollama when it is running and a deterministic intent router
  when it is not.** Either way the engine produces every number, so the answers
  are identical in substance and only fixed in wording without it.
- **`?city=gujarat`** (the statewide composite) is not a supported study area —
  it has no water layer and some analytics fail on it. The UI filters it out of
  the district selector.

---

## Team

**Team Billota**

| Member | Contribution |
|---|---|
| **Ved Sharma** | Spatial engine, analytics, frontend, deployment |

---

## Repository notes

`main` is the combined truth. Other branches are kept for history: `VED`
(engine), `rudra-darji` (data pipeline), `frontend-main` and
`frontend-landing-globe` (UI, developed as an unrelated history).
