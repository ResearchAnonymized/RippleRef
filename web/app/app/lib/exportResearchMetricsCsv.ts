/**
 * Research metrics CSV for Excel / Google Sheets (UTF-8, one row per metric).
 * Aligns with the deduplicated Research Metrics panel (no duplicate smell/quality blocks).
 */

import { csvRow, downloadTextFile } from './exportRefactoringReportCsv';

export type ResearchMetricsSheetInput = {
  workspaceId?: string;
  filePath?: string;
  exportedAtIso: string;
  metrics: ResearchMetricsPayload | null;
  pipelineMetadata?: {
    retryCount?: number;
    model?: string;
    rejectionCategory?: string;
  } | null;
};

export type BeforeAfter = {
  before: number;
  after: number;
  change: number;
  improved: boolean;
};

export type ResearchMetricsPayload = {
  meta?: {
    file?: string;
    verifyAccepted?: boolean;
    overallScore?: number;
    refactoringSuccessful?: boolean;
  };
  comparison?: Record<string, BeforeAfter>;
  structural?: Record<string, number | boolean>;
  behavioral?: Record<string, boolean | string | undefined> & {
    checks?: Array<{
      check_id: string;
      label: string;
      passed?: boolean | null;
      status?: string;
      why_pass?: string;
      why_fail?: string;
    }>;
    behavioral_changes_json?: string;
    warnings?: string;
    errors?: string;
  };
  practices_applied?: string[];
  summary?: { key_achievements?: string[]; concerns?: string[] };
  halstead?: Record<string, BeforeAfter>;
  method_lengths?: Record<string, BeforeAfter>;
  nesting_depth?: Record<string, BeforeAfter>;
  coupling?: Record<string, BeforeAfter>;
  cohesion?: Record<string, BeforeAfter>;
  diff_churn?: {
    lines_added: number;
    lines_removed: number;
    lines_modified: number;
    net_change: number;
    hunks: number;
    churn_rate_percent: number;
    total_changes: number;
  };
  semantic_preservation?: {
    overall_preservation_rate: number;
    classes?: { preservation_rate: number; removed: number; added: number };
    methods?: { preservation_rate: number; removed: number; added: number; removed_items?: string[] };
    fields?: { preservation_rate: number; removed: number; added: number };
  };
  token_efficiency?: {
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    cost_usd: number;
    meaningful_line_changes: number;
    changes_per_1k_tokens: number;
    cost_per_change_usd: number;
  };
  smell_resolution?: {
    by_type: Record<
      string,
      {
        before: number;
        after: number;
        resolved: number;
        introduced: number;
        net_change: number;
        resolution_rate: number;
      }
    >;
    total_before: number;
    total_after: number;
    total_resolved: number;
    overall_resolution_rate: number;
    types_fully_eliminated: number;
    types_with_regression: number;
  };
};

const COMPARISON_LABELS: Record<string, { label: string; group: string }> = {
  pmd_smell_total: { label: 'PMD smell total', group: 'quality_size' },
  complexity: { label: 'Cyclomatic complexity', group: 'quality_size' },
  maintainability: { label: 'Maintainability index', group: 'quality_size' },
  testability: { label: 'Testability score', group: 'quality_size' },
  lines_of_code: { label: 'Lines of code', group: 'quality_size' },
  method_count: { label: 'Method count', group: 'quality_size' },
  smells_critical: { label: 'Critical smells', group: 'smell_severity' },
  smells_major: { label: 'Major smells', group: 'smell_severity' },
  smells_minor: { label: 'Minor smells', group: 'smell_severity' },
  smells_info: { label: 'Info smells', group: 'smell_severity' },
  smells_other: { label: 'Other smells', group: 'smell_severity' },
};

const HEADER = [
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
] as const;

type CsvLine = unknown[];

function baseCells(input: ResearchMetricsSheetInput): [string, string, string] {
  return [
    input.workspaceId ?? '',
    input.filePath ?? input.metrics?.meta?.file ?? '',
    input.exportedAtIso,
  ];
}

function pushBA(
  _out: string[],
  base: [string, string, string],
  section: string,
  subgroup: string,
  key: string,
  label: string,
  data: BeforeAfter,
  add: (cells: CsvLine) => void,
  extra = ''
) {
  add([
    ...base,
    section,
    subgroup,
    key,
    label,
    data.before,
    data.after,
    data.change,
    data.improved,
    extra,
  ]);
}

function hasBA(obj?: Record<string, BeforeAfter>): boolean {
  if (!obj) return false;
  return Object.values(obj).some((d) => d && (d.before !== 0 || d.after !== 0 || d.change !== 0));
}

