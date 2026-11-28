#!/usr/bin/env bash
# ==============================================================================
# Gather — release.sh (used by .github/workflows/deploy.yml)
# ==============================================================================
# WHAT THIS SCRIPT DOES
#   Update pre-provisioned resources only. Does not create SQL, IAM or secrets.
#   (Create those once with deploy/deploy.sh.)
#   Normal release : verify image -> run migration job -> update service.
#   Rollback       : verify image -> update service (NO migration, NO seed).
#
# INPUT (environment variables)
#   PROJECT_ID, REGION, IMAGE_TAG   required (IMAGE_TAG = full 40-char commit SHA)
#   SERVICE_NAME, MIGRATE_JOB_NAME  optional (default: gather, gather-migrate)
#   ROLLBACK                        true | false (default false)
#   EXPECTED_IMAGE_DIGEST           optional sha256 digest to verify before deploy
#   GITHUB_ENV                      when set, SERVICE_URL / DEPLOYED_IMAGE are
#                                   appended so later workflow steps can use them
#
# ⭐ IMPORTANT
#   - If the migration job fails, `set -e` stops the script BEFORE the service is
#     updated, so a broken migration never reaches users.
#   - The image is resolved to an immutable @sha256 digest so the job and the
#     service run exactly the same image.
#   - Offline test: deploy/tests/test_release_stub.sh
#
# REFERENCES
#   - gcloud run jobs update/execute : https://cloud.google.com/sdk/gcloud/reference/run/jobs
#   - gcloud run services update     : https://cloud.google.com/sdk/gcloud/reference/run/services/update
#   - update-traffic (--to-latest)   : https://cloud.google.com/sdk/gcloud/reference/run/services/update-traffic
#   - Artifact Registry images       : https://cloud.google.com/sdk/gcloud/reference/artifacts/docker/images/describe
#
# ⭐ CHANGE ME — groups using another tech stack must review:
#   # CHANGE ME: default SERVICE_NAME / MIGRATE_JOB_NAME and the image path
#   #            `gather/gather` (Artifact Registry repo / image name)
#   # CHANGE ME: how the migration is run (the Cloud Run job is created by
#   #            deploy/deploy.sh step 10 — change the command there)
# ==============================================================================
set -euo pipefail

# ------------------------------------------------------------------------------
# 1. Read and validate inputs (fail before any GCP call)
# ------------------------------------------------------------------------------
: "${PROJECT_ID:?Required}" "${REGION:?Required}" "${IMAGE_TAG:?Required}"
# CHANGE ME: default resource names.
SERVICE_NAME="${SERVICE_NAME:-gather}"
MIGRATE_JOB_NAME="${MIGRATE_JOB_NAME:-gather-migrate}"
ROLLBACK="${ROLLBACK:-false}"
ACTIVATE_LIFECYCLE="${ACTIVATE_LIFECYCLE:-false}"
export ROLLBACK ACTIVATE_LIFECYCLE
[[ "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid image tag.' >&2; exit 1; }
[[ "$ROLLBACK" == true || "$ROLLBACK" == false ]] || { echo 'Invalid rollback mode.' >&2; exit 1; }
[[ "$ACTIVATE_LIFECYCLE" == true || "$ACTIVATE_LIFECYCLE" == false ]] || { echo 'Invalid activation mode.' >&2; exit 1; }

# CP proof comparison is offline only. No authoritative live service/job reader
# is installed yet; do not permit even a fully approved JSON bundle to activate.
if [[ "${LIFECYCLE_DB_FENCE_METHOD:-}" == CLOUDSQL_CREDENTIAL_RETIREMENT_V1 ||
    -n "${CP_FENCE_BUNDLE_PATH:-}" || -n "${CP_APPROVED_PROOF_SHA256:-}" || -n "${CP_ACCEPTED_IMPLEMENTATION_SHA:-}" ||
    -n "${CP_APPROVED_REVIEWER:-}" || "${CP_ACTIVATION_APPROVED:-}" == true ]]; then
  echo 'CP-v1 activation is blocked: offline proof is not live configuration verification.' >&2
  exit 1
fi

# ------------------------------------------------------------------------------
# 2. Find the image and pin it by digest
#    CHANGE ME: `gather/gather` = <Artifact Registry repo>/<image name>.
# ------------------------------------------------------------------------------
IMAGE_REPO="$REGION-docker.pkg.dev/$PROJECT_ID/gather/gather"
IMAGE="$IMAGE_REPO:$IMAGE_TAG"
# Resolve to a digest so the job and service run the exact same immutable image.
DIGEST_IMAGE="$(gcloud artifacts docker images describe "$IMAGE" --project="$PROJECT_ID" --format='value(image_summary.fully_qualified_digest)')"
[[ "$DIGEST_IMAGE" == "$IMAGE_REPO@sha256:"* ]] || { echo 'Image digest not found.' >&2; exit 1; }
if [[ -n "${EXPECTED_IMAGE_DIGEST:-}" && "$DIGEST_IMAGE" != "$IMAGE_REPO@$EXPECTED_IMAGE_DIGEST" ]]; then
  echo 'Resolved image digest does not match the approved image digest.' >&2
  exit 1
fi

# A traffic rollback does not undo database state. No unverified old reader may
# receive traffic once lifecycle state exists. Validate BEFORE any mutation.
"${PYTHON_COMMAND:-python3}" "$(dirname "$0")/verify_lifecycle_release.py"
LIFECYCLE_WRITES=false
if [[ "$ACTIVATE_LIFECYCLE" == true ]]; then LIFECYCLE_WRITES=true; fi

# ------------------------------------------------------------------------------
# 3. Database migration (normal release only; `--wait` blocks until it finishes)
#    ⭐ IMPORTANT: a failure here aborts the release (set -e) — service untouched.
# ------------------------------------------------------------------------------
if [[ "$ROLLBACK" == false ]]; then
  gcloud run jobs update "$MIGRATE_JOB_NAME" --image="$DIGEST_IMAGE" --project="$PROJECT_ID" --region="$REGION" --quiet
  gcloud run jobs execute "$MIGRATE_JOB_NAME" --wait --project="$PROJECT_ID" --region="$REGION" --quiet
else
  echo 'Rollback: reuse existing image; skip tests, build, migration and seed.'
fi

# ------------------------------------------------------------------------------
# 4. Point the Cloud Run service at the image and send it 100% of traffic
# ------------------------------------------------------------------------------
gcloud run services update "$SERVICE_NAME" --image="$DIGEST_IMAGE" \
  --update-env-vars="REGISTRATION_LIFECYCLE_WRITES_ENABLED=$LIFECYCLE_WRITES" \
  --project="$PROJECT_ID" --region="$REGION" --quiet
# Restore 100% traffic to the new latest revision even if it was previously pinned.
gcloud run services update-traffic "$SERVICE_NAME" --to-latest --project="$PROJECT_ID" --region="$REGION" --quiet

# ------------------------------------------------------------------------------
# 5. Report the URL (and hand it to the next workflow steps via GITHUB_ENV)
# ------------------------------------------------------------------------------
SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"
echo "Service URL: $SERVICE_URL"
if [[ -n "${GITHUB_ENV:-}" ]]; then
  printf 'SERVICE_URL=%s\nDEPLOYED_IMAGE=%s\n' "$SERVICE_URL" "$DIGEST_IMAGE" >> "$GITHUB_ENV"
fi
