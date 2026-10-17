/**
 * RQ2/RQ3 statistical analysis sheets for master Excel workbook.
 */

import type { FullExcelFileItem } from './buildFullResearchExcel';
import type { LoadedResearchFile } from './researchDatasetLoader';
import {
  buildRq2ProviderPassRows,
  filterRq2ExtendedPassRows,
  filterRq2PrimaryPassRows,
  type Rq2ProviderPassRow,
} from './researchAnalysisExports';
import { MULTI_LLM_PROVIDERS } from './multiLlmExport';
import {
  buildBalancedNSummaryAoa,
  filterBalancedCompletePassRows,
  summarizeBalancedCohort,
} from './researchCompleteCase';
import {
  cohensD,
  cohensDIndependent,
  confidenceInterval95,
  fmtNum,
  fmtP,
  friedmanTest,
  holmAdjust,
  mannWhitneyUP,
  mean,
  median,
  pairedTTestP,
  pctImproved,
  wilcoxonOneSampleP,
  wilcoxonSignedRankP,
  wilsonInterval,
} from './statisticalTests';
import { orderPassExportRows } from './passExportColumnOrder';

type Aoa = (string | number | boolean)[][];

function num(v: string | number | boolean | undefined): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  return NaN;
}

function yesRate(rows: Rq2ProviderPassRow[], field: string): { n: number; successes: number } {
  let n = 0;
  let successes = 0;
  for (const r of rows) {
    const v = r[field];
    if (v === 'yes' || v === 'no') {
      n += 1;
      if (v === 'yes') successes += 1;
    }
  }
  return { n, successes };
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

type PairedMetric = {
  label: string;
  beforeKey: keyof Rq2ProviderPassRow;
  afterKey: keyof Rq2ProviderPassRow;
  lowerIsBetter?: boolean;
};

const PAIRED_METRICS: PairedMetric[] = [
  { label: 'PMD smells', beforeKey: 'pmd_smells_before', afterKey: 'pmd_smells_after', lowerIsBetter: true },
  { label: 'Complexity', beforeKey: 'complexity_before', afterKey: 'complexity_after', lowerIsBetter: true },
  { label: 'Maintainability', beforeKey: 'maintainability_before', afterKey: 'maintainability_after', lowerIsBetter: false },
  { label: 'Testability', beforeKey: 'testability_before', afterKey: 'testability_after', lowerIsBetter: false },
  { label: 'LOC', beforeKey: 'loc_before', afterKey: 'loc_after', lowerIsBetter: true },
];

const DELTA_METRICS: { label: string; key: keyof Rq2ProviderPassRow; lowerIsBetter: boolean }[] = [
  { label: 'PMD smells removed', key: 'pmd_smells_removed', lowerIsBetter: false },
  { label: 'PMD smell reduction %', key: 'pmd_smells_reduction_pct', lowerIsBetter: false },
  { label: 'Smell delta (run)', key: 'smell_delta', lowerIsBetter: true },
  { label: 'LOC delta', key: 'loc_delta', lowerIsBetter: true },
  { label: 'Overall score', key: 'overall_score', lowerIsBetter: false },
  { label: 'Smell resolution %', key: 'smell_resolution_rate_pct', lowerIsBetter: false },
];

function filterProvider(rows: Rq2ProviderPassRow[], provider: string): Rq2ProviderPassRow[] {
  if (provider === 'ALL') return rows;
  return rows.filter((r) => r.provider_key === provider);
}

function pairedAnalysisRow(
  analysisSet: string,
  provider: string,
  metric: PairedMetric,
  rows: Rq2ProviderPassRow[]
): (string | number | boolean)[] {
  const before: number[] = [];
  const after: number[] = [];
  const deltas: number[] = [];
  for (const r of rows) {
    const b = num(r[metric.beforeKey]);
    const a = num(r[metric.afterKey]);
    if (Number.isFinite(b) && Number.isFinite(a)) {
      before.push(b);
      after.push(a);
      deltas.push(a - b);
    }
  }
  const ci = confidenceInterval95(deltas);
  const lower = metric.lowerIsBetter !== false;
  return [
    analysisSet,
    provider,
    metric.label,
    'paired_before_after',
    deltas.length,
    fmtNum(mean(before)),
    fmtNum(mean(after)),
    fmtNum(mean(deltas)),
    fmtNum(median(deltas)),
    fmtNum(pctImproved(deltas, lower)),
    fmtNum(cohensD(deltas)),
    fmtP(wilcoxonSignedRankP(before, after)),
    fmtP(pairedTTestP(before, after)),
    fmtNum(ci.low),
    fmtNum(ci.high),
  ];
}

function deltaAnalysisRow(
  analysisSet: string,
  provider: string,
  metric: { label: string; key: keyof Rq2ProviderPassRow; lowerIsBetter: boolean },
  rows: Rq2ProviderPassRow[]
): (string | number | boolean)[] {
  const deltas = rows.map((r) => num(r[metric.key])).filter(Number.isFinite);
  const ci = confidenceInterval95(deltas);
  return [
    analysisSet,
    provider,
    metric.label,
    'one_sample_delta',
    deltas.length,
    '',
    '',
    fmtNum(mean(deltas)),
    fmtNum(median(deltas)),
    fmtNum(pctImproved(deltas, metric.lowerIsBetter)),
    fmtNum(cohensD(deltas)),
    fmtP(wilcoxonOneSampleP(deltas)),
    '',
    fmtNum(ci.low),
    fmtNum(ci.high),
  ];
}

const RQ2_HEADER = [
  'analysis_set',
  'provider',
  'metric',
  'test_type',
  'N',
  'mean_before',
  'mean_after',
  'mean_delta',
  'median_delta',
  'pct_improved',
  'cohens_d',
  'wilcoxon_p',
  'paired_t_p',
  'ci95_low',
  'ci95_high',
];

export function buildRq2StatsSheet(rows: Rq2ProviderPassRow[], analysisSet: string): Aoa {
  const out: Aoa = [
    [`RQ2 — Paired before/after tests (${analysisSet})`],
    ['Unit: provider pass row. Primary = cohort A + in_current_sample. Wilcoxon = main; paired t = sensitivity.'],
    [''],
    RQ2_HEADER,
  ];
  const providers = [...MULTI_LLM_PROVIDERS, 'ALL'];
  for (const provider of providers) {
    const subset = filterProvider(rows, provider);
    for (const m of PAIRED_METRICS) {
      out.push(pairedAnalysisRow(analysisSet, provider, m, subset));
    }
    for (const m of DELTA_METRICS) {
      out.push(deltaAnalysisRow(analysisSet, provider, m, subset));
    }
  }
  return out;
}

function pivotByFile(
  rows: Rq2ProviderPassRow[],
  valueKey: keyof Rq2ProviderPassRow
): Map<string, Record<string, number>> {
  const map = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const fp = String(r.file_path);
    const pk = String(r.provider_key);
    if (!pk) continue;
    const v = num(r[valueKey]);
    if (!Number.isFinite(v)) continue;
    if (!map.has(fp)) map.set(fp, {});
    map.get(fp)![pk] = v;
  }
  return map;
}

