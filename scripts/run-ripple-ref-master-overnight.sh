#!/usr/bin/env bash
# Run multiple RIPPLE-REF master-study systems sequentially (overnight batch).
#
# Usage:
#   SYSTEMS="2 3 4" ./scripts/run-ripple-ref-master-overnight.sh
#
# Env:
#   SYSTEMS     space-separated SYSTEM_NUM values (default: 2 3 4)
#   SKIP_SETUP  passed through when set to 1 for all systems
#   LOG_FILE    default .run/ripple-ref-overnight.log

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SYSTEMS="${SYSTEMS:-2 3 4}"
LOG_FILE="${LOG_FILE:-$ROOT/.run/ripple-ref-overnight.log}"
mkdir -p "$(dirname "$LOG_FILE")"

echo "=== RIPPLE-REF overnight batch ===" | tee -a "$LOG_FILE"
echo "Systems: $SYSTEMS" | tee -a "$LOG_FILE"
echo "Started: $(date -u +"%Y-%m-%d %H:%M UTC")" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

for n in $SYSTEMS; do
  echo "========== SYSTEM $n START $(date -u +"%Y-%m-%d %H:%M UTC") ==========" | tee -a "$LOG_FILE"
  set +e
  if [ "${SKIP_SETUP:-0}" = "1" ]; then
    SYSTEM_NUM="$n" RUN=1 SKIP_SETUP=1 "$SCRIPT_DIR/run-ripple-ref-master-system.sh" 2>&1 | tee -a "$LOG_FILE"
  else
    SYSTEM_NUM="$n" RUN=1 "$SCRIPT_DIR/run-ripple-ref-master-system.sh" 2>&1 | tee -a "$LOG_FILE"
  fi
  rc=$?
  set -e
  echo "========== SYSTEM $n END exit=$rc $(date -u +"%Y-%m-%d %H:%M UTC") ==========" | tee -a "$LOG_FILE"
  echo "" | tee -a "$LOG_FILE"
done

echo "=== OVERNIGHT BATCH FINISHED $(date -u +"%Y-%m-%d %H:%M UTC") ===" | tee -a "$LOG_FILE"
