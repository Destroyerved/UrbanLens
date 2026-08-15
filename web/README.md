# UrbanLens — AI-Powered Urban Planning & Land Intelligence

> GLIS tells planners *what land exists*. UrbanLens helps them understand *what is happening there, what is likely to happen next, and what should be built where.*

UrbanLens turns land records, satellite-derived layers, population and infrastructure into an
interactive, explainable urban-planning decision-support system. It ships with three study areas,
switchable from the top bar — practical proof that nothing is hard-coded to one city (add another in
`lib/config.ts`):

| Area | Units | Extent | Parcels | Population |
|---|---|---|---|---|
| **Ahmedabad** | 48 AMC wards | 441 km² | 2,566 | 7.20M |
| **Gandhinagar** | 11 GMC wards | 196 km² | 732 | 0.35M |
| **Ahmedabad–Gandhinagar** | 59 wards | 637 km² | 3,297 | 7.55M |
| **Ahmedabad Metro Region** | 59 wards + 5 talukas | 2,915 km² | 4,273 | 8.65M |

The **twin-city region** matters because the corridor between the two cities — GIFT City, Adalaj, the
SG Highway spine — is where the conurbation is actually growing, and neither municipality sees it
alone. It declares a **Gandhinagar Corridor** growth axis that exists only at regional scale.

The **metro region** goes further, past every corporation limit. Municipal wards stop at the city
edge, but the farmland that a metropolitan area expands into lies beyond it, and the only real
administrative units out there are talukas. Taluka boundaries (OSM `admin_level=6`) are clipped to
their non-municipal remainder so nothing is double-counted, giving Daskroi, Sanand, Kalol and
Gandhinagar rural alongside the 59 city wards.

Metro population is derived without inventing any census figure. No taluka here publishes one — none
carries a `population` tag in OSM, and none of their Wikidata items carries a P1082 claim (checked
for every one). Districts do, so:

```
peri-urban 2011  = district total (Census 2011) − municipal total (Census 2011)
peri-urban density = that population ÷ (district area − municipal area)
taluka population  = clipped area × density × 1.196   (rural growth 2011→2026)
```

Both inputs are published counts and the subtraction is exact. What is modelled is the assumption of
uniform peri-urban density within a district — far more defensible outside a city than inside it —
and that single growth factor.

**One convincing workflow, end to end:**
`Detect Growth → Find Infrastructure Gap → Identify Land → Recommend Site → Simulate Impact → Explain Decision`

---

## Quick start

```bash
npm install
npm run dev
# open http://localhost:3000  (redirects to /overview)
```

Requires Node 18+. No database, no API keys, no external services required to run — the real ward
and OpenStreetMap layers are committed under `data/real/`.

`npm install` also runs `scripts/copy-cesium.mjs`, which stages the self-hosted CesiumJS build into
`public/cesium` for the optional 3D view. Those ~14 MB are gitignored because they are derived from
`node_modules`; without them the 3D toggle reports that it is unavailable and 2D is unaffected.

### Rebuilding the real data (optional)

```bash
npm run data:wards                    # refined/*.geojson → data/real/<city>_wards.json
npm run data:osm                      # Overpass API      → <city>_{facilities,roads,land}.json
npm run data:region                   # merge both cities → ahmedabad-gandhinagar_*.json
npm run data:talukas                  # Overpass API      → talukas.json (admin_level 5/6)
npm run data:metro                    # compose           → ahmedabad-metro_wards.json
npm run data:osm ahmedabad-metro      # peri-urban OSM coverage for the metro extent
```

Run them in that order. Two things worth knowing:

- `data:region` merges the two municipal datasets rather than re-querying Overpass for a bbox twice
  the size. The fetch bboxes already overlap and every feature carries a stable OSM id, so
  de-duplicating on that id reconstructs the region exactly with no extra load on a public API.
- The final `data:osm ahmedabad-metro` is not optional if you care about peri-urban results. Without
  it the metro area reuses the municipal-core layers, and talukas with no mapped facilities score
  zero across the board — an artefact of where data was fetched, not a finding. `data:metro` will not
  overwrite a metro-wide fetch once one exists.

