/**
 * Multi-sheet Excel export: one worksheet per refactored file + project overview sheet.
 */

import type { SavedRefactoringReportBundle } from './savedRefactoringReport';
import { parseSavedRefactoringReportBundle } from './savedRefactoringReport';
import type { RefactoringReportShape } from './refactoringReportDocument';
import { computeLineDiffStats } from './lineDiff';
import type { WorkspaceStudyFileInput } from './exportWorkspaceStudyCsv';
import type { BeforeAfter, ResearchMetricsPayload } from './exportResearchMetricsCsv';
import {
  buildFullResearchWorkbook,
  defaultCrossProjectExcelFilename,
  defaultProjectExcelFilename,
  type FullExcelFileItem,
} from './buildFullResearchExcel';
import { isRefineDemo } from './refineDemoMode';
import { fileLevelSmellsFromBundle, multiLlmRunsFromBundle } from './multiLlmExport';

export type ExportCandidate = {
  filePath: string;
  label: string;
  savedAt?: number;
  status?: string;
  hasSavedReport: boolean;
  smellsBefore?: number;
  smellsAfter?: number;
  humanVerdict?: string | null;
};

type Aoa = (string | number | boolean)[][];

function section(title: string): Aoa {
  return [[title], ['']];
}

function kvRows(pairs: [string, string | number][]): Aoa {
  return [['Field', 'Value'], ...pairs.map(([k, v]) => [k, v]), ['']];
}

function excelSheetName(filePath: string, used: Set<string>): string {
  const base =
    filePath.replace(/\\/g, '/').split('/').pop()?.replace(/[:\\/?*[\]]/g, '_') || 'file';
  let name = base.slice(0, 31);
  let candidate = name;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = `_${i}`;
    candidate = (name.slice(0, Math.max(1, 31 - suffix.length)) + suffix).slice(0, 31);
    i += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function formatTs(ms?: number): string {
  if (!ms || ms <= 0) return '';
  try {
    return new Date(ms).toISOString();
  } catch {
    return String(ms);
  }
}

function smellRows(smells: Array<Record<string, unknown>> | undefined): Aoa {
  if (!smells?.length) return [['(no smells recorded)'], ['']];
  const rows: Aoa = [['Type', 'Severity', 'Line', 'Title', 'Description']];
  for (const s of smells.slice(0, 500)) {
    rows.push([
      String(s.type ?? s.detectorId ?? ''),
      String(s.severity ?? ''),
      String(s.startLine ?? s.line ?? ''),
      String(s.title ?? s.summary ?? '').slice(0, 200),
      String(s.description ?? s.message ?? '').slice(0, 300),
    ]);
  }
  if (smells.length > 500) {
    rows.push([`… ${smells.length - 500} more smells omitted`]);
  }
  rows.push(['']);
  return rows;
}

function reportSection(report: RefactoringReportShape | null | undefined): Aoa {
  if (!report) return [['(no structured refactoring report)'], ['']];
  const out: Aoa = [
    ...section('Refactoring report summary'),
    ...kvRows([
      ['Summary', report.summary || ''],
      ['Behavior preservation', report.behavior_preservation || ''],
    ]),
  ];
  if (report.detected_smells?.length) {
    out.push(['Detected smell', 'Location', 'Evidence']);
    for (const d of report.detected_smells) {
      out.push([d.smell, d.location, d.evidence]);
    }
    out.push(['']);
  }
  if (report.applied_refactorings?.length) {
    out.push(['Applied refactoring', 'Type', 'Before', 'After', 'Description']);
    for (const a of report.applied_refactorings) {
      out.push([a.type, a.before_location, a.after_location, a.description]);
    }
    out.push(['']);
  }
  if (report.change_metrics) {
    const m = report.change_metrics;
    out.push(
      ...kvRows([
        ['Lines added', m.lines_added],
        ['Lines removed', m.lines_removed],
        ['Lines modified', m.lines_modified],
        ['Refactoring operations', m.refactoring_operations],
      ])
    );
  }
  return out;
}

function flattenMetrics(obj: unknown, prefix: string, rows: string[][]): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'object' && 'before' in (obj as object) && 'after' in (obj as object)) {
    const o = obj as { before?: unknown; after?: unknown; change?: unknown };
    rows.push([prefix, String(o.before ?? ''), String(o.after ?? ''), String(o.change ?? '')]);
    return;
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    rows.push([prefix, '', '', String(obj)]);
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    flattenMetrics(v, prefix ? `${prefix}.${k}` : k, rows);
  }
}

