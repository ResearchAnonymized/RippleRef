/**
 * RQ2 / RQ3 analysis CSV builders (per-provider passes, comparison wide, metrics long).
 */

import {
  buildMultiLlmComparisonWideAoa,
  buildMultiLlmMetricsLongAoa,
  multiLlmRunsFromBundle,
  providerKeyFromRun,
} from './multiLlmExport';
import { researchPayloadFromRecord } from './researchMetricSections';
import { classifyResearchCohort, type ResearchCohort } from './researchExportCohort';
import { behavioralColumnsForPassRow } from './behavioralPassTestExport';
import { applyCanonicalPmdToRow } from './canonicalPassMetrics';
import { orderedExportColumnKeys } from './passExportColumnOrder';
import type { LoadedResearchFile } from './researchDatasetLoader';

export type Rq2ProviderPassRow = Record<string, string | number | boolean>;

function baVal(
  rm: ReturnType<typeof researchPayloadFromRecord>,
  group: string,
  key: string,
  field: 'before' | 'after' | 'change'
): number | '' {
  const g = rm?.[group as keyof typeof rm] as Record<string, { before?: number; after?: number; change?: number }> | undefined;
  const leaf = g?.[key];
  if (!leaf || typeof leaf[field] !== 'number') return '';
  return leaf[field] as number;
}

export function buildRq2ProviderPassRows(files: LoadedResearchFile[]): Rq2ProviderPassRow[] {
  const rows: Rq2ProviderPassRow[] = [];
  for (const f of files) {
    const cohort = classifyResearchCohort(f.bundle, f.inCurrentSample);
    const runs = multiLlmRunsFromBundle(f.bundle);
    if (runs.length === 0) continue;

    for (const run of runs) {
      const rm = researchPayloadFromRecord(run.researchMetrics as Record<string, unknown> | undefined);

      rows.push({
        project_name: f.projectName,
        workspace_id: f.workspaceId,
        source_folder: f.sourceFolder,
        file_path: f.filePath,
        file_name: f.fileName,
        cohort: cohort.cohort,
        model_tier: cohort.model_tier,
        multi_llm_mode: cohort.multi_llm_mode,
        in_current_sample: cohort.in_current_sample ? 'yes' : 'no',
        sample_id: cohort.sample_id,
        provider: run.provider,
        provider_key: providerKeyFromRun(run),
        model: run.model,
        pass_index: run.passIndex,
        ok: run.ok ? 'yes' : 'no',
        changed: run.changed ? 'yes' : 'no',
        verify_accepted: rm?.meta?.verifyAccepted === true ? 'yes' : rm?.meta?.verifyAccepted === false ? 'no' : '',
        overall_score: typeof rm?.meta?.overallScore === 'number' ? rm.meta.overallScore : '',
        smells_before: run.smellsBefore ?? '',
        smells_after: run.smellsAfter ?? '',
        smell_delta: run.smellDelta ?? '',
        loc_delta:
          run.linesBefore != null && run.linesAfter != null ? run.linesAfter - run.linesBefore : '',
        complexity_before: baVal(rm, 'comparison', 'complexity', 'before'),
        complexity_after: baVal(rm, 'comparison', 'complexity', 'after'),
        maintainability_before: baVal(rm, 'comparison', 'maintainability', 'before'),
        maintainability_after: baVal(rm, 'comparison', 'maintainability', 'after'),
        testability_before: baVal(rm, 'comparison', 'testability', 'before'),
        testability_after: baVal(rm, 'comparison', 'testability', 'after'),
        loc_before: baVal(rm, 'comparison', 'lines_of_code', 'before'),
        loc_after: baVal(rm, 'comparison', 'lines_of_code', 'after'),
        coupling_cbo_before: baVal(rm, 'coupling', 'cbo', 'before'),
        coupling_cbo_after: baVal(rm, 'coupling', 'cbo', 'after'),
        cohesion_lcom_before: baVal(rm, 'cohesion', 'lcom', 'before'),
        cohesion_lcom_after: baVal(rm, 'cohesion', 'lcom', 'after'),
        semantic_preservation_pct: rm?.semantic_preservation?.overall_preservation_rate ?? '',
        diff_lines_added: rm?.diff_churn?.lines_added ?? '',
        diff_lines_removed: rm?.diff_churn?.lines_removed ?? '',
        tokens_total: rm?.token_efficiency?.total_tokens ?? '',
        tokens_cost_usd: rm?.token_efficiency?.cost_usd ?? '',
        smell_resolution_rate_pct: rm?.smell_resolution?.overall_resolution_rate ?? '',
        metrics_complete: cohort.metrics_complete_all_passes ? 'yes' : 'no',
        pass_scope: String((run as { passScope?: string }).passScope ?? rm?.meta?.passScope ?? ''),
        ...behavioralColumnsForPassRow(rm),
      });
      applyCanonicalPmdToRow(rows[rows.length - 1], run);
    }
  }
  return rows;
}

