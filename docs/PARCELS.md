# Where UrbanLens parcels come from

**Status:** all nine study areas are on the full street network — 315,674
OpenStreetMap street centrelines cut into 163,078 parcels.

---

## 1. The problem this solves

India publishes no bulk cadastral geometry. Gujarat's plot records live behind
**Bhu-Naksha** and **AnyROR**, which serve one plot at a time behind a captcha.
There is no parcel layer to download, and any project claiming to show "GLIS
parcels" from open data is showing something else.

What UrbanLens showed before was **OpenStreetMap land-use polygons**, relabelled
as parcels. That gave us three problems at once:

| Symptom | Cause |
|---|---|
| A "parcel" covering an entire neighbourhood | `landuse=residential` polygons run to **720 ha** |
| The Sabarmati listed as developable land with a survey number | `natural=water` polygons were in the parcel set |
| A third of every district reading **0.00 ha** | area was read from shapely's `.area`, which is square *degrees* |

The last one also broke the headline KPI: Ahmedabad's "vacant government land"
read **19 ha** when the correct figure is **1,719 ha**.

---

## 2. The idea

A parcel is very nearly **a street block carrying the land use of the area it
sits in**. Both halves of that are real and openly published:

- **OpenStreetMap land-use polygons** — what the land is *for*. Real tag, real
  outer boundary.
- **OpenStreetMap street centrelines** — what bounds a block. Real geometry.

So we do not invent parcels. We intersect two real datasets and only model the
divisions that remain inside a block too large to be a single plot.

### The pipeline

```
roads + streets + ward boundaries
        │
        ├─ polygonize ──────────────► street blocks  (every edge is real)
        │
land-use polygons ──── cut at block edges ──► plot-scale pieces
        │                                          │
        │                                          └─ still over the
        │                                             size cap? bisect
        │                                             across the shorter side
        │
ward area no land polygon covers ─── same blocks ──► gap-fill parcels

water polygons ─────────────────────────────────► excluded entirely
```

**Size ceilings** are per land use, because farmland does not subdivide like
housing and forcing it to would invent field boundaries that are not there:

| Land use | Cap |
|---|---|
| residential, commercial, mixed | 2.5 ha |
| industrial, institutional | 6 ha |
| vacant | 5 ha |
| green | 8 ha |
| agriculture | 12 ha |
| gap-fill | 4–50 ha, scaled by distance from the urban core |

### What is real and what is not

| | |
|---|---|
| **Real** | Every parcel boundary — an OSM road or street centreline, a ward edge, or the edge of a mapped land polygon |
| **Real** | Land-use classification, mapped names, and public ownership where OSM tags it |
| **Modelled** | Divisions *inside* a block too large to be one plot |
| **Modelled** | Tenure for everything OSM does not tag, official zoning, built-up and vegetation cover |
| **Excluded** | Water. A river is not land anyone can be allocated |

Every `/api/overview` response carries this as `sources.parcels`, so the app
states it rather than glossing over it.

---

## 3. Why the street layer matters

`<city>_roads.json` carries only motorway → tertiary — the roads worth *drawing*
on a city map. Cutting land polygons at those gives super-blocks: with arterials
alone, the smallest enclosed block in Ahmedabad is still over 100 ha.

`<city>_streets.json` adds residential, service, living-street and unclassified.
`service` matters more than it sounds — in Indian cities, society internal roads
are overwhelmingly tagged that way, and they are exactly the lines that separate
one plot row from the next.

**Ahmedabad: 2,480 arterials → 55,580 centrelines.**

| | Arterials only | With streets |
|---|---:|---:|
| Parcels | 9,177 | **17,215** |
| Median size | 1.72 ha | **1.12 ha** |
| Largest | 49.9 ha | 49.8 ha |

The street layer is **engine-side only**. It is read when parcels are built and
never sent to the browser, so the map payload is unchanged.

---

## 4. Results

| Area | Streets | Land polygons | Parcels | p10 | Median | p90 | Max | Payload |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Ahmedabad | 55,580 | 3,224 | 17,215 | 0.11 | **1.12** | 4.24 | 49.8 | 2.6 MB |
| Gandhinagar | 23,855 | 1,766 | 7,308 | 0.11 | **0.37** | 4.92 | 49.7 | 1.1 MB |
| Ahmedabad–Gandhinagar | 65,275 | 3,884 | 24,556 | 0.11 | **0.92** | 4.42 | 49.8 | 3.6 MB |
| Ahmedabad Metro Region | 84,960 | 4,930 | 37,349 | 0.14 | **1.51** | 30.61 | 50.0 | 6.4 MB |
| Kheda | 27,843 | 5,000 | 12,781 | 0.71 | 23.52 | 42.29 | 50.0 | 2.4 MB |
| Mahesana | 24,725 | 4,597 | 15,427 | 2.46 | 28.49 | 43.68 | 50.0 | 3.1 MB |
| Sabarkantha | 13,469 | 865 | 18,130 | 4.10 | 17.87 | 41.27 | 50.0 | 2.2 MB |
| Aravalli | 6,004 | 741 | 13,512 | 3.32 | 25.13 | 42.57 | 50.0 | 1.8 MB |
| Patan | 13,963 | 600 | 16,800 | 2.24 | 30.73 | 44.64 | 50.0 | 2.4 MB |

Sizes in hectares; payload is the gzipped `?detail=full` response. **No parcel
anywhere reports 0 ha, and none exceeds its cap.**

