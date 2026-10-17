/**
 * RQ3 — Smell-oriented refactoring behaviour analysis (450-file complete-case cohort).
 *
 * Research question: What refactoring behaviours explain code-smell reduction
 * across LLM providers? (code removal/addition, extraction, renaming, duplicate
 * removal, class splitting, public-method changes)
 */

import type { ResearchMetricsPayload } from './exportResearchMetricsCsv';
import { multiLlmRunsFromBundle, MULTI_LLM_PROVIDERS, providerKeyFromRun, fileHasStrictCompleteCaseMetrics } from './multiLlmExport';
import { classifyResearchCohort } from './researchExportCohort';
import {
  buildRq2ProviderPassRows,
  filterRq2FrontierPassRows,
  type Rq2ProviderPassRow,
} from './researchAnalysisExports';
import type { LoadedResearchFile } from './researchDatasetLoader';
import { researchPayloadFromRecord } from './researchMetricSections';
import {
  chiSquareIndependence,
  cohensDIndependent,
  confidenceInterval95,
  fmtNum,
  fmtP,
  holmAdjust,
  mannWhitneyUP,
  mean,
  median,
  spearmanR,
  wilsonInterval,
} from './statisticalTests';

type Aoa = (string | number | boolean)[][];

export type Rq3BehaviourFlag = {
  id: string;
  label: string;
  column: keyof Rq3BehaviourPassRow;
  /** Heuristic proxy — document in Methods. */
  proxyNote: string;
};

export type Rq3BehaviourPassRow = Rq2ProviderPassRow & {
  structural_methods_extracted: number | '';
  structural_methods_renamed: number | '';
  structural_classes_split: number | '';
  structural_duplicate_code_removed: 'yes' | 'no' | '';
  bh_extract_method: 'yes' | 'no' | '';
  bh_rename_method: 'yes' | 'no' | '';
  bh_class_split: 'yes' | 'no' | '';
  bh_duplicate_removed: 'yes' | 'no' | '';
  bh_public_api_changed: 'yes' | 'no' | '';
  bh_addition_heavy: 'yes' | 'no' | '';
  bh_deletion_heavy: 'yes' | 'no' | '';
  bh_edit_style: 'addition_heavy' | 'deletion_heavy' | 'balanced' | 'unknown' | '';
  bh_practices_extract: 'yes' | 'no' | '';
  bh_practices_rename: 'yes' | 'no' | '';
  bh_practices_remove_duplication: 'yes' | 'no' | '';
  practices_applied_long: string;
  smell_outcome_removed: number | '';
};

export const RQ3_BEHAVIOUR_FLAGS: Rq3BehaviourFlag[] = [
  {
    id: 'extract_method',
    label: 'Method extraction',
    column: 'bh_extract_method',
    proxyNote: 'structural.methods_extracted > 0 (new method names in refactored code)',
  },
  {
    id: 'rename_method',
    label: 'Method renaming',
    column: 'bh_rename_method',
    proxyNote: 'structural.methods_renamed > 0 (heuristic name overlap)',
  },
  {
    id: 'class_split',
    label: 'Class splitting',
    column: 'bh_class_split',
    proxyNote: 'structural.classes_split > 0 (more top-level classes after refactor)',
  },
  {
    id: 'duplicate_removed',
    label: 'Duplicate-code removal',
    column: 'bh_duplicate_removed',
    proxyNote: 'structural.duplicate_code_removed flag (proxy: any new method)',
  },
  {
    id: 'public_api_changed',
    label: 'Public-method / API change',
    column: 'bh_public_api_changed',
    proxyNote: 'behavioral.method_signatures_preserved = false',
  },
  {
    id: 'addition_heavy',
    label: 'Addition-heavy edit',
    column: 'bh_addition_heavy',
    proxyNote: 'diff_churn.lines_added > lines_removed',
  },
  {
    id: 'deletion_heavy',
    label: 'Deletion-heavy edit',
    column: 'bh_deletion_heavy',
    proxyNote: 'diff_churn.lines_removed > lines_added',
  },
];

function num(v: string | number | boolean | undefined): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  return NaN;
}

