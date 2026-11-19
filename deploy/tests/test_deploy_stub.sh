#!/usr/bin/env bash
# Offline regression checks: every gcloud and openssl call is a local stub.
# ==============================================================================
# WHAT THIS TEST DOES (no real GCP calls, no cost)
#   Puts fake `gcloud` / `openssl` first on PATH and runs deploy/deploy.sh in
#   these scenarios, asserting on the recorded commands:
#     first_run : nothing exists      -> everything is created
#     rerun     : everything exists   -> nothing replaced (credentials kept)
#     partial   : DB secret missing   -> DB user password reset + secret created
#     job-fail  : migration fails     -> script exits 1, service NOT deployed
#     demo      : --demo flag         -> demo secret is created and granted
#     secret-denied/unavailable/malformed -> unknown state stops credential writes
#   It also checks: `--edition=enterprise`, no project-wide secretAccessor role,
#   DB password == password inside DATABASE_URL, and that no password/secret
#   value leaks into the output. Finally DRY_RUN=1 must make zero gcloud calls.
#
# HOW TO RUN (repo root, needs bash):  bash deploy/tests/test_deploy_stub.sh
#   Prints `PASS: <scenario>` per scenario; any `FAIL ...` exits non-zero.
#   CI runs it too (.github/workflows/ci-docker.yml).
#
# ⭐ CHANGE ME: if you rename resources in deploy/deploy.sh (e.g. the secret
#    names gather-database-url / -admin-password / -demo-password, the DB
#    user `gather`), update the matching strings below.
# ==============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SCRIPT="${SCRIPT_DIR}/../deploy.sh"
export TEST_STATE_DIR
TEST_STATE_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_STATE_DIR"' EXIT
mkdir -p "$TEST_STATE_DIR/bin"

# --- Fake `openssl` (deterministic "random" values) ---------------------------
cat > "$TEST_STATE_DIR/bin/openssl" <<'STUB'
#!/usr/bin/env bash
if [ "$2" = "-hex" ]; then
  printf '%s\n' '0123456789abcdef0123456789abcdef0123456789abcdef'
else
  printf '%s\n' 'TESTONLYGENERATEDPASSWORD'
fi
STUB

# --- Fake `gcloud`: logs each call (password redacted), answers per $STUB_MODE
cat > "$TEST_STATE_DIR/bin/gcloud" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
redacted=()
for arg in "$@"; do
  case "$arg" in
    --password=*)
      printf '%s' "${arg#--password=}" > "$TEST_STATE_DIR/sql-pass"
      redacted+=("--password=<REDACTED>") ;;
    *) redacted+=("$arg") ;;
  esac
done
printf '%s\n' "${redacted[*]}" >> "$GCLOUD_LOG"
if [ "${1:-} ${2:-}" = 'config get-value' ]; then
  echo stub-gcp-project
  exit 0
fi
if [ "${1:-} ${2:-}" = 'secrets list' ]; then
  case "$STUB_MODE" in
    secret-denied) echo 'PERMISSION_DENIED: cannot list secrets' >&2; exit 1 ;;
    secret-unavailable) echo 'UNAVAILABLE: cannot inspect secrets' >&2; exit 1 ;;
    secret-malformed) echo 'unexpected inventory'; exit 0 ;;
    first_run) exit 0 ;;
    partial) printf 'projects/stub-gcp-project/secrets/gather-session-secret\n'; exit 0 ;;
  esac
  printf 'projects/stub-gcp-project/secrets/%s\n' gather-database-url gather-session-secret gather-demo-password
  exit 0
fi
if [ "${1:-} ${2:-} ${3:-}" = 'run services describe' ]; then
  echo https://gather-stub.example.invalid
  exit 0
fi
if [ "${1:-} ${2:-} ${3:-}" = 'run jobs execute' ]; then
  [ "$STUB_MODE" != job-fail ]
  exit $?
fi
if [ "${1:-} ${2:-} ${3:-}" = 'secrets versions add' ]; then
  cat > "$TEST_STATE_DIR/payload-${4}"
  exit 0
fi
if [ "${1:-} ${2:-} ${3:-}" = 'sql users list' ]; then
  if [ "$STUB_MODE" = first_run ]; then
    echo postgres
  else
    printf 'postgres\ngather\n'
  fi
  exit 0
fi
for word in "$@"; do
  if [ "$word" = describe ]; then
    case "$STUB_MODE" in
      secret-denied|secret-unavailable|secret-malformed)
        if [ "${1:-}" = secrets ]; then
          echo 'PERMISSION_DENIED: cannot describe secret' >&2; exit 1
        fi ;;
      first_run) exit 1 ;;
      partial)
        if [ "${1:-} ${3:-}" = 'secrets gather-database-url' ]; then
          exit 1
        fi ;;
    esac
  fi
done
STUB
chmod +x "$TEST_STATE_DIR/bin/openssl" "$TEST_STATE_DIR/bin/gcloud"
export PATH="$TEST_STATE_DIR/bin:$PATH"
export PROJECT_ID=stub-gcp-project
export REGION=asia-southeast1
export DRY_RUN=0

