# UrbanLens — both processes in one container.
#
# The app is a Python spatial engine plus a Next app, and the Next app is
# useless without the engine because every figure it shows is computed there.
# A Docker Space (and Cloud Run, and Fly) exposes exactly one port, so the two
# are colocated: Next listens on the public port and proxies /api and /static
# to uvicorn on loopback. web/next.config.mjs already defaults its rewrite
# target to http://127.0.0.1:8000, so this needs no configuration to work.
#
#   docker build -t urbanlens -f docker/Dockerfile .
#   docker run -p 7860:7860 urbanlens
#
# This lives in docker/ rather than at the repo root on purpose. Render and
# other platforms auto-detect a root Dockerfile and switch the service to a
# Docker build -- which for this file means serving Next on the public port
# and demoting the API to loopback, quietly breaking a backend-only service.
#
# Python 3.11 rather than 3.12: rasterio, faiss-cpu and xgboost all publish
# manylinux wheels for it, so the image builds without a toolchain or a system
# GDAL. Moving up a version is what turns this into a 20-minute source build.
FROM python:3.11-slim-bookworm

# Node is needed at runtime, not just to build: `next start` serves the app.
ENV NODE_VERSION=20
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
 && curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && apt-get purge -y gnupg && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

# Spaces run the container as uid 1000. Everything the engine writes at
# runtime — the parcel pickle cache, the FAISS index, the thermal refresh —
# lives under the app directory, so it has to be owned by that user rather
# than by root, or the first request fails on a read-only path.
RUN useradd -m -u 1000 urbanlens
WORKDIR /app

# Python deps first: they change far less often than application code, so this
# layer survives most rebuilds.
COPY --chown=urbanlens:urbanlens backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Then node deps, for the same reason.
COPY --chown=urbanlens:urbanlens web/package.json web/package-lock.json* web/
RUN npm ci --prefix web

COPY --chown=urbanlens:urbanlens . .

# Build with the loopback origin baked in. NEXT_PUBLIC_* is inlined at build
# time, so leaving it unset here is deliberate: browser calls then go to the
# page's own origin and are rewritten server-side, which is what keeps this
# working behind the Space's TLS proxy without a CORS allowance.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --prefix web \
 && npm prune --omit=dev --prefix web \
 && chown -R urbanlens:urbanlens /app

USER urbanlens

# Spaces default to 7860 and pass no PORT; other hosts pass one. Honour both.
ENV PORT=7860 \
    HOST=0.0.0.0 \
    ENGINE_PORT=8000 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend
EXPOSE 7860

CMD ["bash", "docker/start.sh"]
