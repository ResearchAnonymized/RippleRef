#!/usr/bin/env bash
# Full targeted pipeline: restore (optional) → bootstrap → fan-in → Qwen rerun → export.
#
# Run from your terminal (Desktop access required for restore step):
#   bash scripts/run-emse-targeted-recovery.sh
#   SKIP_RESTORE=1 bash scripts/run-emse-targeted-recovery.sh   # if study already restored
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export REFACTAI_WORKSPACE_TEMP_DIR="${REFACTAI_WORKSPACE_TEMP_DIR:-$HOME/.refactai/workspaces}"
export EMSE_STUDY_BASE="${EMSE_STUDY_BASE:-$REFACTAI_WORKSPACE_TEMP_DIR/ripple_study_runs}"
export EMSE_DESKTOP_DIR="${EMSE_DESKTOP_DIR:-$HOME/Desktop/EMSE-data/EMSE_Master}"

cd "$ROOT"

if [ "${SKIP_RESTORE:-0}" != "1" ]; then
  bash "$ROOT/scripts/restore-emse-data-from-desktop.sh" "${EMSE_DATA_SRC:-$HOME/Desktop/EMSE-data}"
fi

echo "=== Start services ==="
bash "$ROOT/start_daemon.sh" restart

echo "=== Bootstrap study shell (scan + cohort) ==="
bash "$ROOT/scripts/bootstrap-ripple-ref-from-cohort.sh"

echo "=== Collect fan-in for 150 files ==="
python3 "$ROOT/scripts/collect-fan-in-for-cohort.py" ripple_ref_master

if [ "${SKIP_QWEN_RERUN:-0}" != "1" ]; then
  if [ -n "${MAX_CANDIDATES:-}" ]; then
    echo "=== Qwen B0-V2 smoke (MAX=$MAX_CANDIDATES) ==="
    MAX_CANDIDATES="$MAX_CANDIDATES" bash "$ROOT/scripts/rerun-qwen-b0-v2-only.sh"
  else
    echo "=== Qwen B0-V2 full rerun (150) ==="
    bash "$ROOT/scripts/rerun-qwen-b0-v2-only.sh"
  fi
fi

echo "=== Export master Excel ==="
export EMSE_STUDY_BASE EMSE_DESKTOP_DIR
bash "$ROOT/scripts/export-emse-ripple-master-excel.sh"

echo "Done. Workbook: $EMSE_DESKTOP_DIR/EMSE_MASTER_ALL_SHEETS.xlsx"
echo "Check sheets: Qwen_B0_Diagnostics, Fan_In_150_Files"
