/**
 * Canonical 15 research-metric sections (matches ResearchMetricsPanel UI headings).
 */

import type { BeforeAfter, ResearchMetricsPayload } from './exportResearchMetricsCsv';
import type { SavedRefactoringReportBundle } from './savedRefactoringReport';

export const PROVENANCE_COLUMNS = [
  'project_name',
  'source_folder',
  'workspace_id',
  'file_path',
  'file_name',
  'saved_report_id',
  'saved_at_iso',
  'has_full_saved_report',
  'missing_reason',
] as const;

export const RESEARCH_SECTIONS = [
  { id: 'comparison', sheet: '02_Before_After', title: 'Before / After (computed)' },
  { id: 'behavioral', sheet: '03_Behavioral', title: 'Behavioral Checks' },
  { id: 'structural', sheet: '04_Structural', title: 'Structural Changes' },
  { id: 'practices', sheet: '05_Practices', title: 'Practices Applied' },
  { id: 'narrative', sheet: '06_Narrative', title: 'Narrative Summary' },
  { id: 'halstead', sheet: '07_Halstead', title: 'Halstead Complexity' },
  { id: 'method_lengths', sheet: '08_Method_Length', title: 'Method Length Distribution' },
  { id: 'nesting_depth', sheet: '09_Nesting', title: 'Nesting Depth' },
  { id: 'coupling', sheet: '10_Coupling', title: 'Coupling (CBO)' },
  { id: 'cohesion', sheet: '11_Cohesion', title: 'Cohesion (LCOM)' },
  { id: 'diff_churn', sheet: '12_Diff_Churn', title: 'Diff Churn' },
  { id: 'semantic_preservation', sheet: '13_Semantic', title: 'Semantic Preservation' },
  { id: 'token_efficiency', sheet: '14_Tokens', title: 'Token Efficiency' },
  { id: 'smell_resolution', sheet: '15_Smell_By_Type', title: 'Smell Resolution by Type' },
  { id: 'pipeline', sheet: '16_Pipeline', title: 'Pipeline Metadata' },
] as const;

export type FileMetricContext = {
  projectName: string;
  sourceFolder: string;
  workspaceId: string;
  filePath: string;
  fileName: string;
  savedReportId: string;
  savedAtIso: string;
  hasFullSavedReport: boolean;
  missingReason: string;
};

export function researchPayloadFromBundle(
  bundle: SavedRefactoringReportBundle | null
): ResearchMetricsPayload | null {
  if (!bundle) return null;
  const fromTop = researchPayloadFromRecord(bundle.researchMetrics as Record<string, unknown> | null);
  if (fromTop) return fromTop;
  const ar = bundle.applyResult;
  if (ar?.researchMetrics && typeof ar.researchMetrics === 'object') {
    return researchPayloadFromRecord(ar.researchMetrics as Record<string, unknown>);
  }
  return null;
}

export function researchPayloadFromRecord(
  raw: Record<string, unknown> | null | undefined
): ResearchMetricsPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.comparison || o.meta || o.halstead) return raw as ResearchMetricsPayload;
  const inner = o.research_metrics ?? o.metrics;
  if (inner && typeof inner === 'object') return inner as ResearchMetricsPayload;
  return null;
}

export function provenanceRow(ctx: FileMetricContext): (string | number | boolean)[] {
  return [
    ctx.projectName,
    ctx.sourceFolder,
    ctx.workspaceId,
    ctx.filePath,
    ctx.fileName,
    ctx.savedReportId,
    ctx.savedAtIso,
    ctx.hasFullSavedReport ? 'yes' : 'no',
    ctx.missingReason,
  ];
}

function baCols(prefix: string, data?: BeforeAfter): Record<string, string | number | boolean> {
  if (!data) return {};
  return {
    [`${prefix}_before`]: data.before,
    [`${prefix}_after`]: data.after,
    [`${prefix}_delta`]: data.change,
    [`${prefix}_improved`]: data.improved ?? '',
  };
}

