#!/usr/bin/env bash
# Pre-flight before new 150-file independent multi-LLM study.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/ports.env"
BASE="http://127.0.0.1:${BACKEND_PORT}/api"
AGENTS="http://127.0.0.1:${AGENTS_PORT}/agents"
FRONT="http://127.0.0.1:${FRONTEND_PORT}"

pass() { echo "  ✅ $*"; }
fail() { echo "  ❌ $*" >&2; exit 1; }

echo "=== RENDRI-R research study preflight ==="
echo ""

echo "1. Services"
curl -sfS "$BASE/health" >/dev/null || fail "Backend not on port $BACKEND_PORT — run: bash run_in_terminal.sh"
pass "Backend $BACKEND_PORT"

curl -sfS "$AGENTS/health" >/dev/null || fail "Agents not on port $AGENTS_PORT"
pass "Agents $AGENTS_PORT"

curl -sfS -o /dev/null "$FRONT" || fail "Frontend not on port $FRONTEND_PORT"
pass "Frontend $FRONTEND_PORT"

echo ""
echo "2. Agents independent parallel code"
test -f "$ROOT/agents/multi_llm_independent.py" || fail "missing multi_llm_independent.py"
python3 -c "from multi_llm_independent import run_multi_llm_independent_parallel" 2>/dev/null \
  || fail "agents module import failed (cd agents && pip install -r requirements.txt)"
pass "multi_llm_independent.py importable"

grep -q "independent_parallel" "$ROOT/agents/main.py" || fail "main.py missing independent_parallel"
pass "main.py sets multiLlmMode=independent_parallel"

echo ""
echo "3. Backend research APIs"
WS=$(curl -sfS "$BASE/workspaces" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['id'])")
curl -sfS "$BASE/workspaces/$WS/research/excluded-paths" >/dev/null \
  || fail "GET /research/excluded-paths missing — rebuild backend JAR and restart"
pass "excluded-paths API"

FILE=$(curl -sfS "$BASE/workspaces/$WS/files?page=0&size=50" | python3 -c "
import json,sys
for f in json.load(sys.stdin):
  if str(f.get('name','')).endswith('.java'):
    print(f['relativePath']); break
" || true)
if [ -z "${FILE:-}" ]; then
  echo "  ⚠️  No Java file found to test snapshot (upload project + PMD first)"
else
  SAMPLE="preflight-$(date +%s)"
  curl -sfS -X POST "$BASE/workspaces/$WS/research/baseline-snapshot" \
    -H 'Content-Type: application/json' \
    -d "{\"sampleId\":\"$SAMPLE\",\"filePath\":\"$FILE\"}" >/dev/null \
    || fail "baseline-snapshot failed"
  pass "baseline-snapshot API"
fi

echo ""
echo "4. Batch request flags (UI → agents)"
grep -q "researchBatchMode = true" "$ROOT/web/app/app/lib/batchRefactorPipeline.ts" || fail "batch missing researchBatchMode"
grep -q "multiLlmChain: true" "$ROOT/web/app/app/components/BatchRefactoring.tsx" || fail "batch missing multiLlmChain"
pass "Batch sends researchBatchMode + multiLlmChain → independent_parallel"

echo ""
echo "=== All preflight checks passed ==="
echo ""
echo "Next in UI (http://127.0.0.1:${FRONTEND_PORT}):"
echo "  1. Hard refresh (Cmd+Shift+R)"
echo "  2. Per project: Batch → Pick NEW research sample"
echo "  3. Re-run research sample (multi-LLM)"
echo "  4. After 15 files: export Excel with Research sample only"
echo "  5. Repeat ×10 projects → Cross-project export (Only research sample)"