function researchMetricsSection(rm: Record<string, unknown> | null | undefined): Aoa {
  if (!rm) return [['(no research metrics)'], ['']];
  const rows: string[][] = [['Metric', 'Before', 'After', 'Change']];
  flattenMetrics(rm, '', rows);
  return [...section('Research metrics (before / after)'), ...rows, ['']];
}

function buildFileSheetAoa(bundle: SavedRefactoringReportBundle): Aoa {
  const diff = computeLineDiffStats(bundle.originalContent || '', bundle.refactoredContent || '');
  const ar = bundle.applyResult || {};
  const rejected = bundle.refactoringRejected?.rejected ?? ar.rejected;

  const aoa: Aoa = [
    ['RefactAI — File refactoring export'],
    [''],
    ...kvRows([
      ['Workspace ID', bundle.workspaceId],
      ['File path', bundle.filePath],
      ['Saved at', formatTs(bundle.savedAt)],
      ['Success', String(ar.success ?? !rejected)],
      ['Rejected', String(!!rejected)],
      ['Rejection reason', String(bundle.refactoringRejected?.rejectionReason ?? ar.rejectionReason ?? '')],
      ['Original LOC', (bundle.originalContent || '').split('\n').length],
      ['Refactored LOC', (bundle.refactoredContent || '').split('\n').length],
      ['Lines added (diff)', diff.added],
      ['Lines removed (diff)', diff.removed],
    ]),
  ];

  if (bundle.improvementStats) {
    const st = bundle.improvementStats;
    aoa.push(
      ...section('PMD smell counts'),
      ...kvRows([
        ['Before total', st.before?.total ?? ''],
        ['After total', st.after?.total ?? ''],
        ['Delta total', st.delta?.total ?? ''],
        ['Before critical', st.before?.critical ?? ''],
        ['After critical', st.after?.critical ?? ''],
      ])
    );
  }

  if (bundle.smellComparison) {
    const sc = bundle.smellComparison;
    aoa.push(
      ...section('Smell comparison'),
      ...kvRows([
        ['Before count', sc.before?.length ?? 0],
        ['After count', sc.after?.length ?? 0],
        ['Removed', sc.removed?.length ?? 0],
        ['Added', sc.added?.length ?? 0],
      ])
    );
  }

  aoa.push(...section('Code smells (at save time)'), ...smellRows(bundle.codeSmells));
  aoa.push(...reportSection(bundle.refactoringReport));
  aoa.push(...researchMetricsSection(bundle.researchMetrics));

  const steps = (ar.steps as unknown[]) || (bundle.pipelineMetadata?.steps as unknown[]);
  if (Array.isArray(steps) && steps.length) {
    aoa.push(...section('Pipeline steps'));
    aoa.push(['Step', 'Agent', 'Status', 'Error']);
    for (const st of steps) {
      const s = st as Record<string, unknown>;
      aoa.push([
        String(s.name ?? ''),
        String(s.agent ?? ''),
        String(s.status ?? ''),
        String(s.error ?? '').slice(0, 200),
      ]);
    }
    aoa.push(['']);
  }

  aoa.push(
    ...section('Code preview (first 40 lines)'),
    ['Role', 'Line #', 'Content'],
    ...bundle.originalContent
      .split('\n')
      .slice(0, 40)
      .map((line, i) => ['original', i + 1, line.slice(0, 200)]),
    [''],
    ...bundle.refactoredContent
      .split('\n')
      .slice(0, 40)
      .map((line, i) => ['refactored', i + 1, line.slice(0, 200)])
  );

  return aoa;
}

/** Normalize research metrics from saved bundle (several legacy shapes). */
function researchPayloadFromBundle(bundle: SavedRefactoringReportBundle): ResearchMetricsPayload | null {
  const raw = bundle.researchMetrics;
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (o.comparison || o.meta || o.halstead) return raw as ResearchMetricsPayload;
    const inner = o.research_metrics ?? o.metrics;
    if (inner && typeof inner === 'object') return inner as ResearchMetricsPayload;
  }
  const ar = bundle.applyResult;
  if (ar?.researchMetrics && typeof ar.researchMetrics === 'object') {
    return ar.researchMetrics as ResearchMetricsPayload;
  }
  return null;
}

function baVal(group: Record<string, BeforeAfter> | undefined, key: string, field: 'before' | 'after' | 'change'): string | number {
  const d = group?.[key];
  if (!d) return '';
  const v = d[field];
  return typeof v === 'number' ? v : String(v ?? '');
}

function asStringList(val: unknown): string[] {
  if (Array.isArray(val)) return val.map((x) => String(x));
  if (typeof val === 'string' && val) return [val];
  return [];
}

