#!/usr/bin/env bash
# Rerun ONLY Qwen B0-V2 on the locked 150-file cohort (single-prompt, dependency-aware).
# Does not rerun other models or V1. Updates results_candidates.csv in ripple_ref_master.
#
# Prereq: bash scripts/bootstrap-ripple-ref-from-cohort.sh
#
# Usage:
#   bash scripts/rerun-qwen-b0-v2-only.sh
#   FORCE_RERUN=1 bash scripts/rerun-qwen-b0-v2-only.sh   # default: force all 150
#   MAX_CANDIDATES=5 bash scripts/rerun-qwen-b0-v2-only.sh  # smoke test
#   bash scripts/resume-qwen-b0-v2-after-offline.sh       # after travel: skip completed only
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/ripple-ref-lib.sh"

ripple_ref_load_ports
ripple_ref_health_check

STUDY_ID="${STUDY_ID:-ripple_ref_master}"
COHORT_MANIFEST="${COHORT_MANIFEST:-$ROOT/.run/shared_cohort/cohort_manifest.json}"
QWEN_MODEL="${QWEN_MODEL:-qwen/qwen3.6-plus}"
VARIANT="${VARIANT:-V2}"
FORCE_RERUN="${FORCE_RERUN:-1}"
# OpenRouter key credit limit — avoid 8192 max_tokens quota errors on small files
export RIPPLE_REF_MAX_OUTPUT_TOKENS="${RIPPLE_REF_MAX_OUTPUT_TOKENS:-2048}"
LOG="$ROOT/.run/qwen-b0-v2-rerun.log"

if [ ! -f "$COHORT_MANIFEST" ]; then
  echo "ERROR: missing $COHORT_MANIFEST" >&2
  exit 1
fi

echo "=== Qwen B0-V2 rerun: $STUDY_ID (150 files max) ===" | tee -a "$LOG"
echo "model=$QWEN_MODEL variant=$VARIANT force=$FORCE_RERUN resume_completed_only=${RESUME_COMPLETED_ONLY:-0}" | tee -a "$LOG"

ran=0
skipped=0
failed=0

while IFS=$'\t' read -r ws fp; do
  pair_key="${ws}|${fp}|${QWEN_MODEL}|${VARIANT}"
  if [ "$FORCE_RERUN" != "1" ]; then
    if [ "${RESUME_COMPLETED_ONLY:-0}" = "1" ]; then
      pair_skip_fn=ripple_ref_pair_succeeded
      pair_skip_msg="already completed"
    else
      pair_skip_fn=ripple_ref_pair_completed
      pair_skip_msg="already terminal"
    fi
    if [ "$($pair_skip_fn "$STUDY_ID" "$pair_key")" = "yes" ]; then
      echo "skip $pair_key ($pair_skip_msg)" | tee -a "$LOG"
      skipped=$((skipped + 1))
      continue
    fi
  fi
  if [ -n "${MAX_CANDIDATES:-}" ] && [ "$ran" -ge "$MAX_CANDIDATES" ]; then
    echo "Reached MAX_CANDIDATES=$MAX_CANDIDATES" | tee -a "$LOG"
    break
  fi
  echo "[$((ran + 1))] $fp" | tee -a "$LOG"
  result=$(ripple_ref_run_candidate "$STUDY_ID" "$ws" "$fp" "$QWEN_MODEL" "$VARIANT" || echo '{"status":"failed","error":"run_candidate_error"}')
  echo "$result" | ripple_ref_print_candidate_result 2>/dev/null | tee -a "$LOG" || echo "    -> status=failed (parse error)" | tee -a "$LOG"
  status=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','failed'))" 2>/dev/null || echo failed)
  if [ "$status" = "completed" ]; then
    ran=$((ran + 1))
  else
    failed=$((failed + 1))
    ran=$((ran + 1))
  fi
done < <(python3 -c "
import json
m = json.load(open('$COHORT_MANIFEST', encoding='utf-8'))
for ws, entries in sorted((m.get('selectedByRepo') or {}).items()):
    for e in entries:
        fp = e['filePath'] if isinstance(e, dict) else str(e)
        print(ws + '\t' + fp)
")

echo "--- Summary ---" | tee -a "$LOG"
echo "ran=$ran skipped=$skipped failed=$failed" | tee -a "$LOG"
python3 "$ROOT/scripts/diagnose-qwen-b0-failures.py" 2>&1 | tee -a "$LOG" || true

echo ""
echo "Next: python3 scripts/enrich-ripple-study-csv-from-artifacts.py ripple_ref_master"
echo "      bash scripts/export-emse-ripple-master-excel.sh"
