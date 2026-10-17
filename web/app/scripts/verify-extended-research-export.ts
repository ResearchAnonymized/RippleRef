/**
 * Verify extended research export folder (Excel sheets + analysis CSVs + counts).
 * Usage: cd web/app && npm run verify:extended-research [export-dir]
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import ExcelJS from 'exceljs';
import {
  buildResearchAnalysisExports,
  validateAnalysisCounts,
} from '../app/lib/researchAnalysisExports';
import { loadResearchDatasetFromDisk } from '../app/lib/researchDatasetLoader';

const REQUIRED_SHEETS = [
  '00_ReadMe',
  '01_Files_Master',
  '19_Multi_LLM_Comparison_Wide',
  '20_Multi_LLM_Metrics_Long',
  '24_RQ2_Stats_Primary',
  '25_RQ2_Stats_Extended',
  '26_RQ3_Provider_Comparison',
  '27_Cohort_A_vs_B',
  '28_Acceptance_Rates',
  '29_Analysis_ReadMe',
  '30_RQ2_Pass_Data',
];

const COMBINED_MASTER_SHEETS = [
  ...REQUIRED_SHEETS,
  '31_Inclusion_Cohort',
  '32_RQ2_All_Pass_Rows',
  '33_RQ3_Comparison_Wide',
  '43_MASTER_GUIDE',
  '44_Open_Systems_Summary',
];

const REQUIRED_CSV = [
  'inclusion_cohort.csv',
  '05_rq_analysis_views/RQ2_primary_passes.csv',
  '05_rq_analysis_views/RQ2_extended_passes.csv',
  '05_rq_analysis_views/RQ3_comparison_wide.csv',
  '05_rq_analysis_views/RQ2_metrics_long.csv',
];

function latestExportDir(base: string): string | null {
  if (!fs.existsSync(base)) return null;
  const dirs = fs
    .readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();
  return dirs.length ? path.join(base, dirs[0]) : null;
}

async function verifyWorkbook(
  xlsxPath: string,
  requiredSheets: string[] = REQUIRED_SHEETS,
  minMasterRows = 100
): Promise<string[]> {
  const issues: string[] = [];
  if (!fs.existsSync(xlsxPath)) {
    issues.push(`missing workbook: ${xlsxPath}`);
    return issues;
  }
  const stat = fs.statSync(xlsxPath);
  if (stat.size < 50_000) issues.push(`workbook suspiciously small (${stat.size} bytes)`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const names = wb.worksheets.map((w) => w.name);
  for (const s of requiredSheets) {
    if (!names.includes(s)) issues.push(`${path.basename(xlsxPath)} missing sheet ${s}`);
  }

  const master = wb.getWorksheet('01_Files_Master');
  if (master) {
    const header = master.getRow(1).values as (string | undefined)[];
    const headerStr = header.map((h) => String(h ?? '')).join('\t');
    for (const col of ['cohort', 'model_tier', 'in_current_sample']) {
      if (!headerStr.includes(col)) {
        issues.push(`${path.basename(xlsxPath)} 01_Files_Master missing column ${col}`);
      }
    }
    const rowCount = master.rowCount - 1;
    if (rowCount < minMasterRows) {
      issues.push(
        `${path.basename(xlsxPath)} 01_Files_Master has only ${rowCount} data rows (expected >=${minMasterRows})`
      );
    }
  }
  return issues;
}

function verifyCsvs(outDir: string): string[] {
  const issues: string[] = [];
  for (const rel of REQUIRED_CSV) {
    const p = path.join(outDir, rel);
    if (!fs.existsSync(p)) {
      issues.push(`missing ${rel}`);
      continue;
    }
    const lines = fs.readFileSync(p, 'utf8').split(/\n/).filter(Boolean);
    if (lines.length < 2) issues.push(`${rel} has no data rows`);
  }

  const primaryPath = path.join(outDir, '05_rq_analysis_views/RQ2_primary_passes.csv');
  if (fs.existsSync(primaryPath)) {
    const n = fs.readFileSync(primaryPath, 'utf8').split(/\n/).length - 1;
    if (n < 400) issues.push(`RQ2_primary_passes.csv has ${n} rows (expected ~450)`);
  }

  const extendedPath = path.join(outDir, '05_rq_analysis_views/RQ2_extended_passes.csv');
  if (fs.existsSync(extendedPath)) {
    const n = fs.readFileSync(extendedPath, 'utf8').split(/\n/).length - 1;
    if (n < 850) issues.push(`RQ2_extended_passes.csv has ${n} rows (expected ~879)`);
  }

  return issues;
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const base = path.join(os.homedir(), 'RENDRI-R-export');
  const outDir = arg ? path.resolve(arg) : latestExportDir(base);
  if (!outDir || !fs.existsSync(outDir)) {
    console.error('No export directory found. Run: npm run export:extended-research');
    process.exit(1);
  }

  console.log(`Verifying: ${outDir}`);
  const issues: string[] = [];

  issues.push(...(await verifyWorkbook(path.join(outDir, 'RENDRI-R_master_all_files.xlsx'))));
  const combinedPath = path.join(outDir, 'RENDRI-R_MASTER_COMPLETE.xlsx');
  if (fs.existsSync(combinedPath)) {
    issues.push(...(await verifyWorkbook(combinedPath, COMBINED_MASTER_SHEETS, 50)));
  } else {
    issues.push('missing RENDRI-R_MASTER_COMPLETE.xlsx — run npm run export:extended-research');
  }
  if (fs.existsSync(path.join(outDir, 'extended_cross_project.xlsx'))) {
    issues.push(...(await verifyWorkbook(path.join(outDir, 'extended_cross_project.xlsx'))));
  }
  issues.push(...verifyCsvs(outDir));

  const { files } = loadResearchDatasetFromDisk();
  const analysis = buildResearchAnalysisExports(files);
  issues.push(...validateAnalysisCounts(analysis.counts));

  const manifestPath = path.join(outDir, 'export_manifest.json');
  if (fs.existsSync(manifestPath)) {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { totalFiles?: number };
    if (m.totalFiles && m.totalFiles !== files.length) {
      issues.push(`manifest totalFiles ${m.totalFiles} != loaded ${files.length}`);
    }
  }

  console.log('\nDataset (live disk):');
  console.log(`  files: ${analysis.counts.files}`);
  console.log(`  RQ2 primary pass rows: ${analysis.counts.primaryPassRows}`);
  console.log(`  RQ2 extended pass rows: ${analysis.counts.extendedPassRows}`);
  console.log(`  RQ3 comparison rows: ${analysis.counts.comparisonWideRows}`);

  if (issues.length) {
    console.error('\nFAIL:');
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }

  console.log('\nPASS: extended research export verified');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
