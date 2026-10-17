#!/usr/bin/env bash
# Backfill fan-in + enrich CSV + export Excel while Qwen resume runs in parallel.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export EMSE_STUDY_BASE="${EMSE_STUDY_BASE:-${REFACTAI_WORKSPACE_TEMP_DIR:-$HOME/.refactai/workspaces}/ripple_study_runs}"
LOG="$ROOT/.run/emse-backfill-parallel.log"
exec > >(tee -a "$LOG") 2>&1

echo "=== EMSE parallel backfill $(date -Iseconds) ==="
echo "EMSE_STUDY_BASE=$EMSE_STUDY_BASE"

python3 "$ROOT/scripts/collect-fan-in-for-cohort.py" ripple_ref_master || true
python3 "$ROOT/scripts/backfill-fan-in-cohort-from-scans.py" ripple_ref_master || true
python3 "$ROOT/scripts/backfill-fan-in-to-study-csv.py" ripple_ref_master
python3 "$ROOT/scripts/enrich-ripple-study-csv-from-artifacts.py" ripple_ref_master
python3 "$ROOT/scripts/backfill-fan-in-to-study-csv.py" ripple_ref_master

echo "--- Export Excel ---"
bash "$ROOT/scripts/export-emse-ripple-master-excel.sh" || true

echo "=== Backfill done $(date -Iseconds) ==="