export function extractComparisonWide(
  ctx: FileMetricContext,
  rm: ResearchMetricsPayload | null
): Record<string, string | number | boolean> {
  const row: Record<string, string | number | boolean> = Object.fromEntries(
    PROVENANCE_COLUMNS.map((c, i) => [c, provenanceRow(ctx)[i]])
  );
  if (!rm?.comparison) return row;
  for (const [key, data] of Object.entries(rm.comparison)) {
    if (!data) continue;
    Object.assign(row, baCols(key, data));
  }
  if (rm.meta) {
    if (rm.meta.verifyAccepted !== undefined) row.verify_accepted = rm.meta.verifyAccepted;
    if (typeof rm.meta.overallScore === 'number') row.overall_score = rm.meta.overallScore;
    if (rm.meta.refactoringSuccessful !== undefined) {
      row.refactoring_successful = rm.meta.refactoringSuccessful;
    }
  }
  return row;
}

export function extractBehavioralWide(
  ctx: FileMetricContext,
  rm: ResearchMetricsPayload | null
): Record<string, string | number | boolean> {
  const row: Record<string, string | number | boolean> = Object.fromEntries(
    PROVENANCE_COLUMNS.map((c, i) => [c, provenanceRow(ctx)[i]])
  );
  if (!rm?.behavioral) return row;
  const b = rm.behavioral as Record<string, unknown>;
  for (const [key, val] of Object.entries(b)) {
    if (key === 'checks' || key === 'behavioral_changes_json') continue;
    if (val !== undefined) row[key] = val as string | number | boolean;
  }
  if (Array.isArray(b.checks)) {
    row.behavioral_check_count = b.checks.length;
    row.behavioral_pass_count = (b.checks as Array<{ status?: string }>).filter((c) => c.status === 'pass').length;
    row.behavioral_fail_count = (b.checks as Array<{ status?: string }>).filter((c) => c.status === 'fail').length;
  }
  return row;
}

export function extractStructuralWide(
  ctx: FileMetricContext,
  rm: ResearchMetricsPayload | null
): Record<string, string | number | boolean> {
  const row: Record<string, string | number | boolean> = Object.fromEntries(
    PROVENANCE_COLUMNS.map((c, i) => [c, provenanceRow(ctx)[i]])
  );
  if (!rm?.structural) return row;
  for (const [key, val] of Object.entries(rm.structural)) {
    row[key] = val;
  }
  return row;
}

export function extractGroupWide(
  ctx: FileMetricContext,
  rm: ResearchMetricsPayload | null,
  group: keyof Pick<
    ResearchMetricsPayload,
    'halstead' | 'method_lengths' | 'nesting_depth' | 'coupling' | 'cohesion'
  >
): Record<string, string | number | boolean> {
  const row: Record<string, string | number | boolean> = Object.fromEntries(
    PROVENANCE_COLUMNS.map((c, i) => [c, provenanceRow(ctx)[i]])
  );
  const g = rm?.[group];
  if (!g) return row;
  for (const [key, data] of Object.entries(g)) {
    if (data && typeof data === 'object' && 'before' in data) {
      Object.assign(row, baCols(`${group}_${key}`, data as BeforeAfter));
    }
  }
  return row;
}

export function extractDiffChurnWide(
  ctx: FileMetricContext,
  rm: ResearchMetricsPayload | null
): Record<string, string | number | boolean> {
  const row: Record<string, string | number | boolean> = Object.fromEntries(
    PROVENANCE_COLUMNS.map((c, i) => [c, provenanceRow(ctx)[i]])
  );
  if (!rm?.diff_churn) return row;
  for (const [key, val] of Object.entries(rm.diff_churn)) {
    row[key] = val;
  }
  return row;
}

