#!/usr/bin/env bash
# Cheap smoke: refactor 2 small Java files (single LLM each if <250 LOC).
# Prerequisites: backend :8084, agents :8092, OpenRouter key in agents/.env
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8084/api}"
AGENTS_BASE="${AGENTS_BASE:-http://localhost:8092}"
WS="${WORKSPACE_ID:-project-07aa431d}"

FILES=(
  "jhotdraw-develop/jhotdraw-core/src/main/java/org/jhotdraw/draw/locator/BezierPointLocator.java"
  "jhotdraw-develop/jhotdraw-core/src/main/java/org/jhotdraw/draw/action/ToggleGridAction.java"
)

echo "== Refactor smoke (2 small files) =="
curl -sfS "${AGENTS_BASE}/health" | jq -e '.status == "ok"' >/dev/null
curl -sfS "${API_BASE}/health" | jq -e '.status != null' >/dev/null

for fp in "${FILES[@]}"; do
  echo ""
  echo "-- $fp --"
  out="$(curl -sfS -X POST "${AGENTS_BASE}/agents/refactor" \
    -H 'Content-Type: application/json' \
    --max-time 300 \
    -d "$(jq -n \
      --arg w "$WS" \
      --arg f "$fp" \
      '{workspaceId:$w,filePath:$f,goals:["reduce code smells"],researchBatchMode:true,multiLlmChain:true}')")"
  success="$(echo "$out" | jq -r '.success')"
  rejected="$(echo "$out" | jq -r '.rejected')"
  identical="$(echo "$out" | jq -r '.researchOutcome.identicalToOriginal')"
  before="$(echo "$out" | jq -r '.researchOutcome.smellsBefore')"
  after="$(echo "$out" | jq -r '.researchOutcome.smellsAfter')"
  runs="$(echo "$out" | jq '.multiLlmRuns | length')"
  echo "  success=$success rejected=$rejected identical=$identical smells=${before}->${after} llm_passes=$runs"
  if [[ "$identical" == "true" ]]; then
    echo "  FAIL: no code change"
    echo "$out" | jq -r '.rejectionReason // .error // empty' | head -3
    exit 1
  fi
  echo "  OK: refactored"
done

echo ""
echo "== Both files refactored successfully =="
