#!/usr/bin/env bash
# Prepare and test 15-file research sample for system 01 (01-Johotdraw).
#
# Phases (set PHASE= or run steps individually):
#   preflight | pmd | sample | analyze | refactor | all
#
# Usage:
#   ./scripts/run-system1-research-15.sh                    # preflight + pmd + sample + analyze
#   RUN_REFACTOR=1 ./scripts/run-system1-research-15.sh     # also run multi-LLM refactor (slow, $$)
#   PHASE=sample ./scripts/run-system1-research-15.sh       # only pick 15 files
#   FORCE_NEW_SAMPLE=1 ./scripts/run-system1-research-15.sh # archive old manifest, pick fresh 15
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/ports.env"

API_BASE="${API_BASE:-http://127.0.0.1:${BACKEND_PORT}/api}"
AGENTS_BASE="${AGENTS_BASE:-http://127.0.0.1:${AGENTS_PORT}}"
PROJECT_NAME="${PROJECT_NAME:-01-Johotdraw}"
SAMPLE_SIZE="${SAMPLE_SIZE:-15}"
PHASE="${PHASE:-all}"
RUN_DIR="$ROOT/.run/system1-research"
PATHS_FILE="$RUN_DIR/sample-paths.txt"
SUMMARY_FILE="$RUN_DIR/run-summary.json"
PMD_BATCH="${PMD_BATCH:-300}"

mkdir -p "$RUN_DIR"

pass() { echo "  ✅ $*"; }
fail() { echo "  ❌ $*" >&2; exit 1; }
info() { echo "  → $*"; }

resolve_workspace() {
  if [[ -n "${WORKSPACE_ID:-}" ]]; then
    echo "$WORKSPACE_ID"
    return
  fi
  python3 << PY
import json
from pathlib import Path
reg = json.loads(Path.home().joinpath('.refactai/workspaces/projects.json').read_text())
name = "$PROJECT_NAME"
for p in reg:
    if name in (p.get('name') or ''):
        print(p['id'])
        break
PY
}

WS="$(resolve_workspace)"
[[ -n "$WS" ]] || fail "Workspace not found for PROJECT_NAME=$PROJECT_NAME (set WORKSPACE_ID)"

should_run() {
  local step="$1"
  [[ "$PHASE" == "all" || "$PHASE" == "$step" ]]
}

echo "=== RENDRI-R system-1 (${PROJECT_NAME}) — ${SAMPLE_SIZE} files ==="
echo "workspace=$WS"
echo "API_BASE=$API_BASE"
echo "AGENTS_BASE=$AGENTS_BASE"
echo "PHASE=$PHASE RUN_REFACTOR=${RUN_REFACTOR:-0}"
echo ""

if should_run preflight || should_run all; then
  echo "-- 1. Preflight --"
  curl -sfS "$API_BASE/health" >/dev/null || fail "Backend down — run: bash $ROOT/start_daemon.sh restart"
  pass "Backend :${BACKEND_PORT}"

  curl -sfS "$AGENTS_BASE/agents/health" | jq -e '.status == "ok"' >/dev/null \
    || fail "Agents down on :${AGENTS_PORT}"
  ORCH="$(curl -sfS "$AGENTS_BASE/agents/health" | jq -r '.model // "?"')"
  pass "Agents :${AGENTS_PORT} (model=$ORCH)"

  KEY_OK="$(curl -sfS "$AGENTS_BASE/agents/health" | jq -r '.hasOpenRouterKey')"
  if [[ "$KEY_OK" != "true" && "${RUN_REFACTOR:-0}" == "1" ]]; then
    fail "OPENROUTER_API_KEY missing in agents/.env (required for refactor)"
  fi
  pass "OpenRouter key present=$KEY_OK"
  echo ""
fi

