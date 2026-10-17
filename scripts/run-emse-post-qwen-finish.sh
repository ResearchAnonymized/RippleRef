#!/usr/bin/env bash
# Wait for Qwen B0-V2 150/150 then fan-in backfill + Excel export.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export REFACTAI_WORKSPACE_TEMP_DIR="${REFACTAI_WORKSPACE_TEMP_DIR:-$HOME/.refactai/workspaces}"
export EMSE_STUDY_BASE="${EMSE_STUDY_BASE:-$REFACTAI_WORKSPACE_TEMP_DIR/ripple_study_runs}"
LOG="$ROOT/.run/emse-post-qwen-finish.log"
COHORT="$ROOT/.run/shared_cohort/cohort_manifest.json"
QWEN_MODEL="qwen/qwen3.6-plus"
VARIANT="V2"
POLL_SEC="${POLL_SEC:-120}"

exec > >(tee -a "$LOG") 2>&1
echo "=== Post-Qwen finish watcher $(date -Iseconds) ==="

while true; do
  done=$(python3 <<PY
import csv, json, os
cohort = json.load(open("$COHORT"))
keys = set()
for ws, entries in cohort.get("selectedByRepo", {}).items():
    for e in entries:
        fp = e["filePath"] if isinstance(e, dict) else str(e)
        keys.add((ws, fp))
study = os.environ["EMSE_STUDY_BASE"] + "/ripple_ref_master/results_candidates.csv"
rows = list(csv.DictReader(open(study, encoding="utf-8")))
n = sum(
    1 for r in rows
    if r.get("model_id") == "$QWEN_MODEL"
    and r.get("variant") == "$VARIANT"
    and r.get("status") == "completed"
    and (r.get("project_id"), r.get("file_path")) in keys
)
print(n)
PY
)
  echo "$(date -Iseconds) Qwen V2 cohort completed: $done/150"
  if [ "$done" -ge 150 ]; then
    break
  fi
  if ! pgrep -fl "rerun-qwen-b0-v2-only" >/dev/null 2>&1; then
    echo "WARN: Qwen rerun not running but only $done/150 — exiting watcher"
    exit 1
  fi
  sleep "$POLL_SEC"
done

python3 "$ROOT/scripts/patch-study-dir-to-persistent.py" ripple_ref_master
bash "$ROOT/scripts/run-emse-backfill-parallel.sh"
bash "$ROOT/scripts/emse-readiness-check.sh"
echo "=== Post-Qwen finish complete $(date -Iseconds) ==="
