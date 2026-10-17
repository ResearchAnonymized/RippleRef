/**
 * Tests for RQ2/RQ3 analysis export builders.
 * Run: cd web/app && npx tsx app/lib/__tests__/researchAnalysisExports.test.mjs
 */

import assert from 'node:assert/strict';
import {
  buildRq2ProviderPassRows,
  buildResearchAnalysisExports,
  filterRq2PrimaryPassRows,
  filterRq2ExtendedPassRows,
  recordsToCsv,
} from '../researchAnalysisExports.ts';

const mockBundle = {
  version: 1,
  workspaceId: 'project-test',
  filePath: 'src/Foo.java',
  savedAt: Date.now(),
  originalContent: 'class Foo {}',
  refactoredContent: 'class Foo { }',
  pipelineMetadata: {
    multiLlmMode: 'independent_parallel',
    sampleId: 'test-seed',
  },
  multiLlmRuns: [
    {
      passIndex: 0,
      provider: 'OpenAI',
      model: 'openai/gpt-5.5',
      ok: true,
      changed: true,
      smellsBefore: 2,
      smellsAfter: 0,
      smellDelta: 2,
      researchMetrics: {
        comparison: { pmd_smell_total: { before: 2, after: 0, change: -2, improved: true } },
        behavioral: { behavioral_correct: true },
        smell_resolution: { overall_resolution_rate: 100 },
        meta: { verifyAccepted: true, overallScore: 80 },
      },
    },
  ],
};

const file = {
  workspaceId: 'project-test',
  projectName: '07-Junit',
  sourceFolder: 'junit4-main',
  filePath: 'src/Foo.java',
  fileName: 'Foo.java',
  bundle: mockBundle,
  inCurrentSample: true,
};

const rows = buildRq2ProviderPassRows([file]);
assert.ok(rows.length >= 1, 'should emit pass rows from fixture');
assert.ok(rows[0].file_path, 'row has file_path');
assert.ok(recordsToCsv(rows).includes('file_path'), 'csv has header');

const analysis = buildResearchAnalysisExports([file]);
assert.equal(typeof analysis.counts.passRows, 'number');

const primary = filterRq2PrimaryPassRows(rows);
const extended = filterRq2ExtendedPassRows(rows);
assert.ok(primary.length <= extended.length);

console.log('researchAnalysisExports.test.mjs: PASS');
