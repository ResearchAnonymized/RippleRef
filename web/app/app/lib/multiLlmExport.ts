/**
 * Multi-LLM chain export helpers (OpenAI → Google → Claude per-pass metrics).
 */

import { buildResearchMetricsSheetCsv } from './exportResearchMetricsCsv';
import { researchPayloadFromRecord } from './researchMetricSections';
import { canonicalPmdSmells } from './canonicalPassMetrics';
import type { MultiLlmRunRecord } from './batchRunStorage';
import type { SavedRefactoringReportBundle } from './savedRefactoringReport';

export const MULTI_LLM_PROVIDERS = ['openai', 'google', 'anthropic'] as const;
export type MultiLlmProviderKey = (typeof MULTI_LLM_PROVIDERS)[number];

export function providerKeyFromRun(run: MultiLlmRunRecord): string {
  const model = (run.model || run.provider || '').toLowerCase();
  if (model.includes('gemini') || model.startsWith('google/')) return 'google';
  if (model.includes('gpt') || model.startsWith('openai/')) return 'openai';
  if (model.includes('claude') || model.startsWith('anthropic/')) return 'anthropic';
  const p = (run.provider || '').toLowerCase();
  if (p.includes('google')) return 'google';
  if (p.includes('openai')) return 'openai';
  if (p.includes('anthropic') || p.includes('claude')) return 'anthropic';
  return p || `pass-${run.passIndex}`;
}

export function multiLlmRunsFromBundle(
  bundle: SavedRefactoringReportBundle | null | undefined
): MultiLlmRunRecord[] {
  if (!bundle) return [];
  if (Array.isArray(bundle.multiLlmRuns) && bundle.multiLlmRuns.length) {
    return bundle.multiLlmRuns;
  }
  const ar = bundle.applyResult;
  if (ar && Array.isArray(ar.multiLlmRuns)) {
    return ar.multiLlmRuns as MultiLlmRunRecord[];
  }
  return [];
}

export function indexRunsByProvider(runs: MultiLlmRunRecord[]): Map<string, MultiLlmRunRecord> {
  const out = new Map<string, MultiLlmRunRecord>();
  for (const run of runs) {
    out.set(providerKeyFromRun(run), run);
  }
  return out;
}

export function locDelta(run: MultiLlmRunRecord): number | '' {
  if (run.linesBefore != null && run.linesAfter != null) {
    return run.linesAfter - run.linesBefore;
  }
  return '';
}

export type FileLevelSmellSummary = {
  before: number | '';
  after: number | '';
  remaining: number | '';
  removed: number | '';
  reduction_pct: number | '';
  delta: number | '';
  source: string;
  provider_key: string;
};

/** File-level smell summary from per-pass researchMetrics (not stale bundle-level comparison). */
export function fileLevelSmellsFromBundle(
  bundle: SavedRefactoringReportBundle | null,
  preferProvider = 'openai'
): FileLevelSmellSummary {
  const empty: FileLevelSmellSummary = {
    before: '',
    after: '',
    remaining: '',
    removed: '',
    reduction_pct: '',
    delta: '',
    source: 'missing',
    provider_key: '',
  };
  const runs = multiLlmRunsFromBundle(bundle);
  if (!runs.length) return empty;

  const byProvider = indexRunsByProvider(runs);
  const run =
    byProvider.get(preferProvider) ??
    runs.find((r) => canonicalPmdSmells(r).before !== '') ??
    runs[0];
  const c = canonicalPmdSmells(run);
  if (c.before === '' && c.after === '') return empty;

  const pk = providerKeyFromRun(run);
  return {
    before: c.before,
    after: c.after,
    remaining: c.after,
    removed: c.removed,
    reduction_pct: c.reduction_pct,
    delta: c.removed,
    source: `pass_${pk}`,
    provider_key: pk,
  };
}

export type MultiLlmWideColumns = Record<string, string | number | boolean>;

