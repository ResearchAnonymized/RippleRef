/**
 * One workbook — key metrics sheet first, then full master sheet.
 */

import type { FullExcelFileItem } from './buildFullResearchExcel';
import {
  buildRq2ProviderPassRows,
  filterRq2FrontierPassRows,
  recordsToCsv,
  type Rq2ProviderPassRow,
} from './researchAnalysisExports';
import { classifyResearchCohort } from './researchExportCohort';
import type { LoadedResearchFile } from './researchDatasetLoader';
import {
  auditExportRowAgainstMetrics,
  flattenPassMetricsForExport,
} from './flattenPassMetricsForExport';
import { multiLlmRunsFromBundle, providerKeyFromRun } from './multiLlmExport';
import type { MultiLlmRunRecord } from './batchRunStorage';
import type { FileMetricContext } from './researchMetricSections';
import {
  KEY_METRICS_COLUMNS,
  orderPassExportRows,
} from './passExportColumnOrder';
import { columnGuideRowsForKeys } from './passExportColumnLabels';
import { runAnalysisValidation } from './buildAnalysisValidation';

export const CLEANING_MASTER_FILENAME = 'STUDY_MASTER_ONE_SHEET.xlsx';
export const KEY_METRICS_SHEET = '01_Key_Metrics';
export const VALIDATION_SHEET = '02_Analysis_Validation';
export const COLUMN_GUIDE_SHEET = '00_Column_Guide';
/** Full pass-level export — all metrics; human-readable column headers. */
export const CLEANING_MASTER_SHEET = '02_Full_Metrics_All_Columns';
export const CLEANING_MASTER_CSV = 'STUDY_MASTER_ONE_SHEET.csv';
export const KEY_METRICS_CSV = 'STUDY_KEY_METRICS.csv';

const COLUMN_GUIDE_INTRO: (string | number | boolean)[][] = [
  ['Quick reference — smell & quality columns (see full list below)'],
  ['Column', 'Excel header', 'Meaning'],
  ['pmd_smells_before', '[Smells] PMD Count — Frozen Baseline (before)', 'Smells on frozen baseline Java file'],
  ['pmd_smells_after', '[Smells] PMD Count — After Refactor (remaining)', '0 = all smells removed'],
  ['pmd_smells_removed', '[Smells] PMD Removed (before − after; + = better)', 'Count of smells fixed'],
  ['pmd_smells_reduction_pct', '[Smells] PMD Reduction % (100× removed/before)', '% of baseline smells removed'],
  ['pmd_smells_delta', '[Smells] PMD Delta (= removed count, NOT remaining)', 'Same as removed — not remaining count'],
  ['complexity_removed', '[Quality] Cyclomatic Complexity — Removed (+ = better)', 'before − after'],
  ['maintainability_gain', '[Quality] Maintainability Index — Gain (after − before)', 'positive = better'],
  ['loc_removed', '[Structure] Lines of Code — Removed (+ = better)', 'before − after'],
  ['verify_accepted', '[Run] Automated Verification Passed (yes/no)', 'Automated gates — not same as smell reduction'],
];

function itemsToLoaded(files: FullExcelFileItem[]): LoadedResearchFile[] {
  return files.map((f) => ({
    filePath: f.filePath,
    fileName: f.fileName,
    bundle: f.bundle!,
    projectName: f.projectName ?? '',
    sourceFolder: f.sourceFolder ?? '',
    workspaceId: f.workspaceId ?? '',
    inCurrentSample: f.inCurrentSample ?? false,
  }));
}

function ctxFromFile(f: LoadedResearchFile): FileMetricContext {
  return {
    projectName: f.projectName,
    sourceFolder: f.sourceFolder,
    workspaceId: f.workspaceId,
    filePath: f.filePath,
    fileName: f.fileName,
    savedReportId: encodeURIComponent(f.filePath),
    savedAtIso: f.bundle?.savedAt ? new Date(f.bundle.savedAt).toISOString() : '',
    hasFullSavedReport: !!f.bundle,
    missingReason: '',
  };
}