function cell(val: unknown): string | number | boolean {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean' || typeof val === 'number') return val;
  if (typeof val === 'string') return val;
  return String(val);
}

function pctReduction(before: number, after: number): string {
  if (!before || before <= 0) return '';
  return String(Math.round(((before - after) / before) * 1000) / 10);
}

export type PaperWideRow = Record<string, string | number | boolean>;

/** One wide row per file — suitable for paper tables (RQ1, RQ2, etc.). */
export function buildPaperWideRow(
  bundle: SavedRefactoringReportBundle | null,
  candidate: ExportCandidate,
  sheetName: string,
  context?: { workspaceId?: string; projectName?: string; researchSampleId?: string }
): PaperWideRow {
  const diff = bundle
    ? computeLineDiffStats(bundle.originalContent || '', bundle.refactoredContent || '')
    : { added: 0, removed: 0 };
  const ar = bundle?.applyResult || {};
  const rejected =
    bundle?.refactoringRejected?.rejected === true ||
    ar.rejected === true ||
    candidate.status === 'rejected';
  const rm = bundle ? researchPayloadFromBundle(bundle) : null;
  const comp = rm?.comparison;
  const st = bundle?.improvementStats;
  const sc = bundle?.smellComparison;
  const pm = bundle?.pipelineMetadata;
  const ca = (ar.deltas as Record<string, unknown> | undefined)?.comprehensiveAnalysis as
    | Record<string, unknown>
    | undefined;
  const caSummary = (ca?.summary as Record<string, unknown> | undefined) || {};
  const caMetrics = (ca?.metrics as Record<string, unknown> | undefined) || {};

  const smellsBefore =
    st?.before?.total ?? Number(comp?.pmd_smell_total?.before ?? candidate.smellsBefore ?? '');
  const smellsAfter =
    st?.after?.total ?? Number(comp?.pmd_smell_total?.after ?? candidate.smellsAfter ?? '');
  let sb = typeof smellsBefore === 'number' ? smellsBefore : parseInt(String(smellsBefore), 10) || 0;
  let sa = typeof smellsAfter === 'number' ? smellsAfter : parseInt(String(smellsAfter), 10) || 0;
  let smellRemoved = sb - sa;
  let smellReductionPct = pctReduction(sb, sa);
  let pmdSmellsSource = 'bundle_level';

  const passSmells = fileLevelSmellsFromBundle(bundle, 'openai');
  if (multiLlmRunsFromBundle(bundle).length > 0 && passSmells.before !== '') {
    sb = passSmells.before as number;
    sa = passSmells.after as number;
    smellRemoved = (passSmells.removed as number) || 0;
    smellReductionPct =
      passSmells.reduction_pct !== '' ? String(passSmells.reduction_pct) : pctReduction(sb, sa);
    pmdSmellsSource = passSmells.source;
  }

  const row: PaperWideRow = {
    ...(context?.workspaceId ? { workspace_id: context.workspaceId } : {}),
    ...(context?.projectName ? { project_name: context.projectName } : {}),
    ...(context?.researchSampleId ? { research_sample_id: context.researchSampleId } : {}),
    sheet_name: sheetName,
    file_name: candidate.label,
    file_path: candidate.filePath,
    saved_at_iso: bundle ? formatTs(bundle.savedAt) : formatTs(candidate.savedAt),
    status: candidate.status ?? (rejected ? 'rejected' : 'refactored'),
    verify_accepted: Boolean(rm?.meta?.verifyAccepted ?? ar.verifyAccepted ?? !rejected),
    rejected: Boolean(rejected),
    rejection_reason: String(
      bundle?.refactoringRejected?.rejectionReason ??
        ar.rejectionReason ??
        candidate.status === 'rejected'
        ? 'see file-status'
        : ''
    ).slice(0, 500),
    human_verdict: candidate.humanVerdict ?? '',
    has_full_saved_report: bundle ? 'yes' : 'no',
    overall_score: cell(rm?.meta?.overallScore ?? caSummary.overall_score),
    refactoring_successful: cell(rm?.meta?.refactoringSuccessful ?? caSummary.refactoring_successful),
    pmd_smells_before: sb,
    pmd_smells_after: sa,
    pmd_smells_remaining: sa,
    pmd_smells_removed: smellRemoved,
    pmd_smells_delta: smellRemoved,
    pmd_smell_reduction_pct: smellReductionPct,
    pmd_smells_reduction_pct: smellReductionPct,
    pmd_smells_source: pmdSmellsSource,
    smells_critical_before: st?.before?.critical ?? baVal(comp, 'smells_critical', 'before'),
    smells_critical_after: st?.after?.critical ?? baVal(comp, 'smells_critical', 'after'),
    smells_major_before: st?.before?.major ?? baVal(comp, 'smells_major', 'before'),
    smells_major_after: st?.after?.major ?? baVal(comp, 'smells_major', 'after'),
    smells_minor_before: st?.before?.minor ?? baVal(comp, 'smells_minor', 'before'),
    smells_minor_after: st?.after?.minor ?? baVal(comp, 'smells_minor', 'after'),
    maintainability_before: cell(baVal(comp, 'maintainability', 'before') || caMetrics.maintainability_before),
    maintainability_after: cell(baVal(comp, 'maintainability', 'after') || caMetrics.maintainability_after),
    complexity_before: cell(baVal(comp, 'complexity', 'before') || caMetrics.complexity_before),
    complexity_after: cell(baVal(comp, 'complexity', 'after') || caMetrics.complexity_after),
    testability_before: baVal(comp, 'testability', 'before'),
    testability_after: baVal(comp, 'testability', 'after'),
    loc_before: baVal(comp, 'lines_of_code', 'before') || (bundle ? bundle.originalContent.split('\n').length : ''),
    loc_after: baVal(comp, 'lines_of_code', 'after') || (bundle ? bundle.refactoredContent.split('\n').length : ''),
    method_count_before: baVal(comp, 'method_count', 'before'),
    method_count_after: baVal(comp, 'method_count', 'after'),
    lines_added_diff: diff.added,
    lines_removed_diff: diff.removed,
    halstead_volume_before: baVal(rm?.halstead, 'volume', 'before'),
    halstead_volume_after: baVal(rm?.halstead, 'volume', 'after'),
    halstead_effort_before: baVal(rm?.halstead, 'effort', 'before'),
    halstead_effort_after: baVal(rm?.halstead, 'effort', 'after'),
    method_length_mean_before: baVal(rm?.method_lengths, 'mean', 'before'),
    method_length_mean_after: baVal(rm?.method_lengths, 'mean', 'after'),
    nesting_max_before: baVal(rm?.nesting_depth, 'max', 'before'),
    nesting_max_after: baVal(rm?.nesting_depth, 'max', 'after'),
    coupling_cbo_before: baVal(rm?.coupling, 'cbo', 'before'),
    coupling_cbo_after: baVal(rm?.coupling, 'cbo', 'after'),
    cohesion_lcom_before: baVal(rm?.cohesion, 'lcom', 'before'),
    cohesion_lcom_after: baVal(rm?.cohesion, 'lcom', 'after'),
    semantic_preservation_pct: rm?.semantic_preservation?.overall_preservation_rate ?? '',
    methods_removed_semantic: rm?.semantic_preservation?.methods?.removed ?? '',
    methods_added_semantic: rm?.semantic_preservation?.methods?.added ?? '',
    diff_lines_added: rm?.diff_churn?.lines_added ?? '',
    diff_lines_removed: rm?.diff_churn?.lines_removed ?? '',
    diff_churn_pct: rm?.diff_churn?.churn_rate_percent ?? '',
    tokens_total: rm?.token_efficiency?.total_tokens ?? '',
    tokens_cost_usd: rm?.token_efficiency?.cost_usd ?? '',
    smell_resolution_rate_pct: rm?.smell_resolution?.overall_resolution_rate ?? '',
    smells_removed_count: sc?.removed?.length ?? '',
    smells_added_count: sc?.added?.length ?? '',
    smells_unchanged_count: sc?.unchanged?.length ?? '',
    llm_model: String(pm?.model ?? ''),
    pipeline_retries: cell(pm?.retryCount),
    rejection_category: String(pm?.rejectionCategory ?? ''),
    behavioral_api_preserved: rm?.behavioral?.public_api_preserved ?? '',
    behavioral_logic_changed: rm?.behavioral?.conditional_logic_changed ?? '',
    practices_applied: (rm?.practices_applied || []).join('; ').slice(0, 400),
    key_achievements: asStringList(rm?.summary?.key_achievements ?? caSummary.key_achievements)
      .slice(0, 5)
      .join(' | ')
      .slice(0, 800),
    concerns: asStringList(rm?.summary?.concerns ?? caSummary.concerns)
      .slice(0, 5)
      .join(' | ')
      .slice(0, 800),
    report_summary: String(bundle?.refactoringReport?.summary ?? '').slice(0, 300),
  };

  return row;
}

