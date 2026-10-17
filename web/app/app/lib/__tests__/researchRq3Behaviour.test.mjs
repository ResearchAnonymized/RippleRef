/**
 * Run: cd web/app && npx tsx app/lib/__tests__/researchRq3Behaviour.test.mjs
 */

import assert from 'node:assert/strict';
import {
  buildRq3BehaviourPassRows,
  enrichRq3BehaviourRow,
  filterRq3BehaviourCompleteCaseRows,
  rq3StrictCompleteCaseFilePaths,
  summarizeRq3BehaviourCohort,
  buildRq3BehaviourChiSquareSheet,
  buildRq3BehaviourSheets,
} from '../researchRq3Behaviour.ts';
import { chiSquareIndependence, spearmanR } from '../statisticalTests.ts';

const mockRm = {
  structural: {
    methods_extracted: 2,
    methods_renamed: 0,
    classes_split: 1,
    duplicate_code_removed: true,
    naming_improved: false,
  },
  behavioral: { method_signatures_preserved: false },
  diff_churn: { lines_added: 10, lines_removed: 40 },
  practices_applied: ['Extract Method', 'Remove Duplication'],
};

const baseRow = {
  file_path: 'src/A.java',
  provider_key: 'openai',
  cohort: 'A_frontier_parallel',
  metrics_complete: 'yes',
  pmd_smells_removed: 5,
  diff_lines_added: 10,
  diff_lines_removed: 40,
};

const enriched = enrichRq3BehaviourRow(baseRow, mockRm);
assert.equal(enriched.bh_extract_method, 'yes');
assert.equal(enriched.bh_deletion_heavy, 'yes');
assert.equal(enriched.bh_public_api_changed, 'yes');
assert.equal(enriched.bh_edit_style, 'deletion_heavy');
assert.equal(enriched.smell_outcome_removed, 5);

const cs = chiSquareIndependence([
  [30, 70],
  [25, 75],
  [50, 50],
]);
assert.ok(Number.isFinite(cs.chi2));
assert.equal(cs.df, 2);

const sr = spearmanR([1, 2, 3, 4, 5, 6], [1, 2, 2, 4, 5, 8]);
assert.ok(sr.r > 0.8);

const mkPass = (fp, pk, complete, extra = {}) => ({
  file_path: fp,
  provider_key: pk,
  cohort: 'A_frontier_parallel',
  metrics_complete: complete ? 'yes' : 'no',
  pmd_smells_removed: 3,
  bh_extract_method: 'yes',
  bh_rename_method: 'no',
  bh_class_split: 'no',
  bh_duplicate_removed: 'yes',
  bh_public_api_changed: 'no',
  bh_addition_heavy: 'no',
  bh_deletion_heavy: 'yes',
  bh_edit_style: 'deletion_heavy',
  smell_outcome_removed: 3,
  ...extra,
});

const rows = [
  mkPass('a.java', 'openai', true),
  mkPass('a.java', 'google', true),
  mkPass('a.java', 'anthropic', true),
  mkPass('b.java', 'openai', false),
  mkPass('b.java', 'google', false),
  mkPass('b.java', 'anthropic', false),
];

const strictPaths = new Set(['a.java']);
const complete = filterRq3BehaviourCompleteCaseRows(rows, strictPaths);
assert.equal(complete.length, 3);

const summary = summarizeRq3BehaviourCohort(rows, strictPaths);
assert.equal(summary.complete_case_files, 1);
assert.equal(summary.complete_case_pass_rows, 3);

const chiSheet = buildRq3BehaviourChiSquareSheet(complete);
assert.ok(chiSheet.length > 5);

const sheets = buildRq3BehaviourSheets([], new Date().toISOString());
assert.ok(sheets.readMe.length > 5);
assert.equal(buildRq3BehaviourPassRows([]).length, 0);

console.log('researchRq3Behaviour.test.mjs: PASS');