export function buildResearchMetricsSheetCsv(input: ResearchMetricsSheetInput): string {
  const out: string[] = [];
  const m = input.metrics;
  if (!m) {
    return [
      csvRow([...HEADER]),
      csvRow([...baseCells(input), 'error', '', '', 'no_metrics', '', '', '', '', '', '']),
    ].join('\r\n');
  }

  const base = baseCells(input);
  const add = (cells: CsvLine) => out.push(csvRow(cells));
  add([...HEADER]);

  const meta = m.meta;
  if (meta) {
    if (meta.verifyAccepted !== undefined) {
      add([...base, 'meta', '', 'verify_accepted', 'Verify accepted', '', '', '', '', meta.verifyAccepted]);
    }
    if (typeof meta.overallScore === 'number') {
      add([...base, 'meta', '', 'overall_score', 'Overall score', '', '', '', '', meta.overallScore]);
    }
    if (meta.refactoringSuccessful !== undefined) {
      add([
        ...base,
        'meta',
        '',
        'refactoring_successful',
        'Refactoring successful',
        '',
        '',
        '',
        '',
        meta.refactoringSuccessful,
      ]);
    }
  }

  if (m.comparison) {
    for (const [key, data] of Object.entries(m.comparison)) {
      if (!data) continue;
      const cfg = COMPARISON_LABELS[key] || { label: key.replace(/_/g, ' '), group: 'comparison' };
      pushBA(out, base, 'comparison', cfg.group, key, cfg.label, data, add);
    }
  }

  if (m.behavioral) {
    for (const [key, ok] of Object.entries(m.behavioral)) {
      if (ok === undefined) continue;
      add([...base, 'behavioral', '', key, key.replace(/_/g, ' '), '', '', '', '', ok]);
    }
  }

  if (m.structural) {
    for (const [key, val] of Object.entries(m.structural)) {
      if (val === false || val === 0) continue;
      add([...base, 'structural', '', key, key.replace(/_/g, ' '), '', '', '', '', val]);
    }
  }

  if (m.practices_applied?.length) {
    m.practices_applied.forEach((p, i) => {
      add([...base, 'practices', '', `practice_${i}`, p, '', '', '', '', '']);
    });
  }

  if (m.summary?.key_achievements?.length) {
    m.summary.key_achievements.forEach((t, i) => {
      add([...base, 'narrative', 'achievement', `achievement_${i}`, t, '', '', '', '', '']);
    });
  }
  if (m.summary?.concerns?.length) {
    m.summary.concerns.forEach((t, i) => {
      add([...base, 'narrative', 'concern', `concern_${i}`, t, '', '', '', '', '']);
    });
  }

  const pushGroup = (section: string, group?: Record<string, BeforeAfter>) => {
    if (!hasBA(group)) return;
    for (const [key, data] of Object.entries(group!)) {
      if (!data) continue;
      pushBA(out, base, section, '', key, key.replace(/_/g, ' '), data, add);
    }
  };

  pushGroup('halstead', m.halstead);
  pushGroup('method_lengths', m.method_lengths);
  pushGroup('nesting_depth', m.nesting_depth);
  pushGroup('coupling', m.coupling);
  pushGroup('cohesion', m.cohesion);

  if (m.diff_churn) {
    const dc = m.diff_churn;
    const fields: [string, number][] = [
      ['lines_added', dc.lines_added],
      ['lines_removed', dc.lines_removed],
      ['lines_modified', dc.lines_modified],
      ['net_change', dc.net_change],
      ['hunks', dc.hunks],
      ['churn_rate_percent', dc.churn_rate_percent],
      ['total_changes', dc.total_changes],
    ];
    for (const [key, val] of fields) {
      add([...base, 'diff_churn', '', key, key.replace(/_/g, ' '), '', '', '', '', val]);
    }
  }

  if (m.semantic_preservation) {
    const sp = m.semantic_preservation;
    add([
      ...base,
      'semantic_preservation',
      '',
      'overall',
      'Overall preservation rate',
      '',
      '',
      '',
      '',
      sp.overall_preservation_rate,
    ]);
    for (const kind of ['classes', 'methods', 'fields'] as const) {
      const block = sp[kind];
      if (!block) continue;
      add([
        ...base,
        'semantic_preservation',
        kind,
        'preservation_rate',
        `${kind} preservation %`,
        '',
        '',
        '',
        '',
        block.preservation_rate,
      ]);
    }
    if (sp.methods?.removed_items?.length) {
      add([
        ...base,
        'semantic_preservation',
        'methods',
        'removed_items',
        'Removed methods',
        '',
        '',
        '',
        '',
        sp.methods.removed_items.join('; '),
      ]);
    }
  }

  if (m.token_efficiency && m.token_efficiency.total_tokens > 0) {
    const te = m.token_efficiency;
    for (const [key, val] of Object.entries(te)) {
      add([...base, 'token_efficiency', '', key, key.replace(/_/g, ' '), '', '', '', '', val]);
    }
  }

  if (m.smell_resolution && m.smell_resolution.total_before > 0) {
    const sr = m.smell_resolution;
    add([
      ...base,
      'smell_resolution',
      'summary',
      'overall_resolution_rate',
      'Overall resolution rate',
      sr.total_before,
      sr.total_after,
      sr.total_resolved,
      '',
      sr.overall_resolution_rate,
    ]);
    for (const [type, data] of Object.entries(sr.by_type || {})) {
      add([
        ...base,
        'smell_resolution',
        'by_type',
        type,
        type,
        data.before,
        data.after,
        data.net_change,
        data.resolved > 0,
        `${data.resolution_rate}% resolved; introduced=${data.introduced}`,
      ]);
    }
  }

  const pm = input.pipelineMetadata;
  if (pm) {
    for (const [key, val] of Object.entries(pm)) {
      if (val === undefined || val === '') continue;
      add([...base, 'pipeline', '', key, key.replace(/_/g, ' '), '', '', '', '', val]);
    }
  }

  return out.join('\r\n');
}

export function defaultResearchMetricsSheetFilename(filePath: string, iso: string): string {
  const safe = filePath.replace(/[^\w.-]+/g, '_').slice(-80) || 'file';
  return `refactai-research-metrics_${safe}_${iso.slice(0, 10)}.csv`;
}

export function downloadResearchMetricsSheet(filename: string, csv: string): void {
  downloadTextFile(filename, csv);
}
