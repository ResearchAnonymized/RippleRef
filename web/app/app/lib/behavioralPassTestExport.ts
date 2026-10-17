/**
 * Behavioral pass/fail checks and verification gates with human-readable explanations
 * for research exports (why a check passed or failed).
 */

import type { ResearchMetricsPayload } from './exportResearchMetricsCsv';
import { multiLlmRunsFromBundle, providerKeyFromRun } from './multiLlmExport';
import { researchPayloadFromRecord } from './researchMetricSections';
import type { SavedRefactoringReportBundle } from './savedRefactoringReport';
import type { LoadedResearchFile } from './researchDatasetLoader';
import type { MultiLlmRunRecord } from './batchRunStorage';

export type BehavioralCheckSpec = {
  id: string;
  label: string;
  passExplanation: string;
  failExplanation: string;
};

export const BEHAVIORAL_CHECK_SPECS: BehavioralCheckSpec[] = [
  {
    id: 'behavioral_correct',
    label: 'Overall behavioral correctness',
    passExplanation:
      'All heuristic behavioral checks passed: public API, exceptions, framework hooks, control flow, and critical calls appear preserved.',
    failExplanation:
      'At least one behavioral heuristic failed or errors were detected — review diff and run project tests before trusting the refactor.',
  },
  {
    id: 'method_signatures_preserved',
    label: 'Public method signatures preserved',
    passExplanation: 'Public method signatures match the original (same API surface for callers).',
    failExplanation:
      'Public methods were removed or signatures changed — callers may fail to compile or behave differently.',
  },
  {
    id: 'exception_handling_preserved',
    label: 'Exception handling preserved',
    passExplanation: 'try/catch/finally structure and thrown types appear consistent with the original.',
    failExplanation:
      'Exception handling changed (e.g. catch removed, throws dropped) — error paths may silently swallow failures.',
  },
  {
    id: 'framework_contracts_preserved',
    label: 'Framework contracts preserved',
    passExplanation: 'Annotations, overrides, and framework lifecycle hooks appear unchanged.',
    failExplanation:
      'Framework annotations or contracts were altered — Spring/JUnit/Jakarta hooks may no longer run as expected.',
  },
  {
    id: 'conditional_logic_preserved',
    label: 'Conditional logic preserved',
    passExplanation: 'if/switch/ternary control flow count is stable — branching structure not removed.',
    failExplanation:
      'Conditional constructs were removed or simplified — side effects guarded by branches may no longer execute.',
  },
  {
    id: 'critical_method_calls_preserved',
    label: 'Critical method calls preserved',
    passExplanation: 'Assert/fail and other critical test calls were not removed unexpectedly.',
    failExplanation:
      'Assert or fail() calls were removed — tests may pass vacuously or miss failures.',
  },
];

export type BehavioralPassTestRow = {
  project_name: string;
  workspace_id: string;
  source_folder: string;
  file_path: string;
  file_name: string;
  scope: 'final' | 'llm_pass';
  provider: string;
  provider_key: string;
  pass_index: number | '';
  model: string;
  check_id: string;
  check_label: string;
  status: 'pass' | 'fail' | 'unknown';
  passed: 'yes' | 'no' | '';
  why_pass: string;
  why_fail: string;
  verify_accepted: 'yes' | 'no' | '';
  overall_score: number | '';
  behavioral_changes: string;
  warnings: string;
  errors: string;
};

export type VerificationGateRow = {
  project_name: string;
  workspace_id: string;
  file_path: string;
  file_name: string;
  scope: 'final' | 'llm_pass';
  provider: string;
  pass_index: number | '';
  gate_code: string;
  gate_category: string;
  verification_passed: 'yes' | 'no' | '';
  why_pass: string;
  why_fail: string;
  raw_reason: string;
};

const VERIFICATION_FAIL_EXPLANATIONS: Array<{ match: RegExp; category: string; explanation: string }> = [
  {
    match: /IDENTICAL|identical|too_similar|tooSimilar/i,
    category: 'identical_code',
    explanation: 'Output was identical or too text-similar to the original — no substantive refactor was saved.',
  },
  {
    match: /no_smell_reduction|smellCountIncreased|smell_regression/i,
    category: 'smell_regression',
    explanation: 'Automatic verification rejected the proposal because code smells did not decrease (or increased).',
  },
  {
    match: /methods_lost|noMethodsPreserved|api_broken/i,
    category: 'behavioral_break',
    explanation: 'Methods or public API entries appear removed — behavioral/API preservation gate failed.',
  },
  {
    match: /size_change|excessiveLineChange|too_short/i,
    category: 'excessive_change',
    explanation: 'File size changed beyond allowed ratio — guards against truncated or runaway rewrites.',
  },
  {
    match: /empty_catch/i,
    category: 'safety_violation',
    explanation: 'Empty catch blocks detected — unsafe exception swallowing.',
  },
];