function yn(v: boolean | undefined): 'yes' | 'no' | '' {
  if (v === true) return 'yes';
  if (v === false) return 'no';
  return '';
}

function yesNo(v: boolean): 'yes' | 'no' {
  return v ? 'yes' : 'no';
}

export function enrichRq3BehaviourRow(
  base: Rq2ProviderPassRow,
  rm: ResearchMetricsPayload | null | undefined
): Rq3BehaviourPassRow {
  const structural = rm?.structural;
  const behavioral = rm?.behavioral;
  const diff = rm?.diff_churn;
  const practices = rm?.practices_applied ?? [];

  const linesAdded = num(diff?.lines_added);
  const linesRemoved = num(diff?.lines_removed);
  const methodsExtracted = num(structural?.methods_extracted);
  const methodsRenamed = num(structural?.methods_renamed);
  const classesSplit = num(structural?.classes_split);

  let editStyle: Rq3BehaviourPassRow['bh_edit_style'] = 'unknown';
  if (Number.isFinite(linesAdded) && Number.isFinite(linesRemoved)) {
    if (linesAdded + linesRemoved === 0) editStyle = 'balanced';
    else if (linesAdded > linesRemoved) editStyle = 'addition_heavy';
    else if (linesRemoved > linesAdded) editStyle = 'deletion_heavy';
    else editStyle = 'balanced';
  }

  const smellRemoved = num(base.pmd_smells_removed);
  const fallbackRemoved = num(base.smell_delta);
  const smellOutcome =
    Number.isFinite(smellRemoved) ? smellRemoved : Number.isFinite(fallbackRemoved) ? fallbackRemoved : '';

  return {
    ...base,
    structural_methods_extracted: Number.isFinite(methodsExtracted) ? methodsExtracted : '',
    structural_methods_renamed: Number.isFinite(methodsRenamed) ? methodsRenamed : '',
    structural_classes_split: Number.isFinite(classesSplit) ? classesSplit : '',
    structural_duplicate_code_removed: structural?.duplicate_code_removed ? 'yes' : structural ? 'no' : '',
    bh_extract_method: Number.isFinite(methodsExtracted) ? yesNo(methodsExtracted > 0) : '',
    bh_rename_method: Number.isFinite(methodsRenamed) ? yesNo(methodsRenamed > 0) : '',
    bh_class_split: Number.isFinite(classesSplit) ? yesNo(classesSplit > 0) : '',
    bh_duplicate_removed: structural?.duplicate_code_removed ? 'yes' : structural ? 'no' : '',
    bh_public_api_changed: yn(behavioral?.method_signatures_preserved === false ? true : behavioral?.method_signatures_preserved === true ? false : undefined),
    bh_addition_heavy: editStyle === 'addition_heavy' ? 'yes' : editStyle === 'unknown' ? '' : 'no',
    bh_deletion_heavy: editStyle === 'deletion_heavy' ? 'yes' : editStyle === 'unknown' ? '' : 'no',
    bh_edit_style: editStyle,
    bh_practices_extract: practices.some((p) => /extract method/i.test(p)) ? 'yes' : practices.length ? 'no' : '',
    bh_practices_rename: practices.some((p) => /rename method/i.test(p)) ? 'yes' : practices.length ? 'no' : '',
    bh_practices_remove_duplication: practices.some((p) => /remove duplication/i.test(p)) ? 'yes' : practices.length ? 'no' : '',
    practices_applied_long: practices.join(' | '),
    smell_outcome_removed: smellOutcome,
  };
}

/** 450-file complete-case: all 3 passes have non-empty comparison, behavioral, smell_resolution. */
export function rq3StrictCompleteCaseFilePaths(files: LoadedResearchFile[]): Set<string> {
  const out = new Set<string>();
  for (const f of files) {
    const cohort = classifyResearchCohort(f.bundle, f.inCurrentSample);
    if (cohort.cohort !== 'A_frontier_parallel') continue;
    if (fileHasStrictCompleteCaseMetrics(multiLlmRunsFromBundle(f.bundle))) {
      out.add(f.filePath);
    }
  }
  return out;
}