# --- Run every scenario and assert on what deploy.sh did ------------------------
for MODE in first_run rerun partial job-fail demo; do
  export STUB_MODE="$MODE"
  [ "$MODE" != demo ] || export STUB_MODE=first_run
  export GCLOUD_LOG="$TEST_STATE_DIR/gcloud-$MODE.log"
  rm -f "$TEST_STATE_DIR/sql-pass" "$TEST_STATE_DIR"/payload-*
  args=()
  if [ "$MODE" = demo ]; then args+=(--demo); fi
  result=0
  bash "$DEPLOY_SCRIPT" "${args[@]}" > "$TEST_STATE_DIR/output" 2>&1 || result=$?
  expected=0
  if [ "$MODE" = job-fail ]; then expected=1; fi
  if [ "$result" -ne "$expected" ]; then
    echo "FAIL $MODE: unexpected exit $result (wanted $expected)"
    exit 1
  fi
  if [ "$MODE" = job-fail ]; then
    if grep -q '^run deploy ' "$GCLOUD_LOG"; then
      echo 'FAIL: service deployed after migration failure'; exit 1
    fi
  else
    grep -q '^run deploy ' "$GCLOUD_LOG"
    grep -q '^run jobs deploy gather-migrate .*--command node --args dist/server/migrate.js' "$GCLOUD_LOG"
    grep -q '^run deploy gather .*SESSION_SECRET=gather-session-secret:latest' "$GCLOUD_LOG"
    grep -q '^run deploy gather .*--port 8080' "$GCLOUD_LOG"
    if grep -q '^run deploy gather .*\(DEMO_PASSWORD\|ALLOW_DEMO_SEED\)' "$GCLOUD_LOG"; then
      echo 'FAIL: web service received seed credentials'; exit 1
    fi
    if [ "$MODE" = demo ]; then
      grep -q '^run jobs deploy gather-seed .*DEMO_PASSWORD=gather-demo-password:latest.*ALLOW_DEMO_SEED=true.*--command node --args dist/server/seed.js' "$GCLOUD_LOG"
    elif grep -q '^run jobs deploy gather-seed ' "$GCLOUD_LOG"; then
      echo 'FAIL: normal deployment ran a seed job'; exit 1
    fi
  fi
  if grep -q '^projects add-iam-policy-binding .*roles/secretmanager.secretAccessor' "$GCLOUD_LOG"; then
    echo 'FAIL: runtime has project-wide secret access'; exit 1
  fi
  for secret in gather-database-url gather-session-secret; do
    grep -q "^secrets add-iam-policy-binding $secret .*roles/secretmanager.secretAccessor" "$GCLOUD_LOG"
  done
  if [ "$MODE" = demo ]; then
    grep -q '^secrets add-iam-policy-binding gather-demo-password ' "$GCLOUD_LOG"
  elif grep -q '^secrets add-iam-policy-binding gather-demo-password ' "$GCLOUD_LOG"; then
    echo 'FAIL: granted optional demo secret in non-demo mode'; exit 1
  fi
  case "$MODE" in
    first_run)
      grep -q -- '--edition=enterprise' "$GCLOUD_LOG"
      grep -q '^sql users create ' "$GCLOUD_LOG" ;;
    partial) grep -q '^sql users set-password ' "$GCLOUD_LOG" ;;
    rerun)
      if grep -Eq '^(secrets create|sql users (create|set-password)) ' "$GCLOUD_LOG"; then
        echo 'FAIL: rerun replaced existing credentials'; exit 1
      fi ;;
  esac
  if [ -f "$TEST_STATE_DIR/sql-pass" ]; then
    db_pass="$(cat "$TEST_STATE_DIR/sql-pass")"
    db_url="$(cat "$TEST_STATE_DIR/payload-gather-database-url")"
    case "$db_url" in
      "postgresql://gather:${db_pass}@"*) ;;
      *) echo 'FAIL: DB password differs from secret'; exit 1 ;;
    esac
    if grep -Fq "$db_pass" "$TEST_STATE_DIR/output"; then
      echo 'FAIL: DB password leaked to output'; exit 1
    fi
  fi
  for secret_file in "$TEST_STATE_DIR"/payload-*; do
    [ -f "$secret_file" ] || continue
    secret_value="$(cat "$secret_file")"
    if [ -n "$secret_value" ] && grep -Fq "$secret_value" "$TEST_STATE_DIR/output"; then
      echo 'FAIL: secret payload leaked to output'; exit 1
    fi
  done
  echo "PASS: $MODE (exit, migration gate, credential handling, secret redaction)"
done
# --- Unknown secret state must stop before credential changes -------------------
for MODE in secret-denied secret-unavailable secret-malformed; do
  export STUB_MODE="$MODE"
  export GCLOUD_LOG="$TEST_STATE_DIR/gcloud-$MODE.log"
  result=0
  bash "$DEPLOY_SCRIPT" --demo > "$TEST_STATE_DIR/output" 2>&1 || result=$?
  if [ "$result" -eq 0 ]; then
    echo "FAIL $MODE: deployment succeeded without knowing secret state"; exit 1
  fi
  if grep -Eq '^(sql users (create|set-password)|secrets (create|versions add)|builds submit|run deploy) ' "$GCLOUD_LOG"; then
    echo "FAIL $MODE: deployment changed credentials or continued after failed inspection"; exit 1
  fi
  grep -q 'Cannot determine Secret Manager state' "$TEST_STATE_DIR/output"
  echo "PASS: $MODE (unknown secret state stops before credential changes)"
done

# --- Dry run must not call gcloud at all ------------------------------------------
export GCLOUD_LOG="$TEST_STATE_DIR/dry-run-calls"
DRY_RUN=1 bash "$DEPLOY_SCRIPT" --demo > "$TEST_STATE_DIR/dry-run-output"
if [ -f "$GCLOUD_LOG" ]; then
  echo 'FAIL: dry run called gcloud'; exit 1
fi
echo 'PASS: dry run makes no gcloud calls'
DRY_RUN=1 bash "$SCRIPT_DIR/../teardown.sh" > "$TEST_STATE_DIR/teardown-dry-output"
test ! -f "$GCLOUD_LOG"
echo 'PASS: teardown preview makes no gcloud calls'