export function filterRq2PrimaryPassRows(rows: Rq2ProviderPassRow[]): Rq2ProviderPassRow[] {
  return rows.filter(
    (r) =>
      r.cohort === 'A_frontier_parallel' &&
      r.in_current_sample === 'yes' &&
      r.provider_key !== ''
  );
}

/** Primary evaluation cohort: all frontier independent-parallel files (527 typical). */
export function filterRq2FrontierPassRows(rows: Rq2ProviderPassRow[]): Rq2ProviderPassRow[] {
  return rows.filter((r) => r.cohort === 'A_frontier_parallel' && r.provider_key !== '');
}

export function filterRq2ExtendedPassRows(rows: Rq2ProviderPassRow[]): Rq2ProviderPassRow[] {
  return rows.filter(
    (r) =>
      (r.cohort === 'A_frontier_parallel' || r.cohort === 'B_legacy_chain_non_frontier') &&
      r.provider_key !== ''
  );
}

export function filterRq3ComparisonPassRows(rows: Rq2ProviderPassRow[]): Rq2ProviderPassRow[] {
  return filterRq2ExtendedPassRows(rows);
}

/** 450-file complete-case: frontier + full metrics on all 3 provider passes. */
export function filterRq3CompleteCasePassRows(rows: Rq2ProviderPassRow[]): Rq2ProviderPassRow[] {
  return rows.filter(
    (r) =>
      r.cohort === 'A_frontier_parallel' &&
      r.provider_key !== '' &&
      r.metrics_complete === 'yes'
  );
}

export function buildRq3ComparisonWideRows(files: LoadedResearchFile[]): Record<string, string | number | boolean>[] {
  const byProject = new Map<string, LoadedResearchFile[]>();
  for (const f of files) {
    if (!byProject.has(f.projectName)) byProject.set(f.projectName, []);
    byProject.get(f.projectName)!.push(f);
  }

  const allRows: Record<string, string | number | boolean>[] = [];
  for (const [projectName, group] of byProject) {
    const sourceFolder = group[0]?.sourceFolder ?? projectName;
    const workspaceId = group[0]?.workspaceId ?? '';
    const aoa = buildMultiLlmComparisonWideAoa({
      projectName,
      sourceFolder,
      workspaceId,
      items: group.map((f) => ({
        filePath: f.filePath,
        fileName: f.fileName,
        bundle: f.bundle,
      })),
    });
    if (aoa.length < 2) continue;
    const header = aoa[0].map(String);
    for (let i = 1; i < aoa.length; i += 1) {
      const row: Record<string, string | number | boolean> = {};
      header.forEach((h, j) => {
        row[h] = aoa[i][j] ?? '';
      });
      const fp = String(row.file_path ?? '');
      const file = group.find((f) => f.filePath === fp);
      if (file) {
        const cohort = classifyResearchCohort(file.bundle, file.inCurrentSample);
        row.cohort = cohort.cohort;
        row.model_tier = cohort.model_tier;
        row.in_current_sample = cohort.in_current_sample ? 'yes' : 'no';
      }
      allRows.push(row);
    }
  }
  return allRows;
}

