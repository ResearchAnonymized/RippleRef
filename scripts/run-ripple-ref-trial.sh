#!/usr/bin/env bash
# RIPPLE-REF trial runner (thin wrapper over ripple-ref-lib + batch runner).
#
# Usage:
#   ./scripts/run-ripple-ref-trial.sh
#   STUDY_ID=study_xxx SKIP_SETUP=1 ./scripts/run-ripple-ref-trial.sh   # resume
#   FILES_PER_REPO=3 WORKSPACE_IDS="project-b16f055f" ./scripts/run-ripple-ref-trial.sh
#
# Env: same as run-ripple-ref-batch.sh (defaults tuned for trial)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/ripple-ref-lib.sh"

export FILES_PER_REPO="${FILES_PER_REPO:-3}"
export RANDOM_SEED="${RANDOM_SEED:-42}"
export MIN_SMELL_COUNT="${MIN_SMELL_COUNT:-1}"
export RESUME="${RESUME:-1}"
export SKIP_SETUP="${SKIP_SETUP:-0}"
export SCALE="${SCALE:-custom}"
export RIPPLE_REF_TEST_PROBE="${RIPPLE_REF_TEST_PROBE:-1}"
export RIPPLE_REF_COMPILE_PROBE="${RIPPLE_REF_COMPILE_PROBE:-0}"

if [ -z "${WORKSPACE_IDS:-}" ]; then
  export WORKSPACE_IDS="project-b16f055f"
fi

# Delegate to batch runner (trial = small batch)
exec "$SCRIPT_DIR/run-ripple-ref-batch.sh"