/** @deprecated Prefer rq3StrictCompleteCaseFilePaths — metrics_complete treats {} as present in JS. */
export function filterRq3CompleteCasePassRows(rows: Rq2ProviderPassRow[]): Rq2ProviderPassRow[] {
  return rows.filter(
    (r) =>
      r.cohort === 'A_frontier_parallel' &&
      r.provider_key !== '' &&
      r.metrics_complete === 'yes'
  );
}

export function buildRq3BehaviourPassRows(files: LoadedResearchFile[]): Rq3BehaviourPassRow[] {
  const rmByKey = new Map<string, ResearchMetricsPayload>();
  for (const f of files) {
    for (const run of multiLlmRunsFromBundle(f.bundle)) {
      const pk = providerKeyFromRun(run);
      const rm = researchPayloadFromRecord(run.researchMetrics as Record<string, unknown> | undefined);
      if (rm) rmByKey.set(`${f.filePath}\0${pk}`, rm);
    }
  }

  const base = buildRq2ProviderPassRows(files);
  return base.map((row) =>
    enrichRq3BehaviourRow(row, rmByKey.get(`${String(row.file_path)}\0${String(row.provider_key)}`))
  );
}

export function filterRq3BehaviourCompleteCaseRows(
  rows: Rq3BehaviourPassRow[],
  strictFilePaths?: Set<string>
): Rq3BehaviourPassRow[] {
  if (strictFilePaths) {
    return rows.filter(
      (r) =>
        r.cohort === 'A_frontier_parallel' &&
        r.provider_key !== '' &&
        strictFilePaths.has(String(r.file_path))
    );
  }
  return filterRq3CompleteCasePassRows(rows) as Rq3BehaviourPassRow[];
}

export type Rq3BehaviourCohortSummary = {
  label: string;
  source_files: number;
  source_pass_rows: number;
  complete_case_files: number;
  complete_case_pass_rows: number;
  passes_per_provider: Record<string, number>;
};

export function summarizeRq3BehaviourCohort(
  rows: Rq3BehaviourPassRow[],
  strictFilePaths?: Set<string>
): Rq3BehaviourCohortSummary {
  const frontier = filterRq2FrontierPassRows(rows) as Rq3BehaviourPassRow[];
  const complete = filterRq3BehaviourCompleteCaseRows(rows, strictFilePaths);
  const fileSet = (rs: Rq3BehaviourPassRow[]) => new Set(rs.map((r) => String(r.file_path)));

  const perProvider: Record<string, number> = {};
  for (const pk of MULTI_LLM_PROVIDERS) {
    perProvider[pk] = complete.filter((r) => r.provider_key === pk).length;
  }

  return {
    label: 'rq3_behaviour_complete_case_450',
    source_files: fileSet(frontier).size,
    source_pass_rows: frontier.length,
    complete_case_files: fileSet(complete).size,
    complete_case_pass_rows: complete.length,
    passes_per_provider: perProvider,
  };
}

function flagYes(rows: Rq3BehaviourPassRow[], column: keyof Rq3BehaviourPassRow): Rq3BehaviourPassRow[] {
  return rows.filter((r) => r[column] === 'yes');
}

export function buildRq3BehaviourCohortSummarySheet(summary: Rq3BehaviourCohortSummary): Aoa {
  return [
    ['RQ3 behaviour analysis cohort — complete-case (450 files)'],
    [''],
    ['Cohort rule', 'A_frontier_parallel AND metrics_complete=yes on all 3 provider passes'],
    ['Files', summary.complete_case_files],
    ['Pass rows', summary.complete_case_pass_rows],
    ['Expected', '450 files × 3 providers = 1350 passes'],
    [''],
    ['Provider', 'N passes'],
    ...MULTI_LLM_PROVIDERS.map((pk) => [pk, summary.passes_per_provider[pk] ?? 0]),
    [''],
    ['Frontier pool (reference)', summary.source_files, 'files', summary.source_pass_rows, 'passes'],
    ['Dropped from 527', summary.source_files - summary.complete_case_files, 'files lack full metrics on ≥1 pass'],
    [''],
    ['Behaviour proxies', 'See Methods — structural heuristics from refactoring_analysis.py'],
  ];
}

