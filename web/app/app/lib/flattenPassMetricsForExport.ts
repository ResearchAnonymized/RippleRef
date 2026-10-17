/**
 * Flatten pass researchMetrics + run record into one export row (matches ResearchMetricsPanel UI).
 */

import type { MultiLlmRunRecord } from './batchRunStorage';
import type { BeforeAfter } from './exportResearchMetricsCsv';
import { behavioralColumnsForPassRow } from './behavioralPassTestExport';
import { applyCanonicalPmdToRow, canonicalPmdSmells, enrichHigherIsBetterMetric, enrichLowerIsBetterMetric } from './canonicalPassMetrics';
import { providerKeyFromRun, locDelta } from './multiLlmExport';
import { researchPayloadFromRecord, type FileMetricContext } from './researchMetricSections';

function num(v: unknown): number | '' {
  return typeof v === 'number' && Number.isFinite(v) ? v : '';
}

function yn(v: boolean | undefined): string {
  if (v === true) return 'yes';
  if (v === false) return 'no';
  return '';
}

function applyBeforeAfter(
  row: Record<string, string | number | boolean>,
  prefix: string,
  data: BeforeAfter | undefined
): void {
  if (!data) return;
  row[`${prefix}_before`] = num(data.before);
  row[`${prefix}_after`] = num(data.after);
  row[`${prefix}_improved`] = data.improved === true ? 'yes' : data.improved === false ? 'no' : '';
}

function applyGroup(
  row: Record<string, string | number | boolean>,
  groupName: string,
  group?: Record<string, BeforeAfter>
): void {
  if (!group) return;
  for (const [key, data] of Object.entries(group)) {
    if (data && typeof data === 'object' && 'before' in data) {
      applyBeforeAfter(row, `${groupName}_${key}`, data as BeforeAfter);
    }
  }
}

export type FlattenPassInput = {
  ctx: FileMetricContext;
  run: MultiLlmRunRecord;
  cohort: {
    cohort: string;
    model_tier: string;
    multi_llm_mode: string;
    in_current_sample: boolean;
    sample_id: string;
    metrics_complete_all_passes: boolean;
  };
};

