/**
 * Run: cd web/app && npx tsx app/lib/__tests__/researchCompleteCase.test.mjs
 */

import assert from 'node:assert/strict';
import {
  balancedFilePaths,
  filterBalancedCompletePassRows,
  summarizeBalancedCohort,
} from '../researchCompleteCase.ts';

const mk = (fp, pk, extra = {}) => ({
  file_path: fp,
  provider_key: pk,
  project_name: 'p',
  cohort: 'A_frontier_parallel',
  pmd_smells_before: 5,
  pmd_smells_after: 3,
  pmd_smells_delta: 2,
  complexity_before: 10,
  complexity_after: 9,
  maintainability_before: 50,
  maintainability_after: 55,
  testability_before: 40,
  testability_after: 42,
  loc_before: 100,
  loc_after: 98,
  overall_score: 80,
  smell_resolution_rate_pct: 100,
  smell_delta: -2,
  loc_delta: -2,
  smells_before: 5,
  smells_after: 3,
  ...extra,
});

const rows = [
  mk('a.java', 'openai'),
  mk('a.java', 'google'),
  mk('a.java', 'anthropic'),
  mk('b.java', 'openai'),
  mk('b.java', 'google'),
  mk('b.java', 'anthropic', { pmd_smells_before: '' }),
];

const full = filterBalancedCompletePassRows(rows, 'full');
assert.equal(full.length, 3);
assert.equal(balancedFilePaths(rows, 'full').size, 1);

const sum = summarizeBalancedCohort(rows, 'full');
assert.equal(sum.balanced_files, 1);
assert.equal(sum.passes_per_provider.openai, 1);

console.log('researchCompleteCase.test.mjs: PASS');