const WIDE_COLUMN_ORDER: string[] = [
  'workspace_id',
  'project_name',
  'research_sample_id',
  'sheet_name',
  'file_name',
  'file_path',
  'saved_at_iso',
  'status',
  'verify_accepted',
  'rejected',
  'rejection_reason',
  'human_verdict',
  'has_full_saved_report',
  'overall_score',
  'refactoring_successful',
  'pmd_smells_before',
  'pmd_smells_after',
  'pmd_smells_delta',
  'pmd_smell_reduction_pct',
  'smells_critical_before',
  'smells_critical_after',
  'smells_major_before',
  'smells_major_after',
  'smells_minor_before',
  'smells_minor_after',
  'maintainability_before',
  'maintainability_after',
  'complexity_before',
  'complexity_after',
  'testability_before',
  'testability_after',
  'loc_before',
  'loc_after',
  'method_count_before',
  'method_count_after',
  'lines_added_diff',
  'lines_removed_diff',
  'halstead_volume_before',
  'halstead_volume_after',
  'halstead_effort_before',
  'halstead_effort_after',
  'method_length_mean_before',
  'method_length_mean_after',
  'nesting_max_before',
  'nesting_max_after',
  'coupling_cbo_before',
  'coupling_cbo_after',
  'cohesion_lcom_before',
  'cohesion_lcom_after',
  'semantic_preservation_pct',
  'methods_removed_semantic',
  'methods_added_semantic',
  'diff_lines_added',
  'diff_lines_removed',
  'diff_churn_pct',
  'tokens_total',
  'tokens_cost_usd',
  'smell_resolution_rate_pct',
  'smells_removed_count',
  'smells_added_count',
  'smells_unchanged_count',
  'llm_model',
  'pipeline_retries',
  'rejection_category',
  'behavioral_api_preserved',
  'behavioral_logic_changed',
  'practices_applied',
  'key_achievements',
  'concerns',
  'report_summary',
];