export function buildRq3BehaviourPrevalenceSheet(rows: Rq3BehaviourPassRow[]): Aoa {
  const out: Aoa = [
    ['RQ3 — Behaviour prevalence by provider (450-file complete-case)'],
    ['Rates use Wilson 95% CI on pass-level yes/no flags.'],
    [''],
    ['behaviour', 'provider', 'N', 'yes_count', 'rate_pct', 'wilson_low', 'wilson_high'],
  ];

  for (const flag of RQ3_BEHAVIOUR_FLAGS) {
    for (const pk of [...MULTI_LLM_PROVIDERS, 'ALL']) {
      const subset =
        pk === 'ALL' ? rows : rows.filter((r) => r.provider_key === pk);
      const withFlag = subset.filter((r) => r[flag.column] === 'yes' || r[flag.column] === 'no');
      const yes = withFlag.filter((r) => r[flag.column] === 'yes').length;
      const n = withFlag.length;
      const w = wilsonInterval(yes, n);
      out.push([
        flag.label,
        pk,
        n,
        yes,
        fmtNum(w.rate * 100, 1),
        fmtNum(w.low * 100, 1),
        fmtNum(w.high * 100, 1),
      ]);
    }
  }
  return out;
}

export function buildRq3BehaviourChiSquareSheet(rows: Rq3BehaviourPassRow[]): Aoa {
  const out: Aoa = [
    ['RQ3 — Chi-square test: provider × behaviour (independence)'],
    ['H0: behaviour prevalence does not differ across providers. Pass-level 3×2 tables.'],
    [''],
    ['behaviour', 'openai_yes', 'openai_no', 'google_yes', 'google_no', 'anthropic_yes', 'anthropic_no', 'chi2', 'df', 'p'],
  ];

  for (const flag of RQ3_BEHAVIOUR_FLAGS) {
    const table: number[][] = [];
    for (const pk of MULTI_LLM_PROVIDERS) {
      const sub = rows.filter((r) => r.provider_key === pk);
      const yes = sub.filter((r) => r[flag.column] === 'yes').length;
      const no = sub.filter((r) => r[flag.column] === 'no').length;
      table.push([yes, no]);
    }
    const cs = chiSquareIndependence(table);
    out.push([
      flag.label,
      table[0][0],
      table[0][1],
      table[1][0],
      table[1][1],
      table[2][0],
      table[2][1],
      fmtNum(cs.chi2),
      cs.df,
      fmtP(cs.p),
    ]);
  }
  return out;
}

export function buildRq3BehaviourSmellAssociationSheet(rows: Rq3BehaviourPassRow[]): Aoa {
  const out: Aoa = [
    ['RQ3 — Smell reduction by behaviour flag (Mann–Whitney U)'],
    ['Outcome: pmd_smells_removed (positive = fewer smells). Compare passes with behaviour=yes vs no.'],
    [''],
    [
      'behaviour',
      'N_yes',
      'N_no',
      'mean_removed_yes',
      'mean_removed_no',
      'median_yes',
      'median_no',
      'mann_whitney_p',
      'cohens_d',
    ],
  ];

  for (const flag of RQ3_BEHAVIOUR_FLAGS) {
    const eligible = rows.filter((r) => r[flag.column] === 'yes' || r[flag.column] === 'no');
    const yesVals = flagYes(eligible, flag.column)
      .map((r) => num(r.smell_outcome_removed))
      .filter(Number.isFinite);
    const noVals = eligible
      .filter((r) => r[flag.column] === 'no')
      .map((r) => num(r.smell_outcome_removed))
      .filter(Number.isFinite);
    out.push([
      flag.label,
      yesVals.length,
      noVals.length,
      fmtNum(mean(yesVals), 2),
      fmtNum(mean(noVals), 2),
      fmtNum(median(yesVals), 2),
      fmtNum(median(noVals), 2),
      fmtP(mannWhitneyUP(yesVals, noVals)),
      fmtNum(cohensDIndependent(yesVals, noVals), 3),
    ]);
  }
  return out;
}

