#!/usr/bin/env bash
# Sequential backfill: B0 completed candidates first, then MA completed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Overnight test-probe backfill (no LLM) ==="
echo "Started: $(date -u +"%Y-%m-%d %H:%M UTC")"

# B0: ~1182 completed with saved diffs
bash "$ROOT/scripts/backfill-ripple-ref-test-probe.sh" ripple_ref_master

# MA: completed so far (resume skips rows that already have test_probe_status)
bash "$ROOT/scripts/backfill-ripple-ref-test-probe.sh" ma_ref_master

echo "=== Backfill batch finished $(date -u +"%Y-%m-%d %H:%M UTC") ==="