function wideRowsToAoa(rows: PaperWideRow[]): Aoa {
  const keys = [...WIDE_COLUMN_ORDER];
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!keys.includes(k)) keys.push(k);
    }
  }
  const aoa: Aoa = [keys];
  for (const r of rows) {
    aoa.push(keys.map((k) => r[k] ?? ''));
  }
  return aoa;
}

function aggregateProjectStats(rows: PaperWideRow[]): Record<string, string | number> {
  let accepted = 0;
  let rejected = 0;
  let smellsBefore = 0;
  let smellsAfter = 0;
  let scoreSum = 0;
  let scoreN = 0;
  for (const r of rows) {
    if (r.rejected === true || r.rejected === 'true') rejected += 1;
    else accepted += 1;
    smellsBefore += Number(r.pmd_smells_before) || 0;
    smellsAfter += Number(r.pmd_smells_after) || 0;
    const sc = Number(r.overall_score);
    if (!Number.isNaN(sc) && sc > 0) {
      scoreSum += sc;
      scoreN += 1;
    }
  }
  return {
    files_total: rows.length,
    files_accepted: accepted,
    files_rejected: rejected,
    pmd_smells_before_sum: smellsBefore,
    pmd_smells_after_sum: smellsAfter,
    pmd_smells_delta_sum: smellsBefore - smellsAfter,
    mean_overall_score: scoreN ? Math.round((scoreSum / scoreN) * 10) / 10 : '',
  };
}

function buildOverviewGuideSheet(
  workspaceId: string,
  projectName: string,
  exportedAt: string,
  stats: Record<string, string | number>
): Aoa {
  return [
    ['RefactAI — Research export for empirical studies'],
    [''],
    ...kvRows([
      ['Workspace ID', workspaceId],
      ['Project', projectName],
      ['Exported at', exportedAt],
      ['Files in export', stats.files_total],
      ['Accepted (applied)', stats.files_accepted],
      ['Rejected (not applied)', stats.files_rejected],
      ['Total PMD smells before', stats.pmd_smells_before_sum],
      ['Total PMD smells after', stats.pmd_smells_after_sum],
      ['Total smell reduction', stats.pmd_smells_delta_sum],
      ['Mean quality score', stats.mean_overall_score],
    ]),
    [''],
    ['Workbook sheets (use for your paper):'],
    ['Overview', 'This page — project metadata and aggregates'],
    ['Files_Summary', 'One row per file: smells, quality, Halstead, coupling, LCOM, tokens, narrative (MAIN TABLE)'],
    ['Metrics_Long', 'Long format: one row per metric per file (good for pivot charts)'],
    ['Smell_By_Type', 'PMD smell resolution by smell type per file'],
    ['<filename>', 'Per-file detail: full report, smells list, code preview'],
    [''],
    ['Citation hint: metrics computed by RefactAI agents (PMD verify + research_metrics pipeline).'],
    ['See wiki/Metric-and-Smell-Computation-Reference.md in the repository.'],
  ];
}

