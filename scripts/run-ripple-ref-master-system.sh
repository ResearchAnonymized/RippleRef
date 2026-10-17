#!/usr/bin/env bash
# Run one system (repository) inside the RIPPLE-REF master study.
#
# Master study: all 15 repos registered, 10 stratified files/repo, executed one system at a time.
#
# Usage — setup + run JUnit (system 7):
#   SYSTEM_NUM=7 RUN=1 ./scripts/run-ripple-ref-master-system.sh
#
# Usage — setup only:
#   SYSTEM_NUM=7 SETUP_ONLY=1 ./scripts/run-ripple-ref-master-system.sh
#
# Usage — resume runs for system 7:
#   SYSTEM_NUM=7 RUN=1 SKIP_SETUP=1 ./scripts/run-ripple-ref-master-system.sh
#
# Env:
#   MASTER_STUDY_ID     default ripple_ref_master
#   SYSTEM_NUM          1–15 (required unless REPO_ONLY set)
#   REPO_ONLY           workspace id override
#   RUN=1               execute candidates after setup
#   SKIP_SETUP=1        skip scan/select/contexts
#   SETUP_ONLY=1        setup then exit
#   RESUME=1            skip completed pair keys (default)
#   MAX_CANDIDATES=N    optional cap per invocation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RIPPLE_REF_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/ripple-ref-lib.sh"

ripple_ref_load_ports
ripple_ref_health_check

FILES_PER_REPO="${FILES_PER_REPO:-10}"
RANDOM_SEED="${RANDOM_SEED:-42}"
MIN_SMELL_COUNT="${MIN_SMELL_COUNT:-1}"
RESUME="${RESUME:-1}"
SKIP_SETUP="${SKIP_SETUP:-0}"
SETUP_ONLY="${SETUP_ONLY:-0}"
RUN="${RUN:-0}"
MASTER_STUDY_ID="${MASTER_STUDY_ID:-ripple_ref_master}"
RUN_DIR="$RIPPLE_REF_ROOT/.run"
MASTER_ID_FILE="$RUN_DIR/ripple-ref-master-study-id"
TRACKER="$RUN_DIR/ripple-ref-master-tracker.md"

SYSTEM_NUM="${SYSTEM_NUM:-}"
REPO_ONLY="${REPO_ONLY:-}"

resolve_system_repo() {
  case "$1" in
    1) echo "project-07aa431d" ;;
    2) echo "project-2ceb0810" ;;
    3) echo "project-873bd0c4" ;;
    4) echo "project-61e475df" ;;
    5) echo "project-4e3bc7d3" ;;
    6) echo "project-6de9c713" ;;
    7) echo "project-b16f055f" ;;
    8) echo "project-d0163663" ;;
    9) echo "project-6f262004" ;;
    10) echo "project-1012eb54" ;;
    11) echo "project-cdf206bf" ;;
    12) echo "project-b80c52cf" ;;
    13) echo "project-d3ce0443" ;;
    14) echo "project-3b2e8898" ;;
    15) echo "project-56221077" ;;
    *) echo "" ;;
  esac
}

resolve_system_name() {
  case "$1" in
    1) echo "01-Johotdraw" ;;
    2) echo "02-GanttProject-master" ;;
    3) echo "03-ArgoUML" ;;
    4) echo "04-Xerces-j-main" ;;
    5) echo "05-Apache Ant" ;;
    6) echo "06-JEdit" ;;
    7) echo "07-Junit" ;;
    8) echo "08-SLF4J" ;;
    9) echo "09-Logback.zip" ;;
    10) echo "10-Mockito" ;;
    11) echo "11-Guava" ;;
    12) echo "12-jsoup" ;;
    13) echo "13-Eclipse Collections" ;;
    14) echo "14-Checkstyle" ;;
    15) echo "15-JabRef" ;;
    *) echo "$2" ;;
  esac
}

if [ -z "$REPO_ONLY" ]; then
  if [ -z "$SYSTEM_NUM" ]; then
    echo "Set SYSTEM_NUM=1..15 or REPO_ONLY=project-..."
    exit 1
  fi
  REPO_ONLY="$(resolve_system_repo "$SYSTEM_NUM")"
  if [ -z "$REPO_ONLY" ]; then
    echo "Invalid SYSTEM_NUM=$SYSTEM_NUM"
    exit 1
  fi
fi

SYSTEM_LABEL="$(resolve_system_name "$SYSTEM_NUM" "$REPO_ONLY")"
WORKSPACE_IDS="$(ripple_ref_all_workspace_ids)"
export WORKSPACE_IDS

echo "=== RIPPLE-REF MASTER — System ${SYSTEM_NUM:-?}: $SYSTEM_LABEL ==="
echo "Master study ID: $MASTER_STUDY_ID"
echo "Repository: $REPO_ONLY"
echo "Files per repo: $FILES_PER_REPO (stratified, seed=$RANDOM_SEED)"
echo "Candidates this system: $((FILES_PER_REPO * 5 * 2))"
echo ""

