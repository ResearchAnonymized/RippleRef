/**
 * Build a single UTF-8 CSV report for a refactoring run (Excel-friendly).
 * See wiki/Metric-and-Smell-Computation-Reference.md for metric definitions.
 */

export function csvEsc(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvEsc).join(',');
}

function esc(v: unknown): string {
  return csvEsc(v);
}

function row(cells: unknown[]): string {
  return csvRow(cells);
}

function isBeforeAfter(
  x: unknown
): x is { before: unknown; after: unknown; change?: unknown; improved?: unknown } {
  return !!x && typeof x === 'object' && 'before' in x && 'after' in x;
}

/** Flatten nested researchMetrics: emit rows for each before/after leaf; primitives as detail rows. */
function flattenResearchMetrics(obj: unknown, prefix: string, out: string[][]): void {
  if (obj === null || obj === undefined) return;
  if (isBeforeAfter(obj)) {
    out.push([
      'research_metric',
      prefix,
      String(obj.before),
      String(obj.after),
      obj.change !== undefined ? String(obj.change) : '',
      obj.improved !== undefined ? String(obj.improved) : '',
    ]);
    return;
  }
  if (Array.isArray(obj)) {
    out.push(['research_detail', prefix, '', '', JSON.stringify(obj), '']);
    return;
  }
  if (typeof obj !== 'object') {
    out.push(['research_detail', prefix, '', '', String(obj), '']);
    return;
  }
  const o = obj as Record<string, unknown>;
  const keys = Object.keys(o);
  const allPrimitive = keys.every(
    (k) => o[k] === null || ['string', 'number', 'boolean'].includes(typeof o[k])
  );
  if (allPrimitive && keys.length > 0) {
    for (const k of keys) {
      out.push(['research_detail', prefix ? `${prefix}.${k}` : k, '', '', String(o[k]), '']);
    }
    return;
  }
  for (const k of keys) {
    const p = prefix ? `${prefix}.${k}` : k;
    flattenResearchMetrics(o[k], p, out);
  }
}

export interface RefactoringCsvExportInput {
  workspaceId: string;
  filePath: string;
  exportedAtIso: string;
  applyResult: Record<string, unknown> | null;
  codeSmells?: unknown[] | null;
  smellComparison?: {
    before?: unknown[];
    after?: unknown[];
    removed?: unknown[];
    added?: unknown[];
    unchanged?: unknown[];
    beforeTotal?: number;
    afterTotal?: number;
    typeSummary?: Record<string, { before: number; after: number }>;
  } | null;
  agentSteps?: unknown[] | null;
  refactoringRejected?: { rejected?: boolean; rejectionReason?: unknown; message?: unknown } | null;
}

