import assert from 'node:assert/strict';
import { canonicalPmdSmells, applyCanonicalPmdToRow } from '../canonicalPassMetrics.ts';

const cmpOnly = canonicalPmdSmells({
  smellsBefore: 3,
  smellsAfter: 0,
  smellDelta: 3,
  researchMetrics: {
    comparison: { pmd_smell_total: { before: 3, after: 0, change: -3, improved: true } },
  },
});
assert.equal(cmpOnly.before, 3);
assert.equal(cmpOnly.after, 0);
assert.equal(cmpOnly.removed, 3);
assert.equal(cmpOnly.reduction_pct, 100);
assert.equal(cmpOnly.delta_signed, -3);
assert.equal(cmpOnly.source, 'comparison');
assert.equal(cmpOnly.run_vs_comparison_match, 'yes');

const runFallback = canonicalPmdSmells({
  smellsBefore: 7,
  smellsAfter: 0,
  smellDelta: 7,
  researchMetrics: null,
});
assert.equal(runFallback.before, 7);
assert.equal(runFallback.after, 0);
assert.equal(runFallback.removed, 7);
assert.equal(runFallback.reduction_pct, 100);
assert.equal(runFallback.source, 'run_record');

const partial = canonicalPmdSmells({
  smellsBefore: 4,
  smellsAfter: 1,
  smellDelta: 3,
  researchMetrics: {
    comparison: { pmd_smell_total: { before: 4, after: 1, change: -3, improved: true } },
  },
});
assert.equal(partial.removed, 3);
assert.equal(partial.reduction_pct, 75);

const row = {};
applyCanonicalPmdToRow(row, {
  smellsBefore: 13,
  smellsAfter: 4,
  smellDelta: 9,
  researchMetrics: {
    comparison: { pmd_smell_total: { before: 13, after: 4, change: -9, improved: true } },
  },
});
assert.equal(row.pmd_smells_before, 13);
assert.equal(row.pmd_smells_after, 4);
assert.equal(row.pmd_smells_remaining, 4);
assert.equal(row.pmd_smells_removed, 9);
assert.equal(row.pmd_smells_delta, 9);
assert.equal(row.pmd_smells_reduction_pct, 69.2);
assert.equal(row.pmd_smells_delta, 9);
assert.equal(row.pmd_smells_reduction_pct, 69.2);

console.log('canonicalPassMetrics.test.mjs: OK');