function explainVerificationFailure(raw: string): { category: string; explanation: string } {
  for (const rule of VERIFICATION_FAIL_EXPLANATIONS) {
    if (rule.match.test(raw)) {
      return { category: rule.category, explanation: rule.explanation };
    }
  }
  return {
    category: 'other',
    explanation: `Verification gate failed: ${raw}`,
  };
}

function behavioralDetail(rm: ResearchMetricsPayload | null): {
  changes: string;
  warnings: string;
  errors: string;
} {
  const b = rm?.behavioral as Record<string, unknown> | undefined;
  if (!b) return { changes: '', warnings: '', errors: '' };
  if (typeof b.behavioral_changes_json === 'string') {
    return {
      changes: b.behavioral_changes_json,
      warnings: String(b.warnings ?? ''),
      errors: String(b.errors ?? ''),
    };
  }
  if (Array.isArray(b.behavioral_changes)) {
    return {
      changes: JSON.stringify(b.behavioral_changes),
      warnings: String(b.warnings ?? ''),
      errors: String(b.errors ?? ''),
    };
  }
  return {
    changes: '',
    warnings: String(b.warnings ?? ''),
    errors: String(b.errors ?? ''),
  };
}

function checkRowsFromStoredChecks(
  rm: ResearchMetricsPayload | null,
  base: Omit<
    BehavioralPassTestRow,
    'check_id' | 'check_label' | 'status' | 'passed' | 'why_pass' | 'why_fail' | 'behavioral_changes' | 'warnings' | 'errors'
  >
): BehavioralPassTestRow[] {
  const b = rm?.behavioral as Record<string, unknown> | undefined;
  const detail = behavioralDetail(rm);
  const stored = Array.isArray(b?.checks) ? (b!.checks as Array<Record<string, unknown>>) : null;

  if (stored?.length) {
    return stored.map((c) => ({
      ...base,
      check_id: String(c.check_id ?? ''),
      check_label: String(c.label ?? c.check_id ?? ''),
      status: (c.status as BehavioralPassTestRow['status']) ?? 'unknown',
      passed: c.passed === true ? 'yes' : c.passed === false ? 'no' : '',
      why_pass: String(c.why_pass ?? ''),
      why_fail: String(c.why_fail ?? ''),
      behavioral_changes: detail.changes,
      warnings: detail.warnings,
      errors: detail.errors,
    }));
  }

  return BEHAVIORAL_CHECK_SPECS.map((spec) => {
    const val = b?.[spec.id];
    const passed = val === true ? 'yes' : val === false ? 'no' : '';
    const status: BehavioralPassTestRow['status'] =
      val === true ? 'pass' : val === false ? 'fail' : 'unknown';
    return {
      ...base,
      check_id: spec.id,
      check_label: spec.label,
      status,
      passed,
      why_pass: val === true ? spec.passExplanation : '',
      why_fail: val === false ? spec.failExplanation : '',
      behavioral_changes: detail.changes,
      warnings: detail.warnings,
      errors: detail.errors,
    };
  });
}

function verificationReasonsFromBundle(bundle: SavedRefactoringReportBundle | null): string[] {
  if (!bundle) return [];
  const out: string[] = [];
  const ar = bundle.applyResult as Record<string, unknown> | null;
  const push = (r: unknown) => {
    if (typeof r === 'string' && r && !out.includes(r)) out.push(r);
    if (Array.isArray(r)) {
      for (const x of r) push(x);
    }
  };
  push(ar?.verificationRejectionReasons);
  push(ar?.rejectionReason);
  push(bundle.refactoringRejected?.rejectionReason);
  const pm = bundle.pipelineMetadata as Record<string, unknown> | undefined;
  if (pm?.rejectionCategory && out.length === 0) {
    push(String(pm.rejectionCategory));
  }
  return out;
}

export function buildBehavioralPassTestRowsForMetrics(
  ctx: {
    projectName: string;
    workspaceId: string;
    sourceFolder: string;
    filePath: string;
    fileName: string;
  },
  rm: ResearchMetricsPayload | null,
  opts: {
    scope: 'final' | 'llm_pass';
    provider?: string;
    providerKey?: string;
    passIndex?: number;
    model?: string;
  }
): BehavioralPassTestRow[] {
  const verifyAccepted = rm?.meta?.verifyAccepted;
  const base: Omit<
    BehavioralPassTestRow,
    'check_id' | 'check_label' | 'status' | 'passed' | 'why_pass' | 'why_fail' | 'behavioral_changes' | 'warnings' | 'errors'
  > = {
    project_name: ctx.projectName,
    workspace_id: ctx.workspaceId,
    source_folder: ctx.sourceFolder,
    file_path: ctx.filePath,
    file_name: ctx.fileName,
    scope: opts.scope,
    provider: opts.provider ?? '',
    provider_key: opts.providerKey ?? '',
    pass_index: opts.passIndex ?? '',
    model: opts.model ?? '',
    verify_accepted: verifyAccepted === true ? 'yes' : verifyAccepted === false ? 'no' : '',
    overall_score: typeof rm?.meta?.overallScore === 'number' ? rm.meta.overallScore : '',
  };
  return checkRowsFromStoredChecks(rm, base);
}

