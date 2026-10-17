#!/usr/bin/env bash
# Direct-prompt baseline batch — same 450 files × 3 providers as REFINE research batch.
#
# Phases: preflight | recover | batch-dry | batch-smoke | batch | compare | all
#
# Usage:
#   ./scripts/run-baseline-batch.sh                         # preflight + recover + batch dry-run
#   RUN_BATCH=1 ./scripts/run-baseline-batch.sh             # also run execute batch (needs confirm)
#   PHASE=batch-smoke RUN_BATCH=1 ./scripts/run-baseline-batch.sh  # 3 files × 3 providers
#   LIMIT=15 RUN_BATCH=1 CONFIRM_SUBSET=1 ./scripts/run-baseline-batch.sh
#   RUN_BATCH=1 CONFIRM_FULL=1 ./scripts/run-baseline-batch.sh     # full 450×3 (slow, $$)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/ports.env"

API_BASE="${API_BASE:-http://127.0.0.1:${BACKEND_PORT}/api}"
AGENTS_BASE="${AGENTS_BASE:-http://127.0.0.1:${AGENTS_PORT}}"
PHASE="${PHASE:-all}"
LIMIT="${LIMIT:-}"
RUN_DIR="$ROOT/.run/baseline-batch"
SUMMARY_FILE="$RUN_DIR/run-summary.json"

mkdir -p "$RUN_DIR"

pass() { echo "  ✅ $*"; }
fail() { echo "  ❌ $*" >&2; exit 1; }
info() { echo "  → $*"; }

should_run() {
  local step="$1"
  [[ "$PHASE" == "all" || "$PHASE" == "$step" ]]
}

echo "=== Direct-prompt baseline batch (REFINE-aligned cohort) ==="
echo "API_BASE=$API_BASE"
echo "AGENTS_BASE=$AGENTS_BASE"
echo "PHASE=$PHASE RUN_BATCH=${RUN_BATCH:-0} LIMIT=${LIMIT:-all}"
echo ""

if should_run preflight || should_run all; then
  echo "-- 1. Preflight --"
  curl -sfS "$API_BASE/workspaces" >/dev/null 2>&1 || curl -sfS "$API_BASE/health" >/dev/null \
    || fail "Backend down — run: bash $ROOT/start_daemon.sh start"
  pass "Backend :${BACKEND_PORT}"

  curl -sfS "$AGENTS_BASE/agents/health" | jq -e '.status == "ok"' >/dev/null \
    || fail "Agents down on :${AGENTS_PORT}"
  pass "Agents :${AGENTS_PORT}"

  if [[ "${RUN_BATCH:-0}" == "1" ]]; then
    KEY_OK="$(curl -sfS "$AGENTS_BASE/agents/health" | jq -r '.hasOpenRouterKey')"
    [[ "$KEY_OK" == "true" ]] || fail "OPENROUTER_API_KEY missing in agents/.env"
    pass "OpenRouter key present"
  fi
  echo ""
fi

if should_run recover || should_run all; then
  echo "-- 2. Recover 450-file cohort --"
  REC="$(curl -sfS -X POST "$AGENTS_BASE/agents/baseline/recover-selected-files")"
  echo "$REC" | jq '{totalRecovered, exactly450, refinePassesMatched}' | tee "$RUN_DIR/recover.json"
  N="$(echo "$REC" | jq -r '.totalRecovered')"
  [[ "$N" -ge 1 ]] || fail "Recovery returned 0 files"
  pass "Recovered $N files"
  echo ""
fi

batch_body() {
  local dry="$1"
  jq -n \
    --argjson dry_run "$dry" \
    --argjson resume "${RESUME:-true}" \
    --argjson confirm_subset "${CONFIRM_SUBSET:-false}" \
    --argjson confirm_full "${CONFIRM_FULL:-false}" \
    --arg limit "${LIMIT:-}" \
    '{
      providers: ["openai", "google", "anthropic"],
      resume: $resume,
      confirmSubset: $confirm_subset,
      confirmFull: $confirm_full,
      limit: (if $limit == "" then null else ($limit|tonumber) end),
      dryRun: $dry_run
    }' | jq 'del(.dryRun)'
}

if should_run batch-dry || should_run all; then
  echo "-- 3. Batch dry-run (files × 3 providers, no LLM) --"
  OUT="$(curl -sfS -X POST "$AGENTS_BASE/agents/baseline/batch-dry-run" \
    -H 'Content-Type: application/json' \
    -d "$(batch_body true)")"
  echo "$OUT" | jq '.summary' | tee "$RUN_DIR/batch-dry-summary.json"
  pass "Batch dry-run complete"
  echo ""
fi

