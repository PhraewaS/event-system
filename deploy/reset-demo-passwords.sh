#!/usr/bin/env bash
set -euo pipefail

# One-time password reset for the four seeded demo accounts. This is deliberately
# separate from deploy.sh/seed.js: ordinary deployment and seed reruns must not
# change existing account credentials.

: "${PROJECT_ID:?Set PROJECT_ID to the approved GCP project}"
: "${REGION:?Set REGION to the Cloud Run/Cloud SQL region}"
: "${IMAGE_DIGEST:?Set IMAGE_DIGEST to the reviewed image sha256 digest}"
: "${DEMO_SECRET_VERSION:?Set DEMO_SECRET_VERSION to the reviewed JSON secret version}"

if [[ ! "$IMAGE_DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo "ERROR: IMAGE_DIGEST must be sha256:<64 lowercase hex characters>." >&2
  exit 2
fi
if [[ ! "$DEMO_SECRET_VERSION" =~ ^[1-9][0-9]*$ ]]; then
  echo "ERROR: DEMO_SECRET_VERSION must be a numeric Secret Manager version." >&2
  exit 2
fi

REPO_NAME="gather"
SERVICE_NAME="gather"
SQL_INSTANCE="gather-pg"
DB_SECRET="gather-database-url"
DEMO_SECRET="gather-demo-password"
SA_EMAIL="gather-runner@${PROJECT_ID}.iam.gserviceaccount.com"
SQL_CONN_NAME="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}@${IMAGE_DIGEST}"
JOB_NAME="${SERVICE_NAME}-demo-password-reset"

printf 'This will reset the four seeded demo accounts and invalidate their sessions in project %s, region %s.\n' "$PROJECT_ID" "$REGION"
read -r -p 'Type the project ID to continue: ' CONFIRMED_PROJECT
if [[ "$CONFIRMED_PROJECT" != "$PROJECT_ID" ]]; then
  echo "ERROR: project confirmation did not match; no job was run." >&2
  exit 1
fi

gcloud run jobs deploy "$JOB_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --service-account "$SA_EMAIL" \
  --set-cloudsql-instances "$SQL_CONN_NAME" \
  --set-secrets "DATABASE_URL=${DB_SECRET}:latest,DEMO_PASSWORDS_JSON=${DEMO_SECRET}:${DEMO_SECRET_VERSION}" \
  --set-env-vars "NODE_ENV=production,ALLOW_DEMO_PASSWORD_RESET=true,DB_POOL_MAX=3,TZ=Asia/Bangkok" \
  --command node \
  --args dist/server/reset-demo-passwords.js \
  --max-retries 0 \
  --task-timeout 300s \
  --project "$PROJECT_ID"

gcloud run jobs execute "$JOB_NAME" --region "$REGION" --wait --project "$PROJECT_ID"
echo "Password reset job completed. Secret values were not printed."
