#!/usr/bin/env bash
# RIPPLE-REF one-file pilot: scan → select → contexts → V1+V2 for one model.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -f "$ROOT/ports.env" ]; then
  # shellcheck disable=SC1091
  source "$ROOT/ports.env"
fi

BACKEND_PORT="${BACKEND_PORT:-8084}"
AGENTS_PORT="${AGENTS_PORT:-8092}"
API="http://127.0.0.1:${BACKEND_PORT}/api"
AGENTS="http://127.0.0.1:${AGENTS_PORT}"

WORKSPACE_ID="${1:-project-b16f055f}"
MODEL_ID="${2:-openai/gpt-5.5}"

echo "=== RIPPLE-REF pilot ==="
echo "Workspace: $WORKSPACE_ID"
echo "Model: $MODEL_ID"

echo "Creating study..."
STUDY=$(curl -sf -X POST "$API/ripple-ref/studies" \
  -H 'Content-Type: application/json' \
  -d "{\"scale\":\"custom\",\"workspaceIds\":[\"$WORKSPACE_ID\"],\"filesPerRepository\":1,\"randomSeed\":42,\"minSmellCount\":1,\"models\":[{\"provider\":\"openai\",\"family\":\"gpt\",\"displayName\":\"GPT-5.5\",\"modelId\":\"$MODEL_ID\",\"apiRoute\":\"openrouter\",\"contextWindow\":1000000}]}")

STUDY_ID=$(echo "$STUDY" | python3 -c "import sys,json; print(json.load(sys.stdin)['config']['studyId'])")
echo "Study ID: $STUDY_ID"

echo "Scanning repository..."
curl -sf -X POST "$API/ripple-ref/studies/$STUDY_ID/scan/$WORKSPACE_ID" >/dev/null

echo "Selecting files..."
SELECTED=$(curl -sf -X POST "$API/ripple-ref/studies/$STUDY_ID/select-files")
FILE_PATH=$(echo "$SELECTED" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for repo, files in (d.get('selectedByRepo') or {}).items():
  if files:
    print(files[0]['filePath'])
    break
")
echo "Selected file: $FILE_PATH"

echo "Building dependency contexts..."
curl -sf -X POST "$API/ripple-ref/studies/$STUDY_ID/build-contexts" >/dev/null

GRAPH=$(curl -sf "$API/ripple-ref/studies/$STUDY_ID/file-dependency-graph?workspaceId=$WORKSPACE_ID&filePath=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$FILE_PATH")")
echo "Dependency graph summary:"
echo "$GRAPH" | python3 -c "
import sys,json
g=json.load(sys.stdin)
print(f\"  fan-in={g.get('fanIn')} fan-out={g.get('fanOut')} callers={len(g.get('downstreamCallers',[]))} upstream={len(g.get('upstreamFiles',[]))}\")
"

export RIPPLE_REF_TEST_PROBE="${RIPPLE_REF_TEST_PROBE:-1}"
export RIPPLE_REF_COMPILE_PROBE="${RIPPLE_REF_COMPILE_PROBE:-0}"
echo "Behavioral L4: always on | Test probe L5: $RIPPLE_REF_TEST_PROBE | Compile L3: $RIPPLE_REF_COMPILE_PROBE"

for VARIANT in V1 V2; do
  echo "Running $VARIANT with $MODEL_ID..."
  RESULT=$(curl -sf -X POST "$AGENTS/agents/ripple-ref/run-candidate" \
    -H 'Content-Type: application/json' \
    -d "{\"studyId\":\"$STUDY_ID\",\"workspaceId\":\"$WORKSPACE_ID\",\"filePath\":\"$FILE_PATH\",\"variant\":\"$VARIANT\",\"model\":{\"modelId\":\"$MODEL_ID\",\"apiRoute\":\"openrouter\",\"contextWindow\":1000000},\"resume\":false}" \
    || echo '{"status":"failed","error":"agent call failed"}')
  echo "$RESULT" | python3 -c "
import sys,json
r=json.load(sys.stdin)
rep=r.get('rippleReport') or {}
beh=(rep.get('behavioral') or {})
print(f\"  status={r.get('status')} risk={rep.get('riskLevel')} adoption={rep.get('adoptionClass')} behavioral={beh.get('behavioralCorrect')} tests={((rep.get('tests') or {}).get('status'))} error={r.get('error')}\")
"
done

EXPORT=$(curl -sf "$API/ripple-ref/studies/$STUDY_ID/export-info")
STUDY_DIR=$(echo "$EXPORT" | python3 -c "import sys,json; print(json.load(sys.stdin)['studyDir'])")

echo ""
echo "=== Pilot complete ==="
echo "Study ID: $STUDY_ID"
echo "Study dir: $STUDY_DIR"
echo "Results CSV: $STUDY_DIR/results_candidates.csv"
if [ -f "$STUDY_DIR/results_candidates.csv" ]; then
  echo "--- results_candidates.csv ---"
  cat "$STUDY_DIR/results_candidates.csv"
fi