export function buildRq3EditStyleSheet(rows: Rq3BehaviourPassRow[]): Aoa {
  const out: Aoa = [
    ['RQ3 — Edit style profile (code addition vs removal)'],
    [''],
    ['--- Prevalence by provider ---'],
    ['provider', 'N', 'addition_heavy_pct', 'deletion_heavy_pct', 'balanced_pct'],
  ];

  for (const pk of MULTI_LLM_PROVIDERS) {
    const sub = rows.filter((r) => r.provider_key === pk && r.bh_edit_style !== 'unknown');
    const n = sub.length;
    const add = sub.filter((r) => r.bh_edit_style === 'addition_heavy').length;
    const del = sub.filter((r) => r.bh_edit_style === 'deletion_heavy').length;
    const bal = sub.filter((r) => r.bh_edit_style === 'balanced').length;
    out.push([pk, n, fmtNum((100 * add) / n, 1), fmtNum((100 * del) / n, 1), fmtNum((100 * bal) / n, 1)]);
  }

  out.push(['']);
  out.push(['--- Smell reduction by edit style (Kruskal-Wallis on 3 groups) ---']);
  out.push(['edit_style', 'N', 'mean_smells_removed', 'median', 'ci95_low', 'ci95_high']);

  const styleGroups: Rq3BehaviourPassRow['bh_edit_style'][] = [
    'addition_heavy',
    'deletion_heavy',
    'balanced',
  ];
  for (const style of styleGroups) {
    const vals = rows
      .filter((r) => r.bh_edit_style === style)
      .map((r) => num(r.smell_outcome_removed))
      .filter(Number.isFinite);
    const ci = confidenceInterval95(vals);
    out.push([style, vals.length, fmtNum(mean(vals), 2), fmtNum(median(vals), 2), fmtNum(ci.low, 2), fmtNum(ci.high, 2)]);
  }

  out.push(['']);
  out.push(['--- Pairwise edit style vs smell (Mann–Whitney) ---']);
  out.push(['group_a', 'group_b', 'N_a', 'N_b', 'mean_a', 'mean_b', 'mann_whitney_p']);

  const pairs: [string, string][] = [
    ['deletion_heavy', 'addition_heavy'],
    ['deletion_heavy', 'balanced'],
    ['addition_heavy', 'balanced'],
  ];
  for (const [a, b] of pairs) {
    const va = rows
      .filter((r) => r.bh_edit_style === a)
      .map((r) => num(r.smell_outcome_removed))
      .filter(Number.isFinite);
    const vb = rows
      .filter((r) => r.bh_edit_style === b)
      .map((r) => num(r.smell_outcome_removed))
      .filter(Number.isFinite);
    out.push([a, b, va.length, vb.length, fmtNum(mean(va), 2), fmtNum(mean(vb), 2), fmtP(mannWhitneyUP(va, vb))]);
  }

  return out;
}

export function buildRq3DiffChurnCorrelationSheet(rows: Rq3BehaviourPassRow[]): Aoa {
  const out: Aoa = [
    ['RQ3 — Diff churn vs smell reduction (Spearman correlation)'],
    ['Outcome: pmd_smells_removed. Predictors: lines_added, lines_removed, net LOC delta.'],
    [''],
    ['predictor', 'N', 'spearman_r', 'p_value'],
  ];

  const outcome = rows.map((r) => num(r.smell_outcome_removed));
  const predictors: { label: string; values: number[] }[] = [
    { label: 'lines_added', values: rows.map((r) => num(r.diff_lines_added)) },
    { label: 'lines_removed', values: rows.map((r) => num(r.diff_lines_removed)) },
    {
      label: 'net_loc_delta',
      values: rows.map((r) => {
        const a = num(r.diff_lines_added);
        const b = num(r.diff_lines_removed);
        return Number.isFinite(a) && Number.isFinite(b) ? a - b : NaN;
      }),
    },
  ];

  for (const p of predictors) {
    const sr = spearmanR(p.values, outcome);
    out.push([p.label, sr.n, fmtNum(sr.r, 3), fmtP(sr.p)]);
  }

  out.push(['']);
  out.push(['--- By provider: lines_removed vs smells_removed ---']);
  out.push(['provider', 'N', 'spearman_r', 'p_value']);
  for (const pk of MULTI_LLM_PROVIDERS) {
    const sub = rows.filter((r) => r.provider_key === pk);
    const sr = spearmanR(
      sub.map((r) => num(r.diff_lines_removed)),
      sub.map((r) => num(r.smell_outcome_removed))
    );
    out.push([pk, sr.n, fmtNum(sr.r, 3), fmtP(sr.p)]);
  }

  return out;
}