function buildSmellByTypeSheet(
  items: Array<{ filePath: string; fileName: string; bundle: SavedRefactoringReportBundle | null }>
): Aoa {
  const aoa: Aoa = [
    [
      'file_path',
      'file_name',
      'smell_type',
      'before',
      'after',
      'resolved',
      'introduced',
      'net_change',
      'resolution_rate_pct',
    ],
  ];
  for (const { filePath, fileName, bundle } of items) {
    if (!bundle) continue;
    const sr = researchPayloadFromBundle(bundle)?.smell_resolution;
    if (!sr?.by_type) continue;
    for (const [type, data] of Object.entries(sr.by_type)) {
      aoa.push([
        filePath,
        fileName,
        type,
        data.before,
        data.after,
        data.resolved,
        data.introduced,
        data.net_change,
        data.resolution_rate,
      ]);
    }
  }
  if (aoa.length === 1) {
    aoa.push(['(no smell_resolution data — ensure full saved reports exist)']);
  }
  return aoa;
}

function appendLongMetric(
  aoa: Aoa,
  base: (string | number | boolean)[],
  section: string,
  key: string,
  label: string,
  data: BeforeAfter
): void {
  aoa.push([
    ...base,
    section,
    '',
    key,
    label,
    data.before,
    data.after,
    data.change,
    data.improved,
    '',
  ]);
}