if curl -sf "$API/ripple-ref/studies/$MASTER_STUDY_ID" >/dev/null 2>&1; then
  echo "Using existing master study: $MASTER_STUDY_ID"
  STUDY_ID="$MASTER_STUDY_ID"
else
  echo "Creating master study (all 15 repositories, scale=full)..."
  export MASTER_STUDY_ID
  STUDY_JSON="$(ripple_ref_create_study "ripple-ref-master" "full")"
  STUDY_ID="$MASTER_STUDY_ID"
  echo "$STUDY_ID" > "$MASTER_ID_FILE"
  echo "Created: $STUDY_ID"
fi

if [ "$SKIP_SETUP" != "1" ]; then
  echo "--- Setup: scan → select 10 → contexts ($REPO_ONLY) ---"
  ripple_ref_setup_repo "$STUDY_ID" "$REPO_ONLY"
fi

STUDY_JSON="$(ripple_ref_load_study "$STUDY_ID")"
PREFLIGHT="$(ripple_ref_preflight_repo "$STUDY_ID" "$REPO_ONLY")"
echo "$PREFLIGHT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('Preflight ready:', d.get('ready'), '| planned:', d.get('plannedRuns'))
for i in d.get('issues') or []:
    print('  ISSUE:', i)
for w in d.get('warnings') or []:
    print('  WARN:', w)
"

if [ "$SETUP_ONLY" = "1" ]; then
  echo ""
  echo "SETUP COMPLETE — $STUDY_ID / $REPO_ONLY"
  exit 0
fi

if [ "$RUN" != "1" ]; then
  echo ""
  echo "Setup done. Run candidates with:"
  echo "  SYSTEM_NUM=${SYSTEM_NUM:-?} RUN=1 SKIP_SETUP=1 ./scripts/run-ripple-ref-master-system.sh"
  exit 0
fi

if ! echo "$PREFLIGHT" | python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('ready') else 1)"; then
  echo "Preflight failed — fix issues before running candidates."
  exit 1
fi

SUMMARY_FILE="$RUN_DIR/ripple-ref-master-${STUDY_ID}-${REPO_ONLY}.jsonl"
echo ""
echo "--- Running 100 candidates for $REPO_ONLY ---"
counts=$(ripple_ref_run_candidates "$STUDY_ID" "$STUDY_JSON" "$REPO_ONLY" "$SUMMARY_FILE")
ran=$(echo "$counts" | awk '{print $1}')
skipped=$(echo "$counts" | awk '{print $2}')
failed=$(echo "$counts" | awk '{print $3}')

EXPORT=$(curl -sf "$API/ripple-ref/studies/$STUDY_ID/export-info")
STUDY_DIR=$(echo "$EXPORT" | python3 -c "import sys,json; print(json.load(sys.stdin)['studyDir'])")
COMPLETENESS=$(curl -sf "$API/ripple-ref/studies/$STUDY_ID/completeness")

python3 - <<PY
from datetime import datetime, timezone
from pathlib import Path

tracker = Path("$TRACKER")
line = (
    f"| {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} "
    f"| System ${SYSTEM_NUM:-?} $SYSTEM_LABEL | $REPO_ONLY "
    f"| ran=$ran skipped=$skipped failed=$failed | $STUDY_ID |\\n"
)
if not tracker.exists():
    header = (
        "# RIPPLE-REF Master Study Tracker\\n\\n"
        f"- Study ID: \`$STUDY_ID\`\\n"
        f"- Scale: 15 systems × 10 files × 5 models × 2 = 1,500 candidates\\n"
        f"- Selection: stratified (seed=42)\\n\\n"
        "| When | System | Repo | Run | Study |\\n"
        "|------|--------|------|-----|-------|\\n"
    )
    tracker.write_text(header, encoding="utf-8")
tracker.open("a", encoding="utf-8").write(line)
print(f"Updated tracker: {tracker}")
PY

echo ""
echo "=== SYSTEM RUN COMPLETE ==="
echo "Study: $STUDY_ID"
echo "Dir:   $STUDY_DIR"
echo "This system: ran=$ran skipped=$skipped failed=$failed"
echo "Overall completeness:"
echo "$COMPLETENESS" | python3 -c "import sys,json; c=json.load(sys.stdin); print(f\"  {c['completedRuns']}/{c['plannedRuns']} ({c['completionPercentage']:.1f}%)\")"
echo ""
echo "Resume this system:"
echo "  SYSTEM_NUM=${SYSTEM_NUM:-?} RUN=1 SKIP_SETUP=1 ./scripts/run-ripple-ref-master-system.sh"
