#!/usr/bin/env bash
#
# Run MA L5 paired backfill until l5Pending=0. Restarts on crash; skips if already running.
# Uses detach_daemon.py so the job survives IDE shell exit.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/ripple-ref-lib.sh"
ripple_ref_load_ports

STUDY_ID="${STUDY_ID:-ma_ref_master}"
LOCKDIR="$ROOT/.run/ma-l5-backfill-until-complete.lockdir"
LOG="$ROOT/.run/ma-l5-backfill-until-complete.log"
BACKFILL_LOG="$ROOT/.run/backfill-test-probe-${STUDY_ID}.log"
DETACH="$ROOT/scripts/detach_daemon.py"

mkdir -p "$ROOT/.run"

log() {
  echo "[$(date -u +"%Y-%m-%d %H:%M UTC")] $*" | tee -a "$LOG"
}

fetch_pending() {
  curl -sf "$API/ripple-ref/studies/$STUDY_ID/verification-summary" 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(int(d.get('l5Pending', 0)))
except Exception:
    print(-1)
" 2>/dev/null || echo -1
}

backfill_running() {
  pgrep -f "backfill_ripple_ref_test_probe.py $STUDY_ID" >/dev/null 2>&1 \
    || pgrep -f "backfill-ripple-ref-test-probe.sh $STUDY_ID" >/dev/null 2>&1
}

supervisor_running() {
  pgrep -f "run-ma-l5-backfill-until-complete.sh" >/dev/null 2>&1
}

acquire_lock() {
  if mkdir "$LOCKDIR" 2>/dev/null; then
    echo $$ >"$LOCKDIR/pid"
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
}

release_lock() {
  rm -rf "$LOCKDIR"
}

run_supervisor_loop() {
  export BACKFILL_TEST_TIMEOUT_SEC="${BACKFILL_TEST_TIMEOUT_SEC:-900}"
  export BACKFILL_PHASE="${BACKFILL_PHASE:-backfill_ma}"
  export POST_PIPELINE_PROGRESS="${POST_PIPELINE_PROGRESS:-1}"
  export L5_PROBE_V2="${L5_PROBE_V2:-1}"
  export PIPELINE_STATUS_STUDY_ID="${PIPELINE_STATUS_STUDY_ID:-ripple_ref_master}"

  log "=== MA L5 backfill until complete ($STUDY_ID) ==="
  log "Supervisor PID $$"

  round=0
  while true; do
    pending="$(fetch_pending)"
    if [ "$pending" = "-1" ]; then
      log "WARN: backend unreachable — waiting 30s"
      sleep 30
      continue
    fi
    if [ "$pending" -eq 0 ]; then
      log "DONE: l5Pending=0 — all MA candidates probed"
      curl -sf "$API/ripple-ref/studies/$STUDY_ID/verification-summary" 2>/dev/null | tee -a "$LOG" || true
      curl -sf -X POST "$API/ripple-ref/studies/ripple_ref_master/pipeline-status" \
        -H 'Content-Type: application/json' \
        -d '{"phase":"backfill_ma","state":"complete","backfillStudyId":"ma_ref_master"}' >/dev/null 2>&1 || true
      exit 0
    fi

    if backfill_running; then
      log "Backfill worker active — pending=$pending (waiting 30s)"
      sleep 30
      continue
    fi

    round=$((round + 1))
    log "Round $round: starting backfill batch (pending=$pending)"
    ripple_ref_health_check || {
      log "Health check failed — retry in 60s"
      sleep 60
      continue
    }

    set +e
    LOG_FILE="$BACKFILL_LOG" \
      L5_PROBE_V2="${L5_PROBE_V2:-1}" \
      PIPELINE_STATUS_STUDY_ID="${PIPELINE_STATUS_STUDY_ID:-ripple_ref_master}" \
      bash "$ROOT/scripts/backfill-ripple-ref-test-probe.sh" "$STUDY_ID" >>"$LOG" 2>&1
    rc=$?
    set -e
    log "Backfill batch exit=$rc pending_now=$(fetch_pending)"
    sleep 5
  done
}

# Detached mode: re-exec self as worker only
if [ "${MA_L5_BACKFILL_WORKER:-}" = "1" ]; then
  trap 'release_lock' EXIT
  if ! acquire_lock; then
    log "Another supervisor already running. Exiting."
    exit 0
  fi
  run_supervisor_loop
  exit 0
fi

if supervisor_running; then
  echo "MA L5 until-complete supervisor already running."
  exit 0
fi

if [ -f "$DETACH" ]; then
  MA_L5_BACKFILL_WORKER=1 \
    python3 "$DETACH" "$LOG" -- env MA_L5_BACKFILL_WORKER=1 bash "$0"
  echo "Started detached MA L5 backfill supervisor (log: $LOG)"
else
  MA_L5_BACKFILL_WORKER=1 exec bash "$0"
fi
