#!/usr/bin/env bash
# Minimal study shell: scan 15 repos + import locked 150-file cohort (no LLM runs).
# Use before fan-in collection and Qwen-only rerun.
#
# Usage:
#   bash scripts/bootstrap-ripple-ref-from-cohort.sh
#   COHORT_MANIFEST=.run/shared_cohort/cohort_manifest.json bash scripts/bootstrap-ripple-ref-from-cohort.sh
#
# Persist study data (recommended):
#   export REFACTAI_WORKSPACE_TEMP_DIR="$HOME/.refactai/workspaces"
#   ./start_daemon.sh restart
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/ripple-ref-lib.sh"

ripple_ref_load_ports
ripple_ref_health_check

STUDY_ID="${STUDY_ID:-ripple_ref_master}"
COHORT_MANIFEST="${COHORT_MANIFEST:-$ROOT/.run/shared_cohort/cohort_manifest.json}"
FILES_PER_REPO="${FILES_PER_REPO:-10}"
RANDOM_SEED="${RANDOM_SEED:-42}"
MIN_SMELL_COUNT="${MIN_SMELL_COUNT:-1}"

if [ ! -f "$COHORT_MANIFEST" ]; then
  echo "ERROR: missing cohort manifest: $COHORT_MANIFEST" >&2
  exit 1
fi

echo "=== Bootstrap $STUDY_ID from $COHORT_MANIFEST ==="

if ! curl -sf "$API/ripple-ref/studies/$STUDY_ID?view=summary" >/dev/null 2>&1; then
  echo "Creating study $STUDY_ID ..."
  WORKSPACE_IDS="$(python3 -c "
import json
m = json.load(open('$COHORT_MANIFEST', encoding='utf-8'))
print(' '.join(sorted((m.get('selectedByRepo') or {}).keys())))
")"
  export WORKSPACE_IDS
  export MASTER_STUDY_ID="$STUDY_ID"
  export FILES_PER_REPO RANDOM_SEED MIN_SMELL_COUNT
  ripple_ref_create_study "ripple-ref-bootstrap" "full" | python3 -c "import sys,json; print('created', json.load(sys.stdin).get('config',{}).get('studyId'))"
else
  echo "Study $STUDY_ID already exists"
  WORKSPACE_IDS="$(python3 -c "
import json
m = json.load(open('$COHORT_MANIFEST', encoding='utf-8'))
print(' '.join(sorted((m.get('selectedByRepo') or {}).keys())))
")"
fi

echo "--- Scan repositories (dependency graphs for fan-in) ---"
for ws in $WORKSPACE_IDS; do
  if [ "$(ripple_ref_repo_has_scan "$STUDY_ID" "$ws")" = "yes" ]; then
    echo "  skip scan $ws"
  else
    echo "  scan $ws ..."
    ripple_ref_curl -X POST "$API/ripple-ref/studies/$STUDY_ID/scan/$ws" >/dev/null
  fi
done

echo "--- Import locked cohort manifest ---"
IMPORT_OK=0
if curl -sf -X POST "$API/ripple-ref/studies/$STUDY_ID/import-cohort-manifest" \
  -H 'Content-Type: application/json' \
  -d @"$COHORT_MANIFEST" 2>/dev/null | python3 -c "import sys,json; json.load(sys.stdin); print('api import ok')" 2>/dev/null; then
  IMPORT_OK=1
else
  echo "API import-cohort-manifest unavailable — using local import"
  python3 "$ROOT/scripts/import-cohort-manifest-local.py" "$STUDY_ID" "$COHORT_MANIFEST"
  IMPORT_OK=1
fi
if [ "$IMPORT_OK" -eq 1 ]; then
  curl -sf "$API/ripple-ref/studies/$STUDY_ID?view=summary" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('imported files:', sum(len(v) for v in (d.get('selectedByRepo') or {}).values()))
print('studyDir:', d.get('studyDir', ''))
" 2>/dev/null || python3 -c "
import json, os
from pathlib import Path
base = os.environ.get('TMPDIR','/tmp')
p = Path(base)/'refactai/workspaces/ripple_study_runs'/'$STUDY_ID'/'study_state.json'
if p.exists():
    d=json.loads(p.read_text())
    print('imported files:', sum(len(v) for v in (d.get('selectedByRepo') or {}).values()))
"
fi

echo "--- Build dependency contexts ---"
ripple_ref_curl -X POST "$API/ripple-ref/studies/$STUDY_ID/build-contexts" >/dev/null

EXPORT=$(curl -sf "$API/ripple-ref/studies/$STUDY_ID/export-info")
echo "$EXPORT" | python3 -m json.tool
echo "Bootstrap complete."