if should_run pmd || should_run all; then
  echo "-- 2. PMD workspace bootstrap (batched) --"
  SRC_COUNT="$(curl -sfS "$API_BASE/workspaces/$WS" | python3 -c "import json,sys; print(json.load(sys.stdin).get('sourceFiles',0))")"
  info "Java source files: $SRC_COUNT"
  if [[ "${SKIP_PMD:-0}" == "1" ]]; then
    pass "SKIP_PMD=1"
  elif [[ "$SRC_COUNT" -le 0 ]]; then
    fail "No source files — upload project first"
  else
    offset=0
    scanned=0
    while [[ "$offset" -lt "$SRC_COUNT" ]]; do
      info "PMD batch offset=$offset max=$PMD_BATCH"
      BATCH_JSON="$(curl -sfS -X POST "$API_BASE/workspaces/$WS/pmd-scan?offset=$offset&maxFiles=$PMD_BATCH")"
      batch_n="$(echo "$BATCH_JSON" | jq -r '.filesScanned // 0')"
      total="$(echo "$BATCH_JSON" | jq -r '.totalJavaSourceFiles // 0')"
      scanned=$((scanned + batch_n))
      offset=$((offset + PMD_BATCH))
      [[ "$batch_n" -gt 0 ]] || break
      [[ "$offset" -lt "$total" ]] || break
    done
    pass "PMD scanned ~$scanned files"
  fi
  echo ""
fi

if should_run sample || should_run all; then
  echo "-- 3. Stratified sample ($SAMPLE_SIZE files, seed=${RESEARCH_SEED:-42}) --"
  PREP_ARGS=(--workspace "$WS" --label "$PROJECT_NAME" --max "$SAMPLE_SIZE" --seed "${RESEARCH_SEED:-42}")
  if [[ "${FORCE_NEW_SAMPLE:-0}" == "1" ]]; then
    PREP_ARGS+=(--force)
  else
    PREP_ARGS+=(--skip-if-exists)
  fi
  (cd "$ROOT/web/app" && API_BASE="$API_BASE" npx --yes tsx scripts/prepare-research-system-sample.ts "${PREP_ARGS[@]}") \
    | tee "$RUN_DIR/prepare-sample.log"

  curl -sfS "$API_BASE/workspaces/$WS/research-sample" | jq -r '.result.paths[]' > "$PATHS_FILE"
  N="$(wc -l < "$PATHS_FILE" | tr -d ' ')"
  [[ "$N" -ge 1 ]] || fail "No paths in manifest"
  pass "Manifest: $N files → $PATHS_FILE"
  SAMPLE_ID="$(curl -sfS "$API_BASE/workspaces/$WS/research-sample" | jq -r '.sampleId // .manifest.sampleId // empty')"
  info "sampleId=$SAMPLE_ID"
  echo ""
fi

if [[ ! -f "$PATHS_FILE" ]]; then
  curl -sfS "$API_BASE/workspaces/$WS/research-sample" 2>/dev/null | jq -r '.result.paths[]' > "$PATHS_FILE" || true
fi
[[ -s "$PATHS_FILE" ]] || fail "Missing $PATHS_FILE — run PHASE=sample first"

if should_run analyze || should_run all; then
  echo "-- 4. Analyze all sample files (/agents/analyze) --"
  : > "$RUN_DIR/analyze-results.jsonl"
  idx=0
  while IFS= read -r fp; do
    idx=$((idx + 1))
    info "[$idx/$SAMPLE_SIZE] analyze: ${fp##*/}"
  out="$(curl -sfS -X POST "$AGENTS_BASE/agents/analyze" \
      -H 'Content-Type: application/json' \
      --max-time 300 \
      -d "$(jq -n --arg w "$WS" --arg f "$fp" '{workspaceId:$w,filePath:$f}')")"
    decision="$(echo "$out" | jq -r '.decision // "?"')"
    smells="$(echo "$out" | jq -r '.smellCount // (.refactoringPlan | length) // 0')"
    echo "$out" | jq -c '{filePath:$fp,decision,smellCount:(.smellCount//null),planSteps:(.refactoringPlan|length//0),success:(.success//true)}' --arg fp "$fp" >> "$RUN_DIR/analyze-results.jsonl"
    echo "       decision=$decision plan_steps=$smells"
  done < "$PATHS_FILE"
  pass "Analyze complete → $RUN_DIR/analyze-results.jsonl"
  echo ""
