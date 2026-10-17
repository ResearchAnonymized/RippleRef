#!/usr/bin/env bash
# Run automated feature tests (no LLM spend). Manual UI cases: scripts/FEATURE_TEST_MATRIX.md
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'
pass() { echo -e "${GREEN}✓${NC} $*"; }
section() { echo -e "\n${BLUE}== $* ==${NC}"; }
fail() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

section "1. Agents — file size policy"
python3 agents/test_file_size_policy.py || fail "test_file_size_policy.py"
pass "test_file_size_policy.py"

section "2. Agents — refactor response contract"
python3 agents/test_refactor_response_contract.py || fail "test_refactor_response_contract.py"
pass "test_refactor_response_contract.py"

section "2b. Agents — independent multi-LLM helpers"
python3 agents/test_multi_llm_independent.py || fail "test_multi_llm_independent.py"
pass "test_multi_llm_independent.py"

section "3. Web — ingestRefactorResponse (node)"
node web/app/app/lib/__tests__/ingestRefactorResponse.test.mjs || fail "ingestRefactorResponse.test.mjs"
pass "ingestRefactorResponse.test.mjs"

section "3b. Web — multiLlmExport (node)"
(cd web/app && npx --yes tsx app/lib/__tests__/multiLlmExport.test.mjs) || fail "multiLlmExport.test.mjs"
pass "multiLlmExport.test.mjs"

section "3c. Web — research sampling (tsx)"
(cd web/app && npm run test:research-sampling) || fail "researchSampling.test.ts"
pass "researchSampling.test.ts"

section "4. Web — line diff helpers"
if [[ -f web/app/app/components/__tests__/changeCalculation.test.ts ]]; then
  echo "  (changeCalculation.test.ts is documentation-style; run via manual review)"
  pass "changeCalculation present"
fi

section "5. Backend — unit tests (research persistence + PMD)"
if command -v mvn >/dev/null 2>&1; then
  (
    cd backend/server
    mvn -q test \
      -Dtest=SavedRefactoringReportServiceTest,RefactoredArtifactsServiceTest,FileStatusArtifactsIntegrationTest,PmdAnalysisPersistenceTest,ComprehensiveCodeSmellDetectorTest,AssessmentResponsePolicyTest,RippleImpactControllerMvcTest,ResearchSampleManifestServiceTest,ResearchBaselineServiceTest,ResearchBaselineSnapshotTest,MultiLlmArtifactServiceTest,ResearchIndependentPipelineIntegrationTest \
      || fail "Maven unit tests"
  )
  pass "Backend Maven tests"
else
  echo "  skip: mvn not found"
fi

section "6. Optional E2E API smoke (services must be up)"
if curl -sfS "http://localhost:8083/api/health" >/dev/null 2>&1 \
  && curl -sfS "http://localhost:8091/agents/health" >/dev/null 2>&1; then
  ./scripts/e2e-refactai-smoke.sh
  pass "e2e-refactai-smoke.sh"
else
  echo "  skip: backend or agents not running (start with ./restart_all.sh)"
fi

section "7. Optional agents integration (needs workspace + API key for full refactor)"
if [[ "${RUN_AGENTS_INTEGRATION:-}" == "1" ]]; then
  python3 agents/test_refactoring_system.py || fail "test_refactoring_system.py"
  pass "test_refactoring_system.py"
else
  echo "  skip: set RUN_AGENTS_INTEGRATION=1 to run agents/test_refactoring_system.py"
fi

echo ""
echo -e "${GREEN}Automated feature tests finished.${NC}"
echo "Manual checklist: scripts/FEATURE_TEST_MATRIX.md"
echo "LLM E2E: E2E_RUN_AGENTS_REFACTOR=1 ./scripts/e2e-refactai-smoke.sh"