Run `build-wards.mjs` first: `fetch-osm.mjs` derives its query bbox from the real ward extent (plus
~3 km of padding). That padding matters — a bbox tighter than the municipal boundary leaves edge
wards with no facilities at all, which the gap analysis would otherwise report as a genuine
infrastructure desert.

---

## What's built (the six MVP features)

| # | Feature | Page | What it actually does |
|---|---------|------|-----------------------|
| 1 | **Interactive GLIS map** | `/overview` | ~2,600 **real** land parcels, real wards, roads, facilities, boundary, a **250 m population-density heatmap** and **zoning-conflict** markers on a dark MapLibre map. Click any parcel → full intelligence profile. Colour by ownership / potential / land-use / flood; shade wards by infrastructure, livability or density. |
| 2 | **Urban growth + prediction** | `/growth` | "Urban Time Machine" (2018→2026 built-up intensity) + a 2030 growth-probability grid from an explainable logistic model. Built-up-area chart and growth-corridor cards. |
| 3 | **Infrastructure gap analysis** | `/infrastructure` | Per-ward healthcare/education/parks/transport/road scores, choropleth, ranked underserved wards, a click-anywhere **15-minute-city** analyzer, and an **Urban Livability Score** view (7 weighted components, population-weighted city score). |
| 4 | **Smart site selection** | `/site-selection` | Multi-criteria suitability engine with constraints + **live customizable planning weights** → ranked parcels with self-explaining pros/cons. |
| 5 | **What-if simulator** | `/simulator` | Place a proposed facility → real before/after service coverage, residents newly covered, and average-distance change over a population-weighted catchment. |
| 6 | **AI planning copilot** | `/copilot` | Natural-language questions routed to real GIS tools. The assistant interprets intent, calls the engine, and explains structured results — it never invents numbers. It also drives the map (focus / highlight / enable layers). |

Plus **Land Intelligence** (`/land`) — parcel search, government/vacant filters, opportunity ranking.
Each parcel profile also carries its **land-use change** history (2018/2022/2026 built-up with the
detected transition) and an **environmental constraints** checklist — flood zone, water-body
overlap, ecological sensitivity, terrain/drainage.

## API

Every route accepts `?city=<id>` and defaults to Ahmedabad.

| Route | Method | Purpose |
|---|---|---|
| `/api/layers` | GET | Catalogue of spatial layers with feature counts + provenance |
| `/api/boundary` | GET | Municipal outline |
| `/api/wards` · `/api/wards/{id}` | GET | Ward polygons with scores · full ward profile |
| `/api/parcels` · `/api/parcels/{id}` | GET | Parcels GeoJSON (filterable) · parcel intelligence |
| `/api/facilities` · `/api/roads` | GET | OSM facilities · road network |
| `/api/population` | GET | 250 m population raster as points |
| `/api/growth` · `/api/growth/history` | GET | Built-up change 2018→2026 + corridors |
| `/api/growth/prediction` | GET | 2030 growth-probability grid |
| `/api/infrastructure/gaps` | GET | Per-ward service scores + source-coverage confidence |
| `/api/livability` | GET | Urban Livability Score with component weights |
| `/api/accessibility` · `/api/accessibility/analyze` | GET · POST | 15-minute city for a point · for a batch |
| `/api/zoning/conflicts` | GET | Zoning conflicts as GeoJSON |
| `/api/suitability/search` · `/calculate` | POST | Rank the city · score one parcel |
| `/api/scenarios/simulate` | POST | What-if impact of a proposed facility |
| `/api/copilot/query` | POST | Natural language → GIS tool → explained result |
| `/api/health` | GET | Dataset counts, provenance, timings |

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

- `lib/data/generate.ts` — assembles the city: real ward boundaries when available, plus a
  deterministic generator for the remaining layers (radial urban-intensity field with anisotropic
  **growth corridors**, a Sabarmati-style river, arterials + ring road, ~1,800 parcels with
  ownership, zoning, land-use, built-up history 2018/2022/2026 and flood risk) and a 2030 prediction
  grid clipped to the true municipal outline.
