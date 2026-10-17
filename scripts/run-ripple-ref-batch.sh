#!/usr/bin/env bash
# RIPPLE-REF resumable batch runner (multi-repo, checkpoint per candidate).
#
# Usage — new full study:
#   ./scripts/run-ripple-ref-batch.sh
#
# Usage — resume existing study:
#   STUDY_ID=study_20260702_181426 SKIP_SETUP=1 ./scripts/run-ripple-ref-batch.sh
#
# Usage — one repo at a time:
#   REPO_ONLY=project-b16f055f STUDY_ID=... SKIP_SETUP=1 ./scripts/run-ripple-ref-batch.sh
#
# Usage — setup only (scan/select/contexts):
#   SETUP_ONLY=1 ./scripts/run-ripple-ref-batch.sh
#
# Env:
#   WORKSPACE_IDS       space-separated repo IDs (default: all 15 loaded workspaces)
#   FILES_PER_REPO      default 15 (extended scale)
#   STUDY_ID            resume existing study (skip create)
#   SKIP_SETUP=1        skip scan/select/contexts (resume runs only)
#   SETUP_ONLY=1        run setup then exit
#   REPO_ONLY           run candidates for one repository
#   RESUME=1            skip completed/failed pair keys (default 1)
#   MAX_CANDIDATES=N    stop after N new successful runs
#   RIPPLE_REF_TEST_PROBE=0   default off at batch scale
#   RIPPLE_REF_COMPILE_PROBE=0
#   CANDIDATE_TIMEOUT_SEC=600
#   SLEEP_BETWEEN_CANDIDATES_SEC=2

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RIPPLE_REF_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/ripple-ref-lib.sh"

ripple_ref_load_ports
ripple_ref_health_check

FILES_PER_REPO="${FILES_PER_REPO:-15}"
RANDOM_SEED="${RANDOM_SEED:-42}"
MIN_SMELL_COUNT="${MIN_SMELL_COUNT:-1}"
RESUME="${RESUME:-1}"
SKIP_SETUP="${SKIP_SETUP:-0}"
SETUP_ONLY="${SETUP_ONLY:-0}"
SCALE="${SCALE:-extended}"
export RIPPLE_REF_TEST_PROBE="${RIPPLE_REF_TEST_PROBE:-0}"
export RIPPLE_REF_COMPILE_PROBE="${RIPPLE_REF_COMPILE_PROBE:-0}"

if [ -z "${WORKSPACE_IDS:-}" ]; then
  WORKSPACE_IDS="$(ripple_ref_all_workspace_ids)"
fi
export WORKSPACE_IDS

REPO_COUNT=$(echo "$WORKSPACE_IDS" | wc -w | tr -d ' ')
MODEL_COUNT=5
PLANNED=$((REPO_COUNT * FILES_PER_REPO * MODEL_COUNT * 2))
RUN_DIR="$RIPPLE_REF_ROOT/.run"
mkdir -p "$RUN_DIR"

echo "=== RIPPLE-REF BATCH ==="
echo "Repositories: $REPO_COUNT"
echo "Files per repo: $FILES_PER_REPO"
echo "Planned candidates: $PLANNED"
echo "L4 behavioral: always | L5 tests: $RIPPLE_REF_TEST_PROBE | L3 compile: $RIPPLE_REF_COMPILE_PROBE"
echo "Resume: $RESUME | Skip setup: $SKIP_SETUP | Repo filter: ${REPO_ONLY:-all}"
echo ""

if [ -n "${STUDY_ID:-}" ]; then
  echo "Loading study $STUDY_ID ..."
  STUDY_JSON="$(ripple_ref_load_study "$STUDY_ID")"
  if [ -z "$STUDY_JSON" ]; then
    echo "Study not found: $STUDY_ID"
    exit 1
  fi
else
  echo "Creating study (scale=$SCALE)..."
  STUDY_JSON="$(ripple_ref_create_study "ripple-ref-batch" "$SCALE")"
  STUDY_ID=$(echo "$STUDY_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['config']['studyId'])")
  echo "Study ID: $STUDY_ID"
fi

