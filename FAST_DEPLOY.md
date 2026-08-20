# UrbanLens — Ultra-Fast Free Deployment

This build is optimized for a Vercel frontend + Python/FastAPI backend (Render or any similar host).
The dashboard's critical map data is served directly by the frontend CDN, so a sleeping free-tier Python host does **not** block the first map render.

## 1. Backend

```bash
cd backend
python -m venv .venv
# activate it
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Health/docs:

```text
http://localhost:8000/api/health
http://localhost:8000/docs
```

The bundled `backend/urbanlens.db` is detected automatically. Override it with:

```bash
URBANLENS_DB=/path/to/urbanlens.db
```

A missing/empty DB is self-initialized and the requested city's source layers can be auto-seeded from `web/data/engine`.

## 2. Frontend

```bash
cd web
npm install
npm run dev
```

Local development automatically targets `http://localhost:8000`.

### Vercel

Recommended environment variable:

```env
BACKEND_API_URL=https://YOUR-BACKEND.example.com
```

`NEXT_PUBLIC_API_URL` is optional. If it is omitted in production, browser API calls use same-origin `/api/*` and Next rewrites them to `BACKEND_API_URL`. This avoids CORS and prevents a production browser from accidentally trying its own `localhost:8000`.

If you intentionally want browser-direct API calls, set:

```env
NEXT_PUBLIC_API_URL=https://YOUR-BACKEND.example.com
```

## 3. Prebuilt CDN fast path

Prebuilt critical dashboard payloads are included for:

- Ahmedabad
- Gandhinagar
- Surat
- Vadodara
- Rajkot

Files live at:

```text
web/public/data/bootstrap/<city>.json.gz
```

They contain compact wards, render-budgeted roads, parcel intelligence, a downsampled analysis grid, facilities, and precomputed panel summaries.

Optional vegetation/greenspace is separate so it does not slow first paint:

```text
web/public/data/optional/<city>.json.gz
```

`next.config.mjs` serves these as immutable-style cacheable gzip JSON. A city without a static artifact automatically falls back to `/api/bootstrap`.

## 4. Rebuild fast caches/static artifacts

```bash
python scripts/build-fast-cache.py --city ahmedabad
```

Multiple cities:

```bash
python scripts/build-fast-cache.py \
  --city ahmedabad \
  --city gandhinagar \
  --city surat \
  --city vadodara \
  --city rajkot
```

This builds/refreshes:

- SQLite GIS layer cache
- persistent enriched parcel cache
- persistent infrastructure/livability/growth caches
- compact CDN bootstrap payload
- CDN vegetation/greenspace payload
- normalized parcel vector matrix
- FAISS `IndexFlatIP` index when `faiss-cpu` is installed

If FAISS is unavailable, exact NumPy cosine search is used automatically.

## 5. Vector endpoints

```text
GET /api/vector/status?city=ahmedabad
GET /api/parcels/{parcel_id}/similar?city=ahmedabad&limit=10
```

## 6. Main performance changes

- Critical dashboard no longer waits for Render/FastAPI when a static city payload exists.
- Eight startup API requests collapsed into one compact payload.
- Full parcel enrichment survives restarts in SQLite.
- Derived growth/gap/livability results survive restarts.
- Source-signature invalidation prevents stale compute caches.
- Same-key cache misses use single-flight locking.
- No 37-city startup prewarm.
- `/api/health` is constant-time unless `deep=true`.
- The frontend starts a `deep=true` warm in browser idle time so site selection is hot before interaction.
- MapLibre parses only Overview sources initially; prediction/gap/heat/built-up sources are lazy.
- Road render features are capped while the complete road API remains available.
- Population/growth render grid is downsampled for visual use; analytical summaries remain full-resolution backend results.
- Thermal status/raster no longer wakes the backend unless the UHI layer is enabled.
- NDVI + greenspace use lazy CDN payloads.
- City datasets are cached per city in the browser.
- Zoning conflict list is derived from already-loaded signed parcel intelligence instead of another request.
- Simulator starts backend computation immediately instead of intentionally waiting ~2 seconds first.
- GZip + ORJSON enabled.
- Landing CityStage is lazy, globe is low-cost WebGL, and Earth textures are ~1 MB total instead of ~22 MB.
- Heavy full-screen backdrop blur was reduced to improve map FPS.

## 7. Production notes

For the fastest free demo:

1. Deploy `web/` to Vercel.
2. Deploy `backend/` to Render or another Python host.
3. Set `BACKEND_API_URL` in Vercel.
4. Keep the five generated `web/public/data/...` city payloads committed/deployed.
5. Install `faiss-cpu` normally on the backend; if that wheel is unavailable on a platform, NumPy fallback keeps similarity search working.

The map should remain usable even while a sleeping free backend is waking; dynamic actions become fast once the idle-time deep warm completes.
