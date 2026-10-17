#!/usr/bin/env bash
# Final gap-fill for Phase 1: JabRef (15) + ArgoUML (3) missing candidates only.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="${LOG_FILE:-$SCRIPT_DIR/../.run/ripple-ref-phase1-gap-fill.log}"
SYSTEMS="${SYSTEMS:-15 3}"

echo "=== Phase 1 gap-fill (JabRef + ArgoUML) ===" | tee "$LOG_FILE"
echo "Started: $(date -u +"%Y-%m-%d %H:%M UTC")" | tee -a "$LOG_FILE"
echo "Waiting for overnight / in-flight system runs to finish..." | tee -a "$LOG_FILE"

while pgrep -f "run-ripple-ref-master-overnight.sh" >/dev/null 2>&1; do
  sleep 20
done
while pgrep -f "run-ripple-ref-master-system.sh" >/dev/null 2>&1; do
  sleep 15
done
while pgrep -f "run-ripple-ref-master-continue.sh" >/dev/null 2>&1; do
  sleep 10
done

echo "No conflicting batches. Running systems: $SYSTEMS" | tee -a "$LOG_FILE"

for n in $SYSTEMS; do
  echo "========== SYSTEM $n START $(date -u +"%Y-%m-%d %H:%M UTC") ==========" | tee -a "$LOG_FILE"
  SYSTEM_NUM="$n" RUN=1 SKIP_SETUP=1 RESUME=1 "$SCRIPT_DIR/run-ripple-ref-master-system.sh" 2>&1 | tee -a "$LOG_FILE"
  echo "========== SYSTEM $n END exit=${PIPESTATUS[0]} $(date -u +"%Y-%m-%d %H:%M UTC") ==========" | tee -a "$LOG_FILE"
done

echo "=== Completeness ===" | tee -a "$LOG_FILE"
curl -sf "http://127.0.0.1:8083/api/ripple-ref/studies/ripple_ref_master/completeness" | python3 -m json.tool | tee -a "$LOG_FILE"
echo "=== GAP-FILL DONE $(date -u +"%Y-%m-%d %H:%M UTC") ===" | tee -a "$LOG_FILE"
