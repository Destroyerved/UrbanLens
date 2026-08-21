# UrbanLens spatial engine — the API alone, no frontend.
#
# The Next dashboard is on Vercel and the browser calls this image directly
# via NEXT_PUBLIC_API_URL. That is deliberate: proxying through Vercel's
# rewrite puts a gateway timeout in front of a cold engine, and the first
# request after idle can take a minute. A browser waits; an edge proxy does
# not.
#
# Runs anywhere that sets $PORT and expects one listener — Cloud Run (the
# current target), a Hugging Face Docker Space, Fly, or a plain VM. Cloud Run
# injects PORT=8080; the default below covers hosts that inject nothing.
#
# Sizing is not guesswork. Measured peak RSS on a cold process, no SQLite
# cache present, building parcels from street geometry:
#
#     Ahmedabad     556 MB    17,215 parcels
#     Kutch       2,956 MB   131,125 parcels, 101s
#
# Kutch is why this needs 4 GiB and why a 512 MB instance cannot host it.
#
# Python 3.11 rather than 3.12: rasterio, faiss-cpu and xgboost all publish
# manylinux wheels for it, so this builds without GDAL or a toolchain. Moving
# up a version turns it into a 20-minute source build.
FROM python:3.11-slim-bookworm

# Run as a non-root uid. The engine writes its parcel cache, the FAISS index
# and the thermal refresh under the app directory, so that user has to own it
# or the first request fails on a read-only path. (HF Spaces specifically
# requires uid 1000, which is why it is pinned rather than left to Debian.)
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
ENV PORT=8080 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend \
    URBANLENS_CORS_ORIGINS="*"

EXPOSE 8080

# 0.0.0.0, unlike docker/Dockerfile: this is the port the platform publishes,
# not a loopback hop behind a colocated Next server. ${PORT} is honoured so
# Cloud Run's injected 8080 wins over the default above.
CMD ["sh", "-c", "python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port ${PORT}"]
