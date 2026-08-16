# UrbanLens

**AI-Powered Urban Planning & Land Intelligence Platform** — frontend.
Smart India Hackathon 2026 · PS-SW-001 (Geospatial Intelligence Platform for Land Resource Analytics and Evidence-Based Decision Making).

> GLIS tells planners what land exists. UrbanLens helps them understand what is happening there, what is likely to happen next, and what should be built where.

Core journey: **Detect Growth → Find Infrastructure Gap → Identify Land → Recommend Site → Simulate Impact → Explain Decision**.

## Stack

Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS · shadcn/ui-style components (Radix primitives) · MapLibre GL JS · zustand · framer-motion · Recharts · cmdk · sonner · next-themes · lucide-react.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Production check:

```bash
npm run build
npm start
```

Other scripts: `npm run lint` · `npm run sanity` (verifies the deterministic analysis engine: rankings, coverage, determinism).

No environment variables or API keys are required. Basemap tiles come from CARTO's free raster basemaps; everything else is local.

## Architecture

```text
app/            Next.js entry (theme provider, fonts, single-page shell)
components/
  layout/       AppShell, TopBar, ModeRail, ThemeToggle
  map/          MapCanvas (persistent MapLibre map), controls, layer manager, legend
  panels/       Overview / Growth / Infrastructure / Land / Site Selection / Simulator
  parcels/      Parcel Intelligence drawer
  copilot/      AI Copilot drawer
  search/       ⌘K command palette
  shared/, ui/  Score bars, animated numbers, shadcn-style primitives
config/         City config (Ahmedabad) + map layer registry
data/           Deterministic demo datasets (wards, parcels, facilities, roads, grid)
lib/            analysis.ts (scoring/simulation engine), store.ts (zustand), geo, seeded PRNG
services/       Async service layer — mock now, FastAPI later (endpoints noted per file)
types/          Domain types mirroring the future PostGIS schema
scripts/        sanity.ts (analysis verification), verify-ui.mjs (headless UI walk)
```

The map is mounted once and never unmounts; modes swap layer presets and the right-hand
intelligence panel. All analytics (suitability, coverage, gaps, simulation, growth
probability) are pure deterministic functions in `lib/analysis.ts` — no `Math.random()`
anywhere in anything presented as analysis.

## Demo-data disclosure

All datasets are **illustrative/demo data modelled on Ahmedabad and a GLIS-style
schema — not official government, AMC, AUDA or legal records.** Facility names reference
real institutions for familiarity; coordinates and attributes are synthetic. The app
displays this disclaimer in the footer.

## Deployment

Standard Next.js — push to a Git repo and import into [Vercel](https://vercel.com)
(zero config, no env vars), or `npm run build && npm start` on any Node 18+ host.

## Handoff

See `URBANLENS_FRONTEND_HANDOFF.md` for status, feature checklist, calculation docs and
backend-integration notes. See `docs/DEMO_SCRIPT.md` for the judge walkthrough.
