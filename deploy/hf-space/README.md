---
title: UrbanLens Engine
emoji: 🛰️
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
short_description: Spatial analysis API for urban planning across Gujarat
---

# UrbanLens — spatial engine

The FastAPI backend for [UrbanLens](https://github.com/Destroyerved/UrbanLens).
This Space serves the API only; the Next dashboard is hosted separately and
calls this origin directly.

Analysis runs over real municipal ward boundaries, OpenStreetMap land,
infrastructure and water layers, Sentinel-2 NDVI, Copernicus DEM and a
census-grounded population raster, for all 34 districts of Gujarat.

## Endpoints

| Route | Returns |
|---|---|
| `GET /api/health?city=<id>` | liveness and which data source is active |
| `GET /api/bootstrap?city=<id>` | wards, population grid, facilities, roads |
| `GET /api/equity?city=<id>` | ward equity index, population-weighted Gini |
| `GET /api/conservation?city=<id>` | ecological sensitivity x growth pressure |
| `GET /api/encroachment?city=<id>` | built-up intruding into water and green space |
| `POST /api/corridor` | least-cost infrastructure corridor |
| `GET /api/provenance?city=<id>` | measured vs derived vs modelled, per layer |

Interactive docs at `/docs`.

## Notes

The first request after a cold start takes roughly 30 seconds — the engine
builds its parcel and population caches on demand. Subsequent requests are
served from memory.

No database ships with this image. `backend/urbanlens.db` is a local cache;
with it absent the loader reads the committed GeoJSON layers directly, which
is the intended configuration here.

Code and data live in this repo rather than being fetched at build time. To
update, re-run `deploy/hf-space/assemble.sh` against a clone of this Space and
push; the build then picks the changes up automatically.