/** Wide columns for master sheet — one block per provider (openai, google, anthropic). */
export function extractMultiLlmWideColumns(
  bundle: SavedRefactoringReportBundle | null
): MultiLlmWideColumns {
  const runs = multiLlmRunsFromBundle(bundle);
  const pm = bundle?.pipelineMetadata;
  const byProvider = indexRunsByProvider(runs);
  const row: MultiLlmWideColumns = {
    multi_llm_chain_used: pm?.multiLlmChain === true ? 'yes' : pm?.multiLlmChain === false ? 'no' : '',
    multi_llm_mode: String(pm?.multiLlmMode ?? ''),
    research_artifacts_only: pm?.researchArtifactsOnly === true ? 'yes' : pm?.researchArtifactsOnly === false ? 'no' : '',
    sample_id: String(pm?.sampleId ?? ''),
    multi_llm_pass_count: runs.length,
    has_multi_llm_pass_data: runs.length > 0 ? 'yes' : 'no',
  };
  for (const key of MULTI_LLM_PROVIDERS) {
    const run = byProvider.get(key);
    const prefix = `llm_${key}`;
    if (!run) {
      row[`${prefix}_changed`] = '';
      row[`${prefix}_ok`] = '';
      row[`${prefix}_loc_delta`] = '';
      row[`${prefix}_smell_delta`] = '';
      row[`${prefix}_smells_before`] = '';
      row[`${prefix}_smells_after`] = '';
      row[`${prefix}_smells_removed`] = '';
      row[`${prefix}_smells_reduction_pct`] = '';
      row[`${prefix}_model`] = '';
      row[`${prefix}_full_metrics`] = '';
      continue;
    }
    const smells = canonicalPmdSmells(run);
    row[`${prefix}_changed`] = run.changed ? 'yes' : 'no';
    row[`${prefix}_ok`] = run.ok ? 'yes' : 'no';
    row[`${prefix}_loc_delta`] = locDelta(run);
    row[`${prefix}_smells_before`] = smells.before;
    row[`${prefix}_smells_after`] = smells.after;
    row[`${prefix}_smell_delta`] = smells.removed;
    row[`${prefix}_smells_removed`] = smells.removed;
    row[`${prefix}_smells_reduction_pct`] = smells.reduction_pct;
    row[`${prefix}_model`] = run.model || '';
    row[`${prefix}_full_metrics`] = passHasFullResearchMetrics(run) ? 'yes' : 'no';
  }
  return row;
}

/** True when pass researchMetrics has full comparison + behavioral + smell_resolution. */
export function passHasFullResearchMetrics(run: MultiLlmRunRecord | undefined): boolean {
  const rm = researchPayloadFromRecord(run?.researchMetrics as Record<string, unknown> | undefined);
  if (!rm) return false;
  return Boolean(rm.comparison && rm.behavioral && rm.smell_resolution);
}

/** Stricter complete-case check — non-empty sections (matches Python audit / 450-file cohort). */
export function passHasStrictResearchMetrics(run: MultiLlmRunRecord | undefined): boolean {
  const rm = researchPayloadFromRecord(run?.researchMetrics as Record<string, unknown> | undefined);
  if (!rm) return false;
  const cmp = rm.comparison;
  if (!cmp || typeof cmp !== 'object' || Object.keys(cmp).length === 0) return false;
  const beh = rm.behavioral;
  if (!beh || typeof beh !== 'object') return false;
  const sr = rm.smell_resolution;
  if (!sr || typeof sr !== 'object') return false;
  if (
    sr.by_type === undefined &&
    sr.total_before === undefined &&
    sr.overall_resolution_rate === undefined
  ) {
    return false;
  }
  return true;
}

export function fileHasStrictCompleteCaseMetrics(
  runs: MultiLlmRunRecord[] | null | undefined,
  minPasses = 3
): boolean {
  if (!runs || runs.length < minPasses) return false;
  return runs.length >= minPasses && runs.every((r) => passHasStrictResearchMetrics(r));
}

export type MultiLlmPassRow = {
  project_name: string;
  workspace_id: string;
  file_path: string;
  file_name: string;
  pass_index: number;
  provider: string;
  provider_key: string;
  model: string;
  ok: boolean;
  changed: boolean;
  lines_before: number | '';
  lines_after: number | '';
  loc_delta: number | '';
  smells_before: number | '';
  smells_after: number | '';
  smell_delta: number | '';
  pmd_smells_before: number | '';
  pmd_smells_after: number | '';
  pmd_smells_removed: number | '';
  pmd_smells_reduction_pct: number | '';
  orchestration: string;
  agent_step_count: number;
};