fi

if [[ "${RUN_REFACTOR:-0}" == "1" ]] && { should_run refactor || should_run all; }; then
  echo "-- 5. Multi-LLM refactor (research mode, LangGraph) — SLOW --"
  if [[ -z "${SAMPLE_ID:-}" ]]; then
    SAMPLE_ID="$(curl -sfS "$API_BASE/workspaces/$WS/research-sample" | jq -r '.sampleId // .manifest.sampleId // empty')"
  fi
  : > "$RUN_DIR/refactor-results.jsonl"
  idx=0
  while IFS= read -r fp; do
    idx=$((idx + 1))
    info "[$idx/$SAMPLE_SIZE] refactor: ${fp##*/}"
    out="$(curl -sfS -X POST "$AGENTS_BASE/agents/refactor" \
      -H 'Content-Type: application/json' \
      --max-time 3600 \
      -d "$(jq -n \
        --arg w "$WS" \
        --arg f "$fp" \
        --arg sid "${SAMPLE_ID:-}" \
        '{
          workspaceId: $w,
          filePath: $f,
          goals: ["reduce code smells", "improve readability"],
          researchBatchMode: true,
          multiLlmChain: true,
          sampleId: (if $sid == "" then null else $sid end)
        }')")"
    echo "$out" | jq -c '{
      filePath: .filePath,
      success: .success,
      orchestration: .pipelineMetadata.orchestration,
      nodeTrace: .pipelineMetadata.nodeTrace,
      smellsBefore: .researchOutcome.smellsBefore,
      smellsAfter: .researchOutcome.smellsAfter,
      multiLlmPasses: (.multiLlmRuns|length)
    }' >> "$RUN_DIR/refactor-results.jsonl"
    echo "       success=$(echo "$out" | jq -r '.success') orch=$(echo "$out" | jq -r '.pipelineMetadata.orchestration // "?"')"
  done < "$PATHS_FILE"
  pass "Refactor complete → $RUN_DIR/refactor-results.jsonl"
  echo ""
fi

# Summary
python3 << PY
import json
from pathlib import Path
run = Path("$RUN_DIR")
summary = {"workspace": "$WS", "project": "$PROJECT_NAME", "sampleSize": $SAMPLE_SIZE}
ap = run / "analyze-results.jsonl"
if ap.exists():
    rows = [json.loads(l) for l in ap.read_text().splitlines() if l.strip()]
    summary["analyze"] = {
        "files": len(rows),
        "refactor": sum(1 for r in rows if r.get("decision") in ("REFACTOR", "PROCEED")),
        "optional": sum(1 for r in rows if r.get("decision") == "OPTIONAL"),
        "skip": sum(1 for r in rows if r.get("decision") == "SKIP"),
    }
rp = run / "refactor-results.jsonl"
if rp.exists():
    rows = [json.loads(l) for l in rp.read_text().splitlines() if l.strip()]
    summary["refactor"] = {
        "files": len(rows),
        "success": sum(1 for r in rows if r.get("success")),
        "langgraph": sum(1 for r in rows if r.get("orchestration") == "langgraph"),
    }
out = run / "run-summary.json"
out.write_text(json.dumps(summary, indent=2))
print(json.dumps(summary, indent=2))
PY

echo ""
echo "=== Done ==="
echo "Sample paths:  $PATHS_FILE"
echo "Analyze log:   $RUN_DIR/analyze-results.jsonl"
echo "Summary:       $SUMMARY_FILE"
echo ""
echo "Next:"
echo "  UI → $PROJECT_NAME → Batch → use locked research sample → Run multi-LLM"
echo "  Or: RUN_REFACTOR=1 ./scripts/run-system1-research-15.sh"
echo "  Export: cd web/app && npm run export:extended-research"
