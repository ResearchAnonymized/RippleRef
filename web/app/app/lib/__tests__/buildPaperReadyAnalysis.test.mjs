/**
 * Paper-ready analysis tests.
 * Run: cd web/app && npx tsx app/lib/__tests__/buildPaperReadyAnalysis.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, 'fixtures', 'sample-saved-report.json');

const { parseSavedRefactoringReportBundle } = await import('../savedRefactoringReport.ts');
const { filterRq2FrontierPassRows, buildRq2ProviderPassRows } = await import('../researchAnalysisExports.ts');
const {
  buildPaperReadyWorkbook,
  frontierPassRowsFromItems,
  buildFileMaster527Aoa,
} = await import('../buildPaperReadyAnalysis.ts');

const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const baseBundle = parseSavedRefactoringReportBundle(raw);
assert.ok(baseBundle, 'fixture must parse');

function frontierBundle() {
  const rm = baseBundle.researchMetrics;
  const runs = ['OpenAI', 'Google', 'Anthropic'].map((provider, passIndex) => ({
    passIndex,
    provider,
    model: provider === 'OpenAI' ? 'openai/gpt-5' : provider === 'Google' ? 'google/gemini-3-pro' : 'anthropic/claude-opus-4',
    ok: true,
    changed: true,
    smellsBefore: 2,
    smellsAfter: 1,
    smellDelta: 1,
    linesBefore: 70,
    linesAfter: 78,
    researchMetrics: rm,
    agentSteps: [],
  }));
  return {
    ...baseBundle,
    pipelineMetadata: {
      ...(baseBundle.pipelineMetadata ?? {}),
      multiLlmMode: 'independent_parallel',
    },
    multiLlmRuns: runs,
  };
}

const item = {
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
  projectName: 'TestProject',
  workspaceId: 'project-test',
  sourceFolder: 'test',
};

const passRows = frontierPassRowsFromItems([item]);
assert.equal(passRows.length, 3, '3 provider passes');
assert.equal(filterRq2FrontierPassRows(passRows).length, 3);

const fileMaster = buildFileMaster527Aoa(passRows);
assert.ok(fileMaster.length >= 2, 'file master has header + rows');
assert.equal(String(fileMaster.find((r) => r[0] === 'project_name')?.[0]), 'project_name');

const paper = await buildPaperReadyWorkbook([item], new Date().toISOString());
assert.ok(paper.buffer.byteLength > 4000);
assert.equal(paper.fileCount, 1);
assert.equal(paper.passRowCount, 3);

const wb = new ExcelJS.Workbook();
await wb.xlsx.load(Buffer.from(paper.buffer));
const names = wb.worksheets.map((w) => w.name);
for (const sheet of [
  '00_START_HERE',
  '00_ANALYSIS_GUIDE',
  '97_Stats_Column_Formulas',
  'RQ1_03_Effectiveness_Stats',
  'RQ1_03_Excel_CHECK',
  'RQ2_01_Provider_Compare',
  '01_Pass_Master',
  '99_Data_Quality',
]) {
  assert.ok(names.includes(sheet), `missing ${sheet}`);
}

console.log('buildPaperReadyAnalysis.test.mjs: OK');
