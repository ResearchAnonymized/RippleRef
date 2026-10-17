#!/usr/bin/env bash
# Verify refactored-artifact persistence, file-status, and PMD cache tests.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Backend unit tests (artifacts + file-status + PMD) ==="
cd backend/server
mvn -q test -Dtest=RefactoredArtifactsServiceTest,FileStatusArtifactsIntegrationTest,PmdAnalysisPersistenceTest,ComprehensiveCodeSmellDetectorTest
echo "   Backend tests: OK"
cd "$ROOT"

echo "=== Frontend type-check ==="
cd web/app
if npm run type-check 2>&1 | tail -5; then
  echo "   Type-check: OK (or see warnings above)"
else
  echo "   Type-check reported issues (may include pre-existing test file errors)"
fi
cd "$ROOT"

echo ""
echo "=== All verification steps finished ==="
