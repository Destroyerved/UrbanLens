# Deploying UrbanLens

The shipped setup is split: **Next on Vercel, the Python engine on a Hugging
Face Space**, with the browser calling the engine directly.

```
browser ──▶ vercel.app        Next (static)
       └──▶ hf.space          FastAPI engine  ──▶ web/data/engine layers
```

## Why the browser calls the engine directly

Next can proxy `/api/*` server-side — `web/next.config.mjs` rewrites to
`BACKEND_API_URL` — and that avoids CORS. Do not use it here.

A free engine sleeps when idle and the first request after that takes ~30s
(measured: `/api/bootstrap?city=ahmedabad` returned 8.3 MB in 26.7s cold). A
browser will happily wait that out. Vercel's proxy will not — it returns a
gateway timeout first, and every panel shows an error that looks like a
frontend bug. Calling the origin directly puts the wait where it belongs.

CORS is already handled: `app/main.py` defaults `allow_origins` to `*`. Set
`URBANLENS_CORS_ORIGINS` to your Vercel domain to tighten it.

## Frontend — Vercel

Root directory `web`. One environment variable:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<user>-<space>.hf.space` |

`NEXT_PUBLIC_*` is inlined at build time, so set it **before** deploying; an
existing deployment will not pick it up without a redeploy. With it unset,
`lib/api.ts` falls back to a relative path, the rewrite in `next.config.mjs`
targets `http://127.0.0.1:8000`, and every call fails.

Leave `BACKEND_API_URL` unset.

## Engine — Hugging Face Space

### The Space must be public

A private Space requires an auth token on every request, so a browser on
vercel.app cannot call it. The Space therefore has to be public — which means
the engine layers it carries become publicly downloadable, even though the
GitHub repo is private. The data is derived from OpenStreetMap, Census of
India, Sentinel-2 and Copernicus DEM, all public sources, so this is normally
fine. It is still a deliberate decision, not a detail. Note that the API
serves this data publicly regardless; pushing the files additionally makes
them browsable in the Space repo.

### Assembling it

The GitHub repo is private, so an HF build machine cannot clone it and the
data travels in the Space repo instead. Hugging Face is git-LFS native, which
is what makes a 626 MB repo practical there.

```bash
# 1. Create a Docker Space: https://huggingface.co/new-space
#    SDK: Docker, template: Blank, visibility: Public.

# 2. Clone it and fill it in.
git clone https://huggingface.co/spaces/<user>/<space> ../urbanlens-space
bash deploy/hf-space/assemble.sh ../urbanlens-space

# 3. Push. Username is your HF username; password is a WRITE token from
#    https://huggingface.co/settings/tokens
cd ../urbanlens-space
git add -A && git commit -m "UrbanLens engine"
git push
```

`assemble.sh` copies `backend/` (4 MB, minus the local SQLite cache),
`datasets/` (75 MB of DEM/GHSL/Esri tiles) and `web/data/engine/` (547 MB of
OSM + census layers), then configures LFS. It skips `web/public/data` — the
frontend's prebuilt bootstrap payloads, which Vercel serves.

LFS matters: 13 files exceed Hugging Face's 10 MB non-LFS limit, all of them
`*_streets.json`, the largest 29 MB. `assemble.sh` writes `.gitattributes`
and runs `git lfs install --local` before anything is staged, because
attributes applied after the fact do not retroactively convert staged blobs.

The first push moves ~626 MB. The build then takes several minutes, mostly
~575 MB of Python wheels. Watch it under the Space's **Logs** tab.

### Updating

Re-run `assemble.sh` against the Space clone and push. There is no build-time
fetch to invalidate, so a push is all it takes.

## Verifying

```bash
curl "https://<user>-<space>.hf.space/api/health?city=ahmedabad"
```

`database.enabled` is `false` and that is correct — no DB ships with the
image. `backend/urbanlens.db` is a local cache; with it absent
`app/data/loader.py` selects `FilesystemSource` and reads the committed
GeoJSON directly. Verified end to end: all 34 districts resolve, equity
returns 48 wards for Ahmedabad, conservation returns 25 zones.

Then confirm the browser path — open the Vercel URL, and in devtools check
that requests go to `*.hf.space` rather than to the Vercel origin.

## Resources

The free CPU tier (16 GB RAM, 2 vCPU) covers the whole state. That headroom
matters: Kutch is 131,000 parcels over a 620,000-cell population grid, and the
corridor router allocates the full cost surface. A 512 MB tier runs two or
three districts and OOMs on the large ones — and the platform usually restarts
the instance rather than returning an error, so it presents as a hang.

Free Spaces sleep after extended inactivity and wake on request, which is the
~30s cold start above.

## The copilot

Ollama does not run on a Space. `app/llm/copilot.py` falls back to the
deterministic router in `app/gis/copilot.py`, which answers the same questions
from the same tools. To run the LLM, point it at a hosted API rather than
attempting inference in the container.

## Alternative: everything in one container

The root `Dockerfile` and `docker/start.sh` run both processes together, with
Next on the public port proxying to uvicorn on loopback. That suits Cloud Run,
Fly, or a plain VM, and is the right shape if you ever want a single
self-contained deployment. It is not what the Vercel + Space split uses.

Without Docker locally you can still exercise it:

```bash
npm run build --prefix web
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 &
npm run start --prefix web -- --hostname 127.0.0.1 --port 7860
```