function blocksForProviders(
  pivot: Map<string, Record<string, number>>,
  providers: readonly string[]
): number[][] {
  const blocks: number[][] = [];
  for (const vals of pivot.values()) {
    const row = providers.map((p) => vals[p]).filter((v) => v !== undefined);
    if (row.length === providers.length && row.every(Number.isFinite)) {
      blocks.push(row as number[]);
    }
  }
  return blocks;
}

function pairedProviderValues(
  pivot: Map<string, Record<string, number>>,
  a: string,
  b: string
): { va: number[]; vb: number[] } {
  const va: number[] = [];
  const vb: number[] = [];
  for (const vals of pivot.values()) {
    const x = vals[a];
    const y = vals[b];
    if (Number.isFinite(x) && Number.isFinite(y)) {
      va.push(x);
      vb.push(y);
    }
  }
  return { va, vb };
}

export function buildRq3ProviderComparisonSheet(primaryRows: Rq2ProviderPassRow[]): Aoa {
  const out: Aoa = [
    ['RQ3 — Cross-provider comparison (primary sample, cohort A, same files)'],
    ['Friedman: same file × 3 providers. Pairwise Wilcoxon with Holm correction across 3 pairs × metrics.'],
    [''],
    ['--- Friedman test (related samples, k=3 providers) ---'],
    ['metric', 'N_files', 'chi2', 'df', 'friedman_p'],
  ];

  const pairwiseRows: (string | number | boolean)[][] = [];
  const rawPs: number[] = [];

  for (const m of DELTA_METRICS) {
    const pivot = pivotByFile(primaryRows, m.key);
    const blocks = blocksForProviders(pivot, MULTI_LLM_PROVIDERS);
    const fr = friedmanTest(blocks);
    out.push([m.label, fr.n, fmtNum(fr.chi2), fr.df, fmtP(fr.p)]);

    for (let i = 0; i < MULTI_LLM_PROVIDERS.length; i += 1) {
      for (let j = i + 1; j < MULTI_LLM_PROVIDERS.length; j += 1) {
        const a = MULTI_LLM_PROVIDERS[i];
        const b = MULTI_LLM_PROVIDERS[j];
        const { va, vb } = pairedProviderValues(pivot, a, b);
        const p = wilcoxonSignedRankP(va, vb);
        rawPs.push(p);
        pairwiseRows.push([
          m.label,
          a,
          b,
          va.length,
          fmtNum(median(va)),
          fmtNum(median(vb)),
          fmtP(p),
          '',
        ]);
      }
    }
  }

  const holm = holmAdjust(rawPs);
  for (let i = 0; i < pairwiseRows.length; i += 1) {
    pairwiseRows[i][7] = fmtP(holm[i]);
  }

  out.push(['']);
  out.push(['--- Pairwise Wilcoxon (same file, provider A vs B) ---']);
  out.push(['metric', 'provider_a', 'provider_b', 'N_pairs', 'median_a', 'median_b', 'wilcoxon_p', 'holm_adj_p']);
  out.push(...pairwiseRows);
  return out;
}

