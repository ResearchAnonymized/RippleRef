/**
 * Full research Excel workbook: 15 metric sections, master sheet, stats formulas, per-file tabs.
 */

import ExcelJS from 'exceljs';
import type { SavedRefactoringReportBundle } from './savedRefactoringReport';
import { buildResearchMetricsSheetCsv } from './exportResearchMetricsCsv';
import {
  PROVENANCE_COLUMNS,
  extractBehavioralWide,
  extractComparisonWide,
  extractDiffChurnWide,
  extractGroupWide,
  extractNarrativeRows,
  extractPipelineWide,
  extractPracticeRows,
  extractSemanticWide,
  extractSmellTypeRows,
  extractStructuralWide,
  extractTokenWide,
  longRowsToSheetData,
  researchPayloadFromBundle,
  rowsToSheetData,
  type FileMetricContext,
} from './researchMetricSections';
import {
  cohensD,
  confidenceInterval95,
  mean,
  median,
  stdDevSample,
  wilcoxonSignedRankP,
} from './statisticalTests';
import { buildPaperWideRow, type ExportCandidate, type PaperWideRow } from './exportProjectRefactoringExcel';
import { isRefineDemo } from './refineDemoMode';
import { extractMultiLlmPassRows, extractMultiLlmWideColumns, multiLlmPassRowsToAoa, buildMultiLlmMetricsLongAoa, extractMultiLlmAgentStepRows, agentStepRowsToAoa, buildMultiLlmComparisonWideAoa } from './multiLlmExport';
import {
  buildBehavioralPassTestRowsFromItems,
  buildVerificationGateRowsFromItems,
  behavioralPassTestWideFromRows,
  behavioralPassTestRowsToAoa,
  verificationGateRowsToAoa,
} from './behavioralPassTestExport';
import { RESEARCH_EXCEL_SHEETS } from './researchExcelCatalog';
import { extractCohortWideColumns } from './researchExportCohort';
import { buildResearchAnalysisSheets } from './researchStatisticalAnalysis';

export type FullExcelFileItem = {
  filePath: string;
  fileName: string;
  bundle: SavedRefactoringReportBundle | null;
  savedReportId?: string;
  missingReason?: string;
  candidate: ExportCandidate;
  /** Locked research-sample manifest membership */
  inCurrentSample?: boolean;
  /** Override for cross-project exports */
  projectName?: string;
  sourceFolder?: string;
  workspaceId?: string;
};

export type FullExcelBuildInput = {
  workspaceId: string;
  projectName: string;
  sourceFolder: string;
  researchSampleId?: string;
  items: FullExcelFileItem[];
  includePerFileSheets?: boolean;
  completenessNotes?: string[];
  addProjectSummarySheets?: boolean;
  /** Add sheets 24–30 with RQ2/RQ3 statistical tests (master / cross-project export). */
  includeResearchAnalysisSheets?: boolean;
  /** Supplementary demo: neutral labels, no RQ analysis sheets. */
  demoMode?: boolean;
};

function formatTs(ms?: number): string {
  if (!ms || ms <= 0) return '';
  try {
    return new Date(ms).toISOString();
  } catch {
    return String(ms);
  }
}

