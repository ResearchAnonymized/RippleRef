/**
 * One combined master workbook — frontier LLMs only (cohort A_frontier_parallel).
 * Merges raw metric sheets (00–30), supplemental audit tables, and balanced analysis.
 */

import ExcelJS from 'exceljs';
import {
  buildFullResearchWorkbook,
  type FullExcelFileItem,
} from './buildFullResearchExcel';
import {
  buildComprehensivePassMasterRows,
} from './buildCleaningMasterExport';
import {
  buildResearchAnalysisExports,
  type Rq2ProviderPassRow,
} from './researchAnalysisExports';
import {
  buildBalancedNSummaryAoa,
  filterBalancedCompletePassRows,
  summarizeBalancedCohort,
} from './researchCompleteCase';
import {
  buildInclusionRow,
  classifyResearchCohort,
  type InclusionRow,
} from './researchExportCohort';
import {
  buildBehavioralPassTestRowsFromItems,
  buildVerificationGateRowsFromItems,
  behavioralPassTestRowsToAoa,
  verificationGateRowsToAoa,
} from './behavioralPassTestExport';
import type { LoadedResearchFile } from './researchDatasetLoader';
import {
  buildRq2StatsSheet,
  buildRq3ProviderComparisonSheet,
  passRowsToAoa,
} from './researchStatisticalAnalysis';
import { sheetDefinitionsToAoa } from './researchExcelSheetDefinitions';

export const FRONTIER_MASTER_FILENAME = 'REFINE_MASTER_COMPLETE.xlsx';

type Aoa = (string | number | boolean)[][];

export type OpenSystemSummaryRow = {
  project_name: string;
  workspace_id: string;
  saved_reports_total: number;
  frontier_saved: number;
  locked_sample_slots: number;
  sample_with_saved_report: number;
  frontier_in_sample: number;
};

/** Per-project counts across the 15 open-source systems. */
export function summarizeOpenSystemsFromItems(
  items: FullExcelFileItem[],
  lockedSampleSlots?: Record<string, number>
): OpenSystemSummaryRow[] {
  const byProject = new Map<string, OpenSystemSummaryRow>();

  for (const item of items) {
    const projectName = item.projectName ?? item.workspaceId ?? 'unknown';
    if (!byProject.has(projectName)) {
      byProject.set(projectName, {
        project_name: projectName,
        workspace_id: item.workspaceId ?? '',
        saved_reports_total: 0,
        frontier_saved: 0,
        locked_sample_slots: lockedSampleSlots?.[projectName] ?? 0,
        sample_with_saved_report: 0,
        frontier_in_sample: 0,
      });
    }
    if (!item.bundle) continue;

    const row = byProject.get(projectName)!;
    row.saved_reports_total += 1;
    const cohort = classifyResearchCohort(item.bundle, item.inCurrentSample ?? false);
    if (cohort.cohort === 'A_frontier_parallel') row.frontier_saved += 1;
    if (item.inCurrentSample) {
      row.sample_with_saved_report += 1;
      if (cohort.cohort === 'A_frontier_parallel') row.frontier_in_sample += 1;
    }
  }

  return Array.from(byProject.values()).sort((a, b) =>
    a.project_name.localeCompare(b.project_name)
  );
}

export function buildOpenSystemsSummaryAoa(rows: OpenSystemSummaryRow[]): Aoa {
  const header = [
    'project_name',
    'workspace_id',
    'saved_reports_total',
    'frontier_saved',
    'locked_sample_slots',
    'sample_with_saved_report',
    'frontier_in_sample',
  ];
  const body = rows.map((r) => [
    r.project_name,
    r.workspace_id,
    r.saved_reports_total,
    r.frontier_saved,
    r.locked_sample_slots,
    r.sample_with_saved_report,
    r.frontier_in_sample,
  ]);
  const totals = rows.reduce(
    (acc, r) => ({
      saved_reports_total: acc.saved_reports_total + r.saved_reports_total,
      frontier_saved: acc.frontier_saved + r.frontier_saved,
      locked_sample_slots: acc.locked_sample_slots + r.locked_sample_slots,
      sample_with_saved_report: acc.sample_with_saved_report + r.sample_with_saved_report,
      frontier_in_sample: acc.frontier_in_sample + r.frontier_in_sample,
    }),
    {
      saved_reports_total: 0,
      frontier_saved: 0,
      locked_sample_slots: 0,
      sample_with_saved_report: 0,
      frontier_in_sample: 0,
    }
  );
  return [
    header,
    ...body,
    [],
    [
      'TOTAL (15 open systems)',
      '',
      totals.saved_reports_total,
      totals.frontier_saved,
      totals.locked_sample_slots,
      totals.sample_with_saved_report,
      totals.frontier_in_sample,
    ],
  ];
}

