#!/usr/bin/env bash
set -euo pipefail

# Ufugaji Update — Production Deployment Script
# Deploys Express Backend to Cloud Run and Frontend to Firebase Hosting

PROJECT_ID="ufugaji-update"
REGION="europe-west1"
SERVICE_NAME="ufugaji-backend"

echo "=== 1. Building Production Bundles (Frontend + Server) ==="
npm run build

echo "=== 2. Deploying Express Backend to Cloud Run (${REGION}/${SERVICE_NAME}) ==="
gcloud run deploy "${SERVICE_NAME}" \
  --source . \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --allow-unauthenticated \
  --port 8080

echo "=== 3. Deploying Frontend & Rewrites to Firebase Hosting ==="
firebase deploy --only hosting,firestore:rules,storage:rules --project "${PROJECT_ID}"

echo "=== 4. Verifying Health Endpoint ==="
echo "Testing https://${PROJECT_ID}.web.app/api/health"
curl -sSf "https://${PROJECT_ID}.web.app/api/health" || echo "Note: Initial DNS/routing propagation may take 1-2 minutes."

echo "Production deployment complete!"