export function buildCohortAvsBSheet(extendedRows: Rq2ProviderPassRow[]): Aoa {
  const out: Aoa = [
    ['Cohort A (frontier parallel) vs B (legacy chain) — unpaired pass-level comparison'],
    ['Different files between cohorts: distribution comparison only (Mann–Whitney U).'],
    [''],
    ['metric', 'cohort_a_n', 'cohort_b_n', 'median_a', 'median_b', 'mean_a', 'mean_b', 'mann_whitney_p', 'cohens_d'],
  ];

  const cohortA = extendedRows.filter((r) => r.cohort === 'A_frontier_parallel');
  const cohortB = extendedRows.filter((r) => r.cohort === 'B_legacy_chain_non_frontier');

  for (const m of DELTA_METRICS) {
    const va = cohortA.map((r) => num(r[m.key])).filter(Number.isFinite);
    const vb = cohortB.map((r) => num(r[m.key])).filter(Number.isFinite);
    out.push([
      m.label,
      va.length,
      vb.length,
      fmtNum(median(va)),
      fmtNum(median(vb)),
      fmtNum(mean(va)),
      fmtNum(mean(vb)),
      fmtP(mannWhitneyUP(va, vb)),
      fmtNum(cohensDIndependent(va, vb)),
    ]);
  }

  out.push(['']);
  out.push(['--- Acceptance rates (Wilson 95% CI by cohort) ---']);
  out.push(['outcome', 'cohort_a_n', 'cohort_a_rate_pct', 'cohort_b_n', 'cohort_b_rate_pct', 'wilson_a_low', 'wilson_a_high', 'wilson_b_low', 'wilson_b_high']);

  for (const field of ['verify_accepted', 'changed', 'ok'] as const) {
    const ra = yesRate(cohortA, field);
    const rb = yesRate(cohortB, field);
    const wa = wilsonInterval(ra.successes, ra.n);
    const wb = wilsonInterval(rb.successes, rb.n);
    out.push([
      field,
      ra.n,
      fmtNum(wa.rate * 100),
      rb.n,
      fmtNum(wb.rate * 100),
      fmtNum(wa.low * 100),
      fmtNum(wa.high * 100),
      fmtNum(wb.low * 100),
      fmtNum(wb.high * 100),
    ]);
  }
  return out;
}

export function buildAcceptanceRatesSheet(allPassRows: Rq2ProviderPassRow[]): Aoa {
  const out: Aoa = [
    ['Descriptive acceptance / change rates with Wilson 95% CI'],
    [''],
    ['cohort', 'provider', 'outcome', 'N', 'successes', 'rate_pct', 'wilson_ci_low', 'wilson_ci_high'],
  ];

  const cohorts = ['A_frontier_parallel', 'B_legacy_chain_non_frontier', 'ALL'] as const;
  const outcomes = ['verify_accepted', 'changed', 'ok'] as const;

  for (const cohort of cohorts) {
    for (const provider of [...MULTI_LLM_PROVIDERS, 'ALL']) {
      let subset = allPassRows;
      if (cohort !== 'ALL') subset = subset.filter((r) => r.cohort === cohort);
      subset = filterProvider(subset, provider);
      for (const outcome of outcomes) {
        const { n, successes } = yesRate(subset, outcome);
        const w = wilsonInterval(successes, n);
        out.push([
          cohort,
          provider,
          outcome,
          n,
          successes,
          fmtNum(w.rate * 100, 2),
          fmtNum(w.low * 100, 2),
          fmtNum(w.high * 100, 2),
        ]);
      }
    }
  }
  return out;
}

