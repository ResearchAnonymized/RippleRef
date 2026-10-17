/**
 * Tests for full research Excel workbook builder (uses real fixture saved report).
 * Run: cd web/app && npx tsx app/lib/__tests__/buildFullResearchExcel.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, 'fixtures', 'sample-saved-report.json');

const { buildFullResearchWorkbook } = await import('../buildFullResearchExcel.ts');
const { parseSavedRefactoringReportBundle } = await import('../savedRefactoringReport.ts');

const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const bundle = parseSavedRefactoringReportBundle(raw);
assert.ok(bundle, 'fixture must parse as SavedRefactoringReportBundle');

const buffer = await buildFullResearchWorkbook({
  workspaceId: 'project-test',
  projectName: '07-Junit',
  sourceFolder: 'junit4-main',
  items: [
    {
      filePath: bundle.filePath,
      fileName: bundle.filePath.split('/').pop(),
      bundle,
      savedReportId: 'fixture',
      candidate: {
        filePath: bundle.filePath,
        label: bundle.filePath.split('/').pop(),
        hasSavedReport: true,
        status: 'refactored',
      },
    },
  ],
  includePerFileSheets: true,
});

assert.ok(buffer.byteLength > 5000, 'workbook should be non-trivial size');

const wb = new ExcelJS.Workbook();
await wb.xlsx.load(Buffer.from(buffer));
const names = wb.worksheets.map((w) => w.name);

const REQUIRED = [
  '00_ReadMe',
  '01_Files_Master',
  '02_Before_After',
  '03_Behavioral',
  '03b_Behavioral_Pass_Test',
  '03c_Behavioral_Pass_Wide',
  '03d_Verification_Gates',
  '04_Structural',
  '15_Smell_By_Type',
  '16_Pipeline',
  '17_Multi_LLM_Passes',
  '18_Multi_LLM_Agent_Steps',
  '19_Multi_LLM_Comparison_Wide',
  '20_Multi_LLM_Metrics_Long',
  '21_Metrics_Long',
  '22_Project_Stats',
  '23_Statistical_Tests',
];

for (const name of REQUIRED) {
  assert.ok(names.includes(name), `missing sheet ${name}`);
}

const rm = bundle.researchMetrics;
assert.ok(rm?.comparison, 'fixture has comparison metrics');
assert.ok(rm?.halstead, 'fixture has halstead metrics');

const passSheet = wb.getWorksheet('03b_Behavioral_Pass_Test');
assert.ok(passSheet, '03b sheet exists');
const headerRow = passSheet.getRow(1).values;
assert.ok(headerRow.includes('why_pass'), '03b has why_pass column');
assert.ok(headerRow.includes('why_fail'), '03b has why_fail column');

console.log('buildFullResearchExcel.test.mjs: PASS');
