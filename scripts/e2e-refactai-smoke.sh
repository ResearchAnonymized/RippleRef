#!/usr/bin/env bash
# RefactAI E2E smoke: PMD (paginated + per-file + live), agents analyze/batch dry-run, optional full refactor.
# Prerequisites: curl, jq; backend :8083/api; agents :8091; at least one workspace.
#
# Usage:
#   ./scripts/e2e-refactai-smoke.sh
#   WORKSPACE_ID=project-abc API_BASE=http://localhost:8083/api ./scripts/e2e-refactai-smoke.sh
#   E2E_RUN_AGENTS_REFACTOR=1 ./scripts/e2e-refactai-smoke.sh   # slow; needs OpenRouter on agents

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

API_BASE="${API_BASE:-http://localhost:8083/api}"
AGENTS_BASE="${AGENTS_BASE:-http://localhost:8091}"

pass() { echo "  OK: $*"; }
fail() { echo "  FAIL: $*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing command '$1' (install it or use PATH)"
}

need_cmd curl
need_cmd jq

echo "== RefactAI E2E smoke =="
echo "API_BASE=$API_BASE"
echo "AGENTS_BASE=$AGENTS_BASE"
echo

echo "-- TC0: health (backend + agents) --"
curl -sfS "${API_BASE}/health" | jq -e '.status != null' >/dev/null || fail "backend /health"
pass "backend /health"

curl -sfS "${AGENTS_BASE}/agents/health" | jq -e '.status == "ok"' >/dev/null || fail "agents /agents/health"
pass "agents /agents/health"

echo "-- TC1: resolve workspace id --"
WS="${WORKSPACE_ID:-}"
if [[ -z "$WS" ]]; then
  WS="$(curl -sfS "${API_BASE}/workspaces" | jq -r '.[0].id // empty')"
fi
[[ -n "$WS" ]] || fail "No workspace found. Set WORKSPACE_ID or create/upload a project."
pass "workspace id: $WS"

echo "-- TC2: paginated files + PMD counts (analyzeCodeSmells=true) --"
PAGE_JSON="$(curl -sfS "${API_BASE}/workspaces/${WS}/files/paginated?page=0&size=40&analyzeCodeSmells=true")"
echo "$PAGE_JSON" | jq -e '.files | type == "array"' >/dev/null || fail "paginated response missing .files"
JAVA_REL="$(echo "$PAGE_JSON" | jq -r '[.files[] | select(.name | endswith(".java"))] | .[0].relativePath // empty')"
[[ -n "$JAVA_REL" ]] || fail "No .java file on first page — increase size or pick another page"
pass "sample java relativePath: $JAVA_REL"

# At least one java file should report numeric codeSmells when PMD ran (can be 0 for clean files)
HAS_COUNT="$(echo "$PAGE_JSON" | jq '[.files[] | select(.name | endswith(".java")) | select(.codeSmells != null)] | length')"
[[ "$HAS_COUNT" -ge 1 ]] || fail "expected >=1 java file with codeSmells field populated when analyzeCodeSmells=true"
pass "java files with codeSmells field: $HAS_COUNT"

echo "-- TC3: per-file enhanced analysis (PMD via analyze-file) --"
AF_JSON="$(curl -sfS -X POST "${API_BASE}/workspace-enhanced-analysis/analyze-file" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg w "$WS" --arg f "$JAVA_REL" '{workspaceId:$w, filePath:$f}')")"

echo "$AF_JSON" | jq -e '.codeSmells | type == "array"' >/dev/null || fail "analyze-file: .codeSmells must be array"
N_SMELLS="$(echo "$AF_JSON" | jq '.codeSmells | length')"
pass "analyze-file codeSmells count: $N_SMELLS"

# Heuristic: PMD-backed payloads use rule-like type strings from converter (not legacy enum names only)
FIRST_TYPE="$(echo "$AF_JSON" | jq -r '.codeSmells[0].type // empty')"
[[ -n "$FIRST_TYPE" ]] || [[ "$N_SMELLS" -eq 0 ]] || fail "first smell missing type"
if [[ "$N_SMELLS" -gt 0 ]]; then
  echo "  (sample smell type: $FIRST_TYPE)"
fi

echo "-- TC4: analyze-live PMD before/after (no agents) --"
# Bad: empty catch (PMD). Good: same method without try/catch — should not add *more* violations than bad.
BAD_JAVA=$'class E2eBad {\n  void m() {\n    try { int x = 1; } catch (Exception e) { }\n  }\n}\n'
GOOD_JAVA=$'class E2eBad {\n  void m() {\n    int x = 1;\n  }\n}\n'