/** Build one export row — researchMetrics is authoritative for all 15 UI sections. */
export function flattenPassMetricsForExport(input: FlattenPassInput): Record<string, string | number | boolean> {
  const { ctx, run, cohort } = input;
  const rm = researchPayloadFromRecord(run.researchMetrics as Record<string, unknown> | undefined);

  const row: Record<string, string | number | boolean> = {
    project_name: ctx.projectName,
    source_folder: ctx.sourceFolder,
    workspace_id: ctx.workspaceId,
    file_path: ctx.filePath,
    file_name: ctx.fileName,
    cohort: cohort.cohort,
    model_tier: cohort.model_tier,
    multi_llm_mode: cohort.multi_llm_mode,
    in_current_sample: cohort.in_current_sample ? 'yes' : 'no',
    sample_id: cohort.sample_id,
    metrics_complete: cohort.metrics_complete_all_passes ? 'yes' : 'no',
    provider: run.provider,
    provider_key: providerKeyFromRun(run),
    model: run.model,
    pass_index: run.passIndex,
    ok: run.ok ? 'yes' : 'no',
    changed: run.changed ? 'yes' : 'no',
    orchestration: run.orchestration ?? '',
    agent_step_count: run.agentSteps?.length ?? 0,
    lines_before: run.linesBefore ?? '',
    lines_after: run.linesAfter ?? '',
    loc_delta_run: locDelta(run),
    run_smells_before: run.smellsBefore ?? '',
    run_smells_after: run.smellsAfter ?? '',
    run_smell_delta: run.smellDelta ?? '',
    has_research_metrics: rm ? 'yes' : 'no',
  };

  if (!rm) {
    applyCanonicalPmdToRow(row, run);
    return row;
  }

  if (rm.meta) {
    row.verify_accepted = yn(rm.meta.verifyAccepted);
    row.overall_score = num(rm.meta.overallScore);
    row.refactoring_successful = yn(rm.meta.refactoringSuccessful);
    if (rm.meta.llmProvider) row.meta_llm_provider = String(rm.meta.llmProvider);
    if (rm.meta.passScope) row.pass_scope = String(rm.meta.passScope);
  }

  if (rm.comparison) {
    for (const [key, data] of Object.entries(rm.comparison)) {
      if (key === 'pmd_smell_total') continue;
      applyBeforeAfter(row, key, data);
    }
  }

  if (rm.behavioral) {
    for (const [key, val] of Object.entries(rm.behavioral)) {
      if (key === 'checks' || key === 'behavioral_changes_json') continue;
      if (val !== undefined && val !== '') row[`behavioral_${key}`] = val as string | number | boolean;
    }
    Object.assign(row, behavioralColumnsForPassRow(rm));
  }

  if (rm.structural) {
    for (const [key, val] of Object.entries(rm.structural)) {
      row[`structural_${key}`] = val as string | number | boolean;
    }
  }

  row.practices_applied_long = (rm.practices_applied ?? []).join(' | ');
  row.key_achievements_long = (rm.summary?.key_achievements ?? []).join(' | ');
  row.concerns_long = (rm.summary?.concerns ?? []).join(' | ');

  applyGroup(row, 'halstead', rm.halstead);
  applyGroup(row, 'method_lengths', rm.method_lengths);
  applyGroup(row, 'nesting_depth', rm.nesting_depth);
  applyGroup(row, 'coupling', rm.coupling);
  applyGroup(row, 'cohesion', rm.cohesion);

  if (rm.diff_churn) {
    for (const [key, val] of Object.entries(rm.diff_churn)) {
      row[`diff_churn_${key}`] = val;
    }
  }

  if (rm.semantic_preservation) {
    const sp = rm.semantic_preservation;
    row.semantic_overall_preservation_pct = num(sp.overall_preservation_rate);
    row.semantic_preservation_pct = num(sp.overall_preservation_rate);
    for (const kind of ['classes', 'methods', 'fields'] as const) {
      const block = sp[kind];
      if (!block) continue;
      row[`semantic_${kind}_preservation_pct`] = num(block.preservation_rate);
      row[`semantic_${kind}_removed`] = block.removed;
      row[`semantic_${kind}_added`] = block.added;
    }
    if (sp.methods?.removed_items?.length) {
      row.semantic_methods_removed_items = sp.methods.removed_items.join('; ');
    }
  }

  if (rm.token_efficiency) {
    for (const [key, val] of Object.entries(rm.token_efficiency)) {
      row[`token_${key}`] = val;
    }
    row.tokens_total = rm.token_efficiency.total_tokens ?? '';
  }

  if (rm.smell_resolution) {
    const sr = rm.smell_resolution;
    row.smell_resolution_total_before = sr.total_before ?? '';
    row.smell_resolution_total_after = sr.total_after ?? '';
    row.smell_resolution_total_resolved = sr.total_resolved ?? '';
    row.smell_resolution_overall_rate_pct = sr.overall_resolution_rate ?? '';
    row.smell_resolution_rate_pct = sr.overall_resolution_rate ?? '';
    row.smell_resolution_types_fully_eliminated = sr.types_fully_eliminated ?? '';
    row.smell_resolution_types_with_regression = sr.types_with_regression ?? '';
    if (sr.by_type && Object.keys(sr.by_type).length) {
      row.smell_by_type_json = JSON.stringify(sr.by_type);
      row.smell_by_type_count = Object.keys(sr.by_type).length;
    }
  }

  applyCanonicalPmdToRow(row, run);

  const lowerIsBetterKeys = [
    'complexity',
    'lines_of_code',
    'method_count',
    'smells_critical',
    'smells_major',
    'smells_minor',
    'smells_info',
    'smells_other',
  ];
  for (const key of lowerIsBetterKeys) {
    if (row[`${key}_before`] !== undefined) enrichLowerIsBetterMetric(row, key);
  }
  for (const key of ['maintainability', 'testability']) {
    if (row[`${key}_before`] !== undefined) enrichHigherIsBetterMetric(row, key);
  }

  const loc = rm.comparison?.lines_of_code;
  if (loc) {
    row.loc_before = num(loc.before);
    row.loc_after = num(loc.after);
    row.loc_delta = num(loc.change);
    if (row.lines_of_code_before !== undefined) {
      enrichLowerIsBetterMetric(row, 'lines_of_code');
      row.loc_removed = row.lines_of_code_removed ?? '';
      row.loc_reduction_pct = row.lines_of_code_reduction_pct ?? '';
    }
  } else if (run.linesBefore != null && run.linesAfter != null) {
    row.loc_before = run.linesBefore;
    row.loc_after = run.linesAfter;
    row.loc_delta = run.linesAfter - run.linesBefore;
  }

  row.metrics_sections_present = [
    rm.comparison ? 'comparison' : '',
    rm.behavioral ? 'behavioral' : '',
    rm.structural ? 'structural' : '',
    rm.halstead ? 'halstead' : '',
    rm.method_lengths ? 'method_lengths' : '',
    rm.nesting_depth ? 'nesting_depth' : '',
    rm.coupling ? 'coupling' : '',
    rm.cohesion ? 'cohesion' : '',
    rm.diff_churn ? 'diff_churn' : '',
    rm.semantic_preservation ? 'semantic' : '',
    rm.token_efficiency ? 'token' : '',
    rm.smell_resolution ? 'smell_resolution' : '',
  ]
    .filter(Boolean)
    .join('|');

  return row;
}

