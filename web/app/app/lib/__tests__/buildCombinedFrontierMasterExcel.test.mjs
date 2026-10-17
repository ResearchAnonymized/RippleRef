/**
 * Combined frontier master workbook tests.
 * Run: cd web/app && npx tsx app/lib/__tests__/buildCombinedFrontierMasterExcel.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, 'fixtures', 'sample-saved-report.json');

const { parseSavedRefactoringReportBundle } = await import('../savedRefactoringReport.ts');
const {
  buildCombinedFrontierMasterWorkbook,
  filterFrontierMasterItems,
  FRONTIER_MASTER_FILENAME,
} = await import('../buildCombinedFrontierMasterExcel.ts');

const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const baseBundle = parseSavedRefactoringReportBundle(raw);
assert.ok(baseBundle, 'fixture must parse');

function frontierBundle() {
  const rm = baseBundle.researchMetrics;
  const runs = [
    {
      passIndex: 0,
      provider: 'OpenAI',
      model: 'openai/gpt-5',
      ok: true,
      changed: true,
      smellsBefore: 2,
      smellsAfter: 1,
      smellDelta: 1,
      linesBefore: 70,
      linesAfter: 78,
      researchMetrics: rm,
      agentSteps: [{ name: 'Analyze', agent: 'Code Smell Detector', status: 'done' }],
    },
    {
      passIndex: 1,
      provider: 'Google',
      model: 'google/gemini-3-pro',
      ok: true,
      changed: true,
      smellsBefore: 2,
      smellsAfter: 1,
      smellDelta: 1,
      linesBefore: 70,
      linesAfter: 78,
      researchMetrics: rm,
      agentSteps: [],
    },
    {
      passIndex: 2,
      provider: 'Anthropic',
      model: 'anthropic/claude-opus-4',
      ok: true,
      changed: true,
      smellsBefore: 2,
      smellsAfter: 1,
      smellDelta: 1,
      linesBefore: 70,
      linesAfter: 78,
      researchMetrics: rm,
      agentSteps: [],
    },
  ];
  return {
    ...baseBundle,
    pipelineMetadata: {
      ...(baseBundle.pipelineMetadata ?? {}),
      multiLlmMode: 'independent_parallel',
      multiLlmChain: true,
    },
    multiLlmRuns: runs,
  };
}

const frontierItem = {
  filePath: baseBundle.filePath,
  fileName: baseBundle.filePath.split('/').pop(),
  bundle: frontierBundle(),
  savedReportId: 'fixture',
  inCurrentSample: true,
  candidate: {
    filePath: baseBundle.filePath,
    label: baseBundle.filePath.split('/').pop(),
    hasSavedReport: true,
    status: 'refactored',
  },
};

const legacyItem = {
  ...frontierItem,
  bundle: { ...baseBundle },
};

assert.equal(filterFrontierMasterItems([legacyItem]).length, 0, 'legacy fixture excluded');
assert.equal(filterFrontierMasterItems([frontierItem]).length, 1, 'frontier fixture included');

const result = await buildCombinedFrontierMasterWorkbook([frontierItem, legacyItem]);
assert.equal(result.filename, FRONTIER_MASTER_FILENAME);
assert.equal(result.frontierFileCount, 1);
assert.equal(result.totalFileCount, 2);
assert.ok(result.buffer.byteLength > 8000);

const wb = new ExcelJS.Workbook();
await wb.xlsx.load(Buffer.from(result.buffer));
const names = wb.worksheets.map((w) => w.name);

for (const sheet of [
  '00_ReadMe',
  '01_Files_Master',
  '20_Multi_LLM_Metrics_Long',
  '24_RQ2_Stats_Primary',
  '31_Inclusion_Cohort',
  '32_RQ2_All_Pass_Rows',
  '43_MASTER_GUIDE',
  '44_Open_Systems_Summary',
]) {
  assert.ok(names.includes(sheet), `missing sheet ${sheet}`);
}

console.log('buildCombinedFrontierMasterExcel.test.mjs: OK');