if [[ "${RUN_BATCH:-0}" == "1" ]]; then
  if should_run batch-smoke || [[ "$PHASE" == "all" && -z "${LIMIT:-}" && "${CONFIRM_FULL:-0}" != "1" ]]; then
    if should_run batch-smoke || { should_run all && [[ "${SKIP_SMOKE:-0}" != "1" ]]; }; then
      echo "-- 4a. Batch smoke (3 files × 3 providers) — optional on 'all' unless SKIP_SMOKE=1 --"
      if should_run batch-smoke; then
        JOB="$(curl -sfS -X POST "$AGENTS_BASE/agents/baseline/batch-smoke-test" \
          -H 'Content-Type: application/json' \
          -d '{"limit":3}')"
        JOB_ID="$(echo "$JOB" | jq -r '.jobId')"
        info "jobId=$JOB_ID — polling..."
        for _ in $(seq 1 120); do
          sleep 10
          ST="$(curl -sfS "$AGENTS_BASE/agents/baseline/job/$JOB_ID" | jq -r '.status')"
          [[ "$ST" == "completed" || "$ST" == "failed" ]] && break
        done
        curl -sfS "$AGENTS_BASE/agents/baseline/job/$JOB_ID" | jq '.result.summary' | tee "$RUN_DIR/batch-smoke-summary.json"
        pass "Batch smoke done"
        echo ""
      fi
    fi
  fi

  if should_run batch || should_run all; then
    echo "-- 4b. Batch execute (same models as REFINE chain) --"
  BODY="$(batch_body false)"
  if [[ -n "${LIMIT:-}" ]]; then
    [[ "${CONFIRM_SUBSET:-0}" == "1" ]] || fail "Set CONFIRM_SUBSET=1 for subset batch"
  else
    [[ "${CONFIRM_FULL:-0}" == "1" ]] || fail "Set CONFIRM_FULL=1 for full 450×3 batch"
  fi
  JOB="$(curl -sfS -X POST "$AGENTS_BASE/agents/baseline/batch-run" \
    -H 'Content-Type: application/json' \
    -d "$BODY")"
  echo "$JOB" | jq '{jobId, files, expectedPasses, providers, models}' | tee "$RUN_DIR/batch-job.json"
  JOB_ID="$(echo "$JOB" | jq -r '.jobId')"
  info "Polling job $JOB_ID (may take hours for full batch)..."
  for _ in $(seq 1 3600); do
    sleep 15
    J="$(curl -sfS "$AGENTS_BASE/agents/baseline/job/$JOB_ID")"
    ST="$(echo "$J" | jq -r '.status')"
    P="$(echo "$J" | jq -r '.progress | "\(.successful // 0)/\(.attempted // 0) fail=\(.failed // 0) provider=\(.current_provider // "?")"')"
    info "status=$ST $P"
    [[ "$ST" == "completed" || "$ST" == "failed" ]] && break
  done
  echo "$J" | jq '.result' > "$RUN_DIR/batch-result.json"
  pass "Batch execute finished ($ST)"
  echo ""
  fi
fi

if should_run compare || should_run all; then
  echo "-- 5. Compare baseline vs REFINE (delta-paired) --"
  CMP="$(curl -sfS -X POST "$AGENTS_BASE/agents/baseline/compare-refine" \
    -H 'Content-Type: application/json' \
    -d '{}')"
  echo "$CMP" | jq '{matchedPairs, beforeValidationPass, beforeValidationFail, baselineImprovementTotalPmd, refineImprovementTotalPmd}' \
    | tee "$RUN_DIR/compare-summary.json"
  pass "Comparison written to baseline_comparison/results/"
  echo ""
fi

python3 << PY
import json
from pathlib import Path
run = Path("$RUN_DIR")
summary = {"runDir": str(run)}
for name in ("recover.json", "batch-dry-summary.json", "batch-smoke-summary.json", "batch-result.json", "compare-summary.json"):
    p = run / name
    if p.exists():
        summary[name.replace(".json", "")] = json.loads(p.read_text())
Path("$SUMMARY_FILE").write_text(json.dumps(summary, indent=2))
print(json.dumps(summary, indent=2))
PY

echo ""
echo "=== Done ==="
echo "Artifacts: $ROOT/baseline_comparison/results/"
echo "Batch log:   $ROOT/baseline_comparison/logs/baseline_batch_results.jsonl"
echo ""
echo "Examples:"
echo "  PHASE=batch-smoke RUN_BATCH=1 ./scripts/run-baseline-batch.sh"
echo "  LIMIT=15 RUN_BATCH=1 CONFIRM_SUBSET=1 ./scripts/run-baseline-batch.sh"
echo "  RUN_BATCH=1 CONFIRM_FULL=1 ./scripts/run-baseline-batch.sh"
echo "  UI → Baseline Comparison → Batch pipeline (3 providers)"
