#!/usr/bin/env bash
# Outer wrapper: MA generation until 750/750, then automatic L5 backfill on B0 + MA saved refactors.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIDFILE="$ROOT/.run/ma-ref-master-overnight.pid"
SUP_LOG="$ROOT/.run/ma-ref-master-supervisor.log"
MA_STUDY_ID="${MA_STUDY_ID:-ma_ref_master}"
B0_STUDY_ID="${B0_STUDY_ID:-ripple_ref_master}"

# shellcheck disable=SC1091
source "$ROOT/scripts/ripple-ref-lib.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/ma-ref-pipeline-lib.sh"
ripple_ref_load_ports

if ! ma_ref_acquire_wrapper_lock "$ROOT"; then
  exit 0
fi

log() { echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] [wrapper] $*" | tee -a "$SUP_LOG"; }

study_missing() {
  local id="$1"
  curl -sf "$API/ripple-ref/studies/$id/completeness" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d.get('missingArtifacts', 1))
" 2>/dev/null || echo 1
}

post_phase() {
  local phase="$1"
  local state="$2"
  local detail="${3:-}"
  ma_pipeline_post_status "$(python3 -c "
import json,sys
print(json.dumps({
  'phase': sys.argv[1],
  'state': sys.argv[2],
  'backfillDetail': sys.argv[3],
}))
" "$phase" "$state" "$detail")"
}

run_backfill() {
  local study_id="$1"
  local phase="$2"
  log "L5 backfill start: $study_id ($phase)"
  post_phase "$phase" "running" "backfill $study_id"
  set +e
  LOG_FILE="$ROOT/.run/backfill-test-probe-${study_id}.log" \
    bash "$ROOT/scripts/backfill-ripple-ref-test-probe.sh" "$study_id"
  local rc=$?
  set -e
  log "L5 backfill end: $study_id exit=$rc"
  ma_pipeline_post_status "$(ma_pipeline_heal_json "backfill_${study_id}" "$([ "$rc" -eq 0 ] && echo ok || echo fail)" "exit=$rc")"
  return "$rc"
}

if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -dimsu -w $$ &
fi

log "wrapper PID $$ — MA generation then auto L5 backfill (B0 + MA)"
post_phase "ma_generation" "running" "systems 1-15"

while true; do
  missing="$(study_missing "$MA_STUDY_ID")"
  if [ "$missing" = "0" ]; then
    log "MA 750/750 complete — starting automatic L5 backfill"
    break
  fi

  log "starting supervisor (MA missing=$missing)"
  set +e
  bash "$ROOT/scripts/run-ma-ref-master-supervisor.sh"
  rc=$?
  set -e
  log "supervisor exited rc=$rc"
  overnight_lock="$(ma_ref_lock_dir_for "$ROOT" "ma-ref-master-overnight")"
  overnight_pid="$(ma_ref_stale_lock_pid "$overnight_lock")"
  if [ -n "$overnight_pid" ]; then
    log "in-flight overnight batch PID $overnight_pid — waiting (no duplicate supervisor)"
    while kill -0 "$overnight_pid" 2>/dev/null; do
      sleep 30
    done
    ma_ref_stale_lock_pid "$overnight_lock" >/dev/null
    continue
  fi
  log "restart supervisor in 15s"
  sleep 15
done

post_phase "backfill_b0" "running" "replay saved B0 refactors"
run_backfill "$B0_STUDY_ID" "backfill_b0" || true

post_phase "backfill_ma" "running" "replay saved MA refactors"
run_backfill "$MA_STUDY_ID" "backfill_ma" || true

post_phase "complete" "complete" "MA + L5 backfill finished"
ma_pipeline_post_status "$(ma_pipeline_heal_json pipeline_complete ok "MA 750/750 + B0/MA L5 backfill")"
log "all phases complete — wrapper exiting"
ma_ref_release_wrapper_lock "$ROOT"
rm -f "$PIDFILE"
exit 0
