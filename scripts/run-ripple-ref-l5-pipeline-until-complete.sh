#!/usr/bin/env bash
#
# Unified Ripple REF L5 behavioral testing pipeline:
#   Phase 1 — ma_ref_master paired L5 backfill (v2)
#   Phase 2 — ripple_ref_master paired L5 backfill (v2)
# Posts progress to ripple_ref_master pipeline-status for the Ripple REF study UI.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/ripple-ref-lib.sh"
ripple_ref_load_ports

MA_STUDY_ID="${MA_STUDY_ID:-ma_ref_master}"
B0_STUDY_ID="${B0_STUDY_ID:-ripple_ref_master}"
UI_STUDY_ID="${UI_STUDY_ID:-ripple_ref_master}"
LOCKDIR="$ROOT/.run/ripple-ref-l5-pipeline-until-complete.lockdir"
LOG="$ROOT/.run/ripple-ref-l5-pipeline-until-complete.log"
PIDFILE="$ROOT/.run/ripple-ref-l5-pipeline.pid"
DETACH="$ROOT/scripts/detach_daemon.py"

mkdir -p "$ROOT/.run"

log() {
  echo "[$(date -u +"%Y-%m-%d %H:%M UTC")] $*" | tee -a "$LOG"
}

fetch_pending() {
  local study_id="$1"
  curl -sf "$API/ripple-ref/studies/$study_id/verification-summary" 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(int(d.get('l5Pending', 0)))
except Exception:
    print(-1)
" 2>/dev/null || echo -1
}

post_pipeline() {
  local body="$1"
  curl -sf -X POST "$API/ripple-ref/studies/$UI_STUDY_ID/pipeline-status" \
    -H 'Content-Type: application/json' \
    -d "$body" >/dev/null 2>&1 || true
}

backfill_running_for() {
  local study_id="$1"
  pgrep -f "backfill_ripple_ref_test_probe.py $study_id" >/dev/null 2>&1 \
    || pgrep -f "backfill-ripple-ref-test-probe.sh $study_id" >/dev/null 2>&1
}

any_l5_backfill_running() {
  backfill_running_for "$MA_STUDY_ID" || backfill_running_for "$B0_STUDY_ID"
}

supervisor_running() {
  pgrep -f "run-ripple-ref-l5-pipeline-until-complete.sh" >/dev/null 2>&1
}

ma_only_supervisor_running() {
  pgrep -f "run-ma-l5-backfill-until-complete.sh" >/dev/null 2>&1
}

acquire_lock() {
  if mkdir "$LOCKDIR" 2>/dev/null; then
    echo $$ >"$LOCKDIR/pid"
    echo $$ >"$PIDFILE"
    return 0
  fi
  local old
  old="$(cat "$LOCKDIR/pid" 2>/dev/null || echo "")"
  if [ -n "$old" ] && kill -0 "$old" 2>/dev/null; then
    return 1
  fi
  rm -rf "$LOCKDIR"
  mkdir "$LOCKDIR"
  echo $$ >"$LOCKDIR/pid"
  echo $$ >"$PIDFILE"
}

release_lock() {
  rm -rf "$LOCKDIR"
  rm -f "$PIDFILE"
}

run_backfill_batch() {
  local study_id="$1"
  local phase="$2"
  local backfill_log="$ROOT/.run/backfill-test-probe-${study_id}.log"

  export BACKFILL_TEST_TIMEOUT_SEC="${BACKFILL_TEST_TIMEOUT_SEC:-900}"
  export BACKFILL_PHASE="$phase"
  export POST_PIPELINE_PROGRESS="${POST_PIPELINE_PROGRESS:-1}"
  export L5_PROBE_V2="${L5_PROBE_V2:-1}"
  export PIPELINE_STATUS_STUDY_ID="$UI_STUDY_ID"

  set +e
  LOG_FILE="$backfill_log" \
    L5_PROBE_V2="${L5_PROBE_V2:-1}" \
    PIPELINE_STATUS_STUDY_ID="$UI_STUDY_ID" \
    BACKFILL_PHASE="$phase" \
    bash "$ROOT/scripts/backfill-ripple-ref-test-probe.sh" "$study_id" >>"$LOG" 2>&1
  local rc=$?
  set -e
  return "$rc"
}

