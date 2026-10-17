/**
 * Workspace-level study CSV: one row per Java file from file-status.json
 * (analyzed / refactored state + compact researchSnapshot from refactor runs).
 * See wiki/Metric-and-Smell-Computation-Reference.md
 */

import { downloadTextFile } from './exportRefactoringReportCsv';

function esc(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(cells: unknown[]): string {
  return cells.map(esc).join(',');
}

export type WorkspaceStudyFileInput = {
  filePath: string;
  status: string;
  smellsBefore?: number;
  smellsAfter?: number;
  humanVerdict?: string | null;
  analyzedAt?: number | null;
  analysisSmellCount?: number;
  lastRefactorAt?: number | null;
  verifyAccepted?: boolean | null;
  runId?: string | null;
  rejectionReason?: string | null;
  researchSnapshot?: string | null;
};

export type WorkspaceStudyExportInput = {
  workspaceId: string;
  projectName?: string;
  exportedAtIso: string;
  summary?: {
    totalFiles?: number;
    analyzed?: number;
    refactored?: number;
    rejected?: number;
    pending?: number;
    progressPercent?: number;
  };
  files: WorkspaceStudyFileInput[];
};

/** Flatten compact researchSnapshot JSON into string columns. */
function flattenSnapshot(snap: Record<string, unknown>, out: Record<string, string>): void {
  for (const [k, v] of Object.entries(snap)) {
    if (v && typeof v === 'object' && 'before' in v && 'after' in v) {
      const o = v as { before?: unknown; after?: unknown; change?: unknown };
      out[`snap_${k}_before`] = String(o.before ?? '');
      out[`snap_${k}_after`] = String(o.after ?? '');
      if (o.change !== undefined) out[`snap_${k}_change`] = String(o.change);
    } else if (v !== null && typeof v !== 'object') {
      out[`snap_${k}`] = String(v);
    }
  }
}

function parseSnapshot(raw: string | null | undefined): Record<string, string> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    flattenSnapshot(parsed, out);
    return out;
  } catch {
    return { snap_parse_error: 'invalid_json' };
  }
}

const FIXED_COLUMNS = [
  'workspace_id',
  'project_name',
  'exported_at',
  'file_path',
  'status',
  'analyzed_at_ms',
  'analysis_smell_count',
  'smells_before',
  'smells_after',
  'verify_accepted',
  'human_verdict',
  'rejection_reason',
  'last_refactor_at_ms',
  'run_id',
] as const;

export function buildWorkspaceStudyCsv(input: WorkspaceStudyExportInput): string {
  const lines: string[] = [];
  lines.push('# RefactAI workspace study export — wiki/Metric-and-Smell-Computation-Reference.md');

  const snapKeys = new Set<string>();
  const perFileSnap: Record<string, string>[] = [];

  for (const f of input.files) {
    const snap = parseSnapshot(f.researchSnapshot);
    perFileSnap.push(snap);
    Object.keys(snap).forEach((k) => snapKeys.add(k));
  }

  const dynamicCols = Array.from(snapKeys).sort();
  const header = [...FIXED_COLUMNS, ...dynamicCols];
  lines.push(row(header));

  const projectName = input.projectName ?? input.workspaceId;

  for (let i = 0; i < input.files.length; i++) {
    const f = input.files[i];
    const snap = perFileSnap[i];
    const cells: unknown[] = [
      input.workspaceId,
      projectName,
      input.exportedAtIso,
      f.filePath,
      f.status ?? 'pending',
      f.analyzedAt ?? '',
      f.analysisSmellCount ?? '',
      f.smellsBefore ?? '',
      f.smellsAfter ?? '',
      f.verifyAccepted === true || f.verifyAccepted === false ? f.verifyAccepted : '',
      f.humanVerdict ?? '',
      f.rejectionReason ?? '',
      f.lastRefactorAt ?? '',
      f.runId ?? '',
    ];
    for (const col of dynamicCols) {
      cells.push(snap[col] ?? '');
    }
    lines.push(row(cells));
  }

  const s = input.summary;
  if (s) {
    lines.push(
      `# summary totalFiles=${s.totalFiles ?? ''} analyzed=${s.analyzed ?? ''} refactored=${s.refactored ?? ''} rejected=${s.rejected ?? ''} pending=${s.pending ?? ''} progressPercent=${s.progressPercent ?? ''}`
    );
  }

  return lines.join('\r\n');
}

export function defaultWorkspaceStudyFilename(workspaceId: string, iso: string): string {
  const safe = workspaceId.replace(/[^\w.-]+/g, '_').slice(0, 40);
  return `refactai-study_${safe}_${iso.slice(0, 10)}.csv`;
}

export function downloadWorkspaceStudyCsv(filename: string, csv: string): void {
  downloadTextFile(filename, csv);
}