if [ "$SKIP_SETUP" != "1" ]; then
  ripple_ref_study_setup "$STUDY_ID" "$WORKSPACE_IDS"
  STUDY_JSON="$(ripple_ref_load_study "$STUDY_ID")"
else
  STUDY_JSON="$(ripple_ref_load_study "$STUDY_ID")"
fi

if [ "$SETUP_ONLY" = "1" ]; then
  PREFLIGHT="$(curl -sf "$API/ripple-ref/studies/$STUDY_ID/preflight")"
  echo "$PREFLIGHT" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Preflight ready:', d.get('ready'), 'planned:', d.get('plannedRuns'))"
  echo ""
  echo "SETUP COMPLETE — study $STUDY_ID"
  exit 0
fi

SUMMARY_FILE="$RUN_DIR/ripple-ref-batch-${STUDY_ID}.jsonl"
CHECKPOINT_FILE="$RUN_DIR/ripple-ref-batch-${STUDY_ID}.checkpoint"

echo ""
echo "--- Running candidates ---"

if [ -n "${REPO_ONLY:-}" ]; then
  REPOS_TO_RUN="$REPO_ONLY"
else
  REPOS_TO_RUN="$WORKSPACE_IDS"
fi

TOTAL_RAN=0 TOTAL_SKIPPED=0 TOTAL_FAILED=0

for REPO in $REPOS_TO_RUN; do
  echo ""
  echo "=== Repository: $REPO ==="
  counts=$(ripple_ref_run_candidates "$STUDY_ID" "$STUDY_JSON" "$REPO" "$SUMMARY_FILE")
  ran=$(echo "$counts" | awk '{print $1}')
  skipped=$(echo "$counts" | awk '{print $2}')
  failed=$(echo "$counts" | awk '{print $3}')
  ran=${ran:-0}
  skipped=${skipped:-0}
  failed=${failed:-0}
  TOTAL_RAN=$((TOTAL_RAN + ran))
  TOTAL_SKIPPED=$((TOTAL_SKIPPED + skipped))
  TOTAL_FAILED=$((TOTAL_FAILED + failed))
  date -u +"%Y-%m-%dT%H:%M:%SZ completed repo $REPO ran=$ran skipped=$skipped failed=$failed" >> "$CHECKPOINT_FILE"
  echo "  Repo subtotal: ran=$ran skipped=$skipped failed=$failed"

  if [ -n "${MAX_CANDIDATES:-}" ] && [ "$TOTAL_RAN" -ge "$MAX_CANDIDATES" ]; then
    echo "Reached MAX_CANDIDATES=$MAX_CANDIDATES"
    break
  fi
done

EXPORT=$(curl -sf "$API/ripple-ref/studies/$STUDY_ID/export-info")
STUDY_DIR=$(echo "$EXPORT" | python3 -c "import sys,json; print(json.load(sys.stdin)['studyDir'])")
COMPLETENESS=$(echo "$EXPORT" | python3 -c "import sys,json; c=json.load(sys.stdin)['completeness']; print(f\"{c.get('completedRuns')}/{c.get('plannedRuns')} ({c.get('completionPercentage',0):.1f}%)\")")

REPORT="$RUN_DIR/ripple-ref-batch-summary.md"
ripple_ref_write_summary_md "$STUDY_ID" "$STUDY_DIR" "$REPORT" "$PLANNED" "$TOTAL_RAN" "$TOTAL_FAILED" "$TOTAL_SKIPPED"

echo ""
echo "=== BATCH RUN COMPLETE (this invocation) ==="
echo "Study ID:    $STUDY_ID"
echo "Study dir:   $STUDY_DIR"
echo "Completeness: $COMPLETENESS"
echo "This run:    ran=$TOTAL_RAN skipped=$TOTAL_SKIPPED failed=$TOTAL_FAILED"
echo "Checkpoint:  $CHECKPOINT_FILE"
echo "Summary:     $REPORT"
echo ""
echo "Resume with:"
echo "  STUDY_ID=$STUDY_ID SKIP_SETUP=1 ./scripts/run-ripple-ref-batch.sh"
