/**
 * Full ICSE analysis validation — export audit + analysis checks + combined sheet spot check.
 * Usage: cd web/app && npx tsx scripts/validate-icse-analysis.ts
 */

import path from 'path';
import os from 'os';
import fs from 'fs';
import { filterFrontierMasterItems } from '../app/lib/buildCombinedFrontierMasterExcel';
import {
  auditPassMasterRows,
  buildComprehensivePassMasterRows,
} from '../app/lib/buildCleaningMasterExport';
import { runAnalysisValidation } from '../app/lib/buildAnalysisValidation';
import { loadResearchDatasetFromDisk } from '../app/lib/researchDatasetLoader';
import type { FullExcelFileItem } from '../app/lib/buildFullResearchExcel';
import { buildRq1EffectivenessStatsAoa } from '../app/lib/buildPaperReadyAnalysis';
import { mean } from '../app/lib/statisticalTests';

function loadedToItem(f: ReturnType<typeof loadResearchDatasetFromDisk>['files'][0]): FullExcelFileItem {
  return {
    filePath: f.filePath,
    fileName: f.fileName,
    bundle: f.bundle,
    candidate: { filePath: f.filePath, label: f.fileName, hasSavedReport: true, status: 'refactored' },
    inCurrentSample: f.inCurrentSample,
    projectName: f.projectName,
    sourceFolder: f.sourceFolder,
    workspaceId: f.workspaceId,
  };
}

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  return NaN;
}

const { files } = loadResearchDatasetFromDisk();
const items = filterFrontierMasterItems(files.map(loadedToItem));
const loaded = files.filter((f) => items.some((i) => i.filePath === f.filePath));
const rows = buildComprehensivePassMasterRows(loaded);
const audit = auditPassMasterRows(rows, loaded);
const validation = runAnalysisValidation(rows);

const rq103 = buildRq1EffectivenessStatsAoa(rows);
const openaiSmellRow = rq103.find(
  (r) => r[1] === 'openai' && String(r[2]).includes('PMD smells') && r[3] === 'paired_before_after'
);
const recalcOpenaiRemoved = mean(
  rows.filter((r) => r.provider_key === 'openai').map((r) => num(r.pmd_smells_removed)).filter(Number.isFinite)
);
const recalcMeanBefore = mean(
  rows.filter((r) => r.provider_key === 'openai').map((r) => num(r.pmd_smells_before)).filter(Number.isFinite)
);
const recalcMeanAfter = mean(
  rows.filter((r) => r.provider_key === 'openai').map((r) => num(r.pmd_smells_after)).filter(Number.isFinite)
);
const statsMeanAfter = openaiSmellRow ? num(openaiSmellRow[6]) : NaN;
const statsMeanDelta = openaiSmellRow ? num(openaiSmellRow[7]) : NaN;

const lines: string[] = [
  'ICSE ANALYSIS VALIDATION REPORT',
  new Date().toISOString(),
  '',
  '=== EXPORT vs JSON ===',
  `Pass rows: ${audit.passCount}`,
  `JSON mismatches: ${audit.auditIssueCount}`,
  `PMD changed: ${audit.pmdChanged} | unchanged: ${audit.pmdEqualBeforeAfter}`,
  '',
  '=== ANALYSIS READINESS ===',
  `Status: ${validation.summary.validation_errors === 0 ? 'PASS' : 'FAIL'}`,
  `Errors: ${validation.summary.validation_errors}`,
  `Warnings: ${validation.summary.validation_warnings}`,
  '',
  'Summary:',
  ...Object.entries(validation.summary).map(([k, v]) => `  ${k}: ${v}`),
  '',
];

if (validation.issues.length) {
  lines.push('Issues:');
  for (const i of validation.issues) {
    lines.push(`  [${i.severity}] ${i.check}: ${i.detail}`);
  }
  lines.push('');
} else {
  lines.push('No analysis issues detected.', '');
}

lines.push('=== RQ1 SPOT CHECK (OpenAI PMD smells) ===');
lines.push(`RQ1_03 mean_before: ${openaiSmellRow ? openaiSmellRow[5] : 'n/a'}`);
lines.push(`RQ1_03 mean_after: ${statsMeanAfter}`);
lines.push(`Recalculated mean_before: ${recalcMeanBefore}`);
lines.push(`Recalculated mean_after: ${recalcMeanAfter}`);
lines.push(`RQ1_03 mean_delta (after−before): ${statsMeanDelta}`);
lines.push(`Recalculated mean_removed: ${recalcOpenaiRemoved}`);
lines.push(
  Math.abs(statsMeanAfter - recalcMeanAfter) < 0.05
    ? 'RQ1 mean_after matches pass data: YES'
    : 'RQ1 mean_after matches pass data: CHECK MANUALLY'
);

const outDir = path.join(os.homedir(), 'ICSE-Dataset', '05_reference');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'ANALYSIS_VALIDATION_REPORT.txt');
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

console.log(lines.join('\n'));
console.log(`\nWrote: ${outPath}`);
process.exit(validation.summary.validation_errors === 0 && audit.auditIssueCount === 0 ? 0 : 1);
