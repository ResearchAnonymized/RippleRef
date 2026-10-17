#!/usr/bin/env bash
# Preflight checklist for EMSE / RIPPLE-REF B0 recovery.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export REFACTAI_WORKSPACE_TEMP_DIR="${REFACTAI_WORKSPACE_TEMP_DIR:-$HOME/.refactai/workspaces}"
export EMSE_STUDY_BASE="${EMSE_STUDY_BASE:-$REFACTAI_WORKSPACE_TEMP_DIR/ripple_study_runs}"
STUDY_DIR="$EMSE_STUDY_BASE/ripple_ref_master"
COHORT="$ROOT/.run/shared_cohort/cohort_manifest.json"
FAN_IN="$ROOT/.run/shared_cohort/fan_in_exposure.csv"
EXCEL="$ROOT/.run/EMSE_MASTER_ALL_SHEETS.xlsx"
QWEN_MODEL="qwen/qwen3.6-plus"
VARIANT="V2"

ok=0
warn=0
fail=0

pass() { echo "  ✅ $1"; ok=$((ok + 1)); }
warn_msg() { echo "  ⚠️  $1"; warn=$((warn + 1)); }
fail_msg() { echo "  ❌ $1"; fail=$((fail + 1)); }

# shellcheck disable=SC1091
source "$ROOT/scripts/ripple-ref-lib.sh" 2>/dev/null || true
ripple_ref_load_ports 2>/dev/null || true

echo "=== EMSE readiness $(date -Iseconds) ==="
echo "EMSE_STUDY_BASE=$EMSE_STUDY_BASE"
echo ""

echo "--- Services ---"
check_http() {
  local name="$1" port="$2" path="$3"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "http://127.0.0.1:${port}${path}" 2>/dev/null || echo "000")
  if [ "$code" = "200" ]; then pass "$name HTTP $code"; else fail_msg "$name HTTP $code"; fi
}
check_http frontend "${FRONTEND_PORT:-3001}" "/"
check_http backend "${BACKEND_PORT:-8083}" "/api/health"
check_http agents "${AGENTS_PORT:-8091}" "/agents/health"

echo ""
echo "--- Cohort & fan-in ---"
if [ -f "$COHORT" ]; then
  n=$(python3 -c "import json; m=json.load(open('$COHORT')); print(sum(len(v) for v in m.get('selectedByRepo',{}).values()))")
  if [ "$n" = "150" ]; then pass "cohort_manifest.json: 150 files"; else warn_msg "cohort_manifest.json: $n files (expected 150)"; fi
else
  fail_msg "missing cohort_manifest.json"
fi
if [ -f "$FAN_IN" ]; then
  python3 -c "
import csv
rows=list(csv.DictReader(open('$FAN_IN')))
pos=sum(1 for r in rows if float(r.get('fan_in_graph') or 0)>0)
print(f'fan_in_exposure.csv: {len(rows)} rows, {pos} with fan_in>0')
" | while read -r line; do
    if echo "$line" | grep -q "150 rows"; then pass "$line"; else warn_msg "$line"; fi
  done
else
  fail_msg "missing fan_in_exposure.csv"
fi

echo ""
echo "--- Study data ---"
if [ -f "$STUDY_DIR/results_candidates.csv" ]; then
  lines=$(wc -l < "$STUDY_DIR/results_candidates.csv" | tr -d ' ')
  pass "results_candidates.csv: $((lines - 1)) rows"
else
  fail_msg "missing results_candidates.csv"
fi

api_dir=$(curl -sf "http://127.0.0.1:${BACKEND_PORT:-8083}/api/ripple-ref/studies/ripple_ref_master" 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('studyDir',''))" 2>/dev/null || echo "")
if [ "$api_dir" = "$STUDY_DIR" ]; then
  pass "API studyDir matches persistent workspace"
elif [ -n "$api_dir" ]; then
  fail_msg "API studyDir mismatch: $api_dir"
else
  warn_msg "could not read API studyDir"
fi

python3 "$ROOT/scripts/patch-study-dir-to-persistent.py" ripple_ref_master >/dev/null 2>&1 || true

echo ""
echo "--- Qwen B0-V2 (150 cohort) ---"
python3 <<PY | while read -r line; do
import csv, json, os
study = os.environ['EMSE_STUDY_BASE'] + '/ripple_ref_master/results_candidates.csv'
cohort = json.load(open('$COHORT'))
keys = set()
for ws, entries in cohort.get('selectedByRepo', {}).items():
    for e in entries:
        fp = e['filePath'] if isinstance(e, dict) else str(e)
        keys.add((ws, fp))
rows = list(csv.DictReader(open(study, encoding='utf-8')))
qwen_v2 = [r for r in rows if r.get('model_id')=='$QWEN_MODEL' and r.get('variant')=='$VARIANT']
completed = [r for r in qwen_v2 if r.get('status')=='completed']
failed = [r for r in qwen_v2 if r.get('status')!='completed']
cohort_done = sum(1 for r in completed if (r.get('project_id'), r.get('file_path')) in keys)
print(f'Qwen V2 completed: {len(completed)} (cohort: {cohort_done}/150)')
print(f'Qwen V2 non-completed: {len(failed)}')
print('READY_QWEN=1' if cohort_done >= 150 else 'READY_QWEN=0')
PY
  case "$line" in
    READY_QWEN=1) pass "Qwen B0-V2: 150/150 completed" ;;
    READY_QWEN=0) warn_msg "Qwen B0-V2 in progress or incomplete (see counts above)" ;;
    Qwen*) echo "  $line" ;;
  esac
done

if pgrep -fl "rerun-qwen-b0-v2-only|run-emse-recover" >/dev/null 2>&1; then
  pass "Qwen rerun process running"
else
  warn_msg "no Qwen rerun process detected"
fi

echo ""
echo "--- Excel export ---"
if [ -f "$EXCEL" ]; then
  mtime=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$EXCEL" 2>/dev/null || stat -c "%y" "$EXCEL" 2>/dev/null | cut -c1-16)
  pass "EMSE_MASTER_ALL_SHEETS.xlsx ($mtime)"
else
  fail_msg "missing EMSE_MASTER_ALL_SHEETS.xlsx"
fi

echo ""
echo "--- Summary ---"
echo "  pass=$ok  warn=$warn  fail=$fail"
if [ "$fail" -eq 0 ] && grep -q "READY_QWEN=1" <(python3 -c "
import csv, json, os
study=os.environ['EMSE_STUDY_BASE']+'/ripple_ref_master/results_candidates.csv'
cohort=json.load(open('$COHORT'))
keys=set()
for ws, entries in cohort.get('selectedByRepo',{}).items():
  for e in entries:
    fp=e['filePath'] if isinstance(e,dict) else str(e)
    keys.add((ws,fp))
rows=list(csv.DictReader(open(study,encoding='utf-8')))
done=sum(1 for r in rows if r.get('model_id')=='$QWEN_MODEL' and r.get('variant')=='$VARIANT' and r.get('status')=='completed' and (r.get('project_id'),r.get('file_path')) in keys)
print('READY_QWEN=1' if done>=150 else 'READY_QWEN=0')
" 2>/dev/null); then
  echo "  OVERALL: READY for paper export"
  exit 0
elif [ "$fail" -eq 0 ]; then
  echo "  OVERALL: infrastructure ready — Qwen B0-V2 still running or incomplete"
  exit 0
else
  echo "  OVERALL: NOT READY — fix failures above"
  exit 1
fi