LIVE_BAD="$(curl -sfS -X POST "${API_BASE}/workspace-enhanced-analysis/analyze-live" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg w "$WS" --arg f "$JAVA_REL" --arg c "$BAD_JAVA" '{workspaceId:$w, filePath:$f, content:$c}')")"
LIVE_GOOD="$(curl -sfS -X POST "${API_BASE}/workspace-enhanced-analysis/analyze-live" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg w "$WS" --arg f "$JAVA_REL" --arg c "$GOOD_JAVA" '{workspaceId:$w, filePath:$f, content:$c}')")"

NB="$(echo "$LIVE_BAD" | jq '.codeSmells | length')"
NG="$(echo "$LIVE_GOOD" | jq '.codeSmells | length')"
[[ "$NB" -ge 1 ]] || fail "analyze-live (bad java): expected >=1 PMD hit, got $NB"
[[ "$NG" -le "$NB" ]] || fail "analyze-live: good snippet should not increase violations ($NG > $NB)"
pass "analyze-live violations bad=$NB good=$NG (good <= bad)"

echo "-- TC5: agents /agents/analyze (uses backend PMD) --"
AN_JSON="$(curl -sfS -X POST "${AGENTS_BASE}/agents/analyze" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg w "$WS" --arg f "$JAVA_REL" '{workspaceId:$w, filePath:$f}')")"

echo "$AN_JSON" | jq -e '.steps | type == "array"' >/dev/null || fail "agents analyze: missing steps"
DEC="$(echo "$AN_JSON" | jq -r '.decision // empty')"
[[ -n "$DEC" ]] || fail "agents analyze: missing decision"
pass "agents analyze decision=$DEC steps=$(echo "$AN_JSON" | jq '.steps | length')"

echo "-- TC6: agents refactor-batch dry-run --"
DRY="$(curl -sfS -X POST "${AGENTS_BASE}/agents/refactor-batch" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg w "$WS" '{workspaceId:$w, dryRun:true, maxFiles:5}')")"
echo "$DRY" | jq -e '.dryRun == true' >/dev/null || fail "refactor-batch dryRun"
pass "refactor-batch dryRun filePaths=$(echo "$DRY" | jq '.filePaths | length')"

echo "-- TC7: file size policy (local, no HTTP) --"
(cd "$ROOT/agents" && python3 test_file_size_policy.py) || fail "file_size_policy.py"
pass "file_size_policy.py (5k attempt, 30k block, 1M hard block)"

if [[ "${E2E_RUN_AGENTS_REFACTOR:-}" == "1" ]]; then
  echo "-- TC8 (optional): agents /agents/refactor full pipeline (slow, may write disk) --"
  RF="$(curl -sfS -X POST "${AGENTS_BASE}/agents/refactor" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg w "$WS" --arg f "$JAVA_REL" '{workspaceId:$w, filePath:$f, goals:["minimal safe cleanup"]}')" \
    --max-time 600)"
  echo "$RF" | jq -e '.steps | type == "array"' >/dev/null || fail "refactor: missing steps"
  echo "$RF" | jq -e '.researchOutcome != null' >/dev/null || fail "refactor: missing researchOutcome"
  echo "$RF" | jq -e '.filePath != null' >/dev/null || fail "refactor: missing filePath"
  echo "  refactor success=$(echo "$RF" | jq -r '.success // false')"
  FO="$(echo "$RF" | jq -r '.failureOutcome.userMessage // empty')"
  [[ -n "$FO" ]] && echo "  failureOutcome.userMessage: ${FO:0:80}..."
  # Re-check PMD on disk after potential apply
  AFTER="$(curl -sfS -X POST "${API_BASE}/workspace-enhanced-analysis/analyze-file" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg w "$WS" --arg f "$JAVA_REL" '{workspaceId:$w, filePath:$f}')")"
  echo "  post-refactor analyze-file count=$(echo "$AFTER" | jq '.codeSmells | length')"
  pass "TC8 completed (inspect agents log if success=false)"
else
  echo "-- TC8: skipped (set E2E_RUN_AGENTS_REFACTOR=1 to run full /agents/refactor) --"
fi

echo
echo "== All automated smoke checks passed =="
echo "See scripts/FEATURE_TEST_MATRIX.md for full manual + UI checks."
