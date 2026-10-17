#!/usr/bin/env bash
# Recover after TMPDIR wipe: persistent study + merge jsonl + Qwen V2 + backfill + export.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export REFACTAI_WORKSPACE_TEMP_DIR="${REFACTAI_WORKSPACE_TEMP_DIR:-$HOME/.refactai/workspaces}"
export EMSE_STUDY_BASE="${EMSE_STUDY_BASE:-$REFACTAI_WORKSPACE_TEMP_DIR/ripple_study_runs}"
export RIPPLE_REF_MAX_OUTPUT_TOKENS="${RIPPLE_REF_MAX_OUTPUT_TOKENS:-2500}"
LOG="$ROOT/.run/emse-recover-and-finish.log"

exec > >(tee -a "$LOG") 2>&1
echo "=== EMSE recover+finish $(date -Iseconds) ==="
echo "EMSE_STUDY_BASE=$EMSE_STUDY_BASE"

# 1) Services
if ! curl -sf "http://127.0.0.1:${BACKEND_PORT:-8084}/api/health" >/dev/null 2>&1; then
  echo "--- Starting services ---"
  bash "$ROOT/start_daemon.sh" restart
  sleep 5
fi

# shellcheck disable=SC1091
source "$ROOT/scripts/ripple-ref-lib.sh"
ripple_ref_load_ports
ripple_ref_health_check

STUDY_DIR="$EMSE_STUDY_BASE/ripple_ref_master"
mkdir -p "$STUDY_DIR"

# 2) Restore baseline CSV from jsonl if thin or missing
python3 "$ROOT/scripts/patch-study-dir-to-persistent.py" ripple_ref_master || true
if [ ! -f "$STUDY_DIR/results_candidates.csv" ] || [ "$(wc -l < "$STUDY_DIR/results_candidates.csv" | tr -d ' ')" -le 10 ]; then
  echo "--- Merge B0 baseline from jsonl archives ---"
  python3 "$ROOT/scripts/merge-b0-jsonl-baseline-into-csv.py" ripple_ref_master
fi

# 3) Bootstrap study shell (scans, cohort) if API missing
if ! curl -sf "$API/ripple-ref/studies/ripple_ref_master?view=summary" >/dev/null 2>&1; then
  echo "--- Bootstrap study from cohort ---"
  bash "$ROOT/scripts/bootstrap-ripple-ref-from-cohort.sh"
fi

# 4) Fan-in cohort file
python3 "$ROOT/scripts/collect-fan-in-for-cohort.py" ripple_ref_master || true

# 5) Qwen B0-V2 on 150 files (force rerun — old slug rows are not valid)
echo "--- Qwen B0-V2 full rerun (150 cohort) ---"
export FORCE_RERUN=1
unset RESUME_COMPLETED_ONLY
bash "$ROOT/scripts/rerun-qwen-b0-v2-only.sh"

# 6) Backfill + Excel
bash "$ROOT/scripts/run-emse-backfill-parallel.sh"

echo "=== EMSE recover+finish complete $(date -Iseconds) ==="
