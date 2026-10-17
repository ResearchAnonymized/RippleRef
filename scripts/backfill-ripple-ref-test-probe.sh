#!/usr/bin/env bash
#
# Replay L5 targeted test probe (and optional L3 compile) on saved refactors.
# L5: targeted class tests, else full module mvn test (paired before/after).
# L5_PROBE_V2=1 re-runs rows missing test_probe_strategy column.
#
# Usage:
#   ./scripts/backfill-ripple-ref-test-probe.sh ripple_ref_master
#   ./scripts/backfill-ripple-ref-test-probe.sh ma_ref_master
#   MAX=20 ./scripts/backfill-ripple-ref-test-probe.sh ma_ref_master
#   FORCE=1 ./scripts/backfill-ripple-ref-test-probe.sh ripple_ref_master
#
# Env:
#   MAX              max candidates (default: unlimited)
#   FORCE            1 = re-run even if test_probe_status already set
#   COMPILE_PROBE    1 = also run Maven compile in sandbox (slow)
#   WORKSPACE        filter one project id
#   VARIANT          V1 | V2 | MA
#   DRY_RUN          1 = list only
#   LOG_FILE         default .run/backfill-test-probe-<study>.log

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/ripple-ref-lib.sh"
ripple_ref_load_ports

STUDY_ID="${1:-}"
if [ -z "$STUDY_ID" ]; then
  echo "Usage: $0 <study_id>   e.g. ripple_ref_master | ma_ref_master"
  exit 1
fi

LOG_FILE="${LOG_FILE:-$ROOT/.run/backfill-test-probe-${STUDY_ID}.log}"
mkdir -p "$(dirname "$LOG_FILE")"

if [ "$STUDY_ID" = "ma_ref_master" ]; then
  export BACKFILL_PHASE="${BACKFILL_PHASE:-backfill_ma}"
else
  export BACKFILL_PHASE="${BACKFILL_PHASE:-backfill_b0}"
fi
export POST_PIPELINE_PROGRESS="${POST_PIPELINE_PROGRESS:-1}"

ripple_ref_health_check || exit 1

ARGS=(python3 "$SCRIPT_DIR/backfill_ripple_ref_test_probe.py" "$STUDY_ID" --api "$API")
[ -n "${MAX:-}" ] && ARGS+=(--max "$MAX")
[ "${FORCE:-0}" = "1" ] && ARGS+=(--force)
[ "${COMPILE_PROBE:-0}" = "1" ] && ARGS+=(--compile)
[ "${DRY_RUN:-0}" = "1" ] && ARGS+=(--dry-run)
[ -n "${WORKSPACE:-}" ] && ARGS+=(--workspace "$WORKSPACE")
[ -n "${VARIANT:-}" ] && ARGS+=(--variant "$VARIANT")

echo "=== Test-probe backfill: $STUDY_ID ===" | tee "$LOG_FILE"
echo "Started: $(date -u +"%Y-%m-%d %H:%M UTC")" | tee -a "$LOG_FILE"
echo "Log: $LOG_FILE" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

set +e
"${ARGS[@]}" 2>&1 | tee -a "$LOG_FILE"
rc=${PIPESTATUS[0]}
set -e

echo "" | tee -a "$LOG_FILE"
echo "Finished: $(date -u +"%Y-%m-%d %H:%M UTC") exit=$rc" | tee -a "$LOG_FILE"
exit "$rc"
