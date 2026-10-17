/**
 * Tests for research export cohort classification.
 * Run: cd web/app && npx tsx app/lib/__tests__/researchExportCohort.test.mjs
 */

import assert from 'node:assert/strict';
import {
  classifyResearchCohort,
  buildInclusionRow,
  inclusionRowsToCsv,
} from '../researchExportCohort.ts';

function frontierBundle() {
  return {
    version: 1,
    workspaceId: 'w1',
    filePath: 'src/A.java',
    pipelineMetadata: {
      multiLlmMode: 'independent_parallel',
      researchArtifactsOnly: true,
      sampleId: 'w1-seed1',
    },
    multiLlmRuns: [
      { passIndex: 0, provider: 'OpenAI', model: 'openai/gpt-5.5', ok: true, changed: true, smellsBefore: 2, smellsAfter: 0, smellDelta: 2,
        researchMetrics: { comparison: { pmd_smell_total: { before: 2, after: 0 } }, behavioral: {}, smell_resolution: {} } },
      { passIndex: 1, provider: 'Google', model: 'google/gemini-3.1-pro-preview', ok: true, changed: true, smellsBefore: 2, smellsAfter: 1, smellDelta: 1,
        researchMetrics: { comparison: {}, behavioral: {}, smell_resolution: {} } },
      { passIndex: 2, provider: 'Anthropic', model: 'anthropic/claude-opus-4.8', ok: true, changed: true, smellsBefore: 2, smellsAfter: 0, smellDelta: 2,
        researchMetrics: { comparison: {}, behavioral: {}, smell_resolution: {} } },
    ],
  };
}

function legacyBundle() {
  return {
    version: 1,
    workspaceId: 'w1',
    filePath: 'src/B.java',
    pipelineMetadata: { multiLlmChain: true },
    multiLlmRuns: [
      { passIndex: 0, provider: 'OpenAI', model: 'openai/gpt-4o-mini', ok: true, changed: true, smellsBefore: 1, smellsAfter: 0, smellDelta: 1,
        researchMetrics: { comparison: {}, behavioral: {}, smell_resolution: {} } },
      { passIndex: 1, provider: 'Google', model: 'google/gemini-2.5-flash', ok: true, changed: false, smellsBefore: 1, smellsAfter: 1, smellDelta: 0,
        researchMetrics: { comparison: {}, behavioral: {}, smell_resolution: {} } },
      { passIndex: 2, provider: 'Anthropic', model: 'anthropic/claude-sonnet-4.6', ok: true, changed: true, smellsBefore: 1, smellsAfter: 0, smellDelta: 1,
        researchMetrics: { comparison: {}, behavioral: {}, smell_resolution: {} } },
    ],
  };
}

const f = classifyResearchCohort(frontierBundle(), true);
assert.equal(f.cohort, 'A_frontier_parallel');
assert.equal(f.model_tier, 'frontier');
assert.equal(f.in_current_sample, true);
assert.equal(f.include_in_multi_llm_analysis, true);

const l = classifyResearchCohort(legacyBundle(), false);
assert.equal(l.cohort, 'B_legacy_chain_non_frontier');
assert.equal(l.model_tier, 'non_frontier');

const inc = buildInclusionRow(frontierBundle(), {
  projectName: 'P',
  workspaceId: 'w1',
  filePath: 'src/A.java',
  fileName: 'A.java',
}, true);
assert.equal(inc.exclude_from_primary, false);

const csv = inclusionRowsToCsv([inc]);
assert.ok(csv.includes('yes'), 'csv uses yes/no for booleans');
assert.ok(!csv.includes(',true,'), 'csv should not contain raw true');

console.log('researchExportCohort.test.mjs: PASS');