export function buildComprehensivePassMasterRows(files: LoadedResearchFile[]): Rq2ProviderPassRow[] {
  const rows: Rq2ProviderPassRow[] = [];

  for (const f of files) {
    const cohort = classifyResearchCohort(f.bundle, f.inCurrentSample);
    if (cohort.cohort !== 'A_frontier_parallel') continue;

    const ctx = ctxFromFile(f);
    for (const run of multiLlmRunsFromBundle(f.bundle)) {
      if (!providerKeyFromRun(run)) continue;
      rows.push(
        flattenPassMetricsForExport({
          ctx,
          run,
          cohort: {
            cohort: cohort.cohort,
            model_tier: cohort.model_tier,
            multi_llm_mode: cohort.multi_llm_mode,
            in_current_sample: cohort.in_current_sample,
            sample_id: cohort.sample_id,
            metrics_complete_all_passes: cohort.metrics_complete_all_passes,
          },
        })
      );
    }
  }

  return rows;
}

export type PassMetricsAuditSummary = {
  passCount: number;
  withResearchMetrics: number;
  auditIssueCount: number;
  sampleIssues: string[];
  comparisonKeysChecked: number;
  pmdEqualBeforeAfter: number;
  pmdChanged: number;
};

export function auditPassMasterRows(rows: Rq2ProviderPassRow[], files: LoadedResearchFile[]): PassMetricsAuditSummary {
  const runByKey = new Map<string, MultiLlmRunRecord>();
  for (const f of files) {
    for (const run of multiLlmRunsFromBundle(f.bundle)) {
      runByKey.set(`${f.filePath}::${providerKeyFromRun(run)}`, run);
    }
  }

  let auditIssueCount = 0;
  const sampleIssues: string[] = [];
  let withResearchMetrics = 0;
  let pmdEqualBeforeAfter = 0;
  let pmdChanged = 0;

  for (const row of rows) {
    if (row.has_research_metrics === 'yes') withResearchMetrics += 1;
    const b = row.pmd_smells_before;
    const a = row.pmd_smells_after;
    if (b !== '' && a !== '') {
      if (b === a) pmdEqualBeforeAfter += 1;
      else pmdChanged += 1;
    }
    const run = runByKey.get(`${row.file_path}::${row.provider_key}`);
    if (!run) continue;
    const issues = auditExportRowAgainstMetrics(row, run);
    if (issues.length) {
      auditIssueCount += issues.length;
      if (sampleIssues.length < 15) {
        sampleIssues.push(`${row.file_name} ${row.provider_key}: ${issues.join('; ')}`);
      }
    }
  }

  return {
    passCount: rows.length,
    withResearchMetrics,
    auditIssueCount,
    sampleIssues,
    comparisonKeysChecked: rows.length,
    pmdEqualBeforeAfter,
    pmdChanged,
  };
}

export function frontierPassRowsForCleaning(items: FullExcelFileItem[]): Rq2ProviderPassRow[] {
  const loaded = itemsToLoaded(items);
  return buildComprehensivePassMasterRows(loaded);
}

export type CleaningMasterExport = {
  buffer: ArrayBuffer;
  csv: string;
  keyMetricsCsv: string;
  rowCount: number;
  columnCount: number;
  keyColumnCount: number;
  fileCount: number;
  projectCount: number;
  audit: PassMetricsAuditSummary;
  validation: ReturnType<typeof runAnalysisValidation>;
};

function addDataSheet(
  ws: import('exceljs').Worksheet,
  preamble: string[],
  headerRowIndex: number,
  aoa: (string | number | boolean)[][]
): void {
  for (const line of preamble) ws.addRow([line]);
  ws.addRow([]);
  const header = aoa[0];
  const dataRows = aoa.slice(1);
  ws.addRow(header);
  ws.getRow(headerRowIndex).font = { bold: true };
  for (const row of dataRows) ws.addRow(row);
  ws.views = [{ state: 'frozen', ySplit: headerRowIndex }];
}

