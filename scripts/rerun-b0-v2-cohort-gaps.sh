#!/usr/bin/env bash
# Retry B0-V2 cohort pairs that are missing or not completed (all 5 models, 150 files).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/ripple-ref-lib.sh"

ripple_ref_load_ports
ripple_ref_health_check

STUDY_ID="${STUDY_ID:-ripple_ref_master}"
COHORT_MANIFEST="${COHORT_MANIFEST:-$ROOT/.run/shared_cohort/cohort_manifest.json}"
export RIPPLE_REF_MAX_OUTPUT_TOKENS="${RIPPLE_REF_MAX_OUTPUT_TOKENS:-2500}"
LOG="$ROOT/.run/b0-v2-cohort-gaps.log"

echo "=== B0-V2 cohort gap fill $(date -Iseconds) ===" | tee "$LOG"

ran=0
skipped=0
failed=0

while IFS=$'\t' read -r ws fp model; do
  pair_key="${ws}|${fp}|${model}|V2"
  if [ "$(ripple_ref_pair_succeeded "$STUDY_ID" "$pair_key")" = "yes" ]; then
    echo "skip $pair_key (completed)" | tee -a "$LOG"
    skipped=$((skipped + 1))
    continue
  fi
  echo "[$((ran + 1))] $model $(basename "$fp")" | tee -a "$LOG"
  curl -sf -X POST "$API/ripple-ref/studies/$STUDY_ID/live-candidate" \
    -H 'Content-Type: application/json' \
    -d "{\"workspaceId\":\"$ws\",\"filePath\":\"$fp\",\"modelId\":\"$model\",\"variant\":\"V2\",\"phase\":\"queued\"}" \
    >/dev/null 2>&1 || true
  result=$(ripple_ref_run_candidate "$STUDY_ID" "$ws" "$fp" "$model" "V2" || echo '{"status":"failed"}')
  echo "$result" | ripple_ref_print_candidate_result 2>/dev/null | tee -a "$LOG" || true
  status=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','failed'))" 2>/dev/null || echo failed)
  ran=$((ran + 1))
  if [ "$status" != "completed" ]; then
    failed=$((failed + 1))
  fi
done < <(python3 <<PY
import csv, json, os
cohort = json.load(open("$COHORT_MANIFEST", encoding="utf-8"))
models = [
    "google/gemini-3.1-pro-preview",
    "openai/gpt-5.5",
    "anthropic/claude-opus-4.8",
    "deepseek/deepseek-v4-pro",
    "qwen/qwen3.6-plus",
]
keys = set()
for ws, entries in cohort.get("selectedByRepo", {}).items():
    for e in entries:
        fp = e["filePath"] if isinstance(e, dict) else str(e)
        keys.add((ws, fp))
study = os.path.expanduser("~/.refactai/workspaces/ripple_study_runs/ripple_ref_master/results_candidates.csv")
rows = list(csv.DictReader(open(study, encoding="utf-8")))
done = set()
for r in rows:
    if r.get("variant") != "V2":
        continue
    if (r.get("project_id"), r.get("file_path")) not in keys:
        continue
    if r.get("status") == "completed":
        done.add((r.get("project_id"), r.get("file_path"), r.get("model_id")))
for ws, fp in sorted(keys):
    for m in models:
        if (ws, fp, m) not in done:
            print(ws + "\t" + fp + "\t" + m)
PY
)

echo "--- Summary ---" | tee -a "$LOG"
echo "ran=$ran skipped=$skipped failed=$failed" | tee -a "$LOG"
python3 "$ROOT/scripts/diagnose-qwen-b0-failures.py" 2>&1 | tee -a "$LOG" || true
