/**
 * Aggregate batch + multi-LLM pass data into chart rows for research questions (RQs).
 */

import type { MultiLlmRunRecord } from './batchRunStorage';
import type { BatchFileMetrics } from './batchResultMetrics';

export type BatchFileForRq = {
  fileName: string;
  status: string;
  metrics?: BatchFileMetrics | null;
  multiLlmRuns?: MultiLlmRunRecord[];
};

export type ProviderAggregate = {
  provider: string;
  model: string;
  passCount: number;
  changedCount: number;
  okCount: number;
  avgSmellDelta: number;
  avgLocDelta: number;
  avgComplexityDelta: number;
  avgMaintainabilityDelta: number;
  avgTestabilityDelta: number;
};

export type RqSummary = {
  totalFiles: number;
  accepted: number;
  rejected: number;
  errors: number;
  avgFinalSmellDelta: number;
  avgFinalOverallScore: number;
  providerAggregates: ProviderAggregate[];
};

function num(v: unknown): number | undefined {
  return typeof v === 'number' && !Number.isNaN(v) ? v : undefined;
}

export function aggregateProviderStats(results: BatchFileForRq[]): ProviderAggregate[] {
  const byProvider = new Map<
    string,
    {
      model: string;
      passes: MultiLlmRunRecord[];
    }
  >();

  for (const file of results) {
    for (const run of file.multiLlmRuns ?? []) {
      const key = run.provider || `pass-${run.passIndex}`;
      const bucket = byProvider.get(key) ?? { model: run.model, passes: [] };
      bucket.model = run.model;
      bucket.passes.push(run);
      byProvider.set(key, bucket);
    }
  }

  return Array.from(byProvider.entries()).map(([provider, { model, passes }]) => {
    let smellDeltas: number[] = [];
    let locDeltas: number[] = [];
    let ccDeltas: number[] = [];
    let miDeltas: number[] = [];
    let testDeltas: number[] = [];

    for (const p of passes) {
      if (p.smellDelta != null) smellDeltas.push(p.smellDelta);
      if (p.linesBefore != null && p.linesAfter != null) {
        locDeltas.push(p.linesAfter - p.linesBefore);
      }
      const qm = (p.researchMetrics as { qualityMetrics?: { before?: Record<string, number>; after?: Record<string, number> } } | undefined)
        ?.qualityMetrics;
      if (qm?.before && qm?.after) {
        const ccB = num(qm.before.complexity);
        const ccA = num(qm.after.complexity);
        if (ccB != null && ccA != null) ccDeltas.push(ccA - ccB);
        const miB = num(qm.before.maintainability);
        const miA = num(qm.after.maintainability);
        if (miB != null && miA != null) miDeltas.push(miA - miB);
        const tB = num(qm.before.testability);
        const tA = num(qm.after.testability);
        if (tB != null && tA != null) testDeltas.push(tA - tB);
      }
    }

    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    return {
      provider,
      model,
      passCount: passes.length,
      changedCount: passes.filter((p) => p.changed).length,
      okCount: passes.filter((p) => p.ok).length,
      avgSmellDelta: avg(smellDeltas),
      avgLocDelta: avg(locDeltas),
      avgComplexityDelta: avg(ccDeltas),
      avgMaintainabilityDelta: avg(miDeltas),
      avgTestabilityDelta: avg(testDeltas),
    };
  });
}

export function buildRqSummary(results: BatchFileForRq[]): RqSummary {
  const accepted = results.filter((r) => r.status === 'accepted').length;
  const rejected = results.filter((r) => r.status === 'rejected').length;
  const errors = results.filter((r) => r.status === 'error').length;

  const finalSmellDeltas = results
    .map((r) => {
      const pmd = r.metrics?.pmdSmells;
      if (pmd?.change != null) return pmd.change;
      if (pmd?.after != null && pmd?.before != null) {
        return (pmd.before ?? 0) - (pmd.after ?? 0);
      }
      return undefined;
    })
    .filter((v): v is number => v != null);

  const scores = results
    .map((r) => r.metrics?.overallScore)
    .filter((v): v is number => v != null);

  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  return {
    totalFiles: results.length,
    accepted,
    rejected,
    errors,
    avgFinalSmellDelta: avg(finalSmellDeltas),
    avgFinalOverallScore: avg(scores),
    providerAggregates: aggregateProviderStats(results),
  };
}