export async function buildCleaningMasterWorkbook(
  frontierItems: FullExcelFileItem[],
  exportedAt: string
): Promise<CleaningMasterExport> {
  const ExcelJS = (await import('exceljs')).default;
  const loaded = itemsToLoaded(frontierItems);
  const rows = buildComprehensivePassMasterRows(loaded);
  const audit = auditPassMasterRows(rows, loaded);
  const full = orderPassExportRows(rows, undefined, 'display');
  const key = orderPassExportRows(rows, KEY_METRICS_COLUMNS as string[], 'display');
  const fileCount = new Set(rows.map((r) => String(r.file_path))).size;
  const projectCount = new Set(rows.map((r) => String(r.project_name))).size;
  const headerRowIndex = 7;

  const validation = runAnalysisValidation(rows);

  const wb = new ExcelJS.Workbook();
  const guide = wb.addWorksheet(COLUMN_GUIDE_SHEET.slice(0, 31));
  guide.addRow(['Column guide — how to read STUDY_MASTER_ONE_SHEET exports']);
  guide.addRow([`Exported: ${exportedAt}`]);
  guide.addRow(['Prefix legend: [Study]=file/cohort  [LLM]=provider  [Run]=pass outcome  [Smells]=PMD  [Quality]=complexity/MI/testability  [Structure]=LOC/methods  [Preservation]=API  [Cost]=tokens']);
  guide.addRow([]);
  for (const row of COLUMN_GUIDE_INTRO) guide.addRow(row);
  guide.getRow(5).font = { bold: true };
  guide.addRow([]);
  guide.addRow(['—— Full column dictionary (internal key → Excel header) ——']);
  const guideRows = columnGuideRowsForKeys(full.keys);
  for (const row of guideRows) guide.addRow(row);
  guide.getRow(guide.lastRow!.number).font = { bold: true };

  const valWs = wb.addWorksheet(VALIDATION_SHEET.slice(0, 31));
  for (const row of validation.aoa) valWs.addRow(row);
  valWs.getRow(4).font = { bold: true };
  valWs.getRow(validation.aoa.findIndex((r) => r[0] === 'ISSUES') + 1).font = { bold: true };

  const keyWs = wb.addWorksheet(KEY_METRICS_SHEET.slice(0, 31));
  addDataSheet(keyWs, [
    '01_KEY METRICS — start here (one row per file × LLM provider)',
    `${projectCount} systems | ${fileCount} files | ${rows.length} rows`,
    'Column headers use [Section] labels. See tab 00_Column_Guide for internal keys.',
    'Smell columns: Baseline → After (remaining) → Removed → Reduction %',
  ], headerRowIndex, key.aoa);

  const fullWs = wb.addWorksheet(CLEANING_MASTER_SHEET.slice(0, 31));
  addDataSheet(fullWs, [
    '02_FULL METRICS — every researchMetrics field (key columns first, then detail)',
    `Exported: ${exportedAt}`,
    `${projectCount} systems | ${fileCount} files | ${rows.length} rows | ${full.keys.length} columns`,
    'Headers are human-readable; machine keys are in tab 00_Column_Guide.',
    `Audit: ${audit.auditIssueCount} mismatches. Validation: ${validation.summary.validation_errors} errors, ${validation.summary.validation_warnings} warnings.`,
  ], headerRowIndex, full.aoa);

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const keyMetricsCsv = recordsToCsv(
    rows.map((r) => {
      const o: Rq2ProviderPassRow = {};
      for (const k of KEY_METRICS_COLUMNS) o[k] = r[k] ?? '';
      return o;
    })
  );

  return {
    buffer,
    csv: recordsToCsv(rows),
    keyMetricsCsv,
    rowCount: rows.length,
    columnCount: full.keys.length,
    keyColumnCount: KEY_METRICS_COLUMNS.length,
    fileCount,
    projectCount,
    audit,
    validation,
  };
}
