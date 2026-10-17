#!/usr/bin/env bash
# Resume Qwen B0-V2 on the locked 150-file cohort after travel / offline gap.
# - Skips files already completed (no duplicate OpenRouter spend).
# - Retries files that failed or were never reached while offline.
# - Does not delete existing artifacts; each success is appended to results_candidates.csv.
#
# Usage (foreground):
#   bash scripts/resume-qwen-b0-v2-after-offline.sh
#
# Usage (background, survives closing the terminal):
#   python3 scripts/detach_daemon.py .run/qwen-b0-v2-rerun.log -- \
#     bash scripts/resume-qwen-b0-v2-after-offline.sh
set -euo pipefail

export FORCE_RERUN=0
export RESUME_COMPLETED_ONLY=1
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$ROOT/scripts/rerun-qwen-b0-v2-only.sh"