export function openSystemsSummaryToCsv(rows: OpenSystemSummaryRow[]): string {
  const aoa = buildOpenSystemsSummaryAoa(rows);
  if (aoa.length < 2) return '';
  const header = aoa[0].map(String);
  return [
    header.join(','),
    ...aoa.slice(1).filter((row) => row.length === header.length).map((row) =>
      row
        .map((cell) => {
          const s = String(cell);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    ),
  ].join('\n');
}

export function filterFrontierMasterItems(items: FullExcelFileItem[]): FullExcelFileItem[] {
  return items.filter((item) => {
    if (!item.bundle) return false;
    return (
      classifyResearchCohort(item.bundle, item.inCurrentSample ?? false).cohort ===
      'A_frontier_parallel'
    );
  });
}

function itemsToLoadedFiles(items: FullExcelFileItem[]): LoadedResearchFile[] {
  return items
    .filter((i) => i.bundle)
    .map((i) => ({
      workspaceId: i.workspaceId ?? '',
      projectName: i.projectName ?? '',
      sourceFolder: i.sourceFolder ?? '',
      filePath: i.filePath,
      fileName: i.fileName,
      bundle: i.bundle!,
      inCurrentSample: i.inCurrentSample ?? false,
    }));
}

function inclusionToAoa(rows: InclusionRow[]): Aoa {
  if (!rows.length) return [['no_data']];
  const keys = Object.keys(rows[0]) as (keyof InclusionRow)[];
  return [
    keys,
    ...rows.map((r) =>
      keys.map((k) => {
        const v = r[k];
        if (typeof v === 'boolean') return v ? 'yes' : 'no';
        return v ?? '';
      })
    ),
  ];
}

function recordsToAoa(rows: Record<string, string | number | boolean>[]): Aoa {
  if (!rows.length) return [['no_data']];
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  return [keys, ...rows.map((r) => keys.map((k) => r[k] ?? ''))];
}

function addAoaSheet(
  wb: ExcelJS.Workbook,
  name: string,
  aoa: Aoa,
  freezeHeader = true
): void {
  const ws = wb.addWorksheet(name.slice(0, 31));
  for (const row of aoa) ws.addRow(row);
  if (freezeHeader && aoa.length > 1) ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (aoa.length > 0) ws.getRow(1).font = { bold: true };
}

export type CombinedFrontierMasterResult = {
  buffer: ArrayBuffer;
  filename: string;
  frontierFileCount: number;
  totalFileCount: number;
  inSampleCount: number;
  primaryPassRows: number;
  openSystems: OpenSystemSummaryRow[];
};

export async function buildCombinedFrontierMasterWorkbook(
  allItems: FullExcelFileItem[],
  options?: { exportedAt?: string; lockedSampleSlots?: Record<string, number> }
): Promise<CombinedFrontierMasterResult> {
  const items = filterFrontierMasterItems(allItems);
  const exportedAt = options?.exportedAt ?? new Date().toISOString();
  const inSampleCount = items.filter((i) => i.inCurrentSample).length;

  const baseBuffer = await buildFullResearchWorkbook({
    workspaceId: 'frontier-master',
    projectName: 'Frontier LLMs — All Projects',
    sourceFolder: 'all',
    items,
    includePerFileSheets: false,
    addProjectSummarySheets: true,
    includeResearchAnalysisSheets: true,
    completenessNotes: [
      '═══ COMBINED MASTER — FRONTIER LLMs ONLY ═══',
      'Cohort: A_frontier_parallel (independent_parallel, frontier models)',
      `Files in workbook: ${items.length} of ${allItems.length} total saved reports`,
      `In locked 150-file primary sample: ${inSampleCount}`,
      '',
      'Sheets 00–30: all extracted metrics + RQ2/RQ3 statistical tests',
      'Sheets 31–39: inclusion, pass audit, balanced complete-case analysis',
      '',
      'Use sheet 20 (Multi_LLM_Metrics_Long) for per-provider pivot analysis.',
      'This file excludes legacy chain cohort B — frontier parallel only.',
    ],
  });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(baseBuffer));

  const loadedFiles = itemsToLoadedFiles(items);
  const analysis = buildResearchAnalysisExports(loadedFiles);
  const frontierPasses: Rq2ProviderPassRow[] = analysis.rq2AllPassRows.filter(
    (r) => r.cohort === 'A_frontier_parallel'
  );
  const frontierComparisonWide = analysis.rq3ComparisonWide.filter(
    (r) => r.cohort === 'A_frontier_parallel'
  );
  const primaryComparisonWide = analysis.rq3PrimaryComparisonWide;

  const inclusionRows = items.map((item) =>
    buildInclusionRow(
      item.bundle,
      {
        projectName: item.projectName ?? '',
        workspaceId: item.workspaceId ?? '',
        filePath: item.filePath,
        fileName: item.fileName,
      },
      item.inCurrentSample ?? false
    )
  );

  const behavioralRows = buildBehavioralPassTestRowsFromItems(
    'Frontier LLMs',
    'frontier-master',
    'all',
    items
  );
  const verificationRows = buildVerificationGateRowsFromItems(
    'Frontier LLMs',
    'frontier-master',
    items
  );

  const fullBalanced = filterBalancedCompletePassRows(frontierPasses, 'full');
  const runBalanced = filterBalancedCompletePassRows(frontierPasses, 'run');
  const primaryBalanced = filterBalancedCompletePassRows(analysis.rq2Primary, 'full');
  const sumFull = summarizeBalancedCohort(frontierPasses, 'full');
  const sumRun = summarizeBalancedCohort(frontierPasses, 'run');
  const sumPrimary = summarizeBalancedCohort(analysis.rq2Primary, 'full');
  const openSystems = summarizeOpenSystemsFromItems(allItems, options?.lockedSampleSlots);

  addAoaSheet(wb, '31_Inclusion_Cohort', inclusionToAoa(inclusionRows));
  addAoaSheet(wb, '32_RQ2_All_Pass_Rows', passRowsToAoa(buildComprehensivePassMasterRows(loadedFiles)));
  addAoaSheet(wb, '33_RQ3_Comparison_Wide', recordsToAoa(frontierComparisonWide));
  addAoaSheet(wb, '34_RQ3_Primary_Wide', recordsToAoa(primaryComparisonWide));
  addAoaSheet(wb, '35_Behavioral_Pass_Test', behavioralPassTestRowsToAoa(behavioralRows));
  addAoaSheet(wb, '36_Verification_Gates', verificationGateRowsToAoa(verificationRows));
  addAoaSheet(
    wb,
    '37_Balanced_N_Summary',
    buildBalancedNSummaryAoa([sumFull, sumRun, sumPrimary])
  );
  addAoaSheet(
    wb,
    '38_Balanced_RQ2_FULL',
    buildRq2StatsSheet(fullBalanced, `balanced_full_${sumFull.balanced_files}files`)
  );
  addAoaSheet(wb, '39_Balanced_RQ3', buildRq3ProviderComparisonSheet(fullBalanced));
  addAoaSheet(wb, '40_Balanced_Pass_Data', passRowsToAoa(fullBalanced));
  addAoaSheet(
    wb,
    '41_Balanced_RQ2_RUN',
    buildRq2StatsSheet(runBalanced, `balanced_run_${sumRun.balanced_files}files`)
  );
  addAoaSheet(
    wb,
    '42_Balanced_RQ2_Primary',
    buildRq2StatsSheet(primaryBalanced, `balanced_primary_${sumPrimary.balanced_files}files`)
  );

  const systemTotals = openSystems.reduce(
    (acc, r) => ({
      saved: acc.saved + r.saved_reports_total,
      frontier: acc.frontier + r.frontier_saved,
      sampleSlots: acc.sampleSlots + r.locked_sample_slots,
      frontierInSample: acc.frontierInSample + r.frontier_in_sample,
    }),
    { saved: 0, frontier: 0, sampleSlots: 0, frontierInSample: 0 }
  );

  addAoaSheet(wb, '43_MASTER_GUIDE', [
    ['REFINE — Combined master workbook (frontier LLMs)'],
    ['Exported', exportedAt],
    [''],
    ['Scope', 'Cohort A_frontier_parallel only — independent parallel, frontier models'],
    ['Open systems (projects)', openSystems.length],
    ['Saved reports (all cohorts, 15 systems)', systemTotals.saved],
    ['Frontier saved reports (in this workbook)', items.length],
    ['Locked sample slots (15 × 15 target)', systemTotals.sampleSlots],
    ['Frontier files in locked sample', systemTotals.frontierInSample],
    ['Frontier pass rows', frontierPasses.length],
    ['Primary pass rows', analysis.rq2Primary.length],
    [''],
    ['Sheet range', 'Purpose'],
    ['00–30', 'All extracted metrics + RQ2/RQ3 stats (same as prior master)'],
    ['31', 'Inclusion / exclusion audit per file'],
    ['32', 'All provider pass rows (frontier cohort)'],
    ['33–34', 'RQ3 side-by-side comparison (extended + primary sample)'],
    ['35–36', 'Behavioral checks + verification gate explanations'],
    ['37–42', 'Balanced complete-case analysis (equal N per provider)'],
    ['44', 'Per-project file counts — 15 open-source systems'],
    ['45', 'Definitions of every sheet tab (same as REFINE_Sheet_Definitions.xlsx)'],
    [''],
    ['RQ2 primary claims', 'Sheet 24_RQ2_Stats_Primary or 42_Balanced_RQ2_Primary'],
    ['RQ3 provider comparison', 'Sheet 26_RQ3_Provider_Comparison or 39_Balanced_RQ3'],
  ]);

  addAoaSheet(wb, '44_Open_Systems_Summary', buildOpenSystemsSummaryAoa(openSystems));
  addAoaSheet(wb, '45_Sheet_Definitions', sheetDefinitionsToAoa(exportedAt));

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return {
    buffer,
    filename: FRONTIER_MASTER_FILENAME,
    frontierFileCount: items.length,
    totalFileCount: allItems.length,
    inSampleCount,
    primaryPassRows: analysis.rq2Primary.length,
    openSystems,
  };
}
