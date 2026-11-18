#!/usr/bin/env bash
# Offline only: all deletions go to a local gcloud stub, never to GCP.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_STATE_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_STATE_DIR"' EXIT
mkdir -p "$TEST_STATE_DIR/bin"
cat > "$TEST_STATE_DIR/bin/gcloud" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$GCLOUD_LOG"
case "$STUB_MODE:$*" in
  single:sql\ instances\ delete*|multiple:sql\ instances\ delete*|multiple:secrets\ delete\ gather-session-secret*)
    echo 'PERMISSION_DENIED: synthetic deletion failure' >&2; exit 1 ;;
esac
STUB
chmod +x "$TEST_STATE_DIR/bin/gcloud"
export PATH="$TEST_STATE_DIR/bin:$PATH"
export PROJECT_ID=stub-gcp-project
export DRY_RUN=0
for MODE in success single multiple; do
  export STUB_MODE="$MODE"
  export GCLOUD_LOG="$TEST_STATE_DIR/$MODE.log"
  result=0
  printf '%s\n' "$PROJECT_ID" | bash "$SCRIPT_DIR/../teardown.sh" > "$TEST_STATE_DIR/output" 2>&1 || result=$?
  test "$(wc -l < "$GCLOUD_LOG")" -eq 9
  if [ "$MODE" = success ]; then
    test "$result" -eq 0
    grep -q '^Teardown completed\.$' "$TEST_STATE_DIR/output"
  else
    if [ "$result" -eq 0 ]; then
      echo "FAIL $MODE: teardown reported success after a failed deletion"; exit 1
    fi
    ! grep -q '^Teardown completed\.$' "$TEST_STATE_DIR/output"
    grep -q '^Teardown incomplete. Failed resources:' "$TEST_STATE_DIR/output"
    grep -q '^ - Cloud SQL instance: gather-pg$' "$TEST_STATE_DIR/output"
    if [ "$MODE" = multiple ]; then
      grep -q '^ - Secret: gather-session-secret$' "$TEST_STATE_DIR/output"
      test "$(grep -c '^ - ' "$TEST_STATE_DIR/output")" -eq 2
    else
      test "$(grep -c '^ - ' "$TEST_STATE_DIR/output")" -eq 1
    fi
  fi
  echo "PASS: teardown $MODE (all deletions attempted, accurate exit and summary)"
done
export GCLOUD_LOG="$TEST_STATE_DIR/not-confirmed.log"
result=0
printf 'wrong-project\n' | bash "$SCRIPT_DIR/../teardown.sh" > "$TEST_STATE_DIR/output" 2>&1 || result=$?
test "$result" -ne 0
test ! -f "$GCLOUD_LOG"
echo 'PASS: teardown incorrect confirmation makes no gcloud calls'
DRY_RUN=1 bash "$SCRIPT_DIR/../teardown.sh" > "$TEST_STATE_DIR/output"
test ! -f "$GCLOUD_LOG"
echo 'PASS: teardown dry run makes no gcloud calls'
