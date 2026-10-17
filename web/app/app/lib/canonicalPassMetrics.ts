/**
 * Canonical before/after metrics for exports — prefer saved comparison, fall back to run record.
 */

import type { MultiLlmRunRecord } from './batchRunStorage';
import { researchPayloadFromRecord } from './researchMetricSections';

export type CanonicalPmdSmells = {
  before: number | '';
  after: number | '';
  /** Smells removed = before − after (positive means fewer smells remain). */
  removed: number | '';
  /** % of baseline smells removed. */
  reduction_pct: number | '';
  /** Signed change = after − before (negative means improvement for smells). */
  delta_signed: number | '';
  source: 'comparison' | 'run_record' | 'missing';
  run_before: number | '';
  run_after: number | '';
  comparison_before: number | '';
  comparison_after: number | '';
  run_vs_comparison_match: 'yes' | 'no' | 'n/a';
};

function num(v: unknown): number | '' {
  return typeof v === 'number' && Number.isFinite(v) ? v : '';
}

function reductionPct(before: number, after: number): number {
  if (before <= 0) return after === 0 ? 100 : 0;
  return Math.round((1000 * (before - after)) / before) / 10;
}

export function canonicalPmdSmells(
  run: Pick<MultiLlmRunRecord, 'smellsBefore' | 'smellsAfter' | 'smellDelta' | 'researchMetrics'>
): CanonicalPmdSmells {
  const rm = researchPayloadFromRecord(run.researchMetrics as Record<string, unknown> | undefined);
  const cmp = rm?.comparison?.pmd_smell_total;
  const cmpB = num(cmp?.before);
  const cmpA = num(cmp?.after);
  const runB = num(run.smellsBefore);
  const runA = num(run.smellsAfter);

  let before: number | '' = '';
  let after: number | '' = '';
  let source: CanonicalPmdSmells['source'] = 'missing';

  if (cmpB !== '' && cmpA !== '') {
    before = cmpB;
    after = cmpA;
    source = 'comparison';
  } else if (runB !== '' && runA !== '') {
    before = runB;
    after = runA;
    source = 'run_record';
  }

  let removed: number | '' = '';
  let reduction_pct: number | '' = '';
  let delta_signed: number | '' = '';

  if (before !== '' && after !== '') {
    removed = (before as number) - (after as number);
    reduction_pct = reductionPct(before as number, after as number);
    delta_signed = (after as number) - (before as number);
  } else if (num(run.smellDelta) !== '') {
    removed = num(run.smellDelta);
  }

  let run_vs_comparison_match: CanonicalPmdSmells['run_vs_comparison_match'] = 'n/a';
  if (cmpB !== '' && cmpA !== '' && runB !== '' && runA !== '') {
    run_vs_comparison_match = cmpB === runB && cmpA === runA ? 'yes' : 'no';
  }

  return {
    before,
    after,
    removed,
    reduction_pct,
    delta_signed,
    source,
    run_before: runB,
    run_after: runA,
    comparison_before: cmpB,
    comparison_after: cmpA,
    run_vs_comparison_match,
  };
}

/** Apply clear PMD smell columns (matches UI: before → after, smells removed, %). */
export function applyCanonicalPmdToRow(
  row: Record<string, string | number | boolean>,
  run: Pick<MultiLlmRunRecord, 'smellsBefore' | 'smellsAfter' | 'smellDelta' | 'researchMetrics'>
): void {
  const c = canonicalPmdSmells(run);
  row.pmd_smells_before = c.before;
  row.pmd_smells_after = c.after;
  row.pmd_smells_remaining = c.after;
  row.pmd_smells_removed = c.removed;
  row.pmd_smells_reduction_pct = c.reduction_pct;
  row.pmd_smells_delta = c.removed;
  row.pmd_smells_delta_signed = c.delta_signed;
  row.pmd_smells_source = c.source;
  row.run_smells_before = c.run_before;
  row.run_smells_after = c.run_after;
  row.smell_run_vs_comparison_match = c.run_vs_comparison_match;
  if (c.removed !== '') {
    row.pmd_smells_improved = (c.removed as number) > 0 ? 'yes' : (c.removed as number) < 0 ? 'no' : 'no';
  }
}

/** For lower-is-better metrics: add removed count + reduction % (complexity, LOC, …). */
export function enrichLowerIsBetterMetric(
  row: Record<string, string | number | boolean>,
  prefix: string
): void {
  const b = num(row[`${prefix}_before`]);
  const a = num(row[`${prefix}_after`]);
  if (b === '' || a === '') return;
  const removed = (b as number) - (a as number);
  row[`${prefix}_remaining`] = a;
  row[`${prefix}_removed`] = removed;
  row[`${prefix}_reduction_pct`] = reductionPct(b as number, a as number);
  row[`${prefix}_delta`] = removed;
  row[`${prefix}_delta_signed`] = (a as number) - (b as number);
}

/** For higher-is-better metrics: add gain count + gain %. */
export function enrichHigherIsBetterMetric(
  row: Record<string, string | number | boolean>,
  prefix: string
): void {
  const b = num(row[`${prefix}_before`]);
  const a = num(row[`${prefix}_after`]);
  if (b === '' || a === '') return;
  const gain = (a as number) - (b as number);
  row[`${prefix}_gain`] = gain;
  row[`${prefix}_gain_pct`] =
    (b as number) > 0 ? Math.round((1000 * gain) / (b as number)) / 10 : gain > 0 ? 100 : 0;
  row[`${prefix}_delta`] = gain;
  row[`${prefix}_delta_signed`] = gain;
}