export function buildRefactoringReportCsv(input: RefactoringCsvExportInput): string {
  const lines: string[] = [];
  lines.push('# RefactAI export — see wiki/Metric-and-Smell-Computation-Reference.md');
  lines.push(row(['section', 'field_1', 'field_2', 'field_3', 'field_4', 'field_5']));

  const { workspaceId, filePath, exportedAtIso, applyResult } = input;

  lines.push(row(['meta', 'workspaceId', workspaceId, '', '', '']));
  lines.push(row(['meta', 'filePath', filePath, '', '', '']));
  lines.push(row(['meta', 'exportedAt', exportedAtIso, '', '', '']));

  if (applyResult) {
    lines.push(row(['summary', 'success', String(applyResult.success ?? ''), '', '', '']));
    lines.push(row(['summary', 'rejected', String(applyResult.rejected ?? ''), '', '', '']));
    const rr = applyResult.rejectionReason;
    lines.push(
      row([
        'summary',
        'rejectionReason',
        Array.isArray(rr) ? rr.join('; ') : String(rr ?? ''),
        '',
        '',
        '',
      ])
    );
    const ch = applyResult.changes as Record<string, unknown> | undefined;
    if (ch) {
      lines.push(row(['summary', 'diff_added', String(ch.added ?? ''), '', '', '']));
      lines.push(row(['summary', 'diff_removed', String(ch.removed ?? ''), '', '', '']));
      lines.push(row(['summary', 'diff_modified', String(ch.modified ?? ''), '', '', '']));
    }

    const deltas = applyResult.deltas as Record<string, unknown> | undefined;
    if (deltas) {
      lines.push(row(['deltas', 'before_smell_total', String(deltas.before ?? ''), '', '', '']));
      lines.push(row(['deltas', 'after_smell_total', String(deltas.after ?? ''), '', '', '']));
      lines.push(row(['deltas', 'improvement', String(deltas.improvement ?? ''), '', '', '']));
      const sb = deltas.smellsBefore as Record<string, unknown> | undefined;
      const sa = deltas.smellsAfter as Record<string, unknown> | undefined;
      if (sb) lines.push(row(['deltas', 'smellsBefore_json', JSON.stringify(sb), '', '', '']));
      if (sa) lines.push(row(['deltas', 'smellsAfter_json', JSON.stringify(sa), '', '', '']));

      const ca = deltas.comprehensiveAnalysis as Record<string, unknown> | undefined;
      if (ca?.summary && typeof ca.summary === 'object') {
        const s = ca.summary as Record<string, unknown>;
        for (const [k, v] of Object.entries(s)) {
          if (Array.isArray(v)) {
            lines.push(row(['comprehensive_summary', k, v.join('; '), '', '', '']));
          } else if (v !== null && typeof v === 'object') {
            lines.push(row(['comprehensive_summary', k, JSON.stringify(v), '', '', '']));
          } else {
            lines.push(row(['comprehensive_summary', k, String(v), '', '', '']));
          }
        }
      }
    }

    const pm = applyResult.pipelineMetadata as Record<string, unknown> | undefined;
    if (pm) {
      for (const [k, v] of Object.entries(pm)) {
        lines.push(row(['pipeline', k, String(v), '', '', '']));
      }
    }

    const rm = applyResult.researchMetrics as Record<string, unknown> | undefined;
    if (rm) {
      lines.push(
        row([
          'research_header',
          'metric_path',
          'before',
          'after',
          'change',
          'improved_or_extra',
        ])
      );
      const metricRows: string[][] = [];
      flattenResearchMetrics(rm, '', metricRows);
      for (const r of metricRows) lines.push(row(r));
    }
  }

  const sc = input.smellComparison;
  if (sc) {
    lines.push(
      row([
        'smell_compare',
        'beforeTotal',
        String(sc.beforeTotal ?? sc.before?.length ?? ''),
        'afterTotal',
        String(sc.afterTotal ?? sc.after?.length ?? ''),
        '',
      ])
    );
    if (sc.typeSummary) {
      for (const [t, c] of Object.entries(sc.typeSummary)) {
        lines.push(row(['smell_compare_by_type', t, String(c.before), String(c.after), '', '']));
      }
    }
    const emitSmell = (group: string, s: unknown, i: number) => {
      if (!s || typeof s !== 'object') return;
      const o = s as Record<string, unknown>;
      lines.push(
        row([
          `smell_${group}`,
          String(i),
          String(o.type ?? o.smell ?? ''),
          String(o.severity ?? ''),
          String(o.location ?? o.lineNumber ?? ''),
          String(o.description ?? ''),
        ])
      );
    };
    (sc.removed ?? []).forEach((s, i) => emitSmell('removed', s, i));
    (sc.added ?? []).forEach((s, i) => emitSmell('added', s, i));
  }

  const smells = input.codeSmells;
  if (Array.isArray(smells)) {
    smells.forEach((s, i) => {
      if (!s || typeof s !== 'object') return;
      const o = s as Record<string, unknown>;
      lines.push(
        row([
          'detected_smell',
          String(i),
          String(o.type ?? ''),
          String(o.severity ?? ''),
          String(o.location ?? o.lineNumber ?? ''),
          String(o.description ?? ''),
        ])
      );
    });
  }

  if (Array.isArray(input.agentSteps)) {
    input.agentSteps.forEach((st, i) => {
      if (!st || typeof st !== 'object') return;
      const o = st as Record<string, unknown>;
      lines.push(
        row([
          'agent_step',
          String(i),
          String(o.name ?? ''),
          String(o.status ?? ''),
          String(o.agent ?? ''),
          String(o.error ?? ''),
        ])
      );
    });
  }

  if (input.refactoringRejected) {
    const rj = input.refactoringRejected;
    lines.push(row(['rejected_meta', 'rejected', String(rj.rejected ?? ''), '', '', '']));
    const rr = rj.rejectionReason;
    lines.push(
      row([
        'rejected_meta',
        'reason',
        Array.isArray(rr) ? rr.join('; ') : String(rr ?? ''),
        '',
        '',
        '',
      ])
    );
  }

  return lines.join('\r\n');
}

export function downloadTextFile(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function defaultRefactoringExportFilename(filePath: string, iso: string): string {
  const safe = filePath.replace(/[^\w.-]+/g, '_').slice(-80) || 'file';
  const day = iso.slice(0, 10);
  return `refactai-report_${safe}_${day}.csv`;
}
