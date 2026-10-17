/**
 * Paper-ready analysis workbook — 527 frontier cohort, RQ1 effectiveness + RQ2 providers.
 */

import type { FullExcelFileItem } from './buildFullResearchExcel';
import type { LoadedResearchFile } from './researchDatasetLoader';
import {
  buildComprehensivePassMasterRows,
} from './buildCleaningMasterExport';
import type { Rq2ProviderPassRow } from './researchAnalysisExports';
import { classifyResearchCohort } from './researchExportCohort';
import {
  buildAcceptanceRatesSheet,
  buildRq2StatsSheet,
  buildRq3ProviderComparisonSheet,
  passRowsToAoa,
} from './researchStatisticalAnalysis';
import { mean } from './statisticalTests';
import {
  buildMasterAnalysisGuideAoa,
  buildPassColumnFormulasAoa,
  buildRq1AcceptancePreambleAoa,
  buildRq1EffectivenessPreambleAoa,
  buildRq1ExcelCheckSheetAoa,
  buildRq1ExcelCheckRows,
  buildRq2PreambleAoa,
  buildRejectionPreambleAoa,
  buildStatsColumnFormulasAoa,
  STATS_TABLE_HEADER,
} from './researchAnalysisDocumentation';

type Aoa = (string | number | boolean)[][];

export const PAPER_READY_FILENAME = 'REFINE_PAPER_READY.xlsx';

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

function num(v: string | number | boolean | undefined): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  return NaN;
}

export function frontierPassRowsFromItems(items: FullExcelFileItem[]): Rq2ProviderPassRow[] {
  return buildComprehensivePassMasterRows(itemsToLoadedFiles(items));
}

export function countFrontierFiles(items: FullExcelFileItem[]): number {
  return items.filter(
    (i) =>
      i.bundle &&
      classifyResearchCohort(i.bundle, i.inCurrentSample ?? false).cohort === 'A_frontier_parallel'
  ).length;
}

export function buildAnalysisMethodsCatalogAoa(): Aoa {
  return buildStatsColumnFormulasAoa();
}

export function buildDataQualityAuditAoa(passRows: Rq2ProviderPassRow[]): Aoa {
  const files = new Set(passRows.map((r) => String(r.file_path)));
  const metrics = [
    { label: 'verify_accepted', ok: (r: Rq2ProviderPassRow) => r.verify_accepted === 'yes' || r.verify_accepted === 'no' },
    { label: 'pmd_smells_before/after', ok: (r: Rq2ProviderPassRow) => Number.isFinite(num(r.pmd_smells_before)) && Number.isFinite(num(r.pmd_smells_after)) },
    { label: 'maintainability', ok: (r: Rq2ProviderPassRow) => Number.isFinite(num(r.maintainability_before)) },
    { label: 'tokens_total', ok: (r: Rq2ProviderPassRow) => Number.isFinite(num(r.tokens_total)) },
    { label: 'semantic_preservation', ok: (r: Rq2ProviderPassRow) => Number.isFinite(num(r.semantic_preservation_pct)) },
  ];

  const okFail = { n: passRows.length, successes: passRows.filter((r) => r.ok === 'yes').length };
  const verifyKnown = passRows.filter((r) => r.verify_accepted === 'yes' || r.verify_accepted === 'no').length;

  const out: Aoa = [
    ['Data quality audit — 527 frontier cohort'],
    ['How many pass rows have valid data for each metric. Use column N in RQ1_03 to see effective sample size.'],
    [''],
    ['Cohort metric', 'Value'],
    ['Unique files', files.size],
    ['Provider pass rows', passRows.length],
    ['Expected passes (files × 3)', files.size * 3],
    ['Passes with ok=yes', okFail.successes],
    ['Passes with ok=no (failed execution)', okFail.n - okFail.successes],
    ['Passes with verify_accepted known', verifyKnown],
    [''],
    ['Metric', 'Passes with data', 'Passes missing', 'Coverage %'],
  ];

  for (const m of metrics) {
    let have = 0;
    for (const r of passRows) {
      if (m.ok(r)) have += 1;
    }
    const miss = passRows.length - have;
    out.push([m.label, have, miss, passRows.length ? ((100 * have) / passRows.length).toFixed(1) : '0']);
  }
  return out;
}