export function buildRq3ProviderBehaviourMeanSheet(rows: Rq3BehaviourPassRow[]): Aoa {
  const out: Aoa = [
    ['RQ3 — Mean smell reduction by provider × behaviour (descriptive)'],
    [''],
    ['behaviour', 'provider', 'N_yes', 'mean_smells_removed_when_yes', 'N_all', 'mean_smells_removed_all'],
  ];

  for (const flag of RQ3_BEHAVIOUR_FLAGS) {
    for (const pk of MULTI_LLM_PROVIDERS) {
      const sub = rows.filter((r) => r.provider_key === pk);
      const yes = flagYes(sub, flag.column);
      const yesVals = yes.map((r) => num(r.smell_outcome_removed)).filter(Number.isFinite);
      const allVals = sub.map((r) => num(r.smell_outcome_removed)).filter(Number.isFinite);
      out.push([
        flag.label,
        pk,
        yesVals.length,
        fmtNum(mean(yesVals), 2),
        allVals.length,
        fmtNum(mean(allVals), 2),
      ]);
    }
  }
  return out;
}

export function buildRq3BehaviourProviderStratifiedSheet(rows: Rq3BehaviourPassRow[]): Aoa {
  const out: Aoa = [
    ['RQ3 — Provider-stratified: smell reduction yes vs no per behaviour (Mann–Whitney)'],
    ['Controls for provider-specific baselines by testing within each provider separately.'],
    [''],
    ['behaviour', 'provider', 'N_yes', 'N_no', 'mean_yes', 'mean_no', 'mann_whitney_p'],
  ];

  const rawPs: number[] = [];
  const cells: (string | number | boolean)[][] = [];

  for (const flag of RQ3_BEHAVIOUR_FLAGS) {
    for (const pk of MULTI_LLM_PROVIDERS) {
      const sub = rows.filter((r) => r.provider_key === pk);
      const yesVals = flagYes(sub, flag.column)
        .map((r) => num(r.smell_outcome_removed))
        .filter(Number.isFinite);
      const noVals = sub
        .filter((r) => r[flag.column] === 'no')
        .map((r) => num(r.smell_outcome_removed))
        .filter(Number.isFinite);
      const p = mannWhitneyUP(yesVals, noVals);
      rawPs.push(Number.isFinite(p) ? p : 1);
      cells.push([
        flag.label,
        pk,
        yesVals.length,
        noVals.length,
        fmtNum(mean(yesVals), 2),
        fmtNum(mean(noVals), 2),
        fmtP(p),
        '',
      ]);
    }
  }

  const holm = holmAdjust(rawPs);
  for (let i = 0; i < cells.length; i += 1) cells[i][7] = fmtP(holm[i]);

  out.push(['behaviour', 'provider', 'N_yes', 'N_no', 'mean_yes', 'mean_no', 'mann_whitney_p', 'holm_adj_p']);
  out.push(...cells);
  return out;
}