- `lib/gis/population.ts` — rasterises wards into a **~250 m population grid**. Population queries
  are the hottest path in the platform, and intersecting buffers against real ward polygons (hundreds
  of vertices each) is far too slow; the raster answers them as an indexed cell sum and conserves
  each ward's total exactly.
- `lib/gis/spatial-index.ts` — uniform-grid nearest-neighbour index. Distance-to-road and
  nearest-facility are the innermost loops of parcel enrichment; bucketing ~30k road vertices into a
  ~1 km grid cut the first-load enrichment pass from ~6 s to ~0.6 s.
- `lib/gis/engine.ts` — nearest-facility, road distance, per-parcel enrichment (accessibility /
  transit / infrastructure / environment / development potential), suitability + site search,
  infrastructure gaps and **source-data coverage confidence**, 15-minute city, growth summary +
  corridors, zoning conflicts, and the what-if simulator.
- `lib/scoring.ts` — normalization primitives, the customizable **UDS weighted formula**, project
  specifications, and the OSM-completeness benchmarks behind coverage confidence.
- `lib/gis/copilot.ts` — intent router that maps natural language to GIS tools.

## Data provenance

Layers are **not** uniformly real or uniformly fake, so each one carries its own provenance
(`lib/types.ts` → `LayerProvenance`), surfaced in the UI under **Data provenance** in the top bar.
The badge always reflects the *least* authoritative layer in play, so a synthetic layer is never
hidden behind an "official" headline.

| Layer | Source | Notes |
|---|---|---|
| Ward boundaries | **Official** | Digitised municipal ward map (48 AMC / 11 GMC) with measured area, perimeter, compactness and OSM road density. |
| Land parcels | **OpenStreetMap** | Real mapped land boundaries — closed `landuse` / `natural` / `leisure` ways with their real land-use tag, carrying their real names ("AUDA garden, Gota", "Orchid Whitefield"). 2,566 inside AMC, 732 inside GMC. These are surveyed **blocks and estates, not cadastral title plots** — GLIS records are not public. |
| Facilities | **OpenStreetMap** | Overpass API, de-duplicated on a ~150 m grid; `amenity=hospital` is re-classified to `clinic` unless mapped as a building or clearly named as a major hospital, since Indian OSM conflates the two. |
| Roads | **OpenStreetMap** | Motorway/trunk/primary/secondary + rivers, geometry decimated for spatial math. |
| Population | **Derived** | Census municipal totals distributed across wards by `area_km² × road_density^1.35`. Road density is real and measured; the split is a model. **Estimates, not ward-level census counts.** |
| Ownership | **Derived** | No public dataset records land tenure. OSM confirms public ownership for only 10 of 2,566 Ahmedabad parcels; the rest is modelled from land use and distance to centre. **Indicative, not a title record.** |
| Official zoning | **Synthetic** | Development-plan zoning sheets are not published machine-readably, so the official designation is modelled. Zoning conflicts therefore demonstrate the detection method against real land use — they are **not confirmed violations.** |
| Built-up / vegetation cover | **Derived** | Modelled from the real land-use tag and local urban intensity. OSM records what land is *for*, not how densely it is built. |
| Growth prediction | **Derived** | Transparent weighted model over distance-to-road, distance-to-built-up, distance-to-centre and land use. |

### Honest scoring under incomplete source data

OpenStreetMap records ~121 education and ~141 transport facilities across Ahmedabad against roughly
1,900 and 2,900 expected for a city of 7.2M. Distance-based access scores computed from that read as
`0 — Critical` for outer wards, which says more about the map than the ward. Rather than quietly
shipping those numbers, `coverageReport()` measures how completely each facility type is mapped and
the Infrastructure page labels affected scores **thin data** with the counts behind the caveat.
Scores stay honest; their confidence is stated alongside them.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · MapLibre GL JS 5 · deck.gl · Turf.js
7 · Recharts · Zustand · lucide-react.
