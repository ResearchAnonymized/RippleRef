/**
 * Cohort classification for extended research exports (frontier vs legacy, sample membership).
 */

import { fileLevelSmellsFromBundle, indexRunsByProvider, multiLlmRunsFromBundle, passHasFullResearchMetrics } from './multiLlmExport';
import type { MultiLlmRunRecord } from './batchRunStorage';
import type { SavedRefactoringReportBundle } from './savedRefactoringReport';

export type ResearchCohort =
  | 'A_frontier_parallel'
  | 'B_legacy_chain_non_frontier'
  | 'C_no_multi_llm'
  | 'other';

export type CohortMeta = {
  cohort: ResearchCohort;
  model_tier: 'frontier' | 'non_frontier' | 'unknown';
  multi_llm_mode: string;
  in_current_sample: boolean;
  sample_id: string;
  multi_llm_pass_count: number;
  include_in_multi_llm_analysis: boolean;
  metrics_complete_all_passes: boolean;
  backfill: boolean;
  openai_model: string;
  google_model: string;
  anthropic_model: string;
  unchanged_openai: 'yes' | 'no' | '';
  unchanged_google: 'yes' | 'no' | '';
  unchanged_anthropic: 'yes' | 'no' | '';
  research_artifacts_only: 'yes' | 'no' | '';
};

const NON_FRONTIER_MARKERS = ['gpt-4o-mini', 'gemini-2.5-flash', 'claude-sonnet'];
const FRONTIER_MARKERS = ['gpt-5', 'gemini-3', 'claude-opus'];

function modelTierFromRuns(runs: MultiLlmRunRecord[]): 'frontier' | 'non_frontier' | 'unknown' {
  const models = runs.map((r) => (r.model || '').toLowerCase()).join(' ');
  if (NON_FRONTIER_MARKERS.some((m) => models.includes(m))) return 'non_frontier';
  if (FRONTIER_MARKERS.some((m) => models.includes(m))) return 'frontier';
  return 'unknown';
}

function modelForProvider(runs: MultiLlmRunRecord[], provider: string): string {
  const key = provider.toLowerCase();
  for (const r of runs) {
    const p = (r.provider || '').toLowerCase();
    const m = (r.model || '').toLowerCase();
    if (p.includes(key) || (key === 'openai' && m.includes('gpt')) || (key === 'google' && m.includes('gemini')) || (key === 'anthropic' && m.includes('claude'))) {
      return r.model || r.provider || '';
    }
  }
  return '';
}

function unchangedFlag(run: MultiLlmRunRecord | undefined): 'yes' | 'no' | '' {
  if (!run) return '';
  return run.changed === false ? 'yes' : run.changed === true ? 'no' : '';
}

function classifyCohortFromRuns(
  runs: MultiLlmRunRecord[],
  pm: Record<string, unknown>
): ResearchCohort {
  const mode = String(pm.multiLlmMode ?? '');
  if (mode === 'independent_parallel' && runs.length >= 3) return 'A_frontier_parallel';
  if (pm.multiLlmChain === true && runs.length >= 3) {
    const tier = modelTierFromRuns(runs);
    if (tier === 'non_frontier') return 'B_legacy_chain_non_frontier';
    return 'other';
  }
  if (runs.length >= 3) return 'other';
  return 'C_no_multi_llm';
}

export function classifyResearchCohort(
  bundle: SavedRefactoringReportBundle | null | undefined,
  inCurrentSample: boolean
): CohortMeta {
  const pm = (bundle?.pipelineMetadata ?? {}) as Record<string, unknown>;
  const runs = multiLlmRunsFromBundle(bundle);
  const cohort = classifyCohortFromRuns(runs, pm);
  const fullPassCount = runs.filter((r) => passHasFullResearchMetrics(r)).length;

  return {
    cohort,
    model_tier:
      cohort === 'A_frontier_parallel'
        ? 'frontier'
        : cohort === 'B_legacy_chain_non_frontier'
          ? 'non_frontier'
          : modelTierFromRuns(runs),
    multi_llm_mode: String(pm.multiLlmMode ?? (pm.multiLlmChain === true ? 'sequential_chain' : '')),
    in_current_sample: inCurrentSample,
    sample_id: String(pm.sampleId ?? ''),
    multi_llm_pass_count: runs.length,
    include_in_multi_llm_analysis: runs.length >= 3,
    metrics_complete_all_passes: runs.length >= 3 && fullPassCount >= 3,
    backfill: pm.backfill === true,
    openai_model: modelForProvider(runs, 'openai'),
    google_model: modelForProvider(runs, 'google'),
    anthropic_model: modelForProvider(runs, 'anthropic'),
    unchanged_openai: unchangedFlag(indexRunsByProvider(runs).get('openai')),
    unchanged_google: unchangedFlag(indexRunsByProvider(runs).get('google')),
    unchanged_anthropic: unchangedFlag(indexRunsByProvider(runs).get('anthropic')),
    research_artifacts_only: pm.researchArtifactsOnly === true ? 'yes' : pm.researchArtifactsOnly === false ? 'no' : '',
  };
}

