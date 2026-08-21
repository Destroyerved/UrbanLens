#!/usr/bin/env bash
# Deploy the UrbanLens engine to Cloud Run.
#
#   bash deploy/cloudrun/deploy.sh
#
# Run from the repo root, with gcloud authenticated and a project selected.
# Safe to re-run: it creates what is missing and updates what exists.
set -euo pipefail

REGION="${REGION:-asia-south1}"          # Mumbai
SERVICE="${SERVICE:-urbanlens-engine}"
REPO="${REPO:-urbanlens}"

PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
if [ -z "$PROJECT" ] || [ "$PROJECT" = "(unset)" ]; then
  echo "error: no project selected. Run: gcloud config set project <PROJECT_ID>" >&2
  exit 2
fi
echo "project: $PROJECT   region: $REGION   service: $SERVICE"

echo "==> enabling APIs (no-op if already on)"
gcloud services enable \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  --project "$PROJECT"

echo "==> ensuring Artifact Registry repo"
gcloud artifacts repositories describe "$REPO" \
  --location "$REGION" --project "$PROJECT" >/dev/null 2>&1 || \
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker --location "$REGION" --project "$PROJECT" \
  --description="UrbanLens images"

echo "==> building (~630 MB upload, several minutes)"
gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions "_REGION=${REGION},_REPO=${REPO},_IMAGE=${SERVICE},SHORT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo manual)" \
  --project "$PROJECT" .

IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/${SERVICE}:latest"

echo "==> deploying"
# --memory 4Gi: Kutch peaks at 2,956 MB building 131,125 parcels. 2Gi OOMs.
# --concurrency 4: memory-bound, not CPU-bound. The default of 80 would let
#   eighty simultaneous requests share one instance's 4 GiB and kill it.
# --max-instances 2: a cost ceiling. Cloud Run scales on load and bills for
#   it; without this a crawler could run up a real bill on a free-tier grant.
# --timeout 600: Kutch's first request takes ~100s warm; the default 300s is
#   uncomfortably close once a cold start is added.
# --cpu-boost: extra CPU during startup, which is where the pain is.
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --project "$PROJECT" \
  --platform managed \
  --allow-unauthenticated \
  --memory 4Gi \
  --cpu 2 \
  --concurrency 4 \
  --timeout 600 \
  --min-instances 0 \
  --max-instances 2 \
  --cpu-boost \
  --set-env-vars "URBANLENS_CORS_ORIGINS=*"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" \
        --project "$PROJECT" --format='value(status.url)')"

echo
echo "engine URL: $URL"
echo
echo "verify:"
echo "  curl \"$URL/api/health?city=ahmedabad\""
echo
echo "then set NEXT_PUBLIC_API_URL=$URL in Vercel and redeploy."