export function buildRq3BehaviourReadMeSheet(exportedAt: string, summary: Rq3BehaviourCohortSummary): Aoa {
  return [
    ['RQ3 — Smell-oriented refactoring behaviour (450-file complete-case)'],
    ['Exported', exportedAt],
    [''],
    ['Research question', 'What refactoring behaviours explain code-smell reduction across LLM providers?'],
    [''],
    ['Cohort', `${summary.complete_case_files} files, ${summary.complete_case_pass_rows} passes (3 providers each)`],
    [''],
    ['Sheet', 'Purpose', 'Statistical test'],
    ['01_Cohort', 'Inclusion counts', 'Descriptive'],
    ['02_Pass_Data', 'Analysis-ready pass rows with behaviour flags', '—'],
    ['03_Prevalence', 'Behaviour rates by provider', 'Wilson 95% CI'],
    ['04_ChiSquare', 'Provider × behaviour independence', 'Pearson chi-square'],
    ['05_Smell_Association', 'Smell reduction vs behaviour flag', 'Mann–Whitney U + Cohen d'],
    ['06_Edit_Style', 'Addition vs deletion vs balanced', 'Mann–Whitney pairwise'],
    ['07_Correlation', 'Diff churn vs smell reduction', 'Spearman r'],
    ['08_Provider_Means', 'Provider × behaviour descriptive means', 'Descriptive'],
    ['09_Stratified', 'Within-provider behaviour tests', 'Mann–Whitney + Holm'],
    [''],
    ['Interpretation notes'],
    ['• Behaviours are heuristic proxies — document in Threats to Validity.'],
    ['• Association ≠ causation; use stratified tests and cross-provider prevalence jointly.'],
    ['• duplicate_code_removed proxy overlaps with method extraction by construction.'],
    ['• Frame claims as: “deletion-heavy edits associate with higher smell removal” not “cause”.'],
  ];
}

export function behaviourPassRowsToAoa(rows: Rq3BehaviourPassRow[]): Aoa {
  if (!rows.length) return [['no_data']];
  const keys = Object.keys(rows[0]) as (keyof Rq3BehaviourPassRow)[];
  return [keys as string[], ...rows.map((r) => keys.map((k) => r[k] ?? ''))];
}

export type Rq3BehaviourSheets = {
  summary: Rq3BehaviourCohortSummary;
  cohort: Aoa;
  passData: Aoa;
  prevalence: Aoa;
  chiSquare: Aoa;
  smellAssociation: Aoa;
  editStyle: Aoa;
  correlation: Aoa;
  providerMeans: Aoa;
  stratified: Aoa;
  readMe: Aoa;
};

export function buildRq3BehaviourSheets(
  files: LoadedResearchFile[],
  exportedAt: string
): Rq3BehaviourSheets {
  const allRows = buildRq3BehaviourPassRows(files);
  const strictPaths = rq3StrictCompleteCaseFilePaths(files);
  const rows = filterRq3BehaviourCompleteCaseRows(allRows, strictPaths);
  const summary = summarizeRq3BehaviourCohort(allRows, strictPaths);

  return {
    summary,
    cohort: buildRq3BehaviourCohortSummarySheet(summary),
    passData: behaviourPassRowsToAoa(rows),
    prevalence: buildRq3BehaviourPrevalenceSheet(rows),
    chiSquare: buildRq3BehaviourChiSquareSheet(rows),
    smellAssociation: buildRq3BehaviourSmellAssociationSheet(rows),
    editStyle: buildRq3EditStyleSheet(rows),
    correlation: buildRq3DiffChurnCorrelationSheet(rows),
    providerMeans: buildRq3ProviderBehaviourMeanSheet(rows),
    stratified: buildRq3BehaviourProviderStratifiedSheet(rows),
    readMe: buildRq3BehaviourReadMeSheet(exportedAt, summary),
  };
}

export async function buildRq3BehaviourWorkbook(
  files: LoadedResearchFile[],
  exportedAt: string
): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const sheets = buildRq3BehaviourSheets(files, exportedAt);
  const wb = new ExcelJS.Workbook();

  const add = (name: string, aoa: Aoa) => {
    const ws = wb.addWorksheet(name.slice(0, 31));
    for (const row of aoa) ws.addRow(row);
    if (aoa.length > 1) {
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ws.getRow(1).font = { bold: true };
    }
  };

  add('00_START_HERE', sheets.readMe);
  add('01_Cohort_450', sheets.cohort);
  add('02_Pass_Data', sheets.passData);
  add('03_Prevalence', sheets.prevalence);
  add('04_ChiSquare', sheets.chiSquare);
  add('05_Smell_Assoc', sheets.smellAssociation);
  add('06_Edit_Style', sheets.editStyle);
  add('07_Correlation', sheets.correlation);
  add('08_Prov_Means', sheets.providerMeans);
  add('09_Stratified', sheets.stratified);

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export const RQ3_BEHAVIOUR_FILENAME = 'REFINE_RQ3_Behaviour_450.xlsx';
