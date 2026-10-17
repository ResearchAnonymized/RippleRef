/**
 * Extract before/after research metrics from a refactor API response for batch results UI.
 */

import type { RefactorApiResponse } from './ingestRefactorResponse';
import { improvementStatsFromRefactorResponse } from './ingestRefactorResponse';
import type { ResearchMetricsPayload } from './exportResearchMetricsCsv';

export type MetricBeforeAfter = {
  before?: number;
  after?: number;
  change?: number;
  improved?: boolean | null;
};

export type BatchFileMetrics = {
  pmdSmells: MetricBeforeAfter;
  smellsCritical: MetricBeforeAfter;
  smellsMajor: MetricBeforeAfter;
  smellsMinor: MetricBeforeAfter;
  linesOfCode: MetricBeforeAfter;
  complexity: MetricBeforeAfter;
  maintainability: MetricBeforeAfter;
  testability: MetricBeforeAfter;
  methodCount: MetricBeforeAfter;
  overallScore?: number;
  semanticPreservationPct?: number;
  smellResolutionPct?: number;
  diffChurnPct?: number;
  tokensTotal?: number;
  researchMetrics: ResearchMetricsPayload | null;
  pipelineMetadata: Record<string, unknown> | null;
};

function emptyMetric(): MetricBeforeAfter {
  return {};
}

/** Ensure every metric group exists — persisted batch rows may only have partial fields. */
export function normalizeBatchFileMetrics(
  metrics: BatchFileMetrics | Partial<BatchFileMetrics> | null | undefined
): BatchFileMetrics | null {
  if (!metrics) return null;
  return {
    pmdSmells: metrics.pmdSmells ?? emptyMetric(),
    smellsCritical: metrics.smellsCritical ?? emptyMetric(),
    smellsMajor: metrics.smellsMajor ?? emptyMetric(),
    smellsMinor: metrics.smellsMinor ?? emptyMetric(),
    linesOfCode: metrics.linesOfCode ?? emptyMetric(),
    complexity: metrics.complexity ?? emptyMetric(),
    maintainability: metrics.maintainability ?? emptyMetric(),
    testability: metrics.testability ?? emptyMetric(),
    methodCount: metrics.methodCount ?? emptyMetric(),
    overallScore: metrics.overallScore,
    semanticPreservationPct: metrics.semanticPreservationPct,
    smellResolutionPct: metrics.smellResolutionPct,
    diffChurnPct: metrics.diffChurnPct,
    tokensTotal: metrics.tokensTotal,
    researchMetrics: metrics.researchMetrics ?? null,
    pipelineMetadata: metrics.pipelineMetadata ?? null,
  };
}

export function minimalBatchFileMetrics(
  smellsBefore?: number,
  smellsAfter?: number
): BatchFileMetrics | null {
  if (smellsBefore == null && smellsAfter == null) return null;
  return normalizeBatchFileMetrics({
    pmdSmells: { before: smellsBefore, after: smellsAfter },
  });
}

function baFrom(
  comparison: ResearchMetricsPayload['comparison'] | undefined,
  key: string
): MetricBeforeAfter {
  const d = comparison?.[key];
  if (!d) return {};
  return {
    before: d.before,
    after: d.after,
    change: d.change,
    improved: d.improved,
  };
}

export function extractBatchFileMetrics(
  data: RefactorApiResponse | null | undefined
): BatchFileMetrics | null {
  if (!data) return null;

  const rm = (data.researchMetrics as ResearchMetricsPayload | null) || null;
  const comparison = rm?.comparison;
  const stats = improvementStatsFromRefactorResponse(data);

  const pmd = baFrom(comparison, 'pmd_smell_total');
  if (pmd.before == null && stats) {
    pmd.before = stats.before.total;
    pmd.after = stats.after.total;
    pmd.change = stats.delta.total;
    pmd.improved = stats.delta.total > 0;
  }

  const smellsCritical = baFrom(comparison, 'smells_critical');
  const smellsMajor = baFrom(comparison, 'smells_major');
  const smellsMinor = baFrom(comparison, 'smells_minor');
  if (stats && smellsCritical.before == null) {
    smellsCritical.before = stats.before.critical;
    smellsCritical.after = stats.after.critical;
    smellsCritical.change = stats.delta.critical;
  }
  if (stats && smellsMajor.before == null) {
    smellsMajor.before = stats.before.major;
    smellsMajor.after = stats.after.major;
    smellsMajor.change = stats.delta.major;
  }
  if (stats && smellsMinor.before == null) {
    smellsMinor.before = stats.before.minor;
    smellsMinor.after = stats.after.minor;
    smellsMinor.change = stats.delta.minor;
  }

  return {
    pmdSmells: pmd,
    smellsCritical,
    smellsMajor,
    smellsMinor,
    linesOfCode: baFrom(comparison, 'lines_of_code'),
    complexity: baFrom(comparison, 'complexity'),
    maintainability: baFrom(comparison, 'maintainability'),
    testability: baFrom(comparison, 'testability'),
    methodCount: baFrom(comparison, 'method_count'),
    overallScore: rm?.meta?.overallScore,
    semanticPreservationPct: rm?.semantic_preservation?.overall_preservation_rate,
    smellResolutionPct: rm?.smell_resolution?.overall_resolution_rate,
    diffChurnPct: rm?.diff_churn?.churn_rate_percent,
    tokensTotal: rm?.token_efficiency?.total_tokens,
    researchMetrics: rm,
    pipelineMetadata: (data.pipelineMetadata as Record<string, unknown>) || null,
  };
}

export function formatBeforeAfter(m: MetricBeforeAfter | null | undefined, decimals = 0): string {
  if (!m) return '—';
  if (m.before == null && m.after == null) return '—';
  const fmt = (n: number) => (decimals ? n.toFixed(decimals) : String(Math.round(n)));
  if (m.before != null && m.after != null) {
    return `${fmt(m.before)} → ${fmt(m.after)}`;
  }
  if (m.before != null) return String(fmt(m.before));
  if (m.after != null) return `→ ${fmt(m.after)}`;
  return '—';
}

export function formatDelta(m: MetricBeforeAfter | null | undefined, lowerIsBetter = true): string {
  if (!m) return '—';
  if (m.change != null) {
    if (m.change === 0) return '0';
    const improved = m.improved ?? (lowerIsBetter ? m.change > 0 : m.change < 0);
    const sign = improved ? '−' : '+';
    return `${sign}${Math.abs(m.change)}`;
  }
  if (m.before != null && m.after != null) {
    const raw = m.before - m.after;
    if (raw === 0) return '0';
    const improved = lowerIsBetter ? raw > 0 : raw < 0;
    return `${improved ? '−' : '+'}${Math.abs(raw)}`;
  }
  return '—';
}

export function deltaColorClass(m: MetricBeforeAfter | null | undefined, lowerIsBetter = true): string {
  if (!m) return 'text-slate-400';
  if (m.improved === true) return 'text-green-400';
  if (m.improved === false) return 'text-red-400';
  const ch =
    m.change ?? (m.before != null && m.after != null ? m.before - m.after : undefined);
  if (ch == null || ch === 0) return 'text-slate-400';
  const improved = lowerIsBetter ? ch > 0 : ch < 0;
  return improved ? 'text-green-400' : 'text-red-400';
}
