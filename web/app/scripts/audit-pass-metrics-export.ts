/**
 * Audit export rows vs saved pass researchMetrics (all metric sections).
 * Usage: cd web/app && npx tsx scripts/audit-pass-metrics-export.ts
 */

import path from 'path';
import os from 'os';
import fs from 'fs';
import { filterFrontierMasterItems } from '../app/lib/buildCombinedFrontierMasterExcel';
import {
  auditPassMasterRows,
  buildComprehensivePassMasterRows,
} from '../app/lib/buildCleaningMasterExport';
import { loadResearchDatasetFromDisk } from '../app/lib/researchDatasetLoader';
import type { FullExcelFileItem } from '../app/lib/buildFullResearchExcel';

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

const { files } = loadResearchDatasetFromDisk();
const items = filterFrontierMasterItems(files.map(loadedToItem));
const loaded = files.filter((f) =>
  items.some((i) => i.filePath === f.filePath)
);
const rows = buildComprehensivePassMasterRows(loaded);
const audit = auditPassMasterRows(rows, loaded);

console.log('=== Pass metrics export audit ===\n');
console.log(`Pass rows: ${audit.passCount}`);
console.log(`With researchMetrics: ${audit.withResearchMetrics}`);
console.log(`PMD smells changed (before≠after): ${audit.pmdChanged}`);
console.log(`PMD smells unchanged (before=after): ${audit.pmdEqualBeforeAfter}`);
console.log(`Export vs JSON mismatches: ${audit.auditIssueCount}`);

if (audit.sampleIssues.length) {
  console.log('\nSample mismatches:');
  for (const s of audit.sampleIssues) console.log(`  - ${s}`);
} else {
  console.log('\nNo mismatches — export matches saved researchMetrics for all checked fields.');
}

const junit = rows.filter((r) =>
  ['Test.java', 'RuleContainer.java', 'BaseTestRunner.java'].includes(String(r.file_name))
);
console.log('\nJUnit UI cross-check (pmd_smells_before → after):');
for (const r of junit) {
  console.log(
    `  ${r.file_name} ${r.provider_key}: ${r.pmd_smells_before} → ${r.pmd_smells_after} | score=${r.overall_score} | verify=${r.verify_accepted} | semantic=${r.semantic_overall_preservation_pct}`
  );
}

const outPath = path.join(os.homedir(), 'ICSE-Dataset', '05_reference', 'METRICS_EXPORT_AUDIT.txt');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  [
    'Pass metrics export audit',
    new Date().toISOString(),
    JSON.stringify(audit, null, 2),
    '',
    'JUnit samples:',
    ...junit.map(
      (r) =>
        `${r.file_name} ${r.provider_key}: pmd ${r.pmd_smells_before}->${r.pmd_smells_after} score=${r.overall_score}`
    ),
  ].join('\n'),
  'utf8'
);
console.log(`\nWrote: ${outPath}`);

if (audit.auditIssueCount > 0) process.exit(1);
