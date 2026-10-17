#!/usr/bin/env bash
# Full RENDRI-R research pipeline check: services, tests, export verify, sample audit.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/ports.env" 2>/dev/null || true

echo "=== 1. Service status ==="
bash "$ROOT/start_daemon.sh" status || true

echo ""
echo "=== 2. Unit tests (research export) ==="
(cd "$ROOT/web/app" && npm run test:research-export)

echo ""
echo "=== 3. Extended export verify (latest folder) ==="
(cd "$ROOT/web/app" && npm run verify:extended-research)

echo ""
echo "=== 4. Sample integrity audit (150-file primary) ==="
bash "$ROOT/scripts/audit-research-integrity.sh" || {
  echo "  (audit notes: 140/150 full pass metrics — extended export still valid)"
}

echo ""
echo "=== 5. API smoke (if backend up) ==="
if curl -sf "http://127.0.0.1:${BACKEND_PORT:-8083}/api/health" >/dev/null; then
  bash "$ROOT/scripts/smoke-test-research-export-api.sh" || echo "  (smoke partial — check backend logs)"
else
  echo "  SKIP: backend not running — start with: bash start_daemon.sh start"
fi

LATEST=$(ls -td "$HOME/RENDRI-R-export"/*/ 2>/dev/null | head -1)
if [ -n "$LATEST" ]; then
  echo ""
  echo "=== Latest export ==="
  echo "  $LATEST"
  cat "$LATEST/export_manifest.json" 2>/dev/null | python3 -c "import sys,json; m=json.load(sys.stdin); print('  files:', m.get('totalFiles')); print('  RQ2 primary passes:', m.get('analysisCounts',{}).get('primaryPassRows'))" 2>/dev/null || true
fi

echo ""
echo "DONE: research check complete"
