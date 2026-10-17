#!/usr/bin/env bash
# Smoke-test independent multi-LLM research API endpoints (backend must be on ports.env BACKEND_PORT).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/ports.env"
BASE="http://127.0.0.1:${BACKEND_PORT}/api"

curl -sfS "$BASE/health" >/dev/null || {
  echo "Backend not running on $BASE — start with: bash start_daemon.sh"
  exit 1
}

WS=$(curl -sfS "$BASE/workspaces" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['id'])")
SAMPLE="api-smoke-$(date +%s)"
FILE=$(curl -sfS "$BASE/workspaces/$WS/files?page=0&size=30&analyzeCodeSmells=false" | python3 -c "
import json,sys
for f in json.load(sys.stdin).get('files',[]):
  if f.get('name','').endswith('.java'):
    print(f['relativePath']); break
")
test -n "$FILE"

echo "workspace=$WS file=$FILE sample=$SAMPLE"

curl -sfS "$BASE/workspaces/$WS/research/excluded-paths" | python3 -m json.tool >/dev/null

curl -sfS -X POST "$BASE/workspaces/$WS/research/baseline-snapshot" \
  -H 'Content-Type: application/json' \
  -d "{\"sampleId\":\"$SAMPLE\",\"filePath\":\"$FILE\"}" | python3 -m json.tool >/dev/null

ENC=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$FILE'))")
curl -sfS "$BASE/workspaces/$WS/research/baseline-content?sampleId=$SAMPLE&filePath=$ENC" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert len(d.get('content',''))>0, d
"

curl -sfS -X POST "$BASE/workspaces/$WS/multi-llm-artifact" \
  -H 'Content-Type: application/json' \
  -d "{\"sampleId\":\"$SAMPLE\",\"filePath\":\"$FILE\",\"provider\":\"OpenAI\",\"candidateContent\":\"// smoke\",\"researchMetrics\":{\"comparison\":{}},\"agentSteps\":[],\"smellsBefore\":1,\"smellsAfter\":0}" \
  | python3 -m json.tool >/dev/null

echo "research-independent API smoke: OK"