export function extractMultiLlmPassRows(
  ctx: {
    projectName: string;
    workspaceId: string;
    filePath: string;
    fileName: string;
  },
  bundle: SavedRefactoringReportBundle | null
): MultiLlmPassRow[] {
  const runs = multiLlmRunsFromBundle(bundle);
  return runs.map((run) => {
    const smells = canonicalPmdSmells(run);
    return {
      project_name: ctx.projectName,
      workspace_id: ctx.workspaceId,
      file_path: ctx.filePath,
      file_name: ctx.fileName,
      pass_index: run.passIndex,
      provider: run.provider,
      provider_key: providerKeyFromRun(run),
      model: run.model,
      ok: run.ok,
      changed: run.changed,
      lines_before: run.linesBefore ?? '',
      lines_after: run.linesAfter ?? '',
      loc_delta: locDelta(run),
      smells_before: run.smellsBefore ?? '',
      smells_after: run.smellsAfter ?? '',
      smell_delta: run.smellDelta ?? '',
      pmd_smells_before: smells.before,
      pmd_smells_after: smells.after,
      pmd_smells_removed: smells.removed,
      pmd_smells_reduction_pct: smells.reduction_pct,
      orchestration: run.orchestration ?? '',
      agent_step_count: run.agentSteps?.length ?? 0,
    };
  });
}

