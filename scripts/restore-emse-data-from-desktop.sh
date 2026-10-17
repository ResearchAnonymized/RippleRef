#!/usr/bin/env bash
# Restore study artifacts from ~/Desktop/EMSE-data into a stable study dir.
#
# Usage (run in your terminal — has Desktop access):
#   bash scripts/restore-emse-data-from-desktop.sh
#   bash scripts/restore-emse-data-from-desktop.sh /Users/svm648/Desktop/EMSE-data
#
# Then:
#   export EMSE_STUDY_BASE="$HOME/.refactai/workspaces/ripple_study_runs"
#   python3 scripts/collect-fan-in-for-cohort.py ripple_ref_master
#   bash scripts/rerun-qwen-b0-v2-only.sh
#   bash scripts/export-emse-ripple-master-excel.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$HOME/Desktop/EMSE-data}"
DEST_BASE="${EMSE_STUDY_BASE:-$HOME/.refactai/workspaces/ripple_study_runs}"
MASTER_DIR="$SRC/EMSE_Master"

if [ ! -d "$SRC" ]; then
  echo "ERROR: source not found: $SRC" >&2
  exit 1
fi

echo "=== Scanning $SRC ==="
find "$SRC" -maxdepth 5 \( \
  -name 'results_candidates.csv' \
  -o -name 'ripple_ref_master' \
  -o -name 'ma_ref_master' \
  -o -name 'EMSE_MASTER_ALL_SHEETS.xlsx' \
  -o -name 'fan_in_exposure.csv' \
  \) 2>/dev/null | sort || true

mkdir -p "$DEST_BASE"

# Case A: full ripple_study_runs tree under EMSE-data
if [ -d "$SRC/ripple_study_runs" ]; then
  echo "Copying ripple_study_runs -> $DEST_BASE"
  rsync -a "$SRC/ripple_study_runs/" "$DEST_BASE/"
fi

# Case B: study dirs directly under EMSE_Master or EMSE-data
for study in ripple_ref_master ma_ref_master; do
  for base in "$SRC" "$MASTER_DIR" "$SRC/EMSE_Master" "$SRC/studies"; do
    if [ -d "$base/$study" ]; then
      echo "Copying $base/$study -> $DEST_BASE/$study"
      mkdir -p "$DEST_BASE/$study"
      rsync -a "$base/$study/" "$DEST_BASE/$study/"
    fi
  done
done

# Case C: loose CSVs in EMSE_Master
if [ -f "$MASTER_DIR/ripple_ref_master_results_candidates.csv" ] && [ ! -f "$DEST_BASE/ripple_ref_master/results_candidates.csv" ]; then
  mkdir -p "$DEST_BASE/ripple_ref_master"
  cp "$MASTER_DIR/ripple_ref_master_results_candidates.csv" "$DEST_BASE/ripple_ref_master/results_candidates.csv"
  echo "Copied ripple_ref_master_results_candidates.csv"
fi
if [ -f "$MASTER_DIR/ma_ref_master_results_candidates.csv" ] && [ ! -f "$DEST_BASE/ma_ref_master/results_candidates.csv" ]; then
  mkdir -p "$DEST_BASE/ma_ref_master"
  cp "$MASTER_DIR/ma_ref_master_results_candidates.csv" "$DEST_BASE/ma_ref_master/results_candidates.csv"
  echo "Copied ma_ref_master_results_candidates.csv"
fi

# Archive Excel workbooks to .run for reference
mkdir -p "$ROOT/.run/restored_emse"
for x in "$MASTER_DIR"/*.xlsx "$SRC"/*.xlsx; do
  [ -f "$x" ] || continue
  cp -f "$x" "$ROOT/.run/restored_emse/" 2>/dev/null || true
  echo "Archived $(basename "$x") -> .run/restored_emse/"
done

# Fan-in CSV if present
if [ -f "$MASTER_DIR/fan_in_exposure.csv" ]; then
  mkdir -p "$ROOT/.run/shared_cohort"
  cp "$MASTER_DIR/fan_in_exposure.csv" "$ROOT/.run/shared_cohort/fan_in_exposure.csv"
  echo "Copied fan_in_exposure.csv"
fi

echo ""
echo "=== Restore summary ==="
for study in ripple_ref_master ma_ref_master; do
  csv="$DEST_BASE/$study/results_candidates.csv"
  if [ -f "$csv" ]; then
    rows=$(wc -l < "$csv" | tr -d ' ')
    size=$(ls -lh "$csv" | awk '{print $5}')
    echo "OK  $study  rows=$rows  size=$size"
  else
    echo "MISSING  $study/results_candidates.csv"
  fi
done

echo ""
echo "Export with:"
echo "  export EMSE_STUDY_BASE=\"$DEST_BASE\""
echo "  export EMSE_DESKTOP_DIR=\"$HOME/Desktop/EMSE-data/EMSE_Master\""
echo "  bash scripts/export-emse-ripple-master-excel.sh"