export function extractSemanticWide(
  ctx: FileMetricContext,
  rm: ResearchMetricsPayload | null
): Record<string, string | number | boolean> {
  const row: Record<string, string | number | boolean> = Object.fromEntries(
    PROVENANCE_COLUMNS.map((c, i) => [c, provenanceRow(ctx)[i]])
  );
  const sp = rm?.semantic_preservation;
  if (!sp) return row;
  row.overall_preservation_rate = sp.overall_preservation_rate;
  for (const kind of ['classes', 'methods', 'fields'] as const) {
    const block = sp[kind];
    if (!block) continue;
    row[`${kind}_preservation_rate`] = block.preservation_rate;
    row[`${kind}_removed`] = block.removed;
    row[`${kind}_added`] = block.added;
  }
  if (sp.methods?.removed_items?.length) {
    row.methods_removed_items = sp.methods.removed_items.join('; ');
  }
  return row;
}

export function extractTokenWide(
  ctx: FileMetricContext,
  rm: ResearchMetricsPayload | null
): Record<string, string | number | boolean> {
  const row: Record<string, string | number | boolean> = Object.fromEntries(
    PROVENANCE_COLUMNS.map((c, i) => [c, provenanceRow(ctx)[i]])
  );
  if (!rm?.token_efficiency) return row;
  for (const [key, val] of Object.entries(rm.token_efficiency)) {
    row[key] = val;
  }
  return row;
}

export function extractPipelineWide(
  ctx: FileMetricContext,
  bundle: SavedRefactoringReportBundle | null
): Record<string, string | number | boolean> {
  const row: Record<string, string | number | boolean> = Object.fromEntries(
    PROVENANCE_COLUMNS.map((c, i) => [c, provenanceRow(ctx)[i]])
  );
  const pm = bundle?.pipelineMetadata;
  if (!pm) return row;
  for (const [key, val] of Object.entries(pm)) {
    if (val !== undefined && val !== '') row[key] = String(val);
  }
  return row;
}

export type PracticeRow = FileMetricContext & { practice_index: number; practice: string };
export type NarrativeRow = FileMetricContext & {
  narrative_kind: 'achievement' | 'concern';
  narrative_index: number;
  text: string;
};
export type SmellTypeRow = FileMetricContext & {
  smell_type: string;
  before: number;
  after: number;
  resolved: number;
  introduced: number;
  net_change: number;
  resolution_rate: number;
};

export function extractPracticeRows(
  ctx: FileMetricContext,
  rm: ResearchMetricsPayload | null
): PracticeRow[] {
  const list = rm?.practices_applied ?? [];
  return list.map((practice, i) => ({
    ...ctx,
    practice_index: i,
    practice,
  }));
}

export function extractNarrativeRows(
  ctx: FileMetricContext,
  rm: ResearchMetricsPayload | null
): NarrativeRow[] {
  const out: NarrativeRow[] = [];
  rm?.summary?.key_achievements?.forEach((text, i) => {
    out.push({ ...ctx, narrative_kind: 'achievement', narrative_index: i, text });
  });
  rm?.summary?.concerns?.forEach((text, i) => {
    out.push({ ...ctx, narrative_kind: 'concern', narrative_index: i, text });
  });
  return out;
}

export function extractSmellTypeRows(
  ctx: FileMetricContext,
  rm: ResearchMetricsPayload | null
): SmellTypeRow[] {
  const sr = rm?.smell_resolution;
  if (!sr?.by_type) return [];
  return Object.entries(sr.by_type).map(([smell_type, data]) => ({
    ...ctx,
    smell_type,
    before: data.before,
    after: data.after,
    resolved: data.resolved,
    introduced: data.introduced,
    net_change: data.net_change,
    resolution_rate: data.resolution_rate,
  }));
}

export function rowsToSheetData(
  rows: Record<string, string | number | boolean>[]
): (string | number | boolean)[][] {
  if (!rows.length) return [['(no data)']];
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const ordered = [
    ...PROVENANCE_COLUMNS.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !PROVENANCE_COLUMNS.includes(k as (typeof PROVENANCE_COLUMNS)[number])),
  ];
  return [ordered, ...rows.map((r) => ordered.map((k) => r[k] ?? ''))];
}

export function longRowsToSheetData(
  rows: Record<string, string | number | boolean>[]
): (string | number | boolean)[][] {
  if (!rows.length) return [['(no data)']];
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  return [keys, ...rows.map((r) => keys.map((k) => r[k] ?? ''))];
}
