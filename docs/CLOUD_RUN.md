# Deploying the engine to Cloud Run

Next on Vercel, the Python engine on Cloud Run, browser calling the engine
directly.

```
browser ──▶ vercel.app          Next (static)
       └──▶ *.run.app           FastAPI engine
```

## Why this host

The engine's memory ceiling is set by its largest district, and that number
decides everything. Measured peak RSS on a cold process with no SQLite cache
present, so layers parse from GeoJSON and parcels are built from street
geometry — the deployed configuration:

| District | Peak RSS | Parcels | Time |
|---|---|---|---|
| Ahmedabad | 556 MB | 17,215 | 19.5s |
| Kutch | **2,956 MB** | 131,125 | 101s |

That rules out every 512 MB free tier, Render included. It is also why the
service is provisioned at 4 GiB: Kutch needs roughly 3 GB in one request, and
that is a single-request peak, not something reduced by serving fewer
districts.

## Why the browser calls the engine directly

Next can proxy `/api/*` server-side — `web/next.config.mjs` rewrites to
`BACKEND_API_URL`. Do not use it here. A cold engine takes a minute to answer;
a browser waits, an edge proxy returns a gateway timeout first, and every
panel then shows what looks like a frontend bug. CORS is handled:
`app/main.py` defaults `allow_origins` to `*`.

## Prerequisites

A Google account with **billing enabled**. Cloud Run's free tier does not
require payment at demo volume, but it does require a billing account to
exist. Set a budget alert before you start — Billing → Budgets & alerts.

Then either install the CLI, or skip installing anything and use
[Cloud Shell](https://shell.cloud.google.com), which has `gcloud` and Docker
preinstalled:

```bash
gcloud auth login && gcloud config set project <PROJECT_ID>
```

## Deploying

From the repo root:

```bash
bash deploy/cloudrun/deploy.sh
```

It enables the three required APIs, creates an Artifact Registry repo if one
is missing, builds via Cloud Build, deploys, and prints the service URL. Safe
to re-run; that is also how you ship updates.

The build uploads ~630 MB — `backend/`, `datasets/`, `web/data/engine/`.
`.gcloudignore` keeps out the 251 MB SQLite cache, the 72 MB of frontend
bootstrap payloads, `node_modules` and `.git`; without it `gcloud` falls back
to `.gitignore` semantics and sends roughly 1.5 GB.

`cloudbuild.yaml` exists rather than `gcloud run deploy --source .` because
that form only finds a Dockerfile at the repo root — and a root Dockerfile is
precisely what must not exist here. Render auto-detects one and switches an
existing service to a Docker build, which is how the backend broke once
already.

## The settings that matter

| Flag | Why |
|---|---|
| `--memory 4Gi` | Kutch peaks at 2,956 MB. 2 GiB OOMs. |
| `--concurrency 4` | Memory-bound, not CPU-bound. The default 80 lets eighty requests share one instance's 4 GiB and kill it. |
| `--max-instances 2` | Cost ceiling. Cloud Run scales on load and bills for it. |
| `--timeout 600` | Kutch's first request is ~100s warm; the 300s default is close once a cold start is added. |
| `--min-instances 0` | Scale to zero. `1` would keep an instance billing continuously and blow the free grant. |
| `--cpu-boost` | Extra CPU during startup, which is where the pain is. |

## What the free tier covers

Per month: 2M requests, 180,000 vCPU-seconds, 360,000 GiB-seconds. At 2 vCPU
and 4 GiB that is about **25 hours of active request processing** — ample for
a demo, since billing only accrues while a request is in flight.

The real risk is not usage, it is a misconfiguration that pins instances
alive. `--min-instances 0` and `--max-instances 2` are the guards.

## Verifying

```bash
curl "https://<service>-<hash>.a.run.app/api/health?city=ahmedabad"
```

`database.enabled: false` is correct — no DB ships in the image; the loader
selects `FilesystemSource` and reads the committed GeoJSON. Verified end to
end: all 34 districts resolve, Ahmedabad equity returns floor 39.6 with Gini
0.1593 over 48 wards.

Then in Vercel set `NEXT_PUBLIC_API_URL` to the service URL and **redeploy** —
`NEXT_PUBLIC_*` is inlined at build time, so an existing deployment will not
pick it up. Leave `BACKEND_API_URL` unset.

## Cold starts

Scaling to zero means the first request after idle pays for the container
pull plus Python imports. Open the URL a minute before demoing. Requesting
Kutch cold is the worst case; Ahmedabad is much lighter.

## Other hosts

`deploy/engine/Dockerfile` honours `$PORT` and binds `0.0.0.0`, so the same
image runs on a Hugging Face Docker Space (see [HF_SPACES.md](HF_SPACES.md) —
note those now require a PRO subscription), Fly, or any VM.
`docker/Dockerfile` is a different thing: both processes in one container,
for when you want a single self-contained deployment.
