# UrbanLens — Python spatial backend

FastAPI + shapely + XGBoost, per PRD §41–44. This is where the ML lives.

```bash
cd backend
python -m pip install -r requirements.txt
python -m app.ml.train ahmedabad          # train the development model
uvicorn app.main:app --reload --port 8000 # → http://localhost:8000/docs
```

It reads the same real layers as the TypeScript engine — `web/data/engine/*.json` —
so there is one copy of the data in the repo and the two backends cannot drift
apart on inputs.

---

## Status: foundation, not yet a replacement

Both backends currently run. That overlap is deliberate: parity can be checked
route by route rather than trusting a big-bang cutover.

**Ported and verified at parity with the TypeScript engine:**

| | Python | TypeScript |
|---|---|---|
| Wards | 48 | 48 |
| Population cells (250 m) | 7,083 | 7,083 |
| Population (conserved) | 7,200,002 | 7,200,002 |
| Facilities after normalisation | 1,252 | 1,252 |
| Hospitals after reclassification | 121 | 121 |

**Routes live:** `/api/health` · `/api/cities` · `/api/wards` · `/api/population` ·
`/api/population/within` · `/api/facilities` · `/api/accessibility` · `/api/ml/model` ·
`/api/ml/train`

**Not yet ported:** suitability scoring and site search, ward gap analysis,
livability, the what-if simulator, zoning conflicts, growth summary, the copilot.
Those still run in `web/lib/engine`. Port them route by route, checking each
against the TypeScript response before switching the frontend over.

---

## The model

`app/ml/development_model.py` trains a gradient-boosted classifier on **real
labels** — OpenStreetMap's own land-use tags. Built-up classes (residential,
commercial, industrial, institutional) are positive; open classes (farmland,
green, vacant, water) are negative. Features are measured from real geometry:
distance to arterial roads, to the urban core, to existing built-up land, to
hospitals/schools/transit, plus population density and catchment.

```
samples 3,224 (57% built-up)
accuracy      0.880
ROC AUC       0.952
5-fold CV AUC 0.937 ± 0.038

feature importance
  area_ha      0.306      built_km     0.291
  pop_3km      0.065      core_km      0.064
  hospital_km  0.059      pop_density  0.057
  road_km      0.056      school_km    0.052
  transit_km   0.050
```

### What it is not

**It is not a temporal forecast.** It answers *"given where roads, people and
existing development are, how developed does this location look?"* — applied to
undeveloped land, a high probability marks somewhere that resembles already-built
land, i.e. under development pressure. That is a defensible planning signal and
the feature importances make it explainable, which is what PRD §11 asks for.

A genuine "will this urbanise by 2030" model needs **observed** built-up extent at
two dates. This repo has none: the 2018/2022/2026 built-up history in the demo
layers is modelled, so training on it would only teach the model to reproduce the
formula that generated it. Rather than dress that up as prediction, the temporal
model is left unbuilt.

To build it properly, add GHSL (Global Human Settlement Layer) built-up rasters
for two dates and change the label to "was open in year A, built-up in year B".
**The feature pipeline is already the right one** — only the label changes.

Note also that `area_ha` carries the largest importance: built-up parcels are
genuinely smaller than farmland, so parcel size is informative but partly a
shortcut. Worth watching if the label definition changes.

### `datasets/training/` is not training data

Despite the name, `features_*.csv` holds the 48 ward attributes and
`points_sample_*.csv` holds sample points with only `ward_id, name, lon, lat`.
There is no target variable in either. The model above builds its own training
frame from the land layer instead.

---

## Layout (PRD §72)

```text
backend/
  app/
    main.py            FastAPI app + CORS for the Next.js dev server
    api/routes.py      route handlers
    core/config.py     the four study areas, corridors, urban cores
    data/loader.py     layer loading, cached per city
    data/normalise.py  OSM hospital reclassification + de-duplication
    gis/raster.py      population raster, windowed queries, point indexes
    ml/                development model + training entry point
  models/              trained models and their reports (generated)
  requirements.txt
```

## Why no GeoPandas or PostGIS

**GeoPandas** is not required: layers arrive as GeoJSON and shapely + pyproj cover
every operation used here. Skipping it keeps the install working on machines
without GDAL, which is most Windows laptops.

**PostGIS** (PRD §42) is not used. Nothing here is currently limited by query
capability — the raster and STRtree indexes answer in milliseconds — and a
database adds a deployment dependency. Revisit when data outgrows memory or
multiple writers appear.
