/**
 * Export RQ3 smell-oriented refactoring behaviour analysis (450-file complete-case).
 *
 * Usage:
 *   cd web/app && npm run export:rq3-behaviour
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadResearchDatasetFromDisk } from '../app/lib/researchDatasetLoader';
import {
  buildRq3BehaviourPassRows,
  buildRq3BehaviourWorkbook,
  filterRq3BehaviourCompleteCaseRows,
  rq3StrictCompleteCaseFilePaths,
  RQ3_BEHAVIOUR_FILENAME,
  buildRq3BehaviourSheets,
} from '../app/lib/researchRq3Behaviour';
import { classifyResearchCohort } from '../app/lib/researchExportCohort';
import { recordsToCsv } from '../app/lib/researchAnalysisExports';

async function main(): Promise<void> {
  const exportedAt = new Date().toISOString();
  const outRoot = path.join(os.homedir(), 'RENDRI-R-export', `rq3-behaviour-${exportedAt.slice(0, 10)}`);
  fs.mkdirSync(outRoot, { recursive: true });

  console.log('=== RQ3 Behaviour Export (450 complete-case) ===\n');

  const { files } = loadResearchDatasetFromDisk();
  const frontierFiles = files.filter((f) => {
    const c = classifyResearchCohort(f.bundle, f.inCurrentSample);
    return c.cohort === 'A_frontier_parallel';
  });

  const sheets = buildRq3BehaviourSheets(frontierFiles, exportedAt);
  const completeRows = filterRq3BehaviourCompleteCaseRows(
    buildRq3BehaviourPassRows(frontierFiles),
    rq3StrictCompleteCaseFilePaths(frontierFiles)
  );

  const xlsxPath = path.join(outRoot, RQ3_BEHAVIOUR_FILENAME);
  const buffer = await buildRq3BehaviourWorkbook(frontierFiles, exportedAt);
  fs.writeFileSync(xlsxPath, Buffer.from(buffer));

  const csvDir = path.join(outRoot, 'csv');
  fs.mkdirSync(csvDir, { recursive: true });
  fs.writeFileSync(path.join(csvDir, 'RQ3_pass_data_450.csv'), recordsToCsv(completeRows));

  fs.writeFileSync(
    path.join(outRoot, 'RQ3_COHORT_README.txt'),
    [
      'RQ3 — Smell-oriented refactoring behaviour',
      `Exported: ${exportedAt}`,
      '',
      `Cohort: ${sheets.summary.complete_case_files} files, ${sheets.summary.complete_case_pass_rows} passes`,
      'Rule: frontier independent_parallel + metrics_complete=yes on all 3 provider passes',
      '',
      `Workbook: ${RQ3_BEHAVIOUR_FILENAME}`,
      'Sheets 03–09: statistical tests for paper tables',
      '',
      'Open 00_START_HERE first.',
    ].join('\n')
  );

  console.log(`Frontier files loaded: ${frontierFiles.length}`);
  console.log(`Complete-case files:   ${sheets.summary.complete_case_files}`);
  console.log(`Complete-case passes:  ${sheets.summary.complete_case_pass_rows}`);
  console.log(`\nOutput:\n  ${xlsxPath}`);
  console.log(`  ${csvDir}/RQ3_pass_data_450.csv`);

  if (sheets.summary.complete_case_files !== 450) {
    console.warn(`\nNote: expected 450 files, got ${sheets.summary.complete_case_files}`);
  }
  if (sheets.summary.complete_case_pass_rows !== 1350) {
    console.warn(`Note: expected 1350 passes, got ${sheets.summary.complete_case_pass_rows}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