/** Verify export row matches researchMetrics payload (for audit). */
export function auditExportRowAgainstMetrics(
  row: Record<string, string | number | boolean>,
  run: MultiLlmRunRecord
): string[] {
  const issues: string[] = [];
  const rm = researchPayloadFromRecord(run.researchMetrics as Record<string, unknown> | undefined);
  if (!rm) return issues;

  const c = canonicalPmdSmells(run);
  if (c.before !== '' && row.pmd_smells_before !== c.before) {
    issues.push(`pmd_smells_before mismatch export=${row.pmd_smells_before} expected=${c.before}`);
  }
  if (c.after !== '' && row.pmd_smells_after !== c.after) {
    issues.push(`pmd_smells_after mismatch export=${row.pmd_smells_after} expected=${c.after}`);
  }
  if (c.removed !== '' && row.pmd_smells_removed !== c.removed) {
    issues.push(`pmd_smells_removed mismatch export=${row.pmd_smells_removed} expected=${c.removed}`);
  }
  if (c.reduction_pct !== '' && row.pmd_smells_reduction_pct !== c.reduction_pct) {
    issues.push(`pmd_smells_reduction_pct mismatch export=${row.pmd_smells_reduction_pct} expected=${c.reduction_pct}`);
  }

  if (rm.comparison) {
    for (const [key, data] of Object.entries(rm.comparison)) {
      if (!data || key === 'pmd_smell_total') continue;
      const eb = row[`${key}_before`];
      const ea = row[`${key}_after`];
      if (eb !== '' && eb !== data.before) {
        issues.push(`${key}_before mismatch export=${eb} rm=${data.before}`);
      }
      if (ea !== '' && ea !== data.after) {
        issues.push(`${key}_after mismatch export=${ea} rm=${data.after}`);
      }
    }
  }

  if (rm.meta?.overallScore != null && row.overall_score !== '' && row.overall_score !== rm.meta.overallScore) {
    issues.push('overall_score mismatch');
  }

  if (rm.semantic_preservation?.overall_preservation_rate != null) {
    const exp = rm.semantic_preservation.overall_preservation_rate;
    if (row.semantic_overall_preservation_pct !== '' && row.semantic_overall_preservation_pct !== exp) {
      issues.push('semantic_overall_preservation_pct mismatch');
    }
  }

  if (rm.smell_resolution?.overall_resolution_rate != null) {
    const exp = rm.smell_resolution.overall_resolution_rate;
    if (row.smell_resolution_overall_rate_pct !== '' && row.smell_resolution_overall_rate_pct !== exp) {
      issues.push('smell_resolution_overall_rate_pct mismatch');
    }
  }

  if (rm.token_efficiency?.total_tokens != null) {
    if (row.token_total_tokens !== '' && row.token_total_tokens !== rm.token_efficiency.total_tokens) {
      issues.push('token_total_tokens mismatch');
    }
  }

  return issues;
}
