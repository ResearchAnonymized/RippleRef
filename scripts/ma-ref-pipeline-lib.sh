#!/usr/bin/env bash
# Shared MA-REF autonomous pipeline helpers (status API, stall detect, auto-heal).
# shellcheck disable=SC1091

ma_pipeline_resolve_system_label() {
  case "$1" in
    1) echo "01-Johotdraw" ;;
    2) echo "02-GanttProject-master" ;;
    3) echo "03-ArgoUML" ;;
    4) echo "04-Xerces-j-main" ;;
    5) echo "05-Apache Ant" ;;
    6) echo "06-JEdit" ;;
    7) echo "07-Junit" ;;
    8) echo "08-SLF4J" ;;
    9) echo "09-Logback.zip" ;;
    10) echo "10-Mockito" ;;
    11) echo "11-Guava" ;;
    12) echo "12-jsoup" ;;
    13) echo "13-Eclipse Collections" ;;
    14) echo "14-Checkstyle" ;;
    15) echo "15-JabRef" ;;
    *) echo "system-$1" ;;
  esac
}

ma_pipeline_post_status() {
  local payload="$1"
  curl -sf -X POST "$API/ripple-ref/studies/$MA_STUDY_ID/pipeline-status" \
    -H 'Content-Type: application/json' \
    -d "$payload" >/dev/null 2>&1 || true
}

ma_pipeline_fetch_completed() {
  curl -sf "$API/ripple-ref/studies/$MA_STUDY_ID/completeness" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d.get('completedRuns', 0))
" 2>/dev/null || echo 0
}

ma_pipeline_fetch_snapshot() {
  curl -sf "$API/ripple-ref/studies/$MA_STUDY_ID/completeness" 2>/dev/null || echo '{}'
}

ma_pipeline_heal_services() {
  local root="$1"
  log_msg="$2"
  if [ -f "$root/start_daemon.sh" ]; then
    bash "$root/start_daemon.sh" restart >>"$log_msg" 2>&1 || true
    return 0
  fi
  return 1
}

ma_pipeline_clear_live() {
  curl -sf -X DELETE "$API/ripple-ref/studies/$MA_STUDY_ID/live-candidate" >/dev/null 2>&1 || true
}

ma_pipeline_kill_stuck_runners() {
  pkill -f "agents/ma-ref/run-candidate" 2>/dev/null || true
  pkill -f "run-ma-ref-master-system.sh" 2>/dev/null || true
  sleep 3
}

# Return 0 when $1 is $2 or a descendant of $2.
ma_ref_is_descendant_of() {
  local child="$1"
  local root="$2"
  while [ -n "$child" ] && [ "$child" -gt 1 ] 2>/dev/null; do
    if [ "$child" = "$root" ]; then
      return 0
    fi
    child="$(ps -o ppid= -p "$child" 2>/dev/null | tr -d ' ')"
  done
  return 1
}

