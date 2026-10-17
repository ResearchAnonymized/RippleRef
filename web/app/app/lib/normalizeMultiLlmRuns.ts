import type { MultiLlmRunRecord } from './batchRunStorage';

/** Normalize /agents/refactor multiLlmRuns for batch UI and persistence. */
export function normalizeMultiLlmRuns(raw: unknown): MultiLlmRunRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, idx) => {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const smellsBefore =
      typeof r.smellsBefore === 'number' ? r.smellsBefore : undefined;
    const smellsAfter = typeof r.smellsAfter === 'number' ? r.smellsAfter : undefined;
    const smellDelta =
      typeof r.smellDelta === 'number'
        ? r.smellDelta
        : smellsBefore != null && smellsAfter != null
          ? smellsBefore - smellsAfter
          : undefined;
    const agentSteps = Array.isArray(r.agentSteps)
      ? (r.agentSteps as Array<Record<string, unknown>>).map((s) => ({
          name: String(s.name ?? ''),
          agent: String(s.agent ?? ''),
          status: String(s.status ?? ''),
          details:
            s.details && typeof s.details === 'object'
              ? (s.details as Record<string, unknown>)
              : undefined,
        }))
      : [];
    return {
      passIndex: typeof r.passIndex === 'number' ? r.passIndex : idx,
      provider: String(r.provider ?? ''),
      model: String(r.model ?? ''),
      ok: Boolean(r.ok),
      changed: Boolean(r.changed),
      linesBefore: typeof r.linesBefore === 'number' ? r.linesBefore : undefined,
      linesAfter: typeof r.linesAfter === 'number' ? r.linesAfter : undefined,
      smellsBefore,
      smellsAfter,
      smellDelta,
      orchestration: typeof r.orchestration === 'string' ? r.orchestration : undefined,
      agentSteps,
      researchMetrics:
        r.researchMetrics && typeof r.researchMetrics === 'object'
          ? (r.researchMetrics as Record<string, unknown>)
          : undefined,
      experiment:
        r.experiment && typeof r.experiment === 'object'
          ? (r.experiment as Record<string, unknown>)
          : undefined,
    };
  });
}
