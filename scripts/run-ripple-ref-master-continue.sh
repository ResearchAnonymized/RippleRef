#!/usr/bin/env bash
# Wait for an in-flight overnight batch, then run the next systems.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SYSTEMS="${SYSTEMS:-5 6}"
LOG_FILE="${LOG_FILE:-$ROOT/.run/ripple-ref-overnight-5-6.log}"
WAIT_PATTERN="${WAIT_PATTERN:-run-ripple-ref-master-overnight.sh}"

echo "Waiting for current batch ($WAIT_PATTERN) to finish..." | tee "$LOG_FILE"
while pgrep -f "run-ripple-ref-master-overnight.sh|run-ripple-ref-master-system.sh" >/dev/null 2>&1; do
  sleep 30
done
echo "Prior batch finished. Starting systems: $SYSTEMS" | tee -a "$LOG_FILE"

for n in $SYSTEMS; do
  echo "========== SYSTEM $n START $(date -u +"%Y-%m-%d %H:%M UTC") ==========" | tee -a "$LOG_FILE"
  if [ "${SKIP_SETUP:-0}" = "1" ]; then
    SYSTEM_NUM="$n" RUN=1 SKIP_SETUP=1 "$SCRIPT_DIR/run-ripple-ref-master-system.sh" 2>&1 | tee -a "$LOG_FILE"
  else
    SYSTEM_NUM="$n" RUN=1 "$SCRIPT_DIR/run-ripple-ref-master-system.sh" 2>&1 | tee -a "$LOG_FILE"
  fi
  echo "========== SYSTEM $n END exit=${PIPESTATUS[0]} $(date -u +"%Y-%m-%d %H:%M UTC") ==========" | tee -a "$LOG_FILE"
done

echo "=== CONTINUE BATCH FINISHED $(date -u +"%Y-%m-%d %H:%M UTC") ===" | tee -a "$LOG_FILE"
