#!/usr/bin/env bash
# Autonomous MA-REF supervisor: systems 1→15 sequentially, stall detection, auto-heal.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
source "$ROOT/scripts/ripple-ref-lib.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/ma-ref-pipeline-lib.sh"
ripple_ref_load_ports

export SYSTEMS="${SYSTEMS:-1 2 3 4 5 6 7 8 9 10 11 12 13 14 15}"
export CANDIDATE_TIMEOUT_SEC="${CANDIDATE_TIMEOUT_SEC:-1200}"
export SLEEP_BETWEEN_CANDIDATES_SEC="${SLEEP_BETWEEN_CANDIDATES_SEC:-3}"
export RESUME="${RESUME:-1}"
export MA_STUDY_ID="${MA_STUDY_ID:-ma_ref_master}"
export STALL_MINUTES="${STALL_MINUTES:-22}"
export WATCHDOG_INTERVAL_SEC="${WATCHDOG_INTERVAL_SEC:-60}"

PIDFILE="$ROOT/.run/ma-ref-master-overnight.pid"
SUP_LOG="$ROOT/.run/ma-ref-master-supervisor.log"
BATCH_LOG="$ROOT/.run/ma-ref-master-overnight.log"

mkdir -p "$ROOT/.run"

slog() { echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] $*" | tee -a "$SUP_LOG"; }

LAST_COMPLETED=-1
LAST_PROGRESS_TS=$(date +%s)
CURRENT_SYSTEM=0
BATCH_PID=""
round=0

write_status() {
  local state="$1"
  local sys="${2:-$CURRENT_SYSTEM}"
  local payload
  payload="$(ma_pipeline_build_status_json "$state" "$sys" "${round:-0}" "$BATCH_PID")" || payload='{}'
  if [ -z "$payload" ] || [ "$payload" = "{}" ]; then
    ma_pipeline_post_status "{\"state\":\"$state\",\"supervisorPid\":\"$$\",\"round\":${round:-0}}"
    return
  fi
  payload="$(echo "$payload" | python3 -c "
import json,sys
raw=sys.stdin.read().strip()
if not raw:
    sys.exit(0)
d=json.loads(raw)
d['lastProgressAt']=sys.argv[1]
d['stallMinutes']=int(sys.argv[2])
print(json.dumps(d))
" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$STALL_MINUTES" 2>/dev/null)" || true
  [ -n "$payload" ] && ma_pipeline_post_status "$payload"
}

on_supervisor_exit() {
  local code=$?
  slog "supervisor exiting code=$code"
  ma_pipeline_post_status "$(ma_pipeline_heal_json supervisor_exit "code_$code" "supervisor stopped")"
  ma_pipeline_post_status '{"state":"stopped","supervisorPid":""}'
  exit "$code"
}
trap on_supervisor_exit EXIT INT TERM

heal_stall() {
  local reason="$1"
  slog "HEAL stall: $reason"
  ma_pipeline_post_status "$(ma_pipeline_issue_json stall "$reason" auto_heal)"
  ma_pipeline_post_status "$(ma_pipeline_heal_json clear_live ok "$reason")"
  ma_pipeline_clear_live
  ma_pipeline_post_status "$(ma_pipeline_heal_json kill_stuck_runners ok)"
  ma_pipeline_kill_stuck_runners
  if ! ripple_ref_health_check_retry 5 6 2>/dev/null; then
    ma_pipeline_post_status "$(ma_pipeline_heal_json restart_services started)"
    ma_pipeline_heal_services "$ROOT" "$SUP_LOG"
    ma_pipeline_post_status "$(ma_pipeline_heal_json restart_services ok)"
    ripple_ref_health_check_retry 10 6 2>/dev/null || true
  fi
  if [ -n "$BATCH_PID" ] && kill -0 "$BATCH_PID" 2>/dev/null; then
    kill "$BATCH_PID" 2>/dev/null || true
    wait "$BATCH_PID" 2>/dev/null || true
  fi
  BATCH_PID=""
  LAST_PROGRESS_TS=$(date +%s)
  write_status "healing" "$CURRENT_SYSTEM"
}

watchdog_loop() {
  while [ -n "$BATCH_PID" ] && kill -0 "$BATCH_PID" 2>/dev/null; do
    sleep "$WATCHDOG_INTERVAL_SEC"
    if ! ripple_ref_health_check_retry 3 5 2>/dev/null; then
      heal_stall "backend or agents unreachable"
      return
    fi
    local completed
    completed="$(ma_pipeline_fetch_completed)"
    local now
    now=$(date +%s)
    if [ "$completed" != "$LAST_COMPLETED" ]; then
      LAST_COMPLETED=$completed
      LAST_PROGRESS_TS=$now
      write_status "running" "$CURRENT_SYSTEM"
      continue
    fi
    local stall_sec=$((STALL_MINUTES * 60))
    if [ $((now - LAST_PROGRESS_TS)) -ge "$stall_sec" ]; then
      heal_stall "no progress for ${STALL_MINUTES}m (completed=$completed)"
      return
    fi
    write_status "running" "$CURRENT_SYSTEM"
  done
}

slog "=== MA-REF autonomous supervisor PID $$ ==="
slog "Systems: $SYSTEMS | stall=${STALL_MINUTES}m | watchdog=${WATCHDOG_INTERVAL_SEC}s"

if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -dimsu -w $$ &
fi

ma_pipeline_post_status "$(ma_pipeline_heal_json supervisor_start ok "PID $$")"
write_status "running" 1

round=0
while true; do
  round=$((round + 1))
  if ! ripple_ref_health_check_retry 5 6 2>/dev/null; then
    slog "services down after retries — restarting"
    ma_pipeline_post_status "$(ma_pipeline_issue_json services_down "backend/agents down after retries" restart_services)"
    ma_pipeline_heal_services "$ROOT" "$SUP_LOG"
    ripple_ref_health_check_retry 10 6 2>/dev/null || true
    sleep 30
    continue
  fi

  comp="$(ma_pipeline_fetch_snapshot)"
  missing="$(echo "$comp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('missingArtifacts',750))" 2>/dev/null || echo 750)"
  completed="$(echo "$comp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('completedRuns',0))" 2>/dev/null || echo 0)"

  if [ "$missing" = "0" ] 2>/dev/null; then
    slog "STUDY COMPLETE $completed/750"
    write_status "complete" 15
    ma_pipeline_post_status "$(ma_pipeline_heal_json study_complete ok)"
    break
  fi

  LAST_COMPLETED=$completed
  LAST_PROGRESS_TS=$(date +%s)
  slog "round $round: completed=$completed missing=$missing — starting batch"

  bash "$ROOT/scripts/run-ma-ref-master-overnight.sh" >>"$BATCH_LOG" 2>&1 &
  BATCH_PID=$!
  CURRENT_SYSTEM=1
  write_status "running" 1

  watchdog_loop &
  WD_PID=$!
  wait "$BATCH_PID" 2>/dev/null || true
  BATCH_PID=""
  kill "$WD_PID" 2>/dev/null || true
  wait "$WD_PID" 2>/dev/null || true

  slog "round $round batch ended"
  write_status "running" "$CURRENT_SYSTEM"
  sleep 10
done

slog "=== supervisor finished ==="
