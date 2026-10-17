#!/usr/bin/env bash
#
# Usage:
#   SYSTEMS="1 2 3 4 5" ./scripts/run-ma-ref-master-overnight.sh
#
# Env:
#   SYSTEMS                  space-separated SYSTEM_NUM 1–15 (default: all 15)
#   CANDIDATE_TIMEOUT_SEC    per-candidate curl timeout (default: 1200)
#   SLEEP_BETWEEN_CANDIDATES_SEC  pause between runs (default: 3)
#   RESUME                   1 = skip completed pairs (default: 1)
#   MODEL_FILTER             optional single model slug
#   LOG_FILE                 default .run/ma-ref-master-overnight.log

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/ripple-ref-lib.sh"

ripple_ref_load_ports

SYSTEMS="${SYSTEMS:-1 2 3 4 5 6 7 8 9 10 11 12 13 14 15}"
LOG_FILE="${LOG_FILE:-$ROOT/.run/ma-ref-master-overnight.log}"
CANDIDATE_TIMEOUT_SEC="${CANDIDATE_TIMEOUT_SEC:-1200}"
SLEEP_BETWEEN_CANDIDATES_SEC="${SLEEP_BETWEEN_CANDIDATES_SEC:-3}"
RESUME="${RESUME:-1}"
MA_STUDY_ID="${MA_STUDY_ID:-ma_ref_master}"

mkdir -p "$(dirname "$LOG_FILE")"

# shellcheck disable=SC1091
source "$SCRIPT_DIR/ma-ref-pipeline-lib.sh"

if ! ma_ref_try_lock_dir "$(ma_ref_lock_dir_for "$ROOT" "ma-ref-master-overnight")"; then
  echo "Another MA overnight batch is already running — exit (no duplicate spend)." | tee -a "$LOG_FILE"
  exit 0
fi

on_overnight_exit() {
  ma_ref_release_overnight_lock "$ROOT"
}
trap on_overnight_exit EXIT INT TERM

ripple_ref_health_check || exit 1

agent_mode="$(curl -sf "$AGENTS/agents/health" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('multiLlmAgentMode','?'))" 2>/dev/null || echo "?")"
if [ "$agent_mode" != "full" ]; then
  echo "ERROR: agents multiLlmAgentMode=$agent_mode (need full). Set MULTI_LLM_AGENT_MODE=full in agents/.env and restart." | tee -a "$LOG_FILE"
  exit 1
fi

integrity_ok="$(curl -sf "$API/ripple-ref/studies/$MA_STUDY_ID/integrity-preflight" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('integrityOk', False))" 2>/dev/null || echo "False")"
if [ "$integrity_ok" != "True" ]; then
  echo "ERROR: integrity preflight failed for $MA_STUDY_ID" | tee -a "$LOG_FILE"
  exit 1
fi

echo "=== MA-REF overnight batch (P-MA) ===" | tee -a "$LOG_FILE"
echo "Study: $MA_STUDY_ID" | tee -a "$LOG_FILE"
echo "Systems: $SYSTEMS (50 candidates each = $(echo "$SYSTEMS" | wc -w | tr -d ' ') × 50)" | tee -a "$LOG_FILE"
echo "multiLlmAgentMode: $agent_mode" | tee -a "$LOG_FILE"
echo "CANDIDATE_TIMEOUT_SEC: $CANDIDATE_TIMEOUT_SEC" | tee -a "$LOG_FILE"
echo "Started: $(date -u +"%Y-%m-%d %H:%M UTC")" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

export CANDIDATE_TIMEOUT_SEC SLEEP_BETWEEN_CANDIDATES_SEC RESUME MA_STUDY_ID
[ -n "${MODEL_FILTER:-}" ] && export MODEL_FILTER

for n in $SYSTEMS; do
  echo "========== MA SYSTEM $n / 15 START $(date -u +"%Y-%m-%d %H:%M UTC") ==========" | tee -a "$LOG_FILE"
  set +e
  SYSTEM_NUM="$n" RUN=1 LOG_FILE="$ROOT/.run/ma-ref-master-system-${n}.log" \
    bash "$SCRIPT_DIR/run-ma-ref-master-system.sh" 2>&1 | tee -a "$LOG_FILE"
  rc=$?
  set -e
  echo "========== MA SYSTEM $n / 15 END exit=$rc $(date -u +"%Y-%m-%d %H:%M UTC") ==========" | tee -a "$LOG_FILE"
  curl -sf "$API/ripple-ref/studies/$MA_STUDY_ID/completeness" 2>/dev/null | python3 -m json.tool 2>/dev/null | tee -a "$LOG_FILE" || true
  echo "" | tee -a "$LOG_FILE"
done

echo "=== MA-REF OVERNIGHT BATCH FINISHED $(date -u +"%Y-%m-%d %H:%M UTC") ===" | tee -a "$LOG_FILE"
curl -sf "$API/ripple-ref/studies/$MA_STUDY_ID/completeness" 2>/dev/null | python3 -m json.tool 2>/dev/null | tee -a "$LOG_FILE" || true
