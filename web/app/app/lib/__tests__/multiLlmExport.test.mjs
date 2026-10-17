import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMultiLlmPassRows,
  extractMultiLlmWideColumns,
  multiLlmRunsFromBundle,
  passHasFullResearchMetrics,
} from '../multiLlmExport.ts';

const sampleRuns = [
  {
    passIndex: 0,
    provider: 'OpenAI',
    model: 'openai/gpt-4.1-mini',
    ok: true,
    changed: true,
    linesBefore: 100,
    linesAfter: 96,
    smellsBefore: 10,
    smellsAfter: 8,
    smellDelta: 2,
  },
  {
    passIndex: 1,
    provider: 'Google',
    model: 'google/gemini-2.5-flash',
    ok: true,
    changed: false,
    linesBefore: 96,
    linesAfter: 96,
    smellsBefore: 8,
    smellsAfter: 8,
    smellDelta: 0,
  },
];

test('multiLlmRunsFromBundle reads top-level field', () => {
  const bundle = {
    version: 1,
    workspaceId: 'w1',
    filePath: 'Foo.java',
    multiLlmRuns: sampleRuns,
  };
  assert.equal(multiLlmRunsFromBundle(bundle).length, 2);
});

test('extractMultiLlmWideColumns maps provider columns', () => {
  const bundle = {
    version: 1,
    workspaceId: 'w1',
    filePath: 'Foo.java',
    multiLlmRuns: sampleRuns,
    pipelineMetadata: {
      multiLlmChain: true,
      multiLlmMode: 'independent_parallel',
      researchArtifactsOnly: true,
      sampleId: 'w1-seed99-1',
    },
  };
  const wide = extractMultiLlmWideColumns(bundle);
  assert.equal(wide.multi_llm_chain_used, 'yes');
  assert.equal(wide.multi_llm_mode, 'independent_parallel');
  assert.equal(wide.research_artifacts_only, 'yes');
  assert.equal(wide.sample_id, 'w1-seed99-1');
  assert.equal(wide.llm_openai_smell_delta, 2);
  assert.equal(wide.llm_google_loc_delta, 0);
});

test('extractMultiLlmPassRows long format', () => {
  const bundle = {
    version: 1,
    workspaceId: 'w1',
    filePath: 'src/Foo.java',
    multiLlmRuns: sampleRuns,
  };
  const rows = extractMultiLlmPassRows(
    { projectName: 'P', workspaceId: 'w1', filePath: 'src/Foo.java', fileName: 'Foo.java' },
    bundle
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].provider_key, 'openai');
});

test('passHasFullResearchMetrics detects full pass payload', () => {
  const full = {
    passIndex: 0,
    provider: 'OpenAI',
    model: 'openai/gpt-4.1-mini',
    ok: true,
    changed: true,
    researchMetrics: {
      comparison: { pmd_smell_total: { before: 1, after: 0, change: -1, improved: true } },
      behavioral: { behavioral_correct: true },
      smell_resolution: { by_type: {} },
    },
  };
  assert.equal(passHasFullResearchMetrics(full), true);
  assert.equal(passHasFullResearchMetrics({ ...full, researchMetrics: { halstead: {} } }), false);
});