export function buildVerificationGateRowsForBundle(
  ctx: {
    projectName: string;
    workspaceId: string;
    filePath: string;
    fileName: string;
  },
  bundle: SavedRefactoringReportBundle | null,
  opts: {
    scope: 'final' | 'llm_pass';
    provider?: string;
    passIndex?: number;
    rm?: ResearchMetricsPayload | null;
  }
): VerificationGateRow[] {
  const reasons = verificationReasonsFromBundle(bundle);
  const verifyAccepted = opts.rm?.meta?.verifyAccepted;
  const pm = bundle?.pipelineMetadata as Record<string, unknown> | undefined;
  const category = String(pm?.rejectionCategory ?? '');

  if (reasons.length === 0) {
    return [
      {
        project_name: ctx.projectName,
        workspace_id: ctx.workspaceId,
        file_path: ctx.filePath,
        file_name: ctx.fileName,
        scope: opts.scope,
        provider: opts.provider ?? '',
        pass_index: opts.passIndex ?? '',
        gate_code: verifyAccepted === false ? 'verify_rejected' : 'verify_passed',
        gate_category: verifyAccepted === false ? category || 'verification_failed' : 'accepted',
        verification_passed: verifyAccepted === true ? 'yes' : verifyAccepted === false ? 'no' : '',
        why_pass:
          verifyAccepted !== false
            ? 'Automatic verification gates passed — refactor was accepted for save (API, smell count, size, similarity).'
            : '',
        why_fail: '',
        raw_reason: '',
      },
    ];
  }

  return reasons.map((raw) => {
    const { category: cat, explanation } = explainVerificationFailure(raw);
    return {
      project_name: ctx.projectName,
      workspace_id: ctx.workspaceId,
      file_path: ctx.filePath,
      file_name: ctx.fileName,
      scope: opts.scope,
      provider: opts.provider ?? '',
      pass_index: opts.passIndex ?? '',
      gate_code: raw.split('(')[0]?.trim() || raw,
      gate_category: category || cat,
      verification_passed: 'no',
      why_pass: '',
      why_fail: explanation,
      raw_reason: raw,
    };
  });
}

export function buildBehavioralPassTestRows(files: LoadedResearchFile[]): BehavioralPassTestRow[] {
  const rows: BehavioralPassTestRow[] = [];
  for (const f of files) {
    const ctx = {
      projectName: f.projectName,
      workspaceId: f.workspaceId,
      sourceFolder: f.sourceFolder,
      filePath: f.filePath,
      fileName: f.fileName,
    };
    const finalRm = researchPayloadFromRecord(f.bundle.researchMetrics as Record<string, unknown> | undefined);
    rows.push(
      ...buildBehavioralPassTestRowsForMetrics(ctx, finalRm, { scope: 'final' })
    );

    for (const run of multiLlmRunsFromBundle(f.bundle)) {
      const rm = researchPayloadFromRecord(run.researchMetrics as Record<string, unknown> | undefined);
      rows.push(
        ...buildBehavioralPassTestRowsForMetrics(ctx, rm, {
          scope: 'llm_pass',
          provider: run.provider,
          providerKey: providerKeyFromRun(run),
          passIndex: run.passIndex,
          model: run.model,
        })
      );
    }
  }
  return rows;
}

export function buildVerificationGateRows(files: LoadedResearchFile[]): VerificationGateRow[] {
  const rows: VerificationGateRow[] = [];
  for (const f of files) {
    const ctx = {
      projectName: f.projectName,
      workspaceId: f.workspaceId,
      filePath: f.filePath,
      fileName: f.fileName,
    };
    const finalRm = researchPayloadFromRecord(f.bundle.researchMetrics as Record<string, unknown> | undefined);
    rows.push(
      ...buildVerificationGateRowsForBundle(ctx, f.bundle, {
        scope: 'final',
        rm: finalRm,
      })
    );

    for (const run of multiLlmRunsFromBundle(f.bundle)) {
      const rm = researchPayloadFromRecord(run.researchMetrics as Record<string, unknown> | undefined);
      rows.push(
        ...buildVerificationGateRowsForBundle(ctx, f.bundle, {
          scope: 'llm_pass',
          provider: run.provider,
          passIndex: run.passIndex,
          rm,
        })
      );
    }
  }
  return rows;
}

