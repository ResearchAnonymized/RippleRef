#!/usr/bin/env bash
# Create ma_ref_master study, import locked cohort, build dependency contexts, integrity check.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/ripple-ref-lib.sh"

ripple_ref_load_ports
ripple_ref_health_check

MA_STUDY_ID="${MA_STUDY_ID:-ma_ref_master}"
SOURCE_STUDY="${SOURCE_STUDY:-ripple_ref_master}"

echo "=== Setup $MA_STUDY_ID ==="

# Export cohort if missing
if [ ! -f "$SCRIPT_DIR/../.run/shared_cohort/cohort_manifest.json" ]; then
  SOURCE_STUDY="$SOURCE_STUDY" "$SCRIPT_DIR/export-ripple-ref-cohort.sh"
fi

# Create study if absent
if ! curl -sf "$API/ripple-ref/studies/$MA_STUDY_ID?view=summary" >/dev/null 2>&1; then
  echo "Creating study $MA_STUDY_ID ..."
  models_json="$(ripple_ref_default_models_json)"
  ws_json="$(ripple_ref_all_workspace_ids | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().split()))")"
  curl -sf -X POST "$API/ripple-ref/studies" \
    -H 'Content-Type: application/json' \
    -d "{
      \"studyId\":\"$MA_STUDY_ID\",
      \"label\":\"ma-ref\",
      \"orchestration\":\"multi_agent\",
      \"scale\":\"full\",
      \"variantCount\":1,
      \"cohortSourceStudyId\":\"$SOURCE_STUDY\",
      \"cohortId\":\"${SOURCE_STUDY}_v1\",
      \"workspaceIds\":$ws_json,
      \"filesPerRepository\":10,
      \"randomSeed\":42,
      \"minSmellCount\":1,
      \"models\":$models_json
    }" | python3 -c "import sys,json; d=json.load(sys.stdin); print('created', d.get('config',{}).get('studyId'))"
else
  echo "Study $MA_STUDY_ID already exists"
fi

echo "Importing cohort from $SOURCE_STUDY ..."
curl -sf -X POST "$API/ripple-ref/studies/$MA_STUDY_ID/import-cohort" \
  -H 'Content-Type: application/json' \
  -d "{\"sourceStudyId\":\"$SOURCE_STUDY\"}" | python3 -c "
import sys,json
d=json.load(sys.stdin)
i=d.get('integrity') or {}
print('cohort files:', i.get('cohortFileCount'), 'integrityOk:', i.get('integrityOk'))
if not i.get('integrityOk'):
    print('ISSUES:', i.get('integrityIssues'), file=sys.stderr)
    sys.exit(1)
"

echo "Building dependency contexts ..."
curl -sf -X POST "$API/ripple-ref/studies/$MA_STUDY_ID/build-contexts" >/dev/null

echo "Integrity preflight:"
curl -sf "$API/ripple-ref/studies/$MA_STUDY_ID/integrity-preflight" | python3 -m json.tool

echo "Agents health (require MULTI_LLM_AGENT_MODE=full):"
curl -sf "$AGENTS/health" | python3 -c "
import sys,json
d=json.load(sys.stdin)
mode=d.get('multiLlmAgentMode','?')
print('  multiLlmAgentMode:', mode)
if mode != 'full':
    print('  WARN: set MULTI_LLM_AGENT_MODE=full in agents/.env', file=sys.stderr)
"

echo "=== $MA_STUDY_ID ready ==="