export function buildAnalysisReadMeSheet(exportedAt: string, counts: Record<string, number>): Aoa {
  return [
    ['REFINE — Statistical analysis sheets (computed at export)'],
    ['Exported', exportedAt],
    [''],
    ['Sheet', 'Purpose'],
    ['23_Statistical_Tests', 'Bundle-level paired tests on 01_Files_Master (legacy summary)'],
    ['24_RQ2_Stats_Primary', 'RQ2 paired Wilcoxon/t-test per provider — 150-file primary sample (450 passes)'],
    ['25_RQ2_Stats_Extended', 'RQ2 same tests on extended multi-LLM sample (cohorts A+B)'],
    ['26_RQ3_Provider_Comparison', 'RQ3 Friedman + pairwise Wilcoxon (Holm) across OpenAI/Google/Anthropic'],
    ['27_Cohort_A_vs_B', 'Unpaired Mann–Whitney: frontier parallel vs legacy chain (different files)'],
    ['28_Acceptance_Rates', 'verify_accepted / changed / ok rates with Wilson 95% CI'],
    ['30_RQ2_Pass_Data', 'Primary pass rows used for sheets 24–26 (audit trail)'],
    [''],
    ['Counts'],
    ...Object.entries(counts).map(([k, v]) => [k, v]),
    [''],
    ['Interpretation'],
    ['• Use sheet 24 for primary RQ2 claims; sheet 25 for sensitivity.'],
    ['• Use sheet 26 for RQ3 provider comparison on the same 150 files.'],
    ['• Sheet 27 compares different file sets — label as distribution-level only.'],
    ['• pct_improved: paired smell/LOC uses after−before (negative = better); one-sample PMD uses smells_removed>0; maintainability/testability/score > 0.'],
  ];
}

export function passRowsToAoa(rows: Rq2ProviderPassRow[]): Aoa {
  if (!rows.length) return [['no_data']];
  return orderPassExportRows(rows).aoa;
}

export type ResearchAnalysisSheets = {
  rq2Primary: Aoa;
  rq2Extended: Aoa;
  rq3Provider: Aoa;
  cohortAvsB: Aoa;
  acceptanceRates: Aoa;
  analysisReadMe: Aoa;
  passDataPrimary: Aoa;
  counts: Record<string, number>;
};

export function buildResearchAnalysisSheets(
  items: FullExcelFileItem[],
  exportedAt: string
): ResearchAnalysisSheets {
  const files = itemsToLoadedFiles(items);
  const allPass = buildRq2ProviderPassRows(files);
  const primary = filterRq2PrimaryPassRows(allPass);
  const extended = filterRq2ExtendedPassRows(allPass);

  const counts = {
    files: files.length,
    pass_rows_all: allPass.length,
    pass_rows_primary: primary.length,
    pass_rows_extended: extended.length,
  };

  return {
    rq2Primary: buildRq2StatsSheet(primary, 'primary_150_sample'),
    rq2Extended: buildRq2StatsSheet(extended, 'extended_multi_llm'),
    rq3Provider: buildRq3ProviderComparisonSheet(primary),
    cohortAvsB: buildCohortAvsBSheet(extended),
    acceptanceRates: buildAcceptanceRatesSheet(allPass),
    analysisReadMe: buildAnalysisReadMeSheet(exportedAt, counts),
    passDataPrimary: passRowsToAoa(primary),
    counts,
  };
}

function addAoaToWorkbook(
  wb: import('exceljs').Workbook,
  name: string,
  aoa: Aoa,
  freezeHeader = true
): void {
  const ws = wb.addWorksheet(name.slice(0, 31));
  for (const row of aoa) ws.addRow(row);
  if (freezeHeader && aoa.length > 1) ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (aoa.length > 0) ws.getRow(1).font = { bold: true };
}