function excelSheetName(filePath: string, used: Set<string>): string {
  const base =
    filePath.replace(/\\/g, '/').split('/').pop()?.replace(/[:\\/?*[\]]/g, '_') || 'file';
  let name = base.slice(0, 31);
  let candidate = name;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = `_${i}`;
    candidate = (name.slice(0, Math.max(1, 31 - suffix.length)) + suffix).slice(0, 31);
    i += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function ctxFromItem(input: FullExcelBuildInput, item: FullExcelFileItem): FileMetricContext {
  return {
    projectName: item.projectName ?? input.projectName,
    sourceFolder: item.sourceFolder ?? input.sourceFolder,
    workspaceId: item.workspaceId ?? input.workspaceId,
    filePath: item.filePath,
    fileName: item.fileName,
    savedReportId: item.savedReportId ?? '',
    savedAtIso: item.bundle ? formatTs(item.bundle.savedAt) : formatTs(item.candidate.savedAt),
    hasFullSavedReport: !!item.bundle,
    missingReason: item.missingReason ?? '',
  };
}

function addAoaSheet(
  wb: ExcelJS.Workbook,
  name: string,
  aoa: (string | number | boolean)[][],
  freezeHeader = true
): void {
  const ws = wb.addWorksheet(name.slice(0, 31));
  for (const row of aoa) ws.addRow(row);
  if (freezeHeader && aoa.length > 1) ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.getRow(1).font = { bold: true };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function buildMetricsLongAoa(
  input: FullExcelBuildInput,
  exportedAt: string
): (string | number | boolean)[][] {
  const header = [
    'project_name',
    'source_folder',
    'workspace_id',
    'file_path',
    'exported_at',
    'section',
    'subgroup',
    'metric_key',
    'metric_label',
    'before',
    'after',
    'change',
    'improved',
    'extra',
  ];
  const rows: (string | number | boolean)[][] = [header];
  for (const item of input.items) {
    const rm = researchPayloadFromBundle(item.bundle);
    if (!rm) continue;
    const csv = buildResearchMetricsSheetCsv({
      workspaceId: input.workspaceId,
      filePath: item.filePath,
      exportedAtIso: exportedAt,
      metrics: rm,
      pipelineMetadata: item.bundle?.pipelineMetadata as Record<string, unknown> | null,
    });
    for (const line of csv.split(/\r?\n/).slice(1)) {
      if (!line.trim()) continue;
      const cells = parseCsvLine(line);
      if (cells.length < 12) continue;
      rows.push([
        input.projectName,
        input.sourceFolder,
        cells[0],
        cells[1],
        cells[2],
        cells[3],
        cells[4],
        cells[5],
        cells[6],
        cells[7],
        cells[8],
        cells[9],
        cells[10],
        cells[11],
      ]);
    }
  }
  if (rows.length === 1) rows.push(['', '', '', '', '', 'note', '', '', 'no_metrics', '', '', '', '', '']);
  return rows;
}

function allocateSheetNames(items: FullExcelFileItem[]): Map<string, string> {
  const used = new Set<string>();
  const map = new Map<string, string>();
  for (const item of items) {
    map.set(item.filePath, excelSheetName(item.filePath, used));
  }
  return map;
}

function buildMasterRows(input: FullExcelBuildInput, sheetNames: Map<string, string>): PaperWideRow[] {
  const rows: PaperWideRow[] = [];
  for (const item of input.items) {
    const sheetName = sheetNames.get(item.filePath) ?? item.fileName;
    const ctx = ctxFromItem(input, item);
    const base = buildPaperWideRow(item.bundle, item.candidate, sheetName, {
      workspaceId: ctx.workspaceId,
      projectName: ctx.projectName,
      researchSampleId: input.researchSampleId,
    });
    const rm = researchPayloadFromBundle(item.bundle);
    rows.push({
      ...base,
      ...extractCohortWideColumns(item.bundle, item.inCurrentSample ?? false),
      ...extractMultiLlmWideColumns(item.bundle),
      source_folder: ctx.sourceFolder,
      saved_report_id: item.savedReportId ?? '',
      missing_reason: item.missingReason ?? '',
      practices_applied_long: (rm?.practices_applied ?? []).join(' | '),
      key_achievements_long: (rm?.summary?.key_achievements ?? []).join(' | '),
      concerns_long: (rm?.summary?.concerns ?? []).join(' | '),
    });
  }
  return rows;
}

function masterToAoa(rows: PaperWideRow[]): (string | number | boolean)[][] {
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const priority = [
    'project_name',
    'source_folder',
    'workspace_id',
    'cohort',
    'model_tier',
    'multi_llm_mode',
    'in_current_sample',
    'sample_id',
    'research_sample_id',
    'file_path',
    'file_name',
    'saved_report_id',
    'saved_at_iso',
    'has_full_saved_report',
    'missing_reason',
    'verify_accepted',
    'overall_score',
    'pmd_smells_before',
    'pmd_smells_after',
    'pmd_smells_remaining',
    'pmd_smells_removed',
    'pmd_smells_reduction_pct',
    'pmd_smells_delta',
    'pmd_smells_source',
    'llm_openai_smells_before',
    'llm_openai_smells_after',
    'llm_openai_smells_removed',
    'llm_openai_smells_reduction_pct',
    'llm_google_smells_before',
    'llm_google_smells_after',
    'llm_google_smells_removed',
    'llm_google_smells_reduction_pct',
    'llm_anthropic_smells_before',
    'llm_anthropic_smells_after',
    'llm_anthropic_smells_removed',
    'llm_anthropic_smells_reduction_pct',
  ];
  const ordered = [
    ...priority.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !priority.includes(k)),
  ];
  return [ordered, ...rows.map((r) => ordered.map((k) => r[k] ?? ''))];
}

function colLetter(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function findCol(headers: string[], name: string): number {
  const idx = headers.indexOf(name);
  return idx >= 0 ? idx + 1 : -1;
}

function buildProjectStatsSheet(wb: ExcelJS.Workbook, masterHeaders: string[], dataRows: number): void {
  const ws = wb.addWorksheet('22_Project_Stats');
  const last = dataRows + 1;
  ws.addRow(['Statistic', 'Value']);
  ws.getRow(1).font = { bold: true };
  const addF = (label: string, formula: string) => {
    const row = ws.addRow([label, '']);
    row.getCell(2).value = { formula };
  };
  addF('Files (N)', `=COUNTA('01_Files_Master'!D2:D${last})`);
  const smellDeltaCol = findCol(masterHeaders, 'pmd_smells_delta');
  if (smellDeltaCol > 0) {
    const c = colLetter(smellDeltaCol);
    addF('Mean smell delta', `=AVERAGE('01_Files_Master'!${c}2:${c}${last})`);
    addF('Median smell delta', `=MEDIAN('01_Files_Master'!${c}2:${c}${last})`);
    addF('Std dev smell delta', `=STDEV.S('01_Files_Master'!${c}2:${c}${last})`);
  }
  const scoreCol = findCol(masterHeaders, 'overall_score');
  if (scoreCol > 0) {
    addF('Mean overall score', `=AVERAGE('01_Files_Master'!${colLetter(scoreCol)}2:${colLetter(scoreCol)}${last})`);
  }
  const fullCol = findCol(masterHeaders, 'has_full_saved_report');
  if (fullCol > 0) {
    const c = colLetter(fullCol);
    addF('Files with full report', `=COUNTIF('01_Files_Master'!${c}2:${c}${last},"yes")`);
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function buildStatisticalTestsSheet(
  wb: ExcelJS.Workbook,
  masterRows: PaperWideRow[],
  masterHeaders: string[]
): void {
  const ws = wb.addWorksheet('23_Statistical_Tests');
  ws.addRow([
    'Metric',
    'N',
    'Mean before',
    'Mean after',
    'Mean delta',
    'Median delta',
    'Std dev delta',
    "Cohen's d",
    'Wilcoxon p',
    'CI 95% low',
    'CI 95% high',
    'Paired t-test p (Excel)',
  ]);
  ws.getRow(1).font = { bold: true };
  const last = masterRows.length + 1;
  const tests = [
    { label: 'PMD smells', b: 'pmd_smells_before', a: 'pmd_smells_after' },
    { label: 'LOC', b: 'loc_before', a: 'loc_after' },
    { label: 'Complexity', b: 'complexity_before', a: 'complexity_after' },
    { label: 'Maintainability', b: 'maintainability_before', a: 'maintainability_after' },
    { label: 'Testability', b: 'testability_before', a: 'testability_after' },
  ];
  for (const t of tests) {
    const bCol = findCol(masterHeaders, t.b);
    const aCol = findCol(masterHeaders, t.a);
    if (bCol < 0 || aCol < 0) continue;
    const before = masterRows.map((r) => Number(r[t.b])).filter(Number.isFinite);
    const after = masterRows.map((r) => Number(r[t.a])).filter(Number.isFinite);
    const n = Math.min(before.length, after.length);
    const deltas = before.slice(0, n).map((b, i) => after[i] - b);
    const ci = confidenceInterval95(deltas);
    const row = ws.addRow([
      t.label,
      n,
      mean(before),
      mean(after),
      mean(deltas),
      median(deltas),
      stdDevSample(deltas),
      cohensD(deltas),
      wilcoxonSignedRankP(before.slice(0, n), after.slice(0, n)),
      ci.low,
      ci.high,
      '',
    ]);
    row.getCell(12).value = {
      formula: `=T.TEST('01_Files_Master'!${colLetter(bCol)}2:${colLetter(bCol)}${last},'01_Files_Master'!${colLetter(aCol)}2:${colLetter(aCol)}${last},2,1)`,
    };
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function buildReadMeAoa(
  input: FullExcelBuildInput,
  exportedAt: string,
  stats: { total: number; withReport: number; missing: number }
): (string | number | boolean)[][] {
  const notes = input.completenessNotes ?? [];
  const demo = input.demoMode ?? isRefineDemo();
  const catalog = demo
    ? RESEARCH_EXCEL_SHEETS.filter(
        (s) => !/^2[4-9]_|^30_/.test(s.name) && !/RQ/i.test(s.name)
      )
    : RESEARCH_EXCEL_SHEETS;
  return [
    [demo ? 'REFINE — Refactoring metrics export' : 'RefactAI — Full research metrics export'],
    ['Project (registry)', input.projectName],
    ['Source folder', input.sourceFolder],
    ['Workspace', input.workspaceId],
    ['Exported', exportedAt],
    ['Files', stats.total],
    ['Full reports', stats.withReport],
    ['Missing/incomplete', stats.missing],
    [''],
    ['Data policy: all values from saved-reports JSON — never invented at export time.'],
    [''],
    ['Sheet index'],
    ['Sheet', 'Contents', 'Source'],
    ...catalog.map((s) => [s.name, s.description, s.dataSource]),
    [''],
    ['Per-file tabs', 'Comparison summary for each exported file', 'saved_report'],
    ['P_<project>', 'Cross-project only: per-project comparison slice', 'saved_report'],
    ...(notes.length ? [['Notes'], ...notes.map((n) => ['', n])] : []),
  ];
}

function buildFileDetailAoa(bundle: SavedRefactoringReportBundle): (string | number | boolean)[][] {
  const rm = researchPayloadFromBundle(bundle);
  const rows: (string | number | boolean)[][] = [
    ['Per-file detail', bundle.filePath],
    ['Saved', formatTs(bundle.savedAt)],
    [''],
  ];
  if (rm?.comparison) {
    rows.push(['BEFORE / AFTER'], ['Metric', 'Before', 'After', 'Change']);
    for (const [k, d] of Object.entries(rm.comparison)) {
      if (d) rows.push([k, d.before, d.after, d.change]);
    }
  }
  return rows;
}

export async function buildFullResearchWorkbook(input: FullExcelBuildInput): Promise<ArrayBuffer> {
  const demo = input.demoMode ?? isRefineDemo();
  const effectiveInput: FullExcelBuildInput = demo
    ? { ...input, demoMode: true, includeResearchAnalysisSheets: false }
    : input;
  const wb = new ExcelJS.Workbook();
  const exportedAt = new Date().toISOString();
  const sheetNames = allocateSheetNames(effectiveInput.items);
  const masterRows = buildMasterRows(effectiveInput, sheetNames);
  const masterAoa = masterToAoa(masterRows);
  const masterHeaders = masterAoa[0].map(String);
  const withReport = effectiveInput.items.filter((i) => i.bundle).length;

  addAoaSheet(wb, '00_ReadMe', buildReadMeAoa(effectiveInput, exportedAt, {
    total: effectiveInput.items.length,
    withReport,
    missing: effectiveInput.items.length - withReport,
  }));
  addAoaSheet(wb, '01_Files_Master', masterAoa);
  addAoaSheet(
    wb,
    '02_Before_After',
    rowsToSheetData(effectiveInput.items.map((i) => extractComparisonWide(ctxFromItem(effectiveInput, i), researchPayloadFromBundle(i.bundle))))
  );
  addAoaSheet(
    wb,
    '03_Behavioral',
    rowsToSheetData(effectiveInput.items.map((i) => extractBehavioralWide(ctxFromItem(effectiveInput, i), researchPayloadFromBundle(i.bundle))))
  );
  const behavioralPassRows = buildBehavioralPassTestRowsFromItems(
    input.projectName,
    input.workspaceId,
    input.sourceFolder,
    input.items
  );
  addAoaSheet(wb, '03b_Behavioral_Pass_Test', behavioralPassTestRowsToAoa(behavioralPassRows));
  addAoaSheet(
    wb,
    '03c_Behavioral_Pass_Wide',
    rowsToSheetData(behavioralPassTestWideFromRows(behavioralPassRows))
  );
  addAoaSheet(
    wb,
    '03d_Verification_Gates',
    verificationGateRowsToAoa(
      buildVerificationGateRowsFromItems(input.projectName, input.workspaceId, input.items)
    )
  );
  addAoaSheet(
    wb,
    '04_Structural',
    rowsToSheetData(input.items.map((i) => extractStructuralWide(ctxFromItem(input, i), researchPayloadFromBundle(i.bundle))))
  );
  addAoaSheet(
    wb,
    '05_Practices',
    longRowsToSheetData(
      input.items.flatMap((i) =>
        extractPracticeRows(ctxFromItem(input, i), researchPayloadFromBundle(i.bundle)).map((r) => ({
          project_name: r.projectName,
          file_path: r.filePath,
          practice_index: r.practice_index,
          practice: r.practice,
        }))
      )
    )
  );
  addAoaSheet(
    wb,
    '06_Narrative',
    longRowsToSheetData(
      input.items.flatMap((i) =>
        extractNarrativeRows(ctxFromItem(input, i), researchPayloadFromBundle(i.bundle)).map((r) => ({
          project_name: r.projectName,
          file_path: r.filePath,
          narrative_kind: r.narrative_kind,
          text: r.text,
        }))
      )
    )
  );
  addAoaSheet(wb, '07_Halstead', rowsToSheetData(input.items.map((i) => extractGroupWide(ctxFromItem(input, i), researchPayloadFromBundle(i.bundle), 'halstead'))));
  addAoaSheet(wb, '08_Method_Length', rowsToSheetData(input.items.map((i) => extractGroupWide(ctxFromItem(input, i), researchPayloadFromBundle(i.bundle), 'method_lengths'))));
  addAoaSheet(wb, '09_Nesting', rowsToSheetData(input.items.map((i) => extractGroupWide(ctxFromItem(input, i), researchPayloadFromBundle(i.bundle), 'nesting_depth'))));
  addAoaSheet(wb, '10_Coupling', rowsToSheetData(input.items.map((i) => extractGroupWide(ctxFromItem(input, i), researchPayloadFromBundle(i.bundle), 'coupling'))));
  addAoaSheet(wb, '11_Cohesion', rowsToSheetData(input.items.map((i) => extractGroupWide(ctxFromItem(input, i), researchPayloadFromBundle(i.bundle), 'cohesion'))));
  addAoaSheet(wb, '12_Diff_Churn', rowsToSheetData(input.items.map((i) => extractDiffChurnWide(ctxFromItem(input, i), researchPayloadFromBundle(i.bundle)))));
  addAoaSheet(wb, '13_Semantic', rowsToSheetData(input.items.map((i) => extractSemanticWide(ctxFromItem(input, i), researchPayloadFromBundle(i.bundle)))));
  addAoaSheet(wb, '14_Tokens', rowsToSheetData(input.items.map((i) => extractTokenWide(ctxFromItem(input, i), researchPayloadFromBundle(i.bundle)))));
  addAoaSheet(
    wb,
    '15_Smell_By_Type',
    longRowsToSheetData(
      input.items.flatMap((i) =>
        extractSmellTypeRows(ctxFromItem(input, i), researchPayloadFromBundle(i.bundle)).map((r) => ({
          project_name: r.projectName,
          file_path: r.filePath,
          smell_type: r.smell_type,
          before: r.before,
          after: r.after,
          resolved: r.resolved,
          resolution_rate: r.resolution_rate,
        }))
      )
    )
  );
  addAoaSheet(wb, '16_Pipeline', rowsToSheetData(input.items.map((i) => extractPipelineWide(ctxFromItem(input, i), i.bundle))));
  addAoaSheet(
    wb,
    '17_Multi_LLM_Passes',
    multiLlmPassRowsToAoa(
      input.items.flatMap((item) =>
        extractMultiLlmPassRows(
          {
            projectName: item.projectName ?? input.projectName,
            workspaceId: item.workspaceId ?? input.workspaceId,
            filePath: item.filePath,
            fileName: item.fileName,
          },
          item.bundle
        )
      )
    )
  );
  addAoaSheet(
    wb,
    '18_Multi_LLM_Agent_Steps',
    agentStepRowsToAoa(
      input.items.flatMap((item) =>
        extractMultiLlmAgentStepRows(
          {
            projectName: item.projectName ?? input.projectName,
            workspaceId: item.workspaceId ?? input.workspaceId,
            filePath: item.filePath,
            fileName: item.fileName,
          },
          item.bundle
        )
      )
    )
  );
  addAoaSheet(
    wb,
    '19_Multi_LLM_Comparison_Wide',
    buildMultiLlmComparisonWideAoa({
      projectName: input.projectName,
      sourceFolder: input.sourceFolder,
      workspaceId: input.workspaceId,
      items: input.items.map((item) => ({
        filePath: item.filePath,
        fileName: item.fileName,
        bundle: item.bundle,
      })),
    })
  );
  addAoaSheet(
    wb,
    '20_Multi_LLM_Metrics_Long',
    buildMultiLlmMetricsLongAoa({
      projectName: input.projectName,
      sourceFolder: input.sourceFolder,
      workspaceId: input.workspaceId,
      items: input.items.map((item) => ({
        filePath: item.filePath,
        fileName: item.fileName,
        bundle: item.bundle,
      })),
      exportedAtIso: exportedAt,
    })
  );
  addAoaSheet(wb, '21_Metrics_Long', buildMetricsLongAoa(input, exportedAt));

  if (input.items.length > 0) {
    buildProjectStatsSheet(wb, masterHeaders, input.items.length);
    buildStatisticalTestsSheet(wb, masterRows, masterHeaders);
  }

  if (effectiveInput.includeResearchAnalysisSheets) {
    const analysis = buildResearchAnalysisSheets(effectiveInput.items, exportedAt);
    addAoaSheet(wb, '24_RQ2_Stats_Primary', analysis.rq2Primary);
    addAoaSheet(wb, '25_RQ2_Stats_Extended', analysis.rq2Extended);
    addAoaSheet(wb, '26_RQ3_Provider_Comparison', analysis.rq3Provider);
    addAoaSheet(wb, '27_Cohort_A_vs_B', analysis.cohortAvsB);
    addAoaSheet(wb, '28_Acceptance_Rates', analysis.acceptanceRates);
    addAoaSheet(wb, '29_Analysis_ReadMe', analysis.analysisReadMe);
    addAoaSheet(wb, '30_RQ2_Pass_Data', analysis.passDataPrimary);
  }

  if (input.addProjectSummarySheets) {
    const byProject = new Map<string, FullExcelFileItem[]>();
    for (const item of input.items) {
      const pn = item.projectName ?? input.projectName;
      if (!byProject.has(pn)) byProject.set(pn, []);
      byProject.get(pn)!.push(item);
    }
    for (const [pn, group] of Array.from(byProject.entries())) {
      const safe = `P_${pn.replace(/[^a-zA-Z0-9._-]+/g, '_')}`.slice(0, 31);
      const sliceInput = { ...input, projectName: pn, items: group };
      addAoaSheet(
        wb,
        safe,
        rowsToSheetData(
          group.map((i: FullExcelFileItem) =>
            extractComparisonWide(ctxFromItem(sliceInput, i), researchPayloadFromBundle(i.bundle))
          )
        )
      );
    }
  }

  if (input.includePerFileSheets !== false) {
    for (const item of input.items) {
      if (!item.bundle) continue;
      const name = sheetNames.get(item.filePath);
      if (!name) continue;
      addAoaSheet(wb, name, buildFileDetailAoa(item.bundle), false);
    }
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export function defaultProjectExcelFilename(projectName: string): string {
  const slug = projectName.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const date = new Date().toISOString().slice(0, 10);
  if (isRefineDemo()) {
    return `refine-${slug}-metrics-${date}.xlsx`;
  }
  return `refactai-${slug}-research-${date}.xlsx`;
}

export function defaultCrossProjectExcelFilename(): string {
  const date = new Date().toISOString().slice(0, 10);
  if (isRefineDemo()) {
    return `refine-all-projects-metrics-${date}.xlsx`;
  }
  return `refactai-all-projects-research-${date}.xlsx`;
}
