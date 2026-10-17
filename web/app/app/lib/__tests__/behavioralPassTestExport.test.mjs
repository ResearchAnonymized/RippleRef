import assert from 'node:assert/strict';
import {
  buildBehavioralPassTestRowsForMetrics,
  buildVerificationGateRowsForBundle,
  BEHAVIORAL_CHECK_SPECS,
} from '../behavioralPassTestExport.ts';

const ctx = {
  projectName: 'P',
  workspaceId: 'w1',
  sourceFolder: 'src',
  filePath: 'src/Foo.java',
  fileName: 'Foo.java',
};

const rm = {
  meta: { verifyAccepted: false, overallScore: 42 },
  behavioral: {
    behavioral_correct: false,
    method_signatures_preserved: false,
    exception_handling_preserved: true,
    framework_contracts_preserved: true,
    conditional_logic_preserved: true,
    critical_method_calls_preserved: true,
    warnings: 'If statements removed: 1',
    errors: 'Public method removed: foo()',
  },
};

const rows = buildBehavioralPassTestRowsForMetrics(ctx, rm, { scope: 'final' });
assert.equal(rows.length, BEHAVIORAL_CHECK_SPECS.length);
const sig = rows.find((r) => r.check_id === 'method_signatures_preserved');
assert.equal(sig.status, 'fail');
assert.ok(sig.why_fail.includes('Public methods'));
const overall = rows.find((r) => r.check_id === 'behavioral_correct');
assert.equal(overall.status, 'fail');

const gateRows = buildVerificationGateRowsForBundle(
  { projectName: 'P', workspaceId: 'w1', filePath: 'src/F.java', fileName: 'F.java' },
  {
    applyResult: { verificationRejectionReasons: ['no_smell_reduction(5→8)'] },
    pipelineMetadata: { rejectionCategory: 'smell_regression' },
  },
  { scope: 'final', rm }
);
assert.ok(gateRows.some((g) => g.verification_passed === 'no'));
assert.ok(gateRows.some((g) => g.why_fail.includes('smells')));

console.log('behavioralPassTestExport.test.mjs: PASS');