/** Small workbook with ONLY paper analysis sheets — easy to find in Excel. */
export async function buildPaperAnalysisWorkbook(
  items: FullExcelFileItem[],
  exportedAt: string
): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const analysis = buildResearchAnalysisSheets(items, exportedAt);
  const wb = new ExcelJS.Workbook();
  addAoaToWorkbook(wb, '00_START_HERE', [
    ['REFINE — Paper analysis results (open these tabs)'],
    ['Exported', exportedAt],
    [''],
    ['Tab name', 'Research question'],
    ['01_RQ2_Primary', 'RQ2 main results — 150-file sample, per provider'],
    ['02_RQ2_Extended', 'RQ2 sensitivity — extended multi-LLM sample'],
    ['03_RQ3_Providers', 'RQ3 — OpenAI vs Google vs Anthropic (same files)'],
    ['04_Cohort_A_vs_B', 'Frontier vs legacy (different files — distribution only)'],
    ['05_Acceptance_Rates', 'verify_accepted / changed / ok with 95% CI'],
    ['06_Pass_Data', 'Raw primary pass rows (audit trail)'],
    [''],
    ['Full 340-file dataset: REFINE_master_all_files.xlsx (sheets 01–30).'],
  ]);
  addAoaToWorkbook(wb, '01_RQ2_Primary', analysis.rq2Primary);
  addAoaToWorkbook(wb, '02_RQ2_Extended', analysis.rq2Extended);
  addAoaToWorkbook(wb, '03_RQ3_Providers', analysis.rq3Provider);
  addAoaToWorkbook(wb, '04_Cohort_A_vs_B', analysis.cohortAvsB);
  addAoaToWorkbook(wb, '05_Acceptance_Rates', analysis.acceptanceRates);
  addAoaToWorkbook(wb, '06_Pass_Data', analysis.passDataPrimary);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

function buildBalancedStartHere(exportedAt: string, full: ReturnType<typeof summarizeBalancedCohort>, run: ReturnType<typeof summarizeBalancedCohort>, primaryFull: ReturnType<typeof summarizeBalancedCohort>): Aoa {
  return [
    ['REFINE — BALANCED analysis (equal N for every metric)'],
    ['Exported', exportedAt],
    [''],
    ['You asked for equal N. Raw exports have 293 multi-LLM files but missing metrics on some passes.'],
    ['This workbook keeps only complete-case files where ALL 3 providers have ALL required metrics.'],
    [''],
    ['Cohort', 'Files', 'Passes', 'N per provider', 'Use for'],
    ['FULL extended', full.balanced_files, full.balanced_pass_rows, full.balanced_files, 'All metrics — same N everywhere (sheets 02–05)'],
    ['RUN extended', run.balanced_files, run.balanced_pass_rows, run.balanced_files, 'Smell/LOC only — ~289 files (sheet 06)'],
    ['FULL primary', primaryFull.balanced_files, primaryFull.balanced_pass_rows, primaryFull.balanced_files, '150-sample complete-case (sheet 07)'],
    [''],
    ['Dropped from FULL cohort', full.dropped_files, 'files lacked full metrics on ≥1 provider pass'],
    ['Dropped from RUN cohort', run.dropped_files, 'files lacked run-level smell/LOC on ≥1 provider'],
    [''],
    ['Open 01_N_Summary first, then 02_RQ2_FULL for paper tables with equal N.'],
  ];
}