The rural districts sit at a 20–30 ha median and that is correct, not a defect —
they are farmland, and the land-use caps deliberately do not subdivide farmland
to housing-plot scale. The Metro Region shows both at once: a 1.51 ha median
where it is urban, a 30 ha p90 out in the fields.

Composition for Ahmedabad: **12,636** subdivided from real OSM land polygons,
**1,117** taken whole, **3,462** gap-fill.

The Metro Region is the heaviest thing the app serves at 6.4 MB gzipped, 1.5 s
from the engine. If that becomes a problem the answer is vector tiles, not fewer
parcels — `/api/parcels` already accepts `?bbox=` and `?limit=` for exactly that.

---

## 5. Running it

Both scripts are idempotent and resumable. Neither needs the engine running.

### Fetch street networks

```bash
python scripts/fetch_streets.py --plan
```

Prints the tile count per area and fetches nothing. Use it to see the size of
the job first.

```bash
python scripts/fetch_streets.py
```

Every active area. Named areas: `python scripts/fetch_streets.py gandhinagar patan`.
Add `--force` to refetch an area that already has a file.

Writes `web/data/engine/<area>_streets.json`.

**Talking to Overpass without losing a day.** It is a shared free service that
504s freely under load. Three things exist only because of that:

1. **Tiles outside the district are never requested.** A study area's bbox can
   be far larger than the area itself — Gandhinagar's is seven times the
   district — and two runs died on a tile of empty countryside 40 km east of the
   city. Tiles are tested against the union of the ward polygons first: **454
   requests instead of 724** across the nine areas, and 8 instead of 56 for
   Gandhinagar.
2. **A failing tile is quartered and retried** rather than failing the area.
   Dense extents are what time out; a quarter of a dense extent usually does not.
3. **Every tile is checkpointed** to `backend/.cache/overpass-tiles` the moment
   it arrives. An interrupted run resumes. Losing 40 good tiles to the 41st is
   what made the first version unusable — and when the fix landed, Gandhinagar
   completed in 2 seconds from tiles two earlier failed runs had already
   downloaded.

### Build parcels

```bash
python scripts/prebuild_parcels.py
```

Builds and caches every area — **90 seconds for all nine**. After fetching new
streets for an area, rebuild just that one:

```bash
python scripts/prebuild_parcels.py gandhinagar --force
```

### Cache behaviour

Parcels persist to `backend/.cache/parcels`, keyed on a fingerprint of every
source layer. Refetch a layer and the key changes, so **both the disk cache and
the running engine's in-memory copy invalidate on their own** — no restart, no
manual clearing. The directory is disposable; deleting it costs one rebuild.

```
Ahmedabad:  19 s to build   →   0.18 s to load
Startup warms every cached area, so all nine are hot in ~3 s.
```

---

## 6. Performance notes

Parcels went up 4× and the app got faster, because the costs were elsewhere:

| Change | Effect |
|---|---|
| `GZipMiddleware` — nothing was compressed before | Ahmedabad's parcel response: 2.5 MB plain → **2.6 MB gzipped carrying 4× the parcels** |
| Disk cache | 19 s build → **0.18 s** load |
| Vectorised nearest-neighbour in `enrich()` | **52 s → 7 s** on the metro region |
| `area_sqm` uses local equal-area scaling, not pyproj | **13× cheaper** (6.4 µs vs 82 µs), within 0.02% |
| Coordinates rounded to 6 dp | **−14%** payload; a cut edge was landing on `72.48833204660801` |

**On measuring the client.** Handling all 17,215 parcels in JavaScript —
`JSON.parse` of 18 MB, building the objects, indexing, building the render
collection, a full filtering scan — totals about **80 ms**. A full scan is
0.5 ms. If the app feels slow it is not the parcel count and it is not
JavaScript; check that you are not running the dev server (6.2 s to first
figures, against 1.0 s for a production build).

---

## 7. Honest limitations

- **This is not a cadastre.** Boundaries are street blocks, not title plots.
  Where a real plot sits inside a block, we do not know where. The app says so.
- **Ownership is mostly modelled.** OSM confirms public ownership for a handful
  of polygons per district; the rest is generated deterministically, and the
  provenance block reports the exact confirmed count.
- **Zoning is synthetic.** Development-plan sheets are not published
  machine-readably. Zoning conflicts demonstrate the detection method; they are
  not confirmed violations.
- **OSM coverage varies.** Dense in Ahmedabad and Gandhinagar, thin in the rural
  districts, where more of the area falls to gap-fill.
- **Subdivision is geometric, not legal.** Bisecting across the shorter axis
  produces compact, plausible plots. It does not reproduce any actual plot.

---

## 8. Licensing

Street and land data are **OpenStreetMap, ODbL 1.0**. Anything derived from them
and published must carry that attribution. The layer files record their source
and licence in their `meta` block.

---

## 9. Regression tests

```bash
python backend/tests/test_parcels.py
```

Pins the properties that broke in the field: areas in the right unit, no parcel
rounding to zero, holes subtracted, and subdivision respecting its cap without
losing area.

One is worth knowing about. `pyproj`'s `geometry_area_perimeter` **adds** an
interior ring instead of subtracting it when the hole winds the same way as the
exterior — over-reporting a test shape by 23%. OSM land polygons do have holes.
"Just use pyproj directly" looks like an obvious simplification, so there is a
test standing in front of it.
