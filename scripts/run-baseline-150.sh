#!/usr/bin/env bash
# Safe 150-file baseline study: stratified sample + direct-prompt only (REFINE read-only).
# Phases: preflight | recover | select-150 | verify-refine | batch-dry | batch-smoke | batch | compare | failed-passes | retry-failed | swap-failed | batch-swapped | paper-analysis | all
#
# Examples:
#   ./scripts/run-baseline-150.sh
#   PHASE=batch-dry ./scripts/run-baseline-150.sh
#   PHASE=batch CONFIRM_EXECUTE=1 ./scripts/run-baseline-150.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/ports.env" 2>/dev/null || true
AGENTS_PORT="${AGENTS_PORT:-8091}"
AGENTS_BASE="http://127.0.0.1:${AGENTS_PORT}"
PHASE="${PHASE:-all}"
RUN_DIR="$ROOT/.run/baseline-150"
mkdir -p "$RUN_DIR"

info() { echo "→ $*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

should_run() { [[ "$PHASE" == "$1" || "$PHASE" == "all" ]]; }

echo "=== Baseline comparison (150-file stratified, REFINE read-only) ==="

if should_run preflight || should_run all; then
  curl -sfS "$AGENTS_BASE/agents/health" >/dev/null || fail "Agents not running on $AGENTS_BASE"
  curl -sfS "http://127.0.0.1:${BACKEND_PORT:-8083}/api/health" >/dev/null || fail "Backend not running"
  info "Preflight OK"
fi

if should_run recover || should_run all; then
  info "Recovering 450-file REFINE cohort..."
  curl -sfS -X POST "$AGENTS_BASE/agents/baseline/recover-selected-files" | tee "$RUN_DIR/recover.json" | jq '{totalRecovered, refinePassesMatched}'
fi

if should_run select-150 || should_run all; then
  info "Selecting 150 stratified files (seed 42)..."
  curl -sfS -X POST "$AGENTS_BASE/agents/baseline/select-150-stratified" | tee "$RUN_DIR/select-150.json" | jq '{selectedCount, refineAllMatched, refinePassesMatched, refinePassesExpected}'
fi

if should_run verify-refine || should_run all; then
  info "Verifying REFINE coverage for 150 cohort..."
  curl -sfS -X POST "$AGENTS_BASE/agents/baseline/verify-refine-coverage" | tee "$RUN_DIR/verify-refine.json" | jq '{filesChecked, passesMatched, passesExpected, allMatched}'
fi

if should_run batch-dry || should_run all; then
  info "Batch dry-run (150×3)..."
  curl -sfS -X POST "$AGENTS_BASE/agents/baseline/batch-dry-run" -H 'Content-Type: application/json' -d '{}' \
    | tee "$RUN_DIR/batch-dry.json" | jq '.summary'
fi

if should_run batch-smoke || should_run all; then
  if [[ "${SKIP_SMOKE:-0}" != "1" ]]; then
    info "Batch smoke (3×3)..."
    JOB="$(curl -sfS -X POST "$AGENTS_BASE/agents/baseline/batch-smoke-test" -H 'Content-Type: application/json' -d '{}')"
    JOB_ID="$(echo "$JOB" | jq -r '.jobId')"
    for _ in $(seq 1 120); do
      J="$(curl -sfS "$AGENTS_BASE/agents/baseline/job/$JOB_ID")"
      ST="$(echo "$J" | jq -r '.status')"
      [[ "$ST" == "completed" || "$ST" == "failed" ]] && break
      sleep 10
    done
    echo "$J" | jq '.result.summary' | tee "$RUN_DIR/batch-smoke-summary.json"
  fi
fi

if should_run batch || should_run all; then
  if [[ "${CONFIRM_EXECUTE:-0}" == "1" ]]; then
    info "Executing 150×3 direct-prompt baseline..."
    JOB="$(curl -sfS -X POST "$AGENTS_BASE/agents/baseline/batch-run" \
      -H 'Content-Type: application/json' \
      -d '{"confirmExecute":true}')"
    JOB_ID="$(echo "$JOB" | jq -r '.jobId')"
    info "Job $JOB_ID — poll with: curl $AGENTS_BASE/agents/baseline/job/$JOB_ID"
  else
    info "Skip batch execute (set CONFIRM_EXECUTE=1 to run 150×3)"
  fi
fi

if should_run compare || should_run all; then
  info "Comparing baseline vs REFINE..."
  curl -sfS -X POST "$AGENTS_BASE/agents/baseline/compare-refine" -H 'Content-Type: application/json' -d '{}' \
    | tee "$RUN_DIR/compare.json" | jq '{matchedPairs, beforeValidationPass, warnings}'
fi

if should_run failed-passes || should_run all; then
  info "Listing failed baseline passes (150 cohort)..."
  curl -sfS "$AGENTS_BASE/agents/baseline/failed-passes" | tee "$RUN_DIR/failed-passes.json" \
    | jq '{stillNeeded, okPasses, failedPasses, filesComplete3of3}'
fi

if should_run retry-failed || should_run all; then
  if [[ "${CONFIRM_EXECUTE:-0}" == "1" ]]; then
    STILL="$(curl -sfS "$AGENTS_BASE/agents/baseline/failed-passes" | jq -r '.stillNeeded')"
    if [[ "$STILL" != "0" ]]; then
      info "Retrying $STILL failed baseline passes only..."
      JOB="$(curl -sfS -X POST "$AGENTS_BASE/agents/baseline/retry-failed" \
        -H 'Content-Type: application/json' \
        -d '{"confirmExecute":true}')"
      JOB_ID="$(echo "$JOB" | jq -r '.jobId')"
      info "Retry job $JOB_ID — poll: curl $AGENTS_BASE/agents/baseline/job/$JOB_ID"
    else
      info "No failed passes to retry"
    fi
  else
    info "Skip retry-failed (set CONFIRM_EXECUTE=1)"
  fi
fi

if should_run swap-failed || should_run all; then
  DRY="${SWAP_DRY_RUN:-0}"
  if [[ "$DRY" == "1" ]]; then
    info "Dry-run: swap failed cohort files with 450-pool replacements..."
    curl -sfS -X POST "$AGENTS_BASE/agents/baseline/swap-failed-files?dryRun=true" \
      | tee "$RUN_DIR/swap-failed-dry.json" | jq '{removedCount, addedCount, newSampleIds, warnings}'
  elif [[ "${CONFIRM_SWAP:-0}" == "1" ]]; then
    info "Swapping failed cohort files (17 replacements from 450 pool)..."
    curl -sfS -X POST "$AGENTS_BASE/agents/baseline/swap-failed-files" \
      | tee "$RUN_DIR/swap-failed.json" | jq '{removedCount, addedCount, newCohortSize, newSampleIds, warnings}'
    info "Verify REFINE on updated cohort..."
    curl -sfS -X POST "$AGENTS_BASE/agents/baseline/verify-refine-coverage" \
      | tee "$RUN_DIR/verify-refine-post-swap.json" | jq '{passesMatched, passesExpected, allMatched}'
  else
    info "Skip swap-failed (set CONFIRM_SWAP=1 to apply, or SWAP_DRY_RUN=1 to preview)"
  fi
fi

if should_run batch-swapped || should_run all; then
  if [[ "${CONFIRM_EXECUTE:-0}" == "1" ]]; then
    info "Executing baseline on swapped files only (typically 17×3)..."
    JOB="$(curl -sfS -X POST "$AGENTS_BASE/agents/baseline/batch-run-swapped" \
      -H 'Content-Type: application/json' \
      -d '{"confirmExecute":true}')"
    JOB_ID="$(echo "$JOB" | jq -r '.jobId')"
    info "Swapped batch job $JOB_ID — poll: curl $AGENTS_BASE/agents/baseline/job/$JOB_ID"
  else
    info "Skip batch-swapped (set CONFIRM_EXECUTE=1 after swap)"
  fi
fi

if should_run paper-analysis || should_run all; then
  info "Building paper analysis workbook + CSV/MD exports..."
  curl -sfS -X POST "$AGENTS_BASE/agents/baseline/paper-analysis" | tee "$RUN_DIR/paper-analysis.json" \
    | jq '{pairedRows, warnings, outputFiles}'
fi

echo ""
echo "Outputs:"
echo "  $ROOT/baseline_comparison/outputs/selected_150_baseline_files.csv"
echo "  $ROOT/baseline_comparison/results/direct_prompt_baseline_results.csv"
echo "  $ROOT/baseline_comparison/results/REFINE_baseline_comparison_analysis.xlsx"
echo "  $ROOT/baseline_comparison/results/paired_analysis_data.csv"
echo "  $ROOT/baseline_comparison/outputs/failed_baseline_passes_150.csv"
echo "  $ROOT/baseline_comparison/outputs/cohort_swap_manifest.csv"