export function multiLlmPassRowsToAoa(rows: MultiLlmPassRow[]): (string | number | boolean)[][] {
  if (!rows.length) return [['(no multi-LLM pass data)']];
  const keys = Object.keys(rows[0]) as (keyof MultiLlmPassRow)[];
  return [
    keys,
    ...rows.map((r) => keys.map((k) => {
      const v = r[k];
      if (typeof v === 'boolean') return v ? 'yes' : 'no';
      return v ?? '';
    })),
  ];
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

/** Long-format research metrics — one row per metric × file × LLM pass (for provider comparison). */
export function buildMultiLlmMetricsLongAoa(input: {
  projectName: string;
  sourceFolder: string;
  workspaceId: string;
  items: Array<{ filePath: string; fileName: string; bundle: SavedRefactoringReportBundle | null }>;
  exportedAtIso: string;
}): (string | number | boolean)[][] {
  const header = [
    'project_name',
    'source_folder',
    'workspace_id',
    'file_path',
    'file_name',
    'llm_provider',
    'llm_model',
    'pass_index',
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
    const runs = multiLlmRunsFromBundle(item.bundle);
    for (const run of runs) {
      const rm = researchPayloadFromRecord(run.researchMetrics as Record<string, unknown> | undefined);
      if (!rm) continue;
      const csv = buildResearchMetricsSheetCsv({
        workspaceId: input.workspaceId,
        filePath: item.filePath,
        exportedAtIso: input.exportedAtIso,
        metrics: rm,
        pipelineMetadata: {
          model: run.model,
          retryCount: undefined,
          rejectionCategory: undefined,
        },
      });
      for (const line of csv.split(/\r?\n/).slice(1)) {
        if (!line.trim()) continue;
        const cells = parseCsvLine(line);
        if (cells.length < 12) continue;
        rows.push([
          input.projectName,
          input.sourceFolder,
          input.workspaceId,
          item.filePath,
          item.fileName,
          run.provider,
          run.model,
          run.passIndex,
          input.exportedAtIso,
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
  }

  if (rows.length === 1) {
    rows.push(['', '', '', '', '', '', '', '', '', 'note', '', '', 'no_pass_metrics', '', '', '', '', '']);
  }
  return rows;
}

export const FULL_PASS_METRIC_SECTIONS = [
  'comparison',
  'behavioral',
  'structural',
  'practices_applied',
  'summary',
  'halstead',
  'method_lengths',
  'nesting_depth',
  'coupling',
  'cohesion',
  'diff_churn',
  'semantic_preservation',
  'token_efficiency',
  'smell_resolution',
  'meta',
] as const;

const PROVIDER_COMPARISON_KEYS = [
  'pmd_smell_total',
  'complexity',
  'maintainability',
  'testability',
  'lines_of_code',
  'method_count',
] as const;

export type MultiLlmAgentStepRow = {
  project_name: string;
  workspace_id: string;
  file_path: string;
  file_name: string;
  pass_index: number;
  provider: string;
  provider_key: string;
  model: string;
  step_index: number;
  step_name: string;
  agent: string;
  step_status: string;
  step_error: string;
};

export function extractMultiLlmAgentStepRows(
  ctx: {
    projectName: string;
    workspaceId: string;
    filePath: string;
    fileName: string;
  },
  bundle: SavedRefactoringReportBundle | null
): MultiLlmAgentStepRow[] {
  const runs = multiLlmRunsFromBundle(bundle);
  const out: MultiLlmAgentStepRow[] = [];
  for (const run of runs) {
    const steps = run.agentSteps ?? [];
    steps.forEach((step, stepIndex) => {
      out.push({
        project_name: ctx.projectName,
        workspace_id: ctx.workspaceId,
        file_path: ctx.filePath,
        file_name: ctx.fileName,
        pass_index: run.passIndex,
        provider: run.provider,
        provider_key: providerKeyFromRun(run),
        model: run.model,
        step_index: stepIndex,
        step_name: step.name,
        agent: step.agent,
        step_status: step.status,
        step_error: String(step.details?.error ?? ''),
      });
    });
  }
  return out;
}

export function agentStepRowsToAoa(rows: MultiLlmAgentStepRow[]): (string | number | boolean)[][] {
  if (!rows.length) return [['(no agent step data)']];
  const keys = Object.keys(rows[0]) as (keyof MultiLlmAgentStepRow)[];
  return [keys, ...rows.map((r) => keys.map((k) => r[k] ?? ''))];
}

export function buildMultiLlmComparisonWideAoa(input: {
  projectName: string;
  sourceFolder: string;
  workspaceId: string;
  items: Array<{ filePath: string; fileName: string; bundle: SavedRefactoringReportBundle | null }>;
}): (string | number | boolean)[][] {
  const baseCols = [
    'project_name',
    'source_folder',
    'workspace_id',
    'file_path',
    'file_name',
    'multi_llm_pass_count',
  ];
  const providerCols: string[] = [];
  for (const pk of MULTI_LLM_PROVIDERS) {
    for (const metric of PROVIDER_COMPARISON_KEYS) {
      providerCols.push(`${pk}_${metric}_before`);
      providerCols.push(`${pk}_${metric}_after`);
      providerCols.push(`${pk}_${metric}_delta`);
    }
    providerCols.push(`${pk}_overall_score`);
    providerCols.push(`${pk}_verify_accepted`);
  }
  const header = [...baseCols, ...providerCols];
  const rows: (string | number | boolean)[][] = [header];

  for (const item of input.items) {
    const runs = multiLlmRunsFromBundle(item.bundle);
    const byProvider = indexRunsByProvider(runs);
    const row: Record<string, string | number | boolean> = {
      project_name: input.projectName,
      source_folder: input.sourceFolder,
      workspace_id: input.workspaceId,
      file_path: item.filePath,
      file_name: item.fileName,
      multi_llm_pass_count: runs.length,
    };
    for (const pk of MULTI_LLM_PROVIDERS) {
      const run = byProvider.get(pk);
      const rm = researchPayloadFromRecord(run?.researchMetrics as Record<string, unknown> | undefined);
      for (const metric of PROVIDER_COMPARISON_KEYS) {
        const ba = rm?.comparison?.[metric];
        row[`${pk}_${metric}_before`] = ba?.before ?? '';
        row[`${pk}_${metric}_after`] = ba?.after ?? '';
        row[`${pk}_${metric}_delta`] = ba?.change ?? '';
      }
      row[`${pk}_overall_score`] = rm?.meta?.overallScore ?? '';
      row[`${pk}_verify_accepted`] =
        rm?.meta?.verifyAccepted === undefined ? '' : rm.meta.verifyAccepted ? 'yes' : 'no';
    }
    rows.push(header.map((k) => row[k] ?? ''));
  }

  if (rows.length === 1) {
    rows.push(header.map((k) => (k === 'file_path' ? 'no multi-LLM comparison data' : '')));
  }
  return rows;
}
