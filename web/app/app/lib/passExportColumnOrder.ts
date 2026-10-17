/**
 * Stable column order for Excel/CSV exports — key metrics first (columns A–AZ).
 */

import type { Rq2ProviderPassRow } from './researchAnalysisExports';
import { displayHeadersForKeys } from './passExportColumnLabels';

export type PassExportHeaderMode = 'key' | 'display';

/** Identity + outcome + smell/quality metrics (manual cleaning). */
export const KEY_METRICS_COLUMNS: (keyof Rq2ProviderPassRow | string)[] = [
  'project_name',
  'source_folder',
  'file_name',
  'file_path',
  'provider_key',
  'provider',
  'model',
  'pass_index',
  'ok',
  'changed',
  'verify_accepted',
  'overall_score',
  'pmd_smells_before',
  'pmd_smells_after',
  'pmd_smells_remaining',
  'pmd_smells_removed',
  'pmd_smells_reduction_pct',
  'pmd_smells_delta',
  'pmd_smells_improved',
  'smell_resolution_rate_pct',
  'complexity_before',
  'complexity_after',
  'complexity_removed',
  'complexity_reduction_pct',
  'maintainability_before',
  'maintainability_after',
  'maintainability_gain',
  'maintainability_gain_pct',
  'testability_before',
  'testability_after',
  'testability_gain',
  'testability_gain_pct',
  'loc_before',
  'loc_after',
  'loc_removed',
  'loc_reduction_pct',
  'loc_delta',
  'semantic_overall_preservation_pct',
  'tokens_total',
  'run_smells_before',
  'run_smells_after',
  'has_research_metrics',
  'pmd_smells_source',
  'cohort',
  'in_current_sample',
];

/** Full export: key block first, then remaining columns alphabetically. */
export const EXPORT_PRIMARY_COLUMNS: string[] = [
  ...KEY_METRICS_COLUMNS,
  'workspace_id',
  'model_tier',
  'multi_llm_mode',
  'sample_id',
  'metrics_complete',
  'orchestration',
  'agent_step_count',
  'lines_before',
  'lines_after',
  'loc_delta_run',
  'run_smell_delta',
  'refactoring_successful',
  'meta_llm_provider',
  'pass_scope',
  'smell_resolution_total_before',
  'smell_resolution_total_after',
  'smell_resolution_total_resolved',
  'pmd_smells_delta_signed',
  'smell_run_vs_comparison_match',
  'metrics_sections_present',
];

export function orderedExportColumnKeys(rows: Rq2ProviderPassRow[]): string[] {
  const all = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) all.add(k);
  }
  const primary = EXPORT_PRIMARY_COLUMNS.filter((k) => all.has(k));
  const primarySet = new Set(primary);
  const rest = [...all].filter((k) => !primarySet.has(k)).sort((a, b) => a.localeCompare(b));
  return [...primary, ...rest];
}

export function pickRowColumns(
  row: Rq2ProviderPassRow,
  keys: string[]
): (string | number | boolean)[] {
  return keys.map((k) => row[k] ?? '');
}

export function orderPassExportRows(
  rows: Rq2ProviderPassRow[],
  keys?: string[],
  headerMode: PassExportHeaderMode = 'key'
): { keys: string[]; aoa: (string | number | boolean)[][] } {
  const columnKeys = keys ?? orderedExportColumnKeys(rows);
  const header =
    headerMode === 'display' ? displayHeadersForKeys(columnKeys) : columnKeys;
  const data = rows.map((r) => pickRowColumns(r, columnKeys));
  return { keys: columnKeys, aoa: [header, ...data] };
}

export function keyMetricsRows(rows: Rq2ProviderPassRow[]): Rq2ProviderPassRow[] {
  return rows.map((r) => {
    const out: Rq2ProviderPassRow = {};
    for (const k of KEY_METRICS_COLUMNS) {
      if (r[k] !== undefined) out[k] = r[k];
    }
    return out;
  });
}
