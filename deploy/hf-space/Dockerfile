# UrbanLens spatial engine — Hugging Face Space (backend only).
#
# The Next frontend lives on Vercel; this Space runs only the FastAPI engine,
# which the browser calls directly via NEXT_PUBLIC_API_URL. That split is
# deliberate: proxying through Vercel's rewrite puts a gateway timeout in front
# of a cold engine, and the first request after idle takes ~27s (measured, see
# docs/HF_SPACES.md). A browser will wait that out; an edge proxy will not.
#
# The data lives in the Space repo rather than being cloned from GitHub at
# build time, because the GitHub repo is private and an HF build machine has no
# credentials for it. Hugging Face is git-LFS native, so the layers push there
# directly. See docs/HF_SPACES.md for which paths to copy in.
#
# Python 3.11 rather than 3.12: rasterio, faiss-cpu and xgboost all publish
# manylinux wheels for it, so this builds without GDAL or a toolchain. Moving
# up a version turns it into a 20-minute source build.
FROM python:3.11-slim-bookworm

# Spaces run the container as uid 1000. The engine writes its parcel cache, the
# FAISS index and the thermal refresh under the app directory, so that user has
# to own it or the first request fails on a read-only path.
RUN useradd -m -u 1000 urbanlens
WORKDIR /app

# Dependencies first: ~575 MB of wheels that change far less often than the
# data, so this layer survives most rebuilds.
COPY --chown=urbanlens:urbanlens backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# backend/ (3.5 MB), datasets/ (74 MB of DEM/GHSL/Esri tiles) and
# web/data/engine/ (546 MB of OSM + census layers) are all the engine reads.
# web/public/data is deliberately absent — those are the frontend's prebuilt
# bootstrap payloads and Vercel serves them.
COPY --chown=urbanlens:urbanlens . .

USER urbanlens

# No database ships here. backend/urbanlens.db is a local cache; with it absent
# app/data/loader.py selects FilesystemSource and reads the committed GeoJSON
# directly — verified end to end, /api/bootstrap returns 8.3 MB for Ahmedabad.
#
# CORS defaults to * because the browser calls this origin cross-site from
# Vercel. Narrow it to your deployment once the domain is known.
ENV PORT=7860 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend \
    URBANLENS_CORS_ORIGINS="*"

EXPOSE 7860

# 0.0.0.0 here, unlike the all-in-one Dockerfile: this is the port the Space
# publishes, not a loopback hop behind a colocated Next server.
CMD ["sh", "-c", "python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port ${PORT}"]
