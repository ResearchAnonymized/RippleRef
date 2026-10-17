#!/usr/bin/env bash
# Final finish pass: Qwen V2 retries + other-model gaps + backfill + Excel export.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/ripple-ref-lib.sh"

ripple_ref_load_ports
ripple_ref_health_check

export EMSE_STUDY_BASE="${EMSE_STUDY_BASE:-${TMPDIR:-/tmp}/refactai/workspaces/ripple_study_runs}"
export RIPPLE_REF_MAX_OUTPUT_TOKENS="${RIPPLE_REF_MAX_OUTPUT_TOKENS:-2500}"
STUDY_ID="${STUDY_ID:-ripple_ref_master}"
COHORT_MANIFEST="${COHORT_MANIFEST:-$ROOT/.run/shared_cohort/cohort_manifest.json}"
LOG="$ROOT/.run/emse-final-finish.log"
QWEN_MODEL="qwen/qwen3.6-plus"
VARIANT="V2"

echo "=== EMSE final finish $(date -Iseconds) ===" | tee "$LOG"

# Stop overlapping Qwen reruns (this script owns the queue now).
pkill -f "rerun-qwen-b0-v2-only.sh" 2>/dev/null || true
pkill -f "resume-qwen-b0-v2-after-offline.sh" 2>/dev/null || true
sleep 3

ran=0
ok=0
fail=0

run_pair() {
  local ws="$1" fp="$2" model="$3" variant="$4"
  local label="${model##*/} ${variant} · ${fp##*/}"
  echo "→ [$((ran + 1))] $label" | tee -a "$LOG"
  local result
  result=$(ripple_ref_run_candidate "$STUDY_ID" "$ws" "$fp" "$model" "$variant" || echo '{"status":"failed","error":"run_candidate_error"}')
  echo "$result" | ripple_ref_print_candidate_result 2>/dev/null | tee -a "$LOG" || echo "    -> status=failed" | tee -a "$LOG"
  local status
  status=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','failed'))" 2>/dev/null || echo failed)
  ran=$((ran + 1))
  if [ "$status" = "completed" ]; then
    ok=$((ok + 1))
  else
    fail=$((fail + 1))
  fi
}

echo "--- Phase 1: Qwen B0-V2 retries (failed + missing) ---" | tee -a "$LOG"
while IFS=$'\t' read -r ws fp; do
  run_pair "$ws" "$fp" "$QWEN_MODEL" "$VARIANT"
done < <(python3 -c "
import csv, json, os
from pathlib import Path
cohort = json.load(open('$COHORT_MANIFEST', encoding='utf-8'))
base = Path(os.environ['EMSE_STUDY_BASE']) / '$STUDY_ID' / 'results_candidates.csv'
by = {}
if base.is_file():
    for r in csv.DictReader(open(base, encoding='utf-8')):
        if r.get('pair_key'):
            by[r['pair_key']] = r
for ws, entries in sorted((cohort.get('selectedByRepo') or {}).items()):
    for e in entries:
        fp = e['filePath'] if isinstance(e, dict) else str(e)
        pk = f\"{ws}|{fp}|$QWEN_MODEL|$VARIANT\"
        row = by.get(pk)
        if row is None or (row.get('status') or '').startswith('failed'):
            print(ws + '\t' + fp)
")

echo "--- Phase 2: Other-model gaps (never in CSV) ---" | tee -a "$LOG"
while IFS=$'\t' read -r ws fp model variant; do
  run_pair "$ws" "$fp" "$model" "$variant"
done < <(python3 -c "
import csv, json, os
from pathlib import Path
cohort = json.load(open('$COHORT_MANIFEST', encoding='utf-8'))
models = [
  'google/gemini-3.1-pro-preview',
  'openai/gpt-5.5',
  'anthropic/claude-opus-4.8',
  'deepseek/deepseek-v4-pro',
  'qwen/qwen3.6-plus',
]
base = Path(os.environ['EMSE_STUDY_BASE']) / '$STUDY_ID' / 'results_candidates.csv'
by = set()
if base.is_file():
    for r in csv.DictReader(open(base, encoding='utf-8')):
        if r.get('pair_key'):
            by.add(r['pair_key'])
planned = []
for ws, entries in sorted((cohort.get('selectedByRepo') or {}).items()):
    for e in entries:
        fp = e['filePath'] if isinstance(e, dict) else str(e)
        for m in models:
            for v in ('V1', 'V2'):
                pk = f'{ws}|{fp}|{m}|{v}'
                if pk not in by:
                    if m == '$QWEN_MODEL' and v == '$VARIANT':
                        continue  # phase 1
                    planned.append((ws, fp, m, v))
for t in planned:
    print('\t'.join(t))
")

echo "--- Summary: ran=$ran ok=$ok fail=$fail ---" | tee -a "$LOG"
python3 "$ROOT/scripts/diagnose-qwen-b0-failures.py" 2>&1 | tee -a "$LOG" || true

echo "--- Phase 3: backfill + export ---" | tee -a "$LOG"
bash "$ROOT/scripts/run-emse-backfill-parallel.sh" 2>&1 | tee -a "$LOG"

echo "=== EMSE final finish complete $(date -Iseconds) ===" | tee -a "$LOG"
