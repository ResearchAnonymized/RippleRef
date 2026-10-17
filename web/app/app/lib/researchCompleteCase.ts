/**
 * Balanced complete-case cohorts — equal N per provider and per metric.
 */

import { MULTI_LLM_PROVIDERS } from './multiLlmExport';
import type { Rq2ProviderPassRow } from './researchAnalysisExports';

export type BalancedCohortMode = 'full' | 'run';

/** All metrics used in paired + delta statistical tests (full complete-case). */
export const FULL_BALANCED_METRIC_KEYS: (keyof Rq2ProviderPassRow)[] = [
  'pmd_smells_before',
  'pmd_smells_after',
  'pmd_smells_delta',
  'complexity_before',
  'complexity_after',
  'maintainability_before',
  'maintainability_after',
  'testability_before',
  'testability_after',
  'loc_before',
  'loc_after',
  'overall_score',
  'smell_resolution_rate_pct',
  'smell_delta',
  'loc_delta',
];

/** Run-level metrics only — larger balanced cohort (~289 files). */
export const RUN_BALANCED_METRIC_KEYS: (keyof Rq2ProviderPassRow)[] = [
  'smells_before',
  'smells_after',
  'smell_delta',
  'loc_delta',
];

export function passHasAllMetrics(
  row: Rq2ProviderPassRow,
  keys: readonly (keyof Rq2ProviderPassRow)[]
): boolean {
  return keys.every((k) => {
    const v = row[k];
    return v !== '' && v !== undefined && v !== null;
  });
}

function passesByFile(rows: Rq2ProviderPassRow[]): Map<string, Rq2ProviderPassRow[]> {
  const map = new Map<string, Rq2ProviderPassRow[]>();
  for (const r of rows) {
    if (!map.has(r.file_path)) map.set(String(r.file_path), []);
    map.get(String(r.file_path))!.push(r);
  }
  return map;
}

function providerPass(
  passes: Rq2ProviderPassRow[],
  provider: string
): Rq2ProviderPassRow | undefined {
  return passes.find((p) => p.provider_key === provider);
}

/** Files where OpenAI, Google, and Anthropic each have all required metrics. */
export function balancedFilePaths(
  rows: Rq2ProviderPassRow[],
  mode: BalancedCohortMode
): Set<string> {
  const keys = mode === 'full' ? FULL_BALANCED_METRIC_KEYS : RUN_BALANCED_METRIC_KEYS;
  const out = new Set<string>();
  for (const [filePath, passes] of passesByFile(rows)) {
    const complete = MULTI_LLM_PROVIDERS.every((pk) => {
      const p = providerPass(passes, pk);
      return p && passHasAllMetrics(p, keys);
    });
    if (complete) out.add(filePath);
  }
  return out;
}

export function filterBalancedCompletePassRows(
  rows: Rq2ProviderPassRow[],
  mode: BalancedCohortMode
): Rq2ProviderPassRow[] {
  const keep = balancedFilePaths(rows, mode);
  return rows.filter((r) => keep.has(String(r.file_path)));
}

export type BalancedCohortSummary = {
  mode: BalancedCohortMode;
  label: string;
  source_pass_rows: number;
  source_files: number;
  balanced_files: number;
  balanced_pass_rows: number;
  passes_per_provider: Record<string, number>;
  dropped_files: number;
};

export function summarizeBalancedCohort(
  rows: Rq2ProviderPassRow[],
  mode: BalancedCohortMode
): BalancedCohortSummary {
  const byFile = passesByFile(rows);
  const keep = balancedFilePaths(rows, mode);
  const filtered = filterBalancedCompletePassRows(rows, mode);
  const perProvider: Record<string, number> = {};
  for (const pk of MULTI_LLM_PROVIDERS) {
    perProvider[pk] = filtered.filter((r) => r.provider_key === pk).length;
  }
  return {
    mode,
    label: mode === 'full' ? 'balanced_full_all_metrics' : 'balanced_run_metrics',
    source_pass_rows: rows.length,
    source_files: byFile.size,
    balanced_files: keep.size,
    balanced_pass_rows: filtered.length,
    passes_per_provider: perProvider,
    dropped_files: byFile.size - keep.size,
  };
}

export function buildBalancedNSummaryAoa(summaries: BalancedCohortSummary[]): (string | number | boolean)[][] {
  const rows: (string | number | boolean)[][] = [
    ['Balanced complete-case cohorts — equal N per provider and per metric'],
    [
      'Use FULL cohort when all metrics must share the same N. Use RUN cohort (~289 files) for smell/LOC-only claims.',
    ],
    [''],
    [
      'cohort',
      'source_files',
      'balanced_files',
      'dropped_files',
      'passes_total',
      'N_openai',
      'N_google',
      'N_anthropic',
      'equal_N_per_provider',
    ],
  ];
  for (const s of summaries) {
    const eq = MULTI_LLM_PROVIDERS.every(
      (pk) => s.passes_per_provider[pk] === s.balanced_files
    );
    rows.push([
      s.label,
      s.source_files,
      s.balanced_files,
      s.dropped_files,
      s.balanced_pass_rows,
      s.passes_per_provider.openai ?? 0,
      s.passes_per_provider.google ?? 0,
      s.passes_per_provider.anthropic ?? 0,
      eq ? 'yes' : 'no',
    ]);
  }
  rows.push(['']);
  rows.push(['Notes']);
  rows.push([
    '',
    '293 = extended multi-LLM files (cohorts A+B). Not all have full 15-section metrics on every provider pass.',
  ]);
  rows.push([
    '',
    '169 = files kept for FULL balanced analysis (3 providers × all test metrics present).',
  ]);
  rows.push([
    '',
    '289 = files kept for RUN balanced analysis (smell_delta + LOC on all 3 providers).',
  ]);
  return rows;
}

export function balancedFileListCsv(
  rows: Rq2ProviderPassRow[],
  mode: BalancedCohortMode
): string {
  const keep = balancedFilePaths(rows, mode);
  const header = 'file_path,project_name,cohort,in_current_sample,balanced_cohort';
  const lines = [header];
  const seen = new Set<string>();
  for (const r of rows) {
    const fp = String(r.file_path);
    if (!keep.has(fp) || seen.has(fp)) continue;
    seen.add(fp);
    lines.push(
      [
        fp,
        String(r.project_name ?? ''),
        String(r.cohort ?? ''),
        String(r.in_current_sample ?? ''),
        mode === 'full' ? 'balanced_full' : 'balanced_run',
      ]
        .map((c) => (c.includes(',') ? `"${c.replace(/"/g, '""')}"` : c))
        .join(',')
    );
  }
  return lines.join('\n');
}