/** Equal-N paper workbook: complete-case cohorts only. */
export async function buildBalancedPaperAnalysisWorkbook(
  items: FullExcelFileItem[],
  exportedAt: string
): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const files = itemsToLoadedFiles(items);
  const allPass = buildRq2ProviderPassRows(files);
  const extended = filterRq2ExtendedPassRows(allPass);
  const primary = filterRq2PrimaryPassRows(allPass);

  const fullExt = filterBalancedCompletePassRows(extended, 'full');
  const runExt = filterBalancedCompletePassRows(extended, 'run');
  const fullPrimary = filterBalancedCompletePassRows(primary, 'full');

  const sumFull = summarizeBalancedCohort(extended, 'full');
  const sumRun = summarizeBalancedCohort(extended, 'run');
  const sumPrimary = summarizeBalancedCohort(primary, 'full');

  const wb = new ExcelJS.Workbook();
  addAoaToWorkbook(wb, '00_START_HERE', buildBalancedStartHere(exportedAt, sumFull, sumRun, sumPrimary));
  addAoaToWorkbook(wb, '01_N_Summary', buildBalancedNSummaryAoa([sumFull, sumRun, sumPrimary]));
  addAoaToWorkbook(wb, '02_RQ2_FULL_169', buildRq2StatsSheet(fullExt, `balanced_full_${sumFull.balanced_files}files`));
  addAoaToWorkbook(wb, '03_RQ3_EXT_FULL', buildRq3ProviderComparisonSheet(fullExt));
  addAoaToWorkbook(wb, '04_Cohort_A_vs_B', buildCohortAvsBSheet(fullExt));
  addAoaToWorkbook(wb, '05_Acceptance_FULL', buildAcceptanceRatesSheet(fullExt));
  addAoaToWorkbook(wb, '06_RQ2_RUN_289', buildRq2StatsSheet(runExt, `balanced_run_${sumRun.balanced_files}files`));
  addAoaToWorkbook(wb, '07_RQ2_Primary_FULL', buildRq2StatsSheet(fullPrimary, `balanced_primary_${sumPrimary.balanced_files}files`));
  addAoaToWorkbook(wb, '08_RQ3_Primary_FULL', buildRq3ProviderComparisonSheet(fullPrimary));
  addAoaToWorkbook(wb, '09_Pass_Data_FULL', passRowsToAoa(fullExt));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** Paper workbook: equal N = 169 files only (507 passes, all metrics). */
export async function buildEqualN169Workbook(
  items: FullExcelFileItem[],
  exportedAt: string
): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const files = itemsToLoadedFiles(items);
  const extended = filterRq2ExtendedPassRows(buildRq2ProviderPassRows(files));
  const fullExt = filterBalancedCompletePassRows(extended, 'full');
  const sumFull = summarizeBalancedCohort(extended, 'full');
  const n = sumFull.balanced_files;

  const wb = new ExcelJS.Workbook();
  addAoaToWorkbook(wb, '00_START_HERE', [
    ['REFINE — Equal N analysis (169 files)'],
    ['Exported', exportedAt],
    [''],
    ['Design pool', '293 multi-LLM files (879 passes)'],
    ['Analysis cohort', `${n} files — complete-case (all 3 providers, all metrics present)`],
    ['Passes', `${n * 3} (= ${n} × OpenAI + Google + Anthropic)`],
    ['Equal N', `Every test row uses N = ${n} per provider (or ${n * 3} for ALL)`],
    [''],
    ['Sheets for your paper'],
    ['01_N_Summary', 'Cohort counts'],
    ['02_RQ2_Results', 'RQ2 — paired Wilcoxon / t-test, Cohen d, CI'],
    ['03_RQ3_Providers', 'RQ3 — Friedman + pairwise Wilcoxon (Holm)'],
    ['04_Cohort_A_vs_B', 'Frontier vs legacy (Mann–Whitney)'],
    ['05_Acceptance_Rates', 'verify_accepted / changed / ok + Wilson CI'],
    ['06_Pass_Data', '507 pass rows (audit trail)'],
    [''],
    ['File list on disk', 'balanced_cohort_full_files.csv (same folder as this export)'],
  ]);
  addAoaToWorkbook(wb, '01_N_Summary', buildBalancedNSummaryAoa([sumFull]));
  addAoaToWorkbook(wb, '02_RQ2_Results', buildRq2StatsSheet(fullExt, `equal_N_${n}_files`));
  addAoaToWorkbook(wb, '03_RQ3_Providers', buildRq3ProviderComparisonSheet(fullExt));
  addAoaToWorkbook(wb, '04_Cohort_A_vs_B', buildCohortAvsBSheet(fullExt));
  addAoaToWorkbook(wb, '05_Acceptance_Rates', buildAcceptanceRatesSheet(fullExt));
  addAoaToWorkbook(wb, '06_Pass_Data', passRowsToAoa(fullExt));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export function getBalancedCohortSummaries(items: FullExcelFileItem[]) {
  const files = itemsToLoadedFiles(items);
  const allPass = buildRq2ProviderPassRows(files);
  const extended = filterRq2ExtendedPassRows(allPass);
  const primary = filterRq2PrimaryPassRows(allPass);
  return {
    extended,
    full: summarizeBalancedCohort(extended, 'full'),
    run: summarizeBalancedCohort(extended, 'run'),
    primaryFull: summarizeBalancedCohort(primary, 'full'),
  };
}
