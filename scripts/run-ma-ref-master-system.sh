#!/usr/bin/env bash
# Run one system at a time (10 files × 5 models = 50 MA candidates) for ma_ref_master.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/ripple-ref-lib.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/ma-ref-pipeline-lib.sh"

ripple_ref_load_ports

MA_STUDY_ID="${MA_STUDY_ID:-ma_ref_master}"
SYSTEM_NUM="${SYSTEM_NUM:-7}"
RUN="${RUN:-1}"
LOG_FILE="${LOG_FILE:-$SCRIPT_DIR/../.run/ma-ref-master-system-${SYSTEM_NUM}.log}"
MA_VARIANT="MA"

log_msg() {
  printf '%s\n' "$*"
  printf '%s\n' "$*" >>"$LOG_FILE"
}

if ! ma_ref_try_lock_dir "$(ma_ref_lock_dir_for "$ROOT" "ma-ref-master-system-${SYSTEM_NUM}")"; then
  log_msg "System $SYSTEM_NUM batch already running — skip duplicate."
  exit 0
fi

on_system_exit() {
  ma_ref_release_system_lock "$ROOT" "$SYSTEM_NUM"
}
trap on_system_exit EXIT INT TERM

ripple_ref_health_check

resolve_system_repo() {
  case "$1" in
    1) echo "project-07aa431d" ;;
    2) echo "project-2ceb0810" ;;
    3) echo "project-873bd0c4" ;;
    4) echo "project-61e475df" ;;
    5) echo "project-4e3bc7d3" ;;
    6) echo "project-6de9c713" ;;
    7) echo "project-b16f055f" ;;
    8) echo "project-d0163663" ;;
    9) echo "project-6f262004" ;;
    10) echo "project-1012eb54" ;;
    11) echo "project-cdf206bf" ;;
    12) echo "project-b80c52cf" ;;
    13) echo "project-d3ce0443" ;;
    14) echo "project-3b2e8898" ;;
    15) echo "project-56221077" ;;
    *) echo "" ;;
  esac
}

resolve_system_name() {
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

WS="$(resolve_system_repo "$SYSTEM_NUM")"
if [ -z "$WS" ]; then
  echo "ERROR: unknown SYSTEM_NUM=$SYSTEM_NUM" | tee "$LOG_FILE"
  exit 1
fi

LABEL="$(resolve_system_name "$SYSTEM_NUM")"

ripple_ref_run_ma_candidate() {
  local study_id="$1"
  local workspace_id="$2"
  local file_path="$3"
  local model_id="$4"
  local timeout="${CANDIDATE_TIMEOUT_SEC:-1200}"
  python3 -c "
import json, sys
study_id, ws, file_path, model_id = sys.argv[1:5]
print(json.dumps({
  'studyId': study_id,
  'workspaceId': ws,
  'filePath': file_path,
  'model': {'modelId': model_id, 'apiRoute': 'openrouter', 'contextWindow': 2000000},
  'resume': True,
}))
" "$study_id" "$workspace_id" "$file_path" "$model_id" | curl -sf --max-time "$timeout" -X POST "$AGENTS/agents/ma-ref/run-candidate" \
    -H 'Content-Type: application/json' \
    -d @- 2>/dev/null || echo '{"status":"failed","error":"timeout or agent error"}'
}

echo "=== MA-REF system $SYSTEM_NUM ($LABEL / $WS) ===" | tee "$LOG_FILE"
log_msg "Started: $(date -u +"%Y-%m-%d %H:%M UTC")"

if [ "$RUN" != "1" ]; then
  log_msg "Set RUN=1 to execute candidates"
  exit 0
fi

MODELS="$(curl -sf "$API/ripple-ref/studies/$MA_STUDY_ID?view=summary" | python3 -c "
import sys,json
for m in json.load(sys.stdin).get('config',{}).get('models') or []:
    print(m['modelId'])
")"

FILES="$(curl -sf "$API/ripple-ref/studies/$MA_STUDY_ID?view=summary" | python3 -c "
import sys,json
ws=sys.argv[1]
for f in (json.load(sys.stdin).get('selectedByRepo') or {}).get(ws) or []:
    print(f['filePath'] if isinstance(f,dict) else f)
" "$WS")"

if [ -z "$FILES" ]; then
  echo "ERROR: no selected files for $WS" | tee -a "$LOG_FILE"
  exit 1
fi

ran=0
failed=0
skipped=0

for FILE in $FILES; do
  for MODEL in $MODELS; do
    if [ -n "${MODEL_FILTER:-}" ] && [ "$MODEL" != "$MODEL_FILTER" ]; then
      continue
    fi
    pair_key="${WS}|${FILE}|${MODEL}|${MA_VARIANT}"
    if [ "${RESUME:-1}" = "1" ] && [ "$(ripple_ref_ma_pair_resolved "$MA_STUDY_ID" "$pair_key")" = "yes" ]; then
      log_msg "  SKIP $MODEL $(basename "$FILE")"
      skipped=$((skipped + 1))
      continue
    fi
    log_msg "  RUN MA $(basename "$FILE") $MODEL ..."
    curl -sf -X POST "$API/ripple-ref/studies/$MA_STUDY_ID/live-candidate" \
      -H 'Content-Type: application/json' \
      -d "{\"workspaceId\":\"$WS\",\"filePath\":\"$FILE\",\"modelId\":\"$MODEL\",\"variant\":\"$MA_VARIANT\",\"phase\":\"queued\"}" \
      >/dev/null 2>&1 || true
    RESULT="$(ripple_ref_run_ma_candidate "$MA_STUDY_ID" "$WS" "$FILE" "$MODEL")"
    result_line="$(printf '%s' "$RESULT" | ripple_ref_print_candidate_result || true)"
    log_msg "$result_line"
    if echo "$RESULT" | python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('status')=='completed' else 1)"; then
      ran=$((ran + 1))
    else
      failed=$((failed + 1))
    fi
    sleep "${SLEEP_BETWEEN_CANDIDATES_SEC:-3}"
  done
done

log_msg "=== Summary: ran=$ran skipped=$skipped failed=$failed ==="
curl -sf "$API/ripple-ref/studies/$MA_STUDY_ID/completeness" | python3 -m json.tool >>"$LOG_FILE" 2>/dev/null || true
log_msg "Finished: $(date -u +"%Y-%m-%d %H:%M UTC")"
