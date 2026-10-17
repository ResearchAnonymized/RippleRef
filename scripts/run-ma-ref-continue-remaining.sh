#!/usr/bin/env bash
# Continue ma_ref_master for systems that still have missing candidates (integrity-safe resume).
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/ripple-ref-lib.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/ma-ref-pipeline-lib.sh"

ripple_ref_load_ports
export MA_STUDY_ID="${MA_STUDY_ID:-ma_ref_master}"
export RESUME="${RESUME:-1}"
export CANDIDATE_TIMEOUT_SEC="${CANDIDATE_TIMEOUT_SEC:-1200}"
export SLEEP_BETWEEN_CANDIDATES_SEC="${SLEEP_BETWEEN_CANDIDATES_SEC:-3}"
LOG_FILE="${LOG_FILE:-$ROOT/.run/ma-ref-continue-remaining.log}"

mkdir -p "$(dirname "$LOG_FILE")"

ripple_ref_health_check || exit 1

SYSTEMS_TO_RUN="$(python3 - "$API" "$MA_STUDY_ID" <<'PY'
import json
import sys
import urllib.request

api = sys.argv[1]
study = sys.argv[2]
ws_to_num = {
    "project-07aa431d": 1, "project-2ceb0810": 2, "project-873bd0c4": 3,
    "project-61e475df": 4, "project-4e3bc7d3": 5, "project-6de9c713": 6,
    "project-b16f055f": 7, "project-d0163663": 8, "project-6f262004": 9,
    "project-1012eb54": 10, "project-cdf206bf": 11, "project-b80c52cf": 12,
    "project-d3ce0443": 13, "project-3b2e8898": 14, "project-56221077": 15,
}
with urllib.request.urlopen(f"{api}/ripple-ref/studies/{study}?view=summary", timeout=30) as r:
    summary = json.load(r)
done = set(summary.get("completedCandidates") or [])
failed = set(summary.get("failedCandidates") or [])
terminal = done | failed
models = [m["modelId"] for m in (summary.get("config") or {}).get("models") or []]
need = set()
for ws, files in (summary.get("selectedByRepo") or {}).items():
    num = ws_to_num.get(ws)
    if not num:
        continue
    for entry in files:
        fp = entry["filePath"] if isinstance(entry, dict) else str(entry)
        for model in models:
            pk = f"{ws}|{fp}|{model}|MA"
            if pk not in terminal:
                need.add(num)
                break
        if num in need:
            break
print(" ".join(str(n) for n in sorted(need)))
PY
)"

if [ -z "$SYSTEMS_TO_RUN" ]; then
  echo "MA study complete — no systems with missing candidates." | tee -a "$LOG_FILE"
  curl -sf "$API/ripple-ref/studies/$MA_STUDY_ID/completeness" | python3 -m json.tool | tee -a "$LOG_FILE"
  exit 0
fi

log_msg() {
  printf '%s\n' "$*"
  printf '%s\n' "$*" >>"$LOG_FILE"
}

if ! ma_ref_try_lock_dir "$(ma_ref_lock_dir_for "$ROOT" "ma-ref-master-continue")"; then
  echo "Another MA continue job is already running — exit." | tee -a "$LOG_FILE"
  exit 0
fi

on_exit() {
  ma_ref_release_continue_lock "$ROOT"
}
trap on_exit EXIT INT TERM

echo "=== MA-REF continue remaining ===" >"$LOG_FILE"
log_msg "Systems: $SYSTEMS_TO_RUN"
log_msg "Started: $(date -u +"%Y-%m-%d %H:%M UTC")"

for n in $SYSTEMS_TO_RUN; do
  rm -rf "$(ma_ref_lock_dir_for "$ROOT" "ma-ref-master-system-${n}")"
  log_msg "========== MA SYSTEM $n START $(date -u +"%Y-%m-%d %H:%M UTC") =========="
  SYSTEM_NUM="$n" RUN=1 LOG_FILE="$ROOT/.run/ma-ref-master-system-${n}.log" \
    bash "$SCRIPT_DIR/run-ma-ref-master-system.sh" || true
  log_msg "========== MA SYSTEM $n END $(date -u +"%Y-%m-%d %H:%M UTC") =========="
  curl -sf "$API/ripple-ref/studies/$MA_STUDY_ID/completeness" 2>/dev/null | python3 -m json.tool >>"$LOG_FILE" 2>/dev/null || true
  log_msg ""
done

log_msg "=== MA-REF continue FINISHED $(date -u +"%Y-%m-%d %H:%M UTC") ==="
curl -sf "$API/ripple-ref/studies/$MA_STUDY_ID/completeness" 2>/dev/null | python3 -m json.tool >>"$LOG_FILE" 2>/dev/null || true