function buildMetricsLongSheet(
  workspaceId: string,
  exportedAt: string,
  items: Array<{ filePath: string; bundle: SavedRefactoringReportBundle | null }>
): Aoa {
  const header = [
    'workspace_id',
    'file_path',
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
  const aoa: Aoa = [header];
  for (const { filePath, bundle } of items) {
    if (!bundle) continue;
    const rm = researchPayloadFromBundle(bundle);
    if (!rm) continue;
    const base: (string | number | boolean)[] = [workspaceId, filePath, exportedAt];

    if (rm.comparison) {
      for (const [key, data] of Object.entries(rm.comparison)) {
        if (data) appendLongMetric(aoa, base, 'comparison', key, key.replace(/_/g, ' '), data);
      }
    }
    const pushGroup = (section: string, group?: Record<string, BeforeAfter>) => {
      if (!group) return;
      for (const [key, data] of Object.entries(group)) {
        if (data) appendLongMetric(aoa, base, section, key, key.replace(/_/g, ' '), data);
      }
    };
    pushGroup('halstead', rm.halstead);
    pushGroup('method_lengths', rm.method_lengths);
    pushGroup('nesting_depth', rm.nesting_depth);
    pushGroup('coupling', rm.coupling);
    pushGroup('cohesion', rm.cohesion);

    if (rm.diff_churn) {
      for (const [key, val] of Object.entries(rm.diff_churn)) {
        aoa.push([...base, 'diff_churn', '', key, key, '', '', '', '', val]);
      }
    }
    if (rm.semantic_preservation) {
      aoa.push([
        ...base,
        'semantic_preservation',
        '',
        'overall_rate',
        'Overall preservation %',
        '',
        '',
        '',
        '',
        rm.semantic_preservation.overall_preservation_rate,
      ]);
    }
    if (rm.token_efficiency?.total_tokens) {
      for (const [key, val] of Object.entries(rm.token_efficiency)) {
        aoa.push([...base, 'token_efficiency', '', key, key, '', '', '', '', val]);
      }
    }
    if (rm.smell_resolution?.total_before) {
      aoa.push([
        ...base,
        'smell_resolution',
        'summary',
        'overall_resolution_rate',
        'Overall resolution rate',
        rm.smell_resolution.total_before,
        rm.smell_resolution.total_after,
        rm.smell_resolution.total_resolved,
        '',
        rm.smell_resolution.overall_resolution_rate,
      ]);
    }
    const pm = bundle.pipelineMetadata;
    if (pm) {
      for (const [key, val] of Object.entries(pm)) {
        if (val !== undefined && val !== '') {
          aoa.push([...base, 'pipeline', '', key, key, '', '', '', '', String(val)]);
        }
      }
    }
  }
  if (aoa.length === 1) {
    aoa.push(['', '', '', 'note', '', '', 'no_metrics', '', '', '', '', '']);
  }
  return aoa;
}

export function mergeExportCandidates(
  progressFiles: WorkspaceStudyFileInput[],
  savedReports: Array<{ filePath: string; savedAt?: number }>
): ExportCandidate[] {
  const byPath = new Map<string, ExportCandidate>();
  const savedSet = new Set(savedReports.map((r) => r.filePath));
  const savedAtByPath = new Map(savedReports.map((r) => [r.filePath, r.savedAt]));

  for (const f of progressFiles) {
    const hasReport = savedSet.has(f.filePath);
    const isResult =
      hasReport ||
      f.status === 'refactored' ||
      f.status === 'rejected' ||
      f.status === 'error' ||
      (f.lastRefactorAt != null && f.lastRefactorAt > 0);
    if (!isResult) continue;
    byPath.set(f.filePath, {
      filePath: f.filePath,
      label: f.filePath.split('/').pop() || f.filePath,
      savedAt: savedAtByPath.get(f.filePath) ?? f.lastRefactorAt ?? f.analyzedAt ?? undefined,
      status: f.status,
      hasSavedReport: hasReport,
      smellsBefore: f.smellsBefore,
      smellsAfter: f.smellsAfter,
      humanVerdict: f.humanVerdict,
    });
  }

  for (const r of savedReports) {
    if (!byPath.has(r.filePath)) {
      byPath.set(r.filePath, {
        filePath: r.filePath,
        label: r.filePath.split('/').pop() || r.filePath,
        savedAt: r.savedAt,
        status: 'saved_report',
        hasSavedReport: true,
      });
    } else {
      const c = byPath.get(r.filePath)!;
      c.hasSavedReport = true;
      if (r.savedAt) c.savedAt = r.savedAt;
    }
  }

  return Array.from(byPath.values()).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
}

export type ProjectExcelExportInput = {
  workspaceId: string;
  projectName?: string;
  sourceFolder?: string;
  candidates: ExportCandidate[];
  loadBundle: (filePath: string) => Promise<SavedRefactoringReportBundle | null>;
  onProgress?: (done: number, total: number, filePath: string) => void;
  researchSampleId?: string;
  /** Paths in locked research-sample-manifest.json */
  samplePathSet?: Set<string>;
  completenessNotes?: string[];
  includePerFileSheets?: boolean;
};

export async function buildProjectRefactoringExcel(
  input: ProjectExcelExportInput
): Promise<{
  buffer: ArrayBuffer;
  filename: string;
  exported: number;
  skipped: number;
  filePaths: string[];
}> {
  const projectName = input.projectName || input.workspaceId;
  const sourceFolder = input.sourceFolder || projectName;
  const items: FullExcelFileItem[] = [];
  let exported = 0;
  let skipped = 0;
  const total = input.candidates.length;

  for (let i = 0; i < input.candidates.length; i += 1) {
    const c = input.candidates[i];
    input.onProgress?.(i, total, c.filePath);
    const bundle = await input.loadBundle(c.filePath);
    items.push({
      filePath: c.filePath,
      fileName: c.label,
      bundle,
      savedReportId: bundle ? encodeURIComponent(c.filePath) : '',
      missingReason: bundle ? '' : 'no saved full report — re-run batch or save report',
      candidate: c,
      inCurrentSample: input.samplePathSet?.has(c.filePath) ?? false,
    });
    if (bundle) exported += 1;
    else skipped += 1;
  }
  input.onProgress?.(total, total, '');

  const buffer = await buildFullResearchWorkbook({
    workspaceId: input.workspaceId,
    projectName,
    sourceFolder,
    researchSampleId: input.researchSampleId,
    items,
    completenessNotes: input.completenessNotes,
    includePerFileSheets: input.includePerFileSheets,
    demoMode: isRefineDemo(),
  });

  const filename = defaultProjectExcelFilename(projectName);
  const filePaths = input.candidates.map((c) => c.filePath);
  return { buffer, filename, exported, skipped, filePaths };
}

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function downloadExcelBuffer(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportProjectRefactoringToExcel(
  input: ProjectExcelExportInput
): Promise<{ exported: number; skipped: number; buffer: ArrayBuffer; filename: string; filePaths: string[] }> {
  const built = await buildProjectRefactoringExcel(input);
  downloadExcelBuffer(built.buffer, built.filename);
  return built;
}

export type CrossProjectSlice = {
  workspaceId: string;
  projectName: string;
  sourceFolder?: string;
  researchSampleId?: string;
  samplePathSet?: Set<string>;
  candidates: ExportCandidate[];
  loadBundle: (filePath: string) => Promise<SavedRefactoringReportBundle | null>;
  completenessNotes?: string[];
};

export type CrossProjectExcelExportInput = {
  slices: CrossProjectSlice[];
  onProgress?: (done: number, total: number, label: string) => void;
  /** Default true for legacy callers; set false for all-files master workbook. */
  includePerFileSheets?: boolean;
  addProjectSummarySheets?: boolean;
  /** Sheets 24–30: RQ2/RQ3 statistical tests (recommended for master export). */
  includeResearchAnalysisSheets?: boolean;
};

function buildCrossProjectOverviewSheet(
  exportedAt: string,
  slices: CrossProjectSlice[],
  paperRows: PaperWideRow[],
  stats: Record<string, string | number>
): Aoa {
  const rows: Aoa = [
    ['RefactAI — Cross-project research export (meta-analysis)'],
    [''],
    ...kvRows([
      ['Exported at', exportedAt],
      ['Projects included', slices.length],
      ['Total files', stats.files_total],
      ['Accepted (applied)', stats.files_accepted],
      ['Rejected (not applied)', stats.files_rejected],
      ['Total PMD smells before', stats.pmd_smells_before_sum],
      ['Total PMD smells after', stats.pmd_smells_after_sum],
      ['Total smell reduction', stats.pmd_smells_delta_sum],
      ['Mean quality score', stats.mean_overall_score],
    ]),
    [''],
    ['Projects in this workbook:'],
    ['Workspace ID', 'Project', 'Research sample ID', 'Files exported'],
  ];
  for (const slice of slices) {
    const n = paperRows.filter((r) => r.workspace_id === slice.workspaceId).length;
    rows.push([slice.workspaceId, slice.projectName, slice.researchSampleId ?? '', n]);
  }
  rows.push(['']);
  rows.push(['Sheets:']);
  rows.push(['Overview', 'This page — cross-project aggregates']);
  rows.push(['Files_Summary', 'One row per file across all projects (MAIN TABLE for RQ2)']);
  rows.push(['Metrics_Long', 'Long-format metrics for pivot charts']);
  rows.push(['Smell_By_Type', 'PMD smell resolution by type']);
  rows.push(['<project>_<file>', 'Per-file detail sheets when included']);
  return rows;
}

export async function buildCrossProjectRefactoringExcel(
  input: CrossProjectExcelExportInput
): Promise<{
  buffer: ArrayBuffer;
  filename: string;
  exported: number;
  skipped: number;
  filePaths: string[];
  projectCount: number;
}> {
  const items: FullExcelFileItem[] = [];
  const completenessNotes: string[] = [];
  let exported = 0;
  let skipped = 0;
  const allPaths: string[] = [];
  let progress = 0;
  const totalCandidates = input.slices.reduce((s, sl) => s + sl.candidates.length, 0);

  for (const slice of input.slices) {
    const sourceFolder = slice.sourceFolder || slice.projectName;
    if (slice.completenessNotes?.length) completenessNotes.push(...slice.completenessNotes);
    for (const c of slice.candidates) {
      input.onProgress?.(progress, totalCandidates, `${slice.projectName}: ${c.label}`);
      progress += 1;
      const bundle = await slice.loadBundle(c.filePath);
      items.push({
        filePath: c.filePath,
        fileName: c.label,
        bundle,
        savedReportId: bundle ? encodeURIComponent(c.filePath) : '',
        missingReason: bundle ? '' : 'no saved full report',
        candidate: c,
        projectName: slice.projectName,
        sourceFolder,
        workspaceId: slice.workspaceId,
        inCurrentSample: slice.samplePathSet?.has(c.filePath) ?? false,
      });
      allPaths.push(`${slice.workspaceId}:${c.filePath}`);
      if (bundle) exported += 1;
      else skipped += 1;
    }
  }
  input.onProgress?.(totalCandidates, totalCandidates, '');

  const buffer = await buildFullResearchWorkbook({
    workspaceId: 'cross-project',
    projectName: 'All Projects',
    sourceFolder: 'all',
    items,
    completenessNotes,
    includePerFileSheets: input.includePerFileSheets ?? true,
    addProjectSummarySheets: input.addProjectSummarySheets ?? true,
    includeResearchAnalysisSheets: input.includeResearchAnalysisSheets ?? false,
  });

  return {
    buffer,
    filename: defaultCrossProjectExcelFilename(),
    exported,
    skipped,
    filePaths: allPaths,
    projectCount: input.slices.length,
  };
}

export function parseSavedReportListResponse(raw: unknown): Array<{ filePath: string; savedAt?: number }> {
  if (!raw || typeof raw !== 'object') return [];
  const reports = (raw as { reports?: unknown }).reports;
  if (!Array.isArray(reports)) return [];
  const out: Array<{ filePath: string; savedAt?: number }> = [];
  for (const r of reports) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const filePath = String(o.filePath ?? '');
    if (!filePath) continue;
    out.push({
      filePath,
      savedAt: typeof o.savedAt === 'number' ? o.savedAt : undefined,
    });
  }
  return out;
}