export function buildRejectionCauseSummaryAoa(passRows: Rq2ProviderPassRow[]): Aoa {
  const total = passRows.length || 1;
  const buckets = new Map<string, number>();

  for (const r of passRows) {
    let cat = 'unknown';
    if (r.ok === 'no') cat = 'execution_failed_ok_no';
    else if (r.verify_accepted === 'no') cat = 'verify_rejected';
    else if (r.verify_accepted === 'yes') cat = 'verify_accepted';
    else if (r.changed === 'no') cat = 'unchanged_output';
    else cat = 'other_or_missing_meta';
    buckets.set(cat, (buckets.get(cat) ?? 0) + 1);
  }

  const table: Aoa = [['category', 'N_passes', 'pct_of_passes', 'formula']];
  for (const [cat, n] of [...buckets.entries()].sort((a, b) => b[1] - a[1])) {
    table.push([cat, n, ((100 * n) / total).toFixed(2), 'pct = 100 × N_passes / ' + total]);
  }
  return [...buildRejectionPreambleAoa(), ...table];
}

export function buildFileMaster527Aoa(passRows: Rq2ProviderPassRow[]): Aoa {
  const byFile = new Map<string, Rq2ProviderPassRow[]>();
  for (const r of passRows) {
    const fp = String(r.file_path);
    if (!byFile.has(fp)) byFile.set(fp, []);
    byFile.get(fp)!.push(r);
  }

  const preamble: Aoa = [
    ['RQ1 — File-level summary (527 files)'],
    ['One row per file. Provider columns come from 01_Pass_Master for that file.'],
    ['mean_smell_removed = average of pmd_smells_removed across passes for this file.'],
    ['any_accepted = yes if any provider pass has verify_accepted=yes.'],
    [''],
  ];

  const header = [
    'project_name',
    'file_path',
    'file_name',
    'pass_count',
    'openai_verify',
    'google_verify',
    'anthropic_verify',
    'openai_smell_delta',
    'google_smell_delta',
    'anthropic_smell_delta',
    'mean_smell_delta',
    'any_accepted',
  ];
  const body: (string | number | boolean)[][] = [];

  for (const [fp, rows] of [...byFile.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const first = rows[0];
    const byProv: Record<string, Rq2ProviderPassRow> = {};
    for (const r of rows) {
      if (r.provider_key) byProv[String(r.provider_key)] = r;
    }
    const deltas = rows.map((r) => num(r.pmd_smells_removed)).filter(Number.isFinite);
    const anyAccepted = rows.some((r) => r.verify_accepted === 'yes') ? 'yes' : 'no';
    body.push([
      first.project_name,
      fp,
      first.file_name,
      rows.length,
      byProv.openai?.verify_accepted ?? '',
      byProv.google?.verify_accepted ?? '',
      byProv.anthropic?.verify_accepted ?? '',
      byProv.openai?.pmd_smells_removed ?? '',
      byProv.google?.pmd_smells_removed ?? '',
      byProv.anthropic?.pmd_smells_removed ?? '',
      deltas.length ? mean(deltas) : '',
      anyAccepted,
    ]);
  }
  return [...preamble, header, ...body];
}

export function buildRq1AcceptanceFrontierAoa(passRows: Rq2ProviderPassRow[]): Aoa {
  const subset = passRows.filter((r) => r.cohort === 'A_frontier_parallel');
  const base = buildAcceptanceRatesSheet(subset);
  return [...buildRq1AcceptancePreambleAoa(), ...base.slice(3)];
}

export function buildRq1EffectivenessStatsAoa(passRows: Rq2ProviderPassRow[]): Aoa {
  const core = buildRq2StatsSheet(passRows, '527_frontier_cohort');
  const dataRows = core.slice(4);
  return [
    ...buildRq1EffectivenessPreambleAoa(passRows.length),
    STATS_TABLE_HEADER,
    ...dataRows,
  ];
}

export function buildRq2ProviderComparisonAoa(passRows: Rq2ProviderPassRow[]): Aoa {
  const core = buildRq3ProviderComparisonSheet(passRows);
  return [...buildRq2PreambleAoa(), ...core.slice(2)];
}

export type PaperReadyWorkbookResult = {
  buffer: ArrayBuffer;
  filename: string;
  passRowCount: number;
  fileCount: number;
};

function addAoaSheet(
  wb: import('exceljs').Workbook,
  name: string,
  aoa: Aoa,
  options?: { freezeRow?: number; boldRows?: number[] }
): void {
  const ws = wb.addWorksheet(name.slice(0, 31));
  for (let i = 0; i < aoa.length; i += 1) {
    ws.addRow(aoa[i]);
    if (options?.boldRows?.includes(i + 1)) {
      ws.getRow(i + 1).font = { bold: true };
    }
  }
  const freeze = options?.freezeRow ?? (aoa.length > 1 ? 1 : 0);
  if (freeze > 0) ws.views = [{ state: 'frozen', ySplit: freeze }];
}

/** Find row index (1-based) of header line starting with given first cell. */
function findHeaderRow(aoa: Aoa, headerFirstCell: string): number {
  for (let i = 0; i < aoa.length; i += 1) {
    if (String(aoa[i][0] ?? '') === headerFirstCell) return i + 1;
  }
  return 1;
}

function addRq1ExcelCheckSheet(
  wb: import('exceljs').Workbook,
  passMasterSheetName: string,
  passRows: Rq2ProviderPassRow[]
): void {
  const aoa = buildRq1ExcelCheckSheetAoa(passMasterSheetName, passRows);
  const headerRow = findHeaderRow(aoa, 'Metric');
  const checkRows = buildRq1ExcelCheckRows(passMasterSheetName, passRows);
  const ws = wb.addWorksheet('RQ1_03_Excel_CHECK');
  for (let i = 0; i < aoa.length; i += 1) {
    ws.addRow(aoa[i]);
  }
  for (let i = 0; i < checkRows.length; i += 1) {
    const excelRow = headerRow + 1 + i;
    const formula = checkRows[i].formulaText.startsWith('=')
      ? checkRows[i].formulaText.slice(1)
      : checkRows[i].formulaText;
    ws.getRow(excelRow).getCell(4).value = { formula };
  }
  ws.views = [{ state: 'frozen', ySplit: headerRow }];
}

export async function buildPaperReadyWorkbook(
  frontierItems: FullExcelFileItem[],
  exportedAt: string
): Promise<PaperReadyWorkbookResult> {
  const ExcelJS = (await import('exceljs')).default;
  const passRows = frontierPassRowsFromItems(frontierItems);
  const fileCount = new Set(passRows.map((r) => String(r.file_path))).size;
  const passAoa = passRowsToAoa(passRows);

  const wb = new ExcelJS.Workbook();

  addAoaSheet(wb, '00_START_HERE', [
    ['REFINE — Paper-ready analysis (527 frontier cohort)'],
    ['Exported', exportedAt],
    ['Files', fileCount],
    ['Provider passes', passRows.length],
    [''],
    ['READ FIRST → 00_ANALYSIS_GUIDE (full plain-English guide)'],
    ['FORMULAS → 97_Stats_Column_Formulas + 98_Pass_Column_Formulas'],
    ['VERIFY → RQ1_03_Excel_Check (Excel formulas on raw pass data)'],
    [''],
    ['Tab', 'Research question', 'Use for paper'],
    ['00_ANALYSIS_GUIDE', 'Both', 'How to read every result'],
    ['97_Stats_Column_Formulas', 'Both', 'Formula for every stats column'],
    ['98_Pass_Column_Formulas', 'Both', 'Source of every pass row column'],
    ['RQ1_01_Acceptance', 'RQ1', 'Verification throughput — Wilson CI'],
    ['RQ1_02_Rejection', 'RQ1', 'Failure / rejection categories'],
    ['RQ1_03_Effectiveness_Stats', 'RQ1', 'Smell & quality paired tests — main RQ1 tables'],
    ['RQ1_03_Excel_CHECK', 'RQ1', 'Recompute means from 01_Pass_Master in Excel'],
    ['RQ1_04_File_Master', 'RQ1', '527 files × provider summary'],
    ['RQ2_01_Provider_Compare', 'RQ2', 'Friedman + pairwise Wilcoxon across LLMs'],
    ['01_Pass_Master', 'Audit', 'All pass rows — raw analysis input'],
    ['99_Data_Quality', 'Methods', 'Coverage and missing-data audit'],
  ]);

  addAoaSheet(wb, '00_ANALYSIS_GUIDE', buildMasterAnalysisGuideAoa(fileCount, passRows.length));
  addAoaSheet(wb, '97_Stats_Column_Formulas', buildStatsColumnFormulasAoa());
  addAoaSheet(wb, '98_Pass_Column_Formulas', buildPassColumnFormulasAoa());

  const passHeaderRow = findHeaderRow(passAoa, 'project_name');
  addAoaSheet(wb, '01_Pass_Master', passAoa, { freezeRow: passHeaderRow, boldRows: [passHeaderRow] });

  const rq103 = buildRq1EffectivenessStatsAoa(passRows);
  addAoaSheet(wb, 'RQ1_03_Effectiveness_Stats', rq103, {
    freezeRow: findHeaderRow(rq103, 'analysis_set'),
    boldRows: [findHeaderRow(rq103, 'analysis_set')],
  });

  addRq1ExcelCheckSheet(wb, '01_Pass_Master', passRows);

  const rq101 = buildRq1AcceptanceFrontierAoa(passRows);
  addAoaSheet(wb, 'RQ1_01_Acceptance', rq101, {
    freezeRow: findHeaderRow(rq101, 'cohort'),
    boldRows: [findHeaderRow(rq101, 'cohort')],
  });

  const rq102 = buildRejectionCauseSummaryAoa(passRows);
  addAoaSheet(wb, 'RQ1_02_Rejection', rq102, {
    freezeRow: findHeaderRow(rq102, 'category'),
    boldRows: [findHeaderRow(rq102, 'category')],
  });

  const rq104 = buildFileMaster527Aoa(passRows);
  addAoaSheet(wb, 'RQ1_04_File_Master', rq104, {
    freezeRow: findHeaderRow(rq104, 'project_name'),
    boldRows: [findHeaderRow(rq104, 'project_name')],
  });

  const rq201 = buildRq2ProviderComparisonAoa(passRows);
  addAoaSheet(wb, 'RQ2_01_Provider_Compare', rq201, { freezeRow: 1 });

  addAoaSheet(wb, '99_Data_Quality', buildDataQualityAuditAoa(passRows));

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return {
    buffer,
    filename: PAPER_READY_FILENAME,
    passRowCount: passRows.length,
    fileCount,
  };
}

export function paperReadySheetsToCsvMap(
  frontierItems: FullExcelFileItem[],
  exportedAt: string
): Record<string, Aoa> {
  const passRows = frontierPassRowsFromItems(frontierItems);
  const fileCount = new Set(passRows.map((r) => String(r.file_path))).size;
  return {
    '00_ANALYSIS_GUIDE.csv': buildMasterAnalysisGuideAoa(fileCount, passRows.length),
    '97_Stats_Column_Formulas.csv': buildStatsColumnFormulasAoa(),
    '98_Pass_Column_Formulas.csv': buildPassColumnFormulasAoa(),
    'RQ1_01_Acceptance.csv': buildRq1AcceptanceFrontierAoa(passRows),
    'RQ1_02_Rejection.csv': buildRejectionCauseSummaryAoa(passRows),
    'RQ1_03_Effectiveness_Stats.csv': buildRq1EffectivenessStatsAoa(passRows),
    'RQ1_03_Excel_Check.csv': buildRq1ExcelCheckSheetAoa('01_Pass_Master', passRows),
    'RQ1_04_File_Master.csv': buildFileMaster527Aoa(passRows),
    'RQ2_01_Provider_Compare.csv': buildRq2ProviderComparisonAoa(passRows),
    '01_Pass_Master.csv': passRowsToAoa(passRows),
    '99_Data_Quality.csv': buildDataQualityAuditAoa(passRows),
    'export_meta.csv': [
      ['exported_at', exportedAt],
      ['files', fileCount],
      ['pass_rows', passRows.length],
    ],
  };
}

export function aoaToCsv(aoa: Aoa): string {
  return aoa
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '');
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
    .join('\n');
}
