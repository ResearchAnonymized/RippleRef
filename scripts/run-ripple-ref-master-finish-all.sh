#!/usr/bin/env bash
# Wait until no RIPPLE-REF batch is running, then run every system that is still incomplete.
#
# Usage:
#   ./scripts/run-ripple-ref-master-finish-all.sh
#
# Env:
#   MASTER_STUDY_ID   default ripple_ref_master
#   SYSTEM_ORDER      default "14 15 11 3 13" (13 last — resume gaps only)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/ripple-ref-lib.sh"

ripple_ref_load_ports
MASTER_STUDY_ID="${MASTER_STUDY_ID:-ripple_ref_master}"
SYSTEM_ORDER="${SYSTEM_ORDER:-14 15 11 3 13}"
LOG_FILE="${LOG_FILE:-$SCRIPT_DIR/../.run/ripple-ref-finish-all.log}"

resolve_ws() {
  case "$1" in
    3) echo "project-873bd0c4" ;;
    11) echo "project-cdf206bf" ;;
    13) echo "project-d3ce0443" ;;
    14) echo "project-3b2e8898" ;;
    15) echo "project-56221077" ;;
    *) echo "" ;;
  esac
}

system_incomplete() {
  local n="$1"
  local ws
  ws="$(resolve_ws "$n")"
  [ -n "$ws" ] || return 1
  ripple_ref_curl "$API/ripple-ref/studies/$MASTER_STUDY_ID?view=summary" | python3 -c "
import sys, json
ws = sys.argv[1]
d = json.load(sys.stdin)
p = ws + '|'
done = set(d.get('completedCandidates') or [])
fail = set(d.get('failedCandidates') or [])
ok = sum(1 for k in done if k.startswith(p))
fl = sum(1 for k in fail if k.startswith(p))
sel = len((d.get('selectedByRepo') or {}).get(ws) or [])
print('incomplete' if sel >= 10 and ok + fl < 100 else ('needs_setup' if sel < 10 else 'done'))
" "$ws"
}

echo "=== RIPPLE-REF finish-all ===" | tee "$LOG_FILE"
echo "Waiting for in-flight batches to finish..." | tee -a "$LOG_FILE"
while true; do
  others="$(pgrep -f "run-ripple-ref-master-(overnight|system|continue)\.sh" 2>/dev/null | grep -v "^$$\$" || true)"
  if [ -z "$others" ]; then
    break
  fi
  sleep 30
done
echo "No active batches. Checking incomplete systems..." | tee -a "$LOG_FILE"

ripple_ref_health_check

for n in $SYSTEM_ORDER; do
  state="$(system_incomplete "$n" || echo done)"
  case "$state" in
    done)
      echo "System $n: already complete — skip" | tee -a "$LOG_FILE"
      ;;
    needs_setup)
      echo "========== SYSTEM $n START (full setup) $(date -u +"%Y-%m-%d %H:%M UTC") ==========" | tee -a "$LOG_FILE"
      SYSTEM_NUM="$n" RUN=1 "$SCRIPT_DIR/run-ripple-ref-master-system.sh" 2>&1 | tee -a "$LOG_FILE"
      ;;
    incomplete)
      echo "========== SYSTEM $n START (resume) $(date -u +"%Y-%m-%d %H:%M UTC") ==========" | tee -a "$LOG_FILE"
      SYSTEM_NUM="$n" RUN=1 SKIP_SETUP=1 "$SCRIPT_DIR/run-ripple-ref-master-system.sh" 2>&1 | tee -a "$LOG_FILE"
      ;;
    *)
      echo "System $n: unknown state ($state) — try full setup" | tee -a "$LOG_FILE"
      SYSTEM_NUM="$n" RUN=1 "$SCRIPT_DIR/run-ripple-ref-master-system.sh" 2>&1 | tee -a "$LOG_FILE"
      ;;
  esac
  echo "========== SYSTEM $n END $(date -u +"%Y-%m-%d %H:%M UTC") ==========" | tee -a "$LOG_FILE"
done

echo "=== FINISH-ALL COMPLETE $(date -u +"%Y-%m-%d %H:%M UTC") ===" | tee -a "$LOG_FILE"
curl -sf "$API/ripple-ref/studies/$MASTER_STUDY_ID/completeness" | python3 -m json.tool | tee -a "$LOG_FILE"