export function buildRq2MetricsLongCsv(files: LoadedResearchFile[], exportedAtIso: string): string {
  const byProject = new Map<string, LoadedResearchFile[]>();
  for (const f of files) {
    if (!byProject.has(f.projectName)) byProject.set(f.projectName, []);
    byProject.get(f.projectName)!.push(f);
  }

  const chunks: (string | number | boolean)[][] = [];
  for (const [projectName, group] of byProject) {
    const aoa = buildMultiLlmMetricsLongAoa({
      projectName,
      sourceFolder: group[0]?.sourceFolder ?? projectName,
      workspaceId: group[0]?.workspaceId ?? '',
      exportedAtIso,
      items: group.map((f) => ({
        filePath: f.filePath,
        fileName: f.fileName,
        bundle: f.bundle,
      })),
    });
    if (chunks.length === 0 && aoa.length > 0) chunks.push(...aoa);
    else if (aoa.length > 1) chunks.push(...aoa.slice(1));
  }

  return aoaToCsv(chunks.length ? chunks : [['note', 'no_data']]);
}

function csvEscape(v: string | number | boolean): string {
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function recordsToCsv(rows: Record<string, string | number | boolean>[]): string {
  if (!rows.length) return '';
  const keys = orderedExportColumnKeys(rows as Rq2ProviderPassRow[]);
  const header = keys.join(',');
  const body = rows.map((r) => keys.map((k) => csvEscape(r[k] ?? '')).join(','));
  return [header, ...body].join('\n');
}

export function aoaToCsv(aoa: (string | number | boolean)[][]): string {
  return aoa.map((row) => row.map((c) => csvEscape(c)).join(',')).join('\n');
}

export type ResearchAnalysisExportResult = {
  rq2AllPassRows: Rq2ProviderPassRow[];
  rq2Primary: Rq2ProviderPassRow[];
  rq2Extended: Rq2ProviderPassRow[];
  rq3ComparisonWide: Record<string, string | number | boolean>[];
  rq3PrimaryComparisonWide: Record<string, string | number | boolean>[];
  counts: {
    files: number;
    passRows: number;
    primaryPassRows: number;
    extendedPassRows: number;
    comparisonWideRows: number;
  };
};

export function buildResearchAnalysisExports(files: LoadedResearchFile[]): ResearchAnalysisExportResult {
  const rq2AllPassRows = buildRq2ProviderPassRows(files);
  const rq2Primary = filterRq2PrimaryPassRows(rq2AllPassRows);
  const rq2Extended = filterRq2ExtendedPassRows(rq2AllPassRows);
  const rq3ComparisonWide = buildRq3ComparisonWideRows(files);
  const rq3PrimaryComparisonWide = rq3ComparisonWide.filter((r) => r.in_current_sample === 'yes');

  return {
    rq2AllPassRows,
    rq2Primary,
    rq2Extended,
    rq3ComparisonWide,
    rq3PrimaryComparisonWide,
    counts: {
      files: files.length,
      passRows: rq2AllPassRows.length,
      primaryPassRows: rq2Primary.length,
      extendedPassRows: rq2Extended.length,
      comparisonWideRows: rq3ComparisonWide.length,
    },
  };
}

export function cohortCountsFromFiles(files: LoadedResearchFile[]): Record<ResearchCohort | 'in_current_sample', number> {
  const out: Record<string, number> = {};
  for (const f of files) {
    const c = classifyResearchCohort(f.bundle, f.inCurrentSample);
    out[c.cohort] = (out[c.cohort] ?? 0) + 1;
    if (f.inCurrentSample) out.in_current_sample = (out.in_current_sample ?? 0) + 1;
  }
  return out as Record<ResearchCohort | 'in_current_sample', number>;
}

/** Sanity expectations for full local dataset (tolerant for empty CI). */
export function validateAnalysisCounts(counts: ResearchAnalysisExportResult['counts']): string[] {
  const issues: string[] = [];
  if (counts.files < 1) issues.push('no files loaded');
  if (counts.files >= 100) {
    if (counts.primaryPassRows < 400) {
      issues.push(`expected ~450 primary pass rows, got ${counts.primaryPassRows}`);
    }
    if (counts.extendedPassRows < 800) {
      issues.push(`expected ~879 extended pass rows, got ${counts.extendedPassRows}`);
    }
  }
  return issues;
}