# Stop duplicate MA runners; keep the canonical wrapper/supervisor tree (study-safe: one owner).
ma_ref_dedupe_runners() {
  local root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
  local keep="${2:-}"
  local pidfile="$root/.run/ma-ref-master-overnight.pid"

  if [ -z "$keep" ] && [ -f "$root/.run/ma-ref-master-wrapper.lockdir/pid" ]; then
    keep="$(tr -d ' \n\r' <"$root/.run/ma-ref-master-wrapper.lockdir/pid" 2>/dev/null || true)"
  fi
  if [ -z "$keep" ] && [ -f "$pidfile" ]; then
    keep="$(tr -d ' \n\r' <"$pidfile" 2>/dev/null || true)"
  fi
  if [ -n "$keep" ] && ! kill -0 "$keep" 2>/dev/null; then
    keep=""
  fi
  if [ -z "$keep" ]; then
    local curl_pid
    curl_pid="$(pgrep -f "curl.*ma-ref/run-candidate" 2>/dev/null | head -1 || true)"
    if [ -n "$curl_pid" ]; then
      local p="$curl_pid"
      while [ -n "$p" ] && [ "$p" -gt 1 ] 2>/dev/null; do
        if ps -p "$p" -o command= 2>/dev/null | grep -qE "run-ma-ref-master-(supervisor|overnight)"; then
          keep="$p"
          break
        fi
        p="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')"
      done
    fi
  fi
  if [ -z "$keep" ]; then
    keep="$(pgrep -f "run-ma-ref-master-supervisor-wrapper.sh" 2>/dev/null | tail -1 || true)"
  fi
  if [ -z "$keep" ]; then
    keep="$(pgrep -f "run-ma-ref-master-supervisor.sh" 2>/dev/null | tail -1 || true)"
  fi
  if [ -z "$keep" ]; then
    echo "ma_ref_dedupe_runners: no keeper found — refusing to stop all runners (pass wrapper PID as 2nd arg)" >&2
    return 1
  fi

  local pid cmd
  while IFS= read -r pid; do
    [ -z "$pid" ] && continue
    if [ -n "$keep" ] && { [ "$pid" = "$keep" ] || ma_ref_is_descendant_of "$pid" "$keep"; }; then
      continue
    fi
    cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    case "$cmd" in
      *run-ma-ref-master-supervisor-wrapper.sh*|*run-ma-ref-master-supervisor.sh*|*run-ma-ref-master-overnight.sh*|*run-ma-ref-master-system.sh*)
        echo "  stop duplicate runner PID $pid" >&2
        kill "$pid" 2>/dev/null || true
        ;;
    esac
  done < <(pgrep -f "run-ma-ref-master-supervisor-wrapper.sh|run-ma-ref-master-supervisor.sh|run-ma-ref-master-overnight.sh|run-ma-ref-master-system.sh" 2>/dev/null || true)

  sleep 2
  while IFS= read -r pid; do
    [ -z "$pid" ] && continue
    if [ -n "$keep" ] && { [ "$pid" = "$keep" ] || ma_ref_is_descendant_of "$pid" "$keep"; }; then
      continue
    fi
    cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    case "$cmd" in
      *curl*ma-ref/run-candidate*)
        echo "  stop duplicate in-flight curl PID $pid" >&2
        kill "$pid" 2>/dev/null || true
        ;;
    esac
  done < <(pgrep -f "curl.*ma-ref/run-candidate" 2>/dev/null || true)

  ma_pipeline_clear_live
}

# Portable single-instance lock (macOS lacks flock(1) in default shells).
ma_ref_lock_dir_for() {
  local root="$1"
  local name="$2"
  echo "$root/.run/${name}.lockdir"
}

ma_ref_stale_lock_pid() {
  local lockdir="$1"
  if [ ! -d "$lockdir" ]; then
    echo ""
    return 0
  fi
  local pid=""
  if [ -f "$lockdir/pid" ]; then
    pid="$(tr -d ' \n\r' <"$lockdir/pid" 2>/dev/null || true)"
  fi
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    echo "$pid"
    return 0
  fi
  rm -rf "$lockdir"
  echo ""
}

ma_ref_try_lock_dir() {
  local lockdir="$1"
  ma_ref_stale_lock_pid "$lockdir" >/dev/null
  if mkdir "$lockdir" 2>/dev/null; then
    echo "$$" >"$lockdir/pid"
    return 0
  fi
  local holder
  holder="$(ma_ref_stale_lock_pid "$lockdir")"
  if [ -z "$holder" ] && mkdir "$lockdir" 2>/dev/null; then
    echo "$$" >"$lockdir/pid"
    return 0
  fi
  [ -n "$holder" ] && echo "$holder"
  return 1
}

ma_ref_acquire_supervisor_lock() {
  local root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
  local lockdir
  lockdir="$(ma_ref_lock_dir_for "$root" "ma-ref-master-supervisor")"
  mkdir -p "$root/.run"
  if ! ma_ref_try_lock_dir "$lockdir"; then
    local holder
    holder="$(ma_ref_stale_lock_pid "$lockdir")"
    if [ -n "$holder" ]; then
      echo "Another MA supervisor is running (PID $holder) — exiting to avoid duplicate spend." >&2
      return 1
    fi
    if ! ma_ref_try_lock_dir "$lockdir"; then
      echo "Could not acquire MA supervisor lock at $lockdir" >&2
      return 1
    fi
  fi
  return 0
}