export function extractCohortWideColumns(
  bundle: SavedRefactoringReportBundle | null | undefined,
  inCurrentSample: boolean
): Record<string, string | number | boolean> {
  const m = classifyResearchCohort(bundle, inCurrentSample);
  return {
    cohort: m.cohort,
    model_tier: m.model_tier,
    multi_llm_mode: m.multi_llm_mode,
    in_current_sample: m.in_current_sample ? 'yes' : 'no',
    sample_id: m.sample_id,
    multi_llm_pass_count: m.multi_llm_pass_count,
    include_in_multi_llm_analysis: m.include_in_multi_llm_analysis ? 'yes' : 'no',
    metrics_complete_all_passes: m.metrics_complete_all_passes ? 'yes' : 'no',
    backfill_flag: m.backfill ? 'yes' : 'no',
    openai_model: m.openai_model,
    google_model: m.google_model,
    anthropic_model: m.anthropic_model,
    unchanged_openai: m.unchanged_openai,
    unchanged_google: m.unchanged_google,
    unchanged_anthropic: m.unchanged_anthropic,
    research_artifacts_only: m.research_artifacts_only,
  };
}

export type InclusionRow = CohortMeta & {
  project_name: string;
  workspace_id: string;
  file_path: string;
  file_name: string;
  verify_accepted: string;
  pmd_smells_before: number | '';
  pmd_smells_after: number | '';
  exclude_from_primary: boolean;
  exclude_reason: string;
};

export function buildInclusionRow(
  bundle: SavedRefactoringReportBundle | null,
  ctx: { projectName: string; workspaceId: string; filePath: string; fileName: string },
  inCurrentSample: boolean
): InclusionRow {
  const meta = classifyResearchCohort(bundle, inCurrentSample);
  const passSmells = fileLevelSmellsFromBundle(bundle, 'openai');
  const rm = bundle?.researchMetrics as {
    meta?: { verifyAccepted?: boolean };
    comparison?: { pmd_smell_total?: { before?: number; after?: number } };
  } | undefined;

  let exclude_from_primary = false;
  const reasons: string[] = [];
  if (meta.backfill) {
    exclude_from_primary = true;
    reasons.push('backfill');
  }
  if (!meta.include_in_multi_llm_analysis) {
    exclude_from_primary = true;
    reasons.push('no_3_pass_multi_llm');
  }
  if (meta.include_in_multi_llm_analysis && !meta.metrics_complete_all_passes) {
    reasons.push('partial_pass_metrics');
  }

  return {
    ...meta,
    project_name: ctx.projectName,
    workspace_id: ctx.workspaceId,
    file_path: ctx.filePath,
    file_name: ctx.fileName,
    verify_accepted:
      rm?.meta?.verifyAccepted === undefined ? '' : rm.meta.verifyAccepted ? 'yes' : 'no',
    pmd_smells_before: passSmells.before !== '' ? passSmells.before : rm?.comparison?.pmd_smell_total?.before ?? '',
    pmd_smells_after: passSmells.after !== '' ? passSmells.after : rm?.comparison?.pmd_smell_total?.after ?? '',
    exclude_from_primary,
    exclude_reason: reasons.join(';'),
  };
}

function csvEscape(v: string | number | boolean): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function inclusionRowsToCsv(rows: InclusionRow[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]) as (keyof InclusionRow)[];
  const header = keys.join(',');
  const body = rows.map((r) =>
    keys
      .map((k) => {
        const v = r[k];
        if (typeof v === 'boolean') return csvEscape(v ? 'yes' : 'no');
        return csvEscape(v as string | number | boolean);
      })
      .join(',')
  );
  return [header, ...body].join('\n');
}
