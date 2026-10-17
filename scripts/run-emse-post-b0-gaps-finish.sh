#!/usr/bin/env bash
# When B0-V2 gap fill finishes, run backfill + Excel export.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export REFACTAI_WORKSPACE_TEMP_DIR="${REFACTAI_WORKSPACE_TEMP_DIR:-$HOME/.refactai/workspaces}"
export EMSE_STUDY_BASE="${EMSE_STUDY_BASE:-$REFACTAI_WORKSPACE_TEMP_DIR/ripple_study_runs}"
LOG="$ROOT/.run/emse-post-b0-gaps-finish.log"
exec > >(tee -a "$LOG") 2>&1
echo "=== post-B0-gaps watcher $(date -Iseconds) ==="
while pgrep -f "rerun-b0-v2-cohort-gaps" >/dev/null 2>&1; do
  sleep 30
done
sleep 5
# Retry any pairs still not completed (e.g. transient 404)
if bash "$ROOT/scripts/rerun-b0-v2-cohort-gaps.sh"; then
  echo "gap retry pass done"
fi
bash "$ROOT/scripts/run-emse-backfill-parallel.sh"
bash "$ROOT/scripts/emse-readiness-check.sh"
echo "=== post-B0-gaps complete $(date -Iseconds) ==="