wait_phase_complete() {
  local study_id="$1"
  local phase="$2"
  local round=0

  log "=== Phase $phase ($study_id) ==="
  post_pipeline "$(python3 -c "
import json
print(json.dumps({
  'phase': '$phase',
  'state': 'running',
  'backfillStudyId': '$study_id',
  'backfillDetail': 'L5 v2 paired behavioral tests',
}))
")"

  while true; do
    local pending
    pending="$(fetch_pending "$study_id")"
    if [ "$pending" = "-1" ]; then
      log "WARN: backend unreachable — waiting 30s"
      sleep 30
      continue
    fi

    local completed probed
    completed="$(curl -sf "$API/ripple-ref/studies/$study_id/verification-summary" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
c=int(d.get('completedCandidates') or 0)
p=int(d.get('l5Pending') or 0)
print(c, max(0,c-p))
" 2>/dev/null || echo "0 0")"
    probed="${completed#* }"
    completed="${completed%% *}"

    post_pipeline "$(python3 -c "
import json
print(json.dumps({
  'phase': '$phase',
  'state': 'running',
  'backfillStudyId': '$study_id',
  'backfillProcessed': int('$probed'),
  'backfillTotal': int('$completed'),
}))
")"

    if [ "$pending" -eq 0 ]; then
      log "DONE phase $phase: l5Pending=0 for $study_id"
      return 0
    fi

    if backfill_running_for "$study_id" || ma_only_supervisor_running; then
      log "Backfill active for $study_id — pending=$pending (waiting 30s)"
      sleep 30
      continue
    fi

    round=$((round + 1))
    log "Round $round: starting backfill batch for $study_id (pending=$pending)"
    ripple_ref_health_check || {
      log "Health check failed — retry in 60s"
      sleep 60
      continue
    }

    run_backfill_batch "$study_id" "$phase" || true
    log "Batch exit pending_now=$(fetch_pending "$study_id")"
    sleep 5
  done
}

run_supervisor_loop() {
  export L5_PROBE_V2="${L5_PROBE_V2:-1}"
  export PIPELINE_STATUS_STUDY_ID="$UI_STUDY_ID"

  log "=== Ripple REF L5 pipeline (MA → B0) supervisor PID $$ ==="
  log "UI study=$UI_STUDY_ID MA=$MA_STUDY_ID B0=$B0_STUDY_ID"

  post_pipeline '{"phase":"backfill_ma","state":"running","backfillStudyId":"ma_ref_master","backfillDetail":"L5 v2 — MA cohort first"}'

  wait_phase_complete "$MA_STUDY_ID" "backfill_ma"

  post_pipeline '{"phase":"backfill_b0","state":"running","backfillStudyId":"ripple_ref_master","backfillDetail":"L5 v2 — B0 cohort"}'

  wait_phase_complete "$B0_STUDY_ID" "backfill_b0"

  log "ALL COMPLETE: MA + B0 L5 backfill finished"
  curl -sf "$API/ripple-ref/studies/$MA_STUDY_ID/verification-summary" 2>/dev/null | tee -a "$LOG" || true
  curl -sf "$API/ripple-ref/studies/$B0_STUDY_ID/verification-summary" 2>/dev/null | tee -a "$LOG" || true
  post_pipeline '{"phase":"complete","state":"complete","backfillDetail":"MA + B0 L5 v2 complete"}'
  exit 0
}

if [ "${RIPPLE_REF_L5_PIPELINE_WORKER:-}" = "1" ]; then
  trap 'release_lock' EXIT
  if ! acquire_lock; then
    log "Another unified L5 supervisor already running. Exiting."
    exit 0
  fi
  run_supervisor_loop
  exit 0
fi

if supervisor_running; then
  echo "Ripple REF L5 pipeline supervisor already running."
  exit 0
fi

if [ -f "$DETACH" ]; then
  RIPPLE_REF_L5_PIPELINE_WORKER=1 \
    python3 "$DETACH" "$LOG" -- env RIPPLE_REF_L5_PIPELINE_WORKER=1 bash "$0"
  echo "Started detached Ripple REF L5 pipeline (log: $LOG)"
else
  RIPPLE_REF_L5_PIPELINE_WORKER=1 exec bash "$0"
fi
