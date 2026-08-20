# UrbanLens frontend package

This package contains the UrbanLens website and the prebuilt data for all 34
districts. It deliberately excludes raw satellite rasters, generated engine
files, local databases, models, caches, dependencies and build output.

## Run locally

1. Install Node.js 20 or newer.
2. Open a terminal in the `web` folder.
3. Run `npm ci`.
4. Run `npm run dev`.
5. Open `http://localhost:3000/app`.

The district map, observed 2018/2022/2024 built-up time machine, 2030 expansion
likelihood and infrastructure-gap intensity work from the included static
prebuilt files. Features that require the optional Python API (such as Copilot)
are not included in this frontend-only package.
