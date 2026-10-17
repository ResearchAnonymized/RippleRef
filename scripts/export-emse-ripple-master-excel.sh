#!/usr/bin/env bash
# Enrich study CSVs, then build EMSE_MASTER_ALL_SHEETS.xlsx → ~/Desktop/ESE/EMSE_Master/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/ripple-ref-lib.sh"
ripple_ref_load_ports

export EMSE_MASTER_OUTPUT_DIR="${EMSE_MASTER_OUTPUT_DIR:-$ROOT/.run}"
if [ -z "${EMSE_STUDY_BASE:-}" ]; then
  export EMSE_STUDY_BASE="${TMPDIR:-/tmp}/refactai/workspaces/ripple_study_runs"
fi

B0_DIR="$EMSE_STUDY_BASE/ripple_ref_master"
MA_DIR="$EMSE_STUDY_BASE/ma_ref_master"

if [ -f "$B0_DIR/results_candidates.csv" ]; then
  echo "Enriching study CSVs from ripple_reports..."
  python3 "$ROOT/scripts/enrich-ripple-study-csv-from-artifacts.py" ripple_ref_master
  if [ -f "$MA_DIR/results_candidates.csv" ]; then
    python3 "$ROOT/scripts/enrich-ripple-study-csv-from-artifacts.py" ma_ref_master
  else
    echo "WARNING: MA results_candidates.csv missing — export will be B0-only for MA sheets"
  fi
  python3 "$ROOT/scripts/backfill-fan-in-cohort-from-scans.py" ripple_ref_master || true
  python3 "$ROOT/scripts/diagnose-qwen-b0-failures.py" || true
else
  echo "WARNING: Study data missing at $B0_DIR/results_candidates.csv"
  echo "         Run bootstrap + Qwen rerun, or restore ripple_study_runs."
fi

if [ -f "$ROOT/.run/shared_cohort/fan_in_exposure.csv" ]; then
  echo "Using fan_in_exposure.csv for RQ1 fan-in columns"
elif curl -sf "$API/health" >/dev/null 2>&1; then
  echo "Collecting fan-in for 150 files..."
  python3 "$ROOT/scripts/collect-fan-in-for-cohort.py" ripple_ref_master || true
fi

cd "$ROOT/web/app"
npm run export:emse-ripple-master

OUT="$ROOT/.run/EMSE_MASTER_ALL_SHEETS.xlsx"
if [ ! -f "$OUT" ]; then
  echo "ERROR: export did not produce $OUT" >&2
  exit 1
fi
SIZE=$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT" 2>/dev/null || echo 0)
if [ "$SIZE" -lt 100000 ] && [ -f "$B0_DIR/results_candidates.csv" ]; then
  ROWS=$(wc -l < "$B0_DIR/results_candidates.csv" | tr -d ' ')
  if [ "${ROWS:-0}" -gt 1 ]; then
    echo "WARNING: workbook is only ${SIZE} bytes but CSV has $ROWS lines — check enrich/export logs" >&2
  fi
fi
if [ ! -f "$B0_DIR/results_candidates.csv" ] || [ "$(wc -l < "$B0_DIR/results_candidates.csv" | tr -d ' ')" -le 1 ]; then
  echo "WARNING: B0 study CSV missing or empty — export may be partial." >&2
  echo "         Restore Desktop data or complete Qwen rerun first." >&2
fi

DEST="${EMSE_DESKTOP_DIR:-$HOME/Desktop/EMSE-Data/EMSE_Master}"
mkdir -p "$DEST"
for wb in \
  EMSE_RAW_MASTER_ALL_RQs.xlsx \
  EMSE_MASTER_ALL_SHEETS.xlsx \
  EMSE_RIPPLE_MASTER_DATA.xlsx \
  EMSE_B0_MASTER_DATA.xlsx \
  EMSE_MA_MASTER_DATA.xlsx \
  EMSE_ANALYSIS_RQ3_RQ5_DATA.xlsx
do
  if [ -f "$ROOT/.run/$wb" ]; then
    cp -f "$ROOT/.run/$wb" "$DEST/"
  fi
done
echo ""
echo "Copied workbooks to: $DEST"
echo "  PRIMARY (raw, all RQs): EMSE_RAW_MASTER_ALL_RQs.xlsx"
ls -lh "$DEST/EMSE_RAW_MASTER_ALL_RQs.xlsx" "$DEST/EMSE_MASTER_ALL_SHEETS.xlsx" 2>/dev/null || true
