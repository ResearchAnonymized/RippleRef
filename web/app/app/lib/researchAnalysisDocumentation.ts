/**
 * Plain-language and formula documentation for paper-ready analysis sheets.
 */

import type { Rq2ProviderPassRow } from './researchAnalysisExports';
import { MULTI_LLM_PROVIDERS } from './multiLlmExport';

type Aoa = (string | number | boolean)[][];

export const STATS_TABLE_HEADER = [
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

/** Stable column order for 01_Pass_Master (used in formula guide). */
export const PASS_MASTER_COLUMN_DOCS: Array<{
  column: string;
  source: string;
  formula: string;
  description: string;
}> = [
  { column: 'project_name', source: 'workspace registry', formula: '—', description: 'Open-source system label (1 of 15 projects).' },
  { column: 'file_path', source: 'saved report key', formula: '—', description: 'Unique path of the Java file within the cloned repository.' },
  { column: 'file_name', source: 'file_path basename', formula: '—', description: 'File name only.' },
  { column: 'provider_key', source: 'multiLlmRuns[].provider', formula: 'normalized to openai | google | anthropic', description: 'Which LLM ran this pass.' },
  { column: 'ok', source: 'multiLlmRuns[].ok', formula: 'yes if agent pipeline completed', description: 'Execution succeeded (not a quality verdict).' },
  { column: 'changed', source: 'multiLlmRuns[].changed', formula: 'yes if refactored text ≠ baseline', description: 'Whether output differed from frozen baseline.' },
  { column: 'verify_accepted', source: 'researchMetrics.meta.verifyAccepted', formula: 'yes/no from automated verification gates', description: 'Candidate accepted by automated gates (RQ1 throughput).' },
  { column: 'pmd_smells_before', source: 'researchMetrics.comparison.pmd_smell_total.before', formula: 'PMD smell count on frozen baseline', description: 'Smell count before refactoring.' },
  { column: 'pmd_smells_after', source: 'researchMetrics.comparison.pmd_smell_total.after', formula: 'PMD smell count on candidate', description: 'Smells remaining after refactoring (0 = all removed).' },
  { column: 'pmd_smells_remaining', source: 'same as pmd_smells_after', formula: 'pmd_smells_after', description: 'Alias — count of smells still present after refactor.' },
  { column: 'pmd_smells_removed', source: 'comparison before/after', formula: 'pmd_smells_before − pmd_smells_after', description: 'Count of smells removed (positive = improvement).' },
  { column: 'pmd_smells_reduction_pct', source: 'derived', formula: '100 × removed / before (0 if before=0)', description: '% of baseline smells removed.' },
  { column: 'pmd_smells_delta', source: 'same as pmd_smells_removed', formula: 'pmd_smells_before − pmd_smells_after', description: 'Smells removed (NOT remaining). Example: 3→0 gives delta=3, after=0.' },
  { column: 'pmd_smells_delta_signed', source: 'derived', formula: 'pmd_smells_after − pmd_smells_before', description: 'Signed change for stats (negative = fewer smells).' },
  { column: 'smell_delta', source: 'multiLlmRuns[].smellDelta', formula: 'smellsBefore − smellsAfter (run summary)', description: 'Alternate smell change from run record.' },
  { column: 'complexity_before', source: 'comparison.complexity.before', formula: 'cyclomatic complexity baseline', description: 'Lower complexity is generally better.' },
  { column: 'complexity_after', source: 'comparison.complexity.after', formula: 'cyclomatic complexity after', description: '—' },
  { column: 'maintainability_before', source: 'comparison.maintainability.before', formula: 'maintainability index baseline', description: 'Higher is better.' },
  { column: 'maintainability_after', source: 'comparison.maintainability.after', formula: 'maintainability index after', description: '—' },
  { column: 'testability_before', source: 'comparison.testability.before', formula: 'testability proxy baseline', description: 'Higher is better.' },
  { column: 'testability_after', source: 'comparison.testability.after', formula: 'testability proxy after', description: '—' },
  { column: 'loc_before', source: 'comparison.lines_of_code.before', formula: 'LOC baseline', description: 'Lines of code before.' },
  { column: 'loc_after', source: 'comparison.lines_of_code.after', formula: 'LOC after', description: 'Lines of code after.' },
  { column: 'loc_delta', source: 'loc_after − loc_before', formula: 'Δ LOC', description: 'Negative = shorter file.' },
  { column: 'semantic_preservation_pct', source: 'semantic_preservation.overall_preservation_rate', formula: 'automated proxy %', description: 'Proxy only — not proof of correctness.' },
  { column: 'tokens_total', source: 'token_efficiency.total_tokens', formula: 'sum of LLM tokens for this pass', description: 'Cost/effort proxy (RQ2).' },
  { column: 'smell_resolution_rate_pct', source: 'smell_resolution.overall_resolution_rate', formula: '% smells resolved', description: 'Higher is better.' },
];

export function buildMasterAnalysisGuideAoa(fileCount: number, passCount: number): Aoa {
  return [
    ['HOW TO READ THIS WORKBOOK — Full analysis guide'],
    [''],
    ['1. What data is this?'],
    [`   • ${fileCount} Java files from 15 OSS projects (527 frontier cohort).`],
    [`   • Each file × 3 LLM providers = ${passCount} provider pass rows.`],
    ['   • Each pass = one multi-agent run (OpenAI, Google, or Anthropic) on the same frozen baseline.'],
    [''],
    ['2. Where do numbers come from?'],
    ['   • Raw values: saved refactoring JSON on disk → sheet 01_Pass_Master.'],
    ['   • Summary statistics: computed in TypeScript at export (same logic as paper).'],
    ['   • See 98_Pass_Column_Formulas and 97_Stats_Column_Formulas for every formula.'],
    [''],
    ['3. Which sheet answers which research question?'],
    ['   RQ1 (effectiveness): RQ1_01 (acceptance), RQ1_02 (rejections), RQ1_03 (main stats table)'],
    ['   RQ2 (providers): RQ2_01 (Friedman + pairwise Wilcoxon)'],
    ['   Audit / traceability: 01_Pass_Master, 99_Data_Quality'],
    [''],
    ['4. How to verify a number is not “magic”'],
    ['   a) Find the metric row in RQ1_03 (e.g. provider=openai, metric=PMD smells).'],
    ['   b) Filter 01_Pass_Master to that provider.'],
    ['   c) Compute mean(pmd_smells_before), mean(pmd_smells_after), mean(delta) in Excel.'],
    ['   d) Compare with mean_before, mean_after, mean_delta in RQ1_03.'],
    ['   e) See sheet RQ1_03_Excel_Check for live Excel formulas that do step (c).'],
    [''],
    ['5. Statistical tests (plain English)'],
    ['   • Wilcoxon signed-rank (wilcoxon_p): Did the metric change systematically after refactoring?'],
    ['     H₀: median change = 0. Primary test for RQ1 paired before/after.'],
    ['   • Paired t-test (paired_t_p): Same question, assumes normal deltas. Sensitivity only.'],
    ['   • Wilson CI (RQ1_01): Uncertainty band for acceptance rates (percent yes).'],
    ['   • Friedman (RQ2_01): Do the three providers differ on the same files?'],
    ['   • Holm-adjusted pairwise Wilcoxon (RQ2_01): Which provider pairs differ?'],
    [''],
    ['6. Code implementation (reproducibility)'],
    ['   • web/app/app/lib/statisticalTests.ts — all test math'],
    ['   • web/app/app/lib/researchStatisticalAnalysis.ts — builds RQ1_03 / RQ2_01 rows'],
    ['   • web/app/app/lib/researchAnalysisExports.ts — builds 01_Pass_Master rows'],
  ];
}

export function buildStatsColumnFormulasAoa(): Aoa {
  return [
    ['RQ1_03 / RQ2_01 — Column formulas (every computed cell)'],
    [''],
    ['column', 'plain_english', 'formula', 'notes'],
    [
      'analysis_set',
      'Label for this export batch',
      '527_frontier_cohort',
      'All rows use the same 527-file frontier cohort.',
    ],
    [
      'provider',
      'LLM filter for this row',
      'openai | google | anthropic | ALL',
      'ALL = pooled across providers for that metric.',
    ],
    [
      'metric',
      'What is being measured',
      'e.g. PMD smells, Maintainability, LOC delta',
      'See paired metrics (before/after) or delta-only metrics.',
    ],
    [
      'test_type',
      'Row computation mode',
      'paired_before_after OR one_sample_delta',
      'paired: uses before & after columns; one_sample: uses precomputed delta column.',
    ],
    [
      'N',
      'Sample size for this row',
      'count of passes with finite values for this metric',
      'Excludes passes missing before/after or delta.',
    ],
    [
      'mean_before',
      'Average baseline value',
      'mean_before = (1/N) × Σ before_i',
      'before_i from 01_Pass_Master (e.g. pmd_smells_before).',
    ],
    [
      'mean_after',
      'Average post-refactoring value',
      'mean_after = (1/N) × Σ after_i',
      'after_i from 01_Pass_Master (e.g. pmd_smells_after).',
    ],
    [
      'mean_delta',
      'Average change',
      'mean_delta = (1/N) × Σ (after_i − before_i) = mean_after − mean_before',
      'Negative smell delta = fewer smells on average.',
    ],
    [
      'median_delta',
      'Typical change',
      'median_delta = median({after_i − before_i})',
      'Robust to outliers.',
    ],
    [
      'pct_improved',
      '% passes that improved',
      '100 × (count improved) / N',
      'Smells/complexity/LOC: improved if delta<0. Maintainability/testability/score/resolution%: improved if delta>0.',
    ],
    [
      'cohens_d',
      'Effect size',
      "d = mean_delta / SD_sample(delta)",
      'SD uses denominator (N−1). |d|≈0.2 small, 0.5 medium, 0.8 large (rule of thumb).',
    ],
    [
      'wilcoxon_p',
      'Primary significance test',
      'Two-sided Wilcoxon signed-rank on pairs (before_i, after_i)',
      'Normal approximation; requires N≥6 pairs. H₀: median delta=0.',
    ],
    [
      'paired_t_p',
      'Sensitivity test',
      'Two-sided paired t-test on deltas; df=N−1',
      'Report as sensitivity; parametric assumption.',
    ],
    [
      'ci95_low',
      'Lower 95% CI on mean delta',
      'mean_delta − 1.96 × (SD(delta)/√N)',
      'CI on mean change, not on median.',
    ],
    [
      'ci95_high',
      'Upper 95% CI on mean delta',
      'mean_delta + 1.96 × (SD(delta)/√N)',
      '—',
    ],
    [''],
    ['Wilson CI columns in RQ1_01 (acceptance rates)'],
    ['rate_pct', 'Percent yes', '100 × successes / N', '—'],
    [
      'wilson_ci_low / wilson_ci_high',
      '95% CI on proportion',
      'Wilson score interval with z=1.96',
      'See statisticalTests.ts → wilsonInterval(successes, N)',
    ],
    [''],
    ['RQ2 Friedman row (RQ2_01)'],
    ['N_files', 'Files with all 3 provider values', 'count files in pivot', 'Same file must have openai, google, anthropic.'],
    ['chi2, df, friedman_p', 'Provider difference test', 'Friedman χ² on k=3 related samples', 'H₀: all providers same distribution.'],
    ['holm_adj_p', 'Pairwise correction', 'Holm–Bonferroni on 3 pairwise Wilcoxon p-values per metric', 'Controls family-wise error.'],
  ];
}

export function buildPassColumnFormulasAoa(): Aoa {
  return [
    ['01_Pass_Master — Column sources and formulas'],
    [''],
    ['column', 'source_in_saved_json', 'computation_formula', 'description'],
    ...PASS_MASTER_COLUMN_DOCS.map((d) => [d.column, d.source, d.formula, d.description]),
  ];
}

export function buildRq1EffectivenessPreambleAoa(passCount: number): Aoa {
  return [
    ['RQ1 — Effectiveness: paired before/after and delta tests (527 frontier cohort)'],
    [''],
    ['WHAT THIS SHEET ANSWERS'],
    ['  Research question: To what extent does the multi-agent workflow reduce code smells and improve quality indicators?'],
    ['  Each row below summarizes one metric for one LLM provider (or ALL providers pooled).'],
    [''],
    ['UNIT OF ANALYSIS'],
    [`  • One provider pass row = one file × one LLM = one row in sheet 01_Pass_Master.`],
    [`  • This cohort has ${passCount} pass rows (527 files × 3 providers).`],
    ['  • Statistics are computed on pass rows that have valid numbers for that metric (column N).'],
    [''],
    ['HOW TO READ A ROW (example: provider=openai, metric=PMD smells)'],
    ['  mean_before  = average smell count on baselines for OpenAI passes'],
    ['  mean_after   = average smell count after OpenAI refactoring (remaining)'],
    ['  mean_delta   = average smells removed (paired: after−before; one-sample: pmd_smells_removed)'],
    ['  wilcoxon_p   = is the change statistically significant? (primary test)'],
    ['  pct_improved = % of passes with improvement (paired smell: delta<0; one-sample removed: >0)'],
    [''],
    ['IMPROVEMENT DIRECTION (for pct_improved)'],
    ['  Paired (mean_delta = after−before): PMD smells, complexity, LOC — improved when delta < 0'],
    ['  One-sample removed count: pmd_smells_removed — improved when > 0'],
    ['  Higher is better: maintainability, testability, overall score, smell resolution %, reduction %'],
    [''],
    ['TESTS'],
    ['  wilcoxon_p  — PRIMARY. Non-parametric paired test. Use this for paper claims.'],
    ['  paired_t_p  — SENSITIVITY only. Parametric paired t-test.'],
    ['  cohens_d     — Effect size for mean delta (not significance).'],
    [''],
    ['FULL COLUMN DEFINITIONS → see sheet 97_Stats_Column_Formulas'],
    ['VERIFY IN EXCEL → see sheet RQ1_03_Excel_Check (live formulas on 01_Pass_Master)'],
    [''],
    ['——— DATA TABLE BELOW ———'],
  ];
}

export function buildRq1AcceptancePreambleAoa(): Aoa {
  return [
    ['RQ1 — Acceptance and change rates (527 frontier cohort)'],
    [''],
    ['WHAT THIS SHEET ANSWERS'],
    ['  What fraction of provider passes were accepted, changed, or completed successfully?'],
    [''],
    ['COLUMNS'],
    ['  cohort     — always A_frontier_parallel for this export'],
    ['  provider   — openai | google | anthropic | ALL'],
    ['  outcome    — verify_accepted | changed | ok'],
    ['  N          — passes with yes/no for that outcome'],
    ['  successes  — count of outcome=yes'],
    ['  rate_pct   — 100 × successes / N'],
    ['  wilson_ci_low / wilson_ci_high — 95% Wilson score CI on the proportion'],
    [''],
    ['FORMULAS'],
    ['  rate_pct = 100 × successes / N'],
    ['  Wilson CI: statisticalTests.ts → wilsonInterval(successes, N) with z=1.96'],
    [''],
    ['INTERPRETATION'],
    ['  verify_accepted=yes ⇒ automated verification gates accepted the candidate.'],
    ['  changed=yes ⇒ output text differed from frozen baseline.'],
    ['  ok=yes ⇒ agent pipeline finished (ok=no means execution failure).'],
    [''],
    ['——— DATA TABLE BELOW ———'],
  ];
}

export function buildRq2PreambleAoa(): Aoa {
  return [
    ['RQ2 — Cross-provider comparison (527 frontier, same files × 3 providers)'],
    [''],
    ['WHAT THIS SHEET ANSWERS'],
    ['  Research question: How do outcomes differ across LLM providers under the same workflow?'],
    ['  Each file has up to 3 passes (OpenAI, Google, Anthropic) on the same baseline.'],
    [''],
    ['FRIEDMAN SECTION'],
    ['  Tests whether the three providers differ on the same files (related samples).'],
    ['  N_files = files with valid delta for all 3 providers for that metric.'],
    ['  friedman_p < 0.05 ⇒ evidence providers differ (distribution of deltas).'],
    [''],
    ['PAIRWISE SECTION'],
    ['  Wilcoxon signed-rank on matched files: provider A vs B on same file.'],
    ['  holm_adj_p — Holm correction across the 3 pairwise comparisons per metric.'],
    [''],
    ['METRICS COMPARED'],
    ...DELTA_METRICS_LABELS().map((m) => [`  • ${m}`]),
    [''],
    ['FULL FORMULAS → sheet 97_Stats_Column_Formulas'],
    [''],
    ['——— DATA TABLE BELOW ———'],
  ];
}

function DELTA_METRICS_LABELS(): string[] {
  return [
    'PMD smell delta',
    'Smell delta (run)',
    'LOC delta',
    'Overall score',
    'Smell resolution %',
  ];
}

export function buildRejectionPreambleAoa(): Aoa {
  return [
    ['RQ1 — Rejection and failure summary'],
    [''],
    ['CATEGORIES (how each pass is classified)'],
    ['  verify_accepted     — automated gates accepted the refactoring candidate'],
    ['  verify_rejected     — gates rejected the candidate (verify_accepted=no)'],
    ['  execution_failed_ok_no — pipeline did not complete (ok=no)'],
    ['  unchanged_output    — changed=no (identical to baseline)'],
    ['  other_or_missing_meta — outcome fields missing'],
    [''],
    ['FORMULAS'],
    ['  N_passes = count of passes in category'],
    ['  pct_of_passes = 100 × N_passes / total passes (1581)'],
    [''],
    ['——— DATA TABLE BELOW ———'],
  ];
}

export type Rq1ExcelCheckRow = {
  metric: string;
  provider: string;
  /** Excel formula including leading = */
  formulaText: string;
  matchesColumn: string;
};

function passMasterColumnRef(
  passRows: Rq2ProviderPassRow[],
  passMasterSheetName: string,
  columnName: string
): { ref: (rowEnd?: number) => string; colLetter: string; dataEnd: number } {
  const keys = passRows.length ? Object.keys(passRows[0]) : [];
  const idx = keys.indexOf(columnName);
  const colLetter =
    idx < 0
      ? '?'
      : (() => {
          let n = idx + 1;
          let s = '';
          while (n > 0) {
            const r = (n - 1) % 26;
            s = String.fromCharCode(65 + r) + s;
            n = Math.floor((n - 1) / 26);
          }
          return s;
        })();
  const sheet = passMasterSheetName.replace(/'/g, "''");
  const dataEnd = passRows.length + 1;
  const ref = (rowEnd = dataEnd): string => `'${sheet}'!$${colLetter}$2:$${colLetter}$${rowEnd}`;
  return { ref, colLetter, dataEnd };
}

/** Rows with Excel formulas that recompute RQ1_03 summary columns from 01_Pass_Master. */
export function buildRq1ExcelCheckRows(
  passMasterSheetName: string,
  passRows: Rq2ProviderPassRow[]
): Rq1ExcelCheckRow[] {
  const pk = passMasterColumnRef(passRows, passMasterSheetName, 'provider_key');
  const providerRef = pk.ref();
  const providers = [...MULTI_LLM_PROVIDERS];
  const rows: Rq1ExcelCheckRow[] = [];

  const addProviderMetric = (
    label: string,
    provider: string,
    formulaBody: string,
    matchesColumn: string
  ): void => {
    rows.push({
      metric: label,
      provider,
      formulaText: `=${formulaBody}`,
      matchesColumn,
    });
  };

  for (const provider of providers) {
    const p = `"${provider}"`;
    const smellsBefore = passMasterColumnRef(passRows, passMasterSheetName, 'pmd_smells_before').ref();
    const smellsAfter = passMasterColumnRef(passRows, passMasterSheetName, 'pmd_smells_after').ref();
    const smellsRemoved = passMasterColumnRef(passRows, passMasterSheetName, 'pmd_smells_removed').ref();
    const smellsReductionPct = passMasterColumnRef(passRows, passMasterSheetName, 'pmd_smells_reduction_pct').ref();
    const maintBefore = passMasterColumnRef(passRows, passMasterSheetName, 'maintainability_before').ref();
    const maintAfter = passMasterColumnRef(passRows, passMasterSheetName, 'maintainability_after').ref();
    const verify = passMasterColumnRef(passRows, passMasterSheetName, 'verify_accepted').ref();

    addProviderMetric(
      'PMD smell mean_before',
      provider,
      `AVERAGEIF(${providerRef},${p},${smellsBefore})`,
      'mean_before'
    );
    addProviderMetric(
      'PMD smell mean_after',
      provider,
      `AVERAGEIF(${providerRef},${p},${smellsAfter})`,
      'mean_after'
    );
    addProviderMetric(
      'PMD smell mean_removed',
      provider,
      `AVERAGEIF(${providerRef},${p},${smellsRemoved})`,
      'mean_delta'
    );
    addProviderMetric(
      'PMD smell mean_reduction_%',
      provider,
      `AVERAGEIF(${providerRef},${p},${smellsReductionPct})`,
      'mean_delta'
    );
    addProviderMetric(
      'PMD smell N (finite removed)',
      provider,
      `COUNTIFS(${providerRef},${p},${smellsRemoved},"<>")`,
      'N'
    );
    addProviderMetric(
      'PMD smell pct_improved (removed>0)',
      provider,
      `IF(COUNTIFS(${providerRef},${p},${smellsRemoved},"<>")=0,"",100*COUNTIFS(${providerRef},${p},${smellsRemoved},">0")/COUNTIFS(${providerRef},${p},${smellsRemoved},"<>"))`,
      'pct_improved'
    );
    addProviderMetric(
      'Maintainability mean_delta (after−before)',
      provider,
      `AVERAGEIF(${providerRef},${p},${maintAfter})-AVERAGEIF(${providerRef},${p},${maintBefore})`,
      'mean_delta'
    );
    addProviderMetric(
      'Maintainability pct_improved (delta>0)',
      provider,
      `IF(COUNTIFS(${providerRef},${p},${maintBefore},"<>",${maintAfter},"<>")=0,"",100*SUMPRODUCT((${providerRef}=${p})*(${maintAfter}-${maintBefore}>0)*1)/COUNTIFS(${providerRef},${p},${maintBefore},"<>",${maintAfter},"<>"))`,
      'pct_improved'
    );
    addProviderMetric(
      'verify_accepted rate_pct',
      provider,
      `IF(COUNTIFS(${providerRef},${p},${verify},"yes")+COUNTIFS(${providerRef},${p},${verify},"no")=0,"",100*COUNTIFS(${providerRef},${p},${verify},"yes")/(COUNTIFS(${providerRef},${p},${verify},"yes")+COUNTIFS(${providerRef},${p},${verify},"no")))`,
      'rate_pct (RQ1_01)'
    );
  }

  return rows;
}

/** Excel formula check sheet — references 01_Pass_Master by column name row. */
export function buildRq1ExcelCheckSheetAoa(
  passMasterSheetName: string,
  passRows: Rq2ProviderPassRow[]
): Aoa {
  const keys = passRows.length ? Object.keys(passRows[0]) : [];
  const col = (name: string): string => passMasterColumnRef(passRows, passMasterSheetName, name).colLetter;
  const dataEnd = passRows.length + 1;
  const checkRows = buildRq1ExcelCheckRows(passMasterSheetName, passRows);

  return [
    ['RQ1_03_Excel_CHECK — Recompute key stats from 01_Pass_Master using Excel formulas'],
    [''],
    ['Column D = LIVE Excel formula (opens in Excel and calculates). Column C = same formula as text.'],
    ['Compare column D with the matching row in RQ1_03_Effectiveness_Stats.'],
    ['Assumes 01_Pass_Master data starts row 2, ends row ' + dataEnd + '.'],
    [''],
    ['Metric', 'Provider', 'Excel formula (documentation)', 'Computed value (live)', 'Matches RQ1_03 column'],
    ...checkRows.map((r) => [r.metric, r.provider, r.formulaText, '', r.matchesColumn]),
    [''],
    ['Note: wilcoxon_p, paired_t_p, cohens_d, and Wilson CI require TypeScript (statisticalTests.ts).'],
    ['Pass master column letters for this export:', keys.map((k) => `${k}=${col(k)}`).join(', ')],
  ];
}

export function appendStatsTable(aoa: Aoa, statsRows: Aoa): Aoa {
  return [...aoa, STATS_TABLE_HEADER, ...statsRows.slice(4)];
}

/** Markdown reference copied into STUDY-Dataset/05_reference/ */
export function buildAnalysisReferenceMarkdown(fileCount: number, passCount: number): string {
  const statsRows = buildStatsColumnFormulasAoa().slice(3);
  const passRows = buildPassColumnFormulasAoa().slice(3);
  const statsTable = statsRows
    .filter((r) => r.length >= 4 && String(r[0]).trim())
    .map((r) => `| ${r.slice(0, 4).map((c) => String(c).replace(/\|/g, '\\|')).join(' | ')} |`)
    .join('\n');
  const passTable = passRows
    .filter((r) => r.length >= 4 && String(r[0]).trim())
    .map((r) => `| ${r.slice(0, 4).map((c) => String(c).replace(/\|/g, '\\|')).join(' | ')} |`)
    .join('\n');

  return [
    '# Study dataset — Analysis Guide & Formulas',
    '',
    'Companion to **STUDY_PAPER_READY.xlsx**. Same content as Excel tabs `00_ANALYSIS_GUIDE`, `97_Stats_Column_Formulas`, and `98_Pass_Column_Formulas`.',
    '',
    '## Cohort',
    '',
    `- **${fileCount}** Java files (527 frontier cohort, \`A_frontier_parallel\`)`,
    `- **${passCount}** provider pass rows (527 × 3 LLMs)`,
    '- Unit of analysis for RQ1 paired tests: **one provider pass row** (file × provider)',
    '',
    '## Research questions',
    '',
    '**RQ1:** To what extent does the multi-agent workflow reduce code smells and improve automated quality indicators?',
    '',
    '**RQ2:** How do refactoring outcomes differ across LLM providers under the same multi-agent workflow?',
    '',
    '## Which Excel tab to open',
    '',
    '| Tab | Purpose |',
    '|-----|---------|',
    '| `00_ANALYSIS_GUIDE` | Plain-English orientation |',
    '| `97_Stats_Column_Formulas` | Formula for every stats column |',
    '| `98_Pass_Column_Formulas` | Source of every raw pass column |',
    '| `01_Pass_Master` | All 1581 pass rows (raw input to stats) |',
    '| `RQ1_01_Acceptance` | Acceptance / change rates + Wilson CI |',
    '| `RQ1_02_Rejection` | Failure and rejection categories |',
    '| `RQ1_03_Effectiveness_Stats` | **Main RQ1 table** — paired before/after tests |',
    '| `RQ1_03_Excel_CHECK` | **Verify** means/rates with live Excel formulas |',
    '| `RQ1_04_File_Master` | 527 files × provider summary |',
    '| `RQ2_01_Provider_Compare` | **Main RQ2 table** — Friedman + pairwise Wilcoxon |',
    '| `99_Data_Quality` | Missing-data and coverage audit |',
    '',
    '## How to verify a number is not fixed',
    '',
    '1. Find the row in `RQ1_03_Effectiveness_Stats` (e.g. provider=openai, metric=PMD smells).',
    '2. Open `RQ1_03_Excel_CHECK` — column **D** recalculates from `01_Pass_Master`.',
    '3. Compare `mean_delta`, `mean_before`, `pct_improved` with the stats table.',
    '4. For `wilcoxon_p`, `cohens_d`, Wilson CI: see formulas below (computed in TypeScript).',
    '',
    '## RQ1_03 — Key concepts',
    '',
    '### Unit of analysis',
    'One row in `01_Pass_Master` = one file × one LLM provider.',
    '',
    '### Improvement direction (`pct_improved`)',
    '- **Paired** (mean_delta = after−before, improved when delta < 0): PMD smells, complexity, LOC',
    '- **One-sample** (pmd_smells_removed > 0): count of smells removed per pass',
    '- **Higher is better**: maintainability, testability, overall score, smell resolution %, reduction %',
    '',
    '### Statistical tests',
    '- **Wilcoxon signed-rank** (`wilcoxon_p`) — PRIMARY paired test; H₀: median change = 0',
    '- **Paired t-test** (`paired_t_p`) — sensitivity only',
    "- **Cohen's d** (`cohens_d`) — effect size = mean_delta / SD(delta)",
    '',
    '## Stats column formulas (RQ1_03 / RQ2_01)',
    '',
    '| column | plain_english | formula | notes |',
    '|--------|---------------|---------|-------|',
    statsTable,
    '',
    '## Pass row columns (01_Pass_Master)',
    '',
    '| column | source_in_saved_json | computation_formula | description |',
    '|--------|----------------------|---------------------|-------------|',
    passTable,
    '',
    '## Code (reproducibility)',
    '',
    '- `web/app/app/lib/statisticalTests.ts` — Wilcoxon, Wilson, Cohen d, Friedman, Holm',
    '- `web/app/app/lib/researchStatisticalAnalysis.ts` — builds RQ1_03 / RQ2_01 rows',
    '- `web/app/app/lib/researchAnalysisExports.ts` — builds pass rows from saved JSON',
    '- Regenerate dataset: `cd web/app && npm run export:icse-dataset`',
  ].join('\n');
}

export function buildPaperReadySheetIndexMarkdown(): string {
  return [
    '# STUDY_PAPER_READY.xlsx — Sheet Index',
    '',
    '| Sheet | RQ | Description |',
    '|-------|-----|-------------|',
    '| `00_START_HERE` | — | Export metadata and tab map |',
    '| `00_ANALYSIS_GUIDE` | Both | Full plain-English analysis guide |',
    '| `97_Stats_Column_Formulas` | Both | Every computed stats column explained |',
    '| `98_Pass_Column_Formulas` | Both | Every raw pass column explained |',
    '| `01_Pass_Master` | Audit | 1581 rows — all provider passes |',
    '| `RQ1_03_Effectiveness_Stats` | RQ1 | Paired before/after + Wilcoxon (main table) |',
    '| `RQ1_03_Excel_CHECK` | RQ1 | Live Excel formulas to verify RQ1_03 |',
    '| `RQ1_01_Acceptance` | RQ1 | verify_accepted / changed / ok rates + Wilson CI |',
    '| `RQ1_02_Rejection` | RQ1 | Rejection and failure categories |',
    '| `RQ1_04_File_Master` | RQ1 | Per-file summary across providers |',
    '| `RQ2_01_Provider_Compare` | RQ2 | Friedman + Holm-adjusted pairwise Wilcoxon |',
    '| `99_Data_Quality` | Methods | Coverage and missing metrics |',
    '',
    'CSV copies of all analysis sheets: `04_paper_ready/rq_analysis_csv/`',
  ].join('\n');
}