export function behavioralPassTestRowsToAoa(rows: BehavioralPassTestRow[]): (string | number | boolean)[][] {
  if (!rows.length) return [['(no data)']];
  const keys = Object.keys(rows[0]) as (keyof BehavioralPassTestRow)[];
  return [keys, ...rows.map((r) => keys.map((k) => r[k] ?? ''))];
}

export function verificationGateRowsToAoa(rows: VerificationGateRow[]): (string | number | boolean)[][] {
  if (!rows.length) return [['(no data)']];
  const keys = Object.keys(rows[0]) as (keyof VerificationGateRow)[];
  return [keys, ...rows.map((r) => keys.map((k) => r[k] ?? ''))];
}

export function buildBehavioralPassTestRowsFromItems(
  projectName: string,
  workspaceId: string,
  sourceFolder: string,
  items: Array<{ filePath: string; fileName: string; bundle: SavedRefactoringReportBundle | null }>
): BehavioralPassTestRow[] {
  const files: LoadedResearchFile[] = items
    .filter((i) => i.bundle)
    .map((i) => ({
      projectName,
      workspaceId,
      sourceFolder,
      filePath: i.filePath,
      fileName: i.fileName,
      bundle: i.bundle!,
      inCurrentSample: false,
    }));
  return buildBehavioralPassTestRows(files);
}

export function buildVerificationGateRowsFromItems(
  projectName: string,
  workspaceId: string,
  items: Array<{ filePath: string; fileName: string; bundle: SavedRefactoringReportBundle | null }>
): VerificationGateRow[] {
  const files: LoadedResearchFile[] = items
    .filter((i) => i.bundle)
    .map((i) => ({
      projectName,
      workspaceId,
      sourceFolder: '',
      filePath: i.filePath,
      fileName: i.fileName,
      bundle: i.bundle!,
      inCurrentSample: false,
    }));
  return buildVerificationGateRows(files);
}

export function behavioralPassTestWideFromRows(rows: BehavioralPassTestRow[]): Record<string, string | number | boolean>[] {
  const byKey = new Map<string, Record<string, string | number | boolean>>();
  for (const r of rows) {
    const key = `${r.workspace_id}|${r.file_path}|${r.scope}|${r.provider_key}|${r.pass_index}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        project_name: r.project_name,
        workspace_id: r.workspace_id,
        file_path: r.file_path,
        file_name: r.file_name,
        scope: r.scope,
        provider: r.provider,
        provider_key: r.provider_key,
        pass_index: r.pass_index,
        model: r.model,
        verify_accepted: r.verify_accepted,
        overall_score: r.overall_score,
        behavioral_pass_count: 0,
        behavioral_fail_count: 0,
        behavioral_unknown_count: 0,
      });
    }
    const wide = byKey.get(key)!;
    wide[`${r.check_id}_status`] = r.status;
    wide[`${r.check_id}_passed`] = r.passed;
    if (r.why_pass) wide[`${r.check_id}_why_pass`] = r.why_pass;
    if (r.why_fail) wide[`${r.check_id}_why_fail`] = r.why_fail;
    if (r.status === 'pass') wide.behavioral_pass_count = Number(wide.behavioral_pass_count) + 1;
    if (r.status === 'fail') wide.behavioral_fail_count = Number(wide.behavioral_fail_count) + 1;
    if (r.status === 'unknown') wide.behavioral_unknown_count = Number(wide.behavioral_unknown_count) + 1;
    if (r.warnings) wide.behavioral_warnings = r.warnings;
    if (r.errors) wide.behavioral_errors = r.errors;
    if (r.behavioral_changes) wide.behavioral_changes = r.behavioral_changes;
  }
  return [...byKey.values()];
}

export function behavioralColumnsForPassRow(rm: ResearchMetricsPayload | null): Record<string, string | number | boolean> {
  const rows = buildBehavioralPassTestRowsForMetrics(
    {
      projectName: '',
      workspaceId: '',
      sourceFolder: '',
      filePath: '',
      fileName: '',
    },
    rm,
    { scope: 'final' }
  );
  const out: Record<string, string | number | boolean> = {
    behavioral_pass_count: rows.filter((r) => r.status === 'pass').length,
    behavioral_fail_count: rows.filter((r) => r.status === 'fail').length,
    behavioral_overall_status: rows.find((r) => r.check_id === 'behavioral_correct')?.status ?? '',
    behavioral_overall_why_fail: rows.find((r) => r.check_id === 'behavioral_correct')?.why_fail ?? '',
  };
  for (const r of rows) {
    out[`behavioral_${r.check_id}`] = r.passed;
    if (r.why_fail) out[`behavioral_${r.check_id}_why_fail`] = r.why_fail;
  }
  return out;
}