ma_ref_acquire_wrapper_lock() {
  local root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
  local lockdir
  lockdir="$(ma_ref_lock_dir_for "$root" "ma-ref-master-wrapper")"
  mkdir -p "$root/.run"
  if ! ma_ref_try_lock_dir "$lockdir"; then
    local holder
    holder="$(ma_ref_stale_lock_pid "$lockdir")"
    if [ -n "$holder" ]; then
      echo "Another MA wrapper is running (PID $holder) — exiting." >&2
      return 1
    fi
    if ! ma_ref_try_lock_dir "$lockdir"; then
      echo "Could not acquire MA wrapper lock at $lockdir" >&2
      return 1
    fi
  fi
  echo "$$" >"$root/.run/ma-ref-master-overnight.pid"
  return 0
}

ma_ref_release_wrapper_lock() {
  local root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
  rm -rf "$(ma_ref_lock_dir_for "$root" "ma-ref-master-wrapper")"
}

ma_ref_release_overnight_lock() {
  local root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
  rm -rf "$(ma_ref_lock_dir_for "$root" "ma-ref-master-overnight")"
}

ma_ref_release_system_lock() {
  local root="$1"
  local system_num="$2"
  rm -rf "$(ma_ref_lock_dir_for "$root" "ma-ref-master-system-${system_num}")"
}

ma_ref_release_continue_lock() {
  local root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
  rm -rf "$(ma_ref_lock_dir_for "$root" "ma-ref-master-continue")"
}

ma_ref_release_supervisor_lock() {
  local root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
  rm -rf "$(ma_ref_lock_dir_for "$root" "ma-ref-master-supervisor")"
}

ma_pipeline_issue_json() {
  local kind="$1"
  local message="$2"
  local heal_action="$3"
  python3 -c "
import json,sys
print(json.dumps({'issue': {
  'at': sys.argv[1],
  'kind': sys.argv[2],
  'message': sys.argv[3],
  'healAction': sys.argv[4],
}}))
" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$kind" "$message" "$heal_action"
}

ma_pipeline_heal_json() {
  local action="$1"
  local result="$2"
  local detail="${3:-}"
  python3 -c "
import json,sys
print(json.dumps({'heal': {
  'at': sys.argv[1],
  'action': sys.argv[2],
  'result': sys.argv[3],
  'detail': sys.argv[4],
}}))
" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$action" "$result" "$detail"
}

ma_pipeline_build_status_json() {
  local state="$1"
  local system_num="$2"
  local round="$3"
  local batch_pid="${4:-}"
  python3 -c "
import json,sys,urllib.request
api=sys.argv[1]
study=sys.argv[2]
state=sys.argv[3]
system_num=sys.argv[4]
round_n=int(sys.argv[5])
batch_pid=sys.argv[6]
supervisor_pid=sys.argv[7]
labels={
  '1':'01-Johotdraw','2':'02-GanttProject-master','3':'03-ArgoUML','4':'04-Xerces-j-main',
  '5':'05-Apache Ant','6':'06-JEdit','7':'07-Junit','8':'08-SLF4J','9':'09-Logback.zip',
  '10':'10-Mockito','11':'11-Guava','12':'12-jsoup','13':'13-Eclipse Collections',
  '14':'14-Checkstyle','15':'15-JabRef',
}
comp={}
live={}
try:
  with urllib.request.urlopen(f'{api}/ripple-ref/studies/{study}/completeness', timeout=10) as r:
    comp=json.load(r)
except Exception:
  pass
try:
  with urllib.request.urlopen(f'{api}/ripple-ref/studies/{study}/live-status', timeout=10) as r:
    live=json.load(r)
except Exception:
  pass
lc=live.get('liveCandidate') or {}
out={
  'state': state,
  'supervisorPid': supervisor_pid,
  'batchPid': batch_pid or '',
  'round': round_n,
  'currentSystemNum': int(system_num) if system_num.isdigit() else 0,
  'currentSystemLabel': labels.get(system_num, f'system-{system_num}'),
  'completedRuns': comp.get('completedRuns', 0),
  'plannedRuns': comp.get('plannedRuns', 750),
  'missingArtifacts': comp.get('missingArtifacts', 750),
  'failedGenerations': comp.get('failedGenerations', 0),
  'completionPercentage': comp.get('completionPercentage', 0),
  'liveCandidate': lc,
  'multiLlmAgentMode': 'full',
}
print(json.dumps(out))
" "$API" "$MA_STUDY_ID" "$state" "$system_num" "$round" "$batch_pid" "$$"
}
