/** Client helpers for /agents/baseline (research direct-prompt baseline). */

import { agentsBaseUrl, agentsProgressUrl, subscribeAgentsProgress } from './refactorClient';

export type BaselineBatchSummary = {
  filesTotal: number;
  passesTotal: number;
  passesAttempted: number;
  passesSucceeded: number;
  passesFailed: number;
  passesSkippedResume?: number;
  providers?: string[];
  models?: Record<string, string>;
  warnings?: string[];
};

export type BaselineBatchRunOptions = {
  limit?: number;
  resume?: boolean;
  confirmExecute?: boolean;
  confirmSubset?: boolean;
  confirmFull?: boolean;
  systemFilter?: string;
  sampleIdFilter?: string;
};

function batchPayload(opts: BaselineBatchRunOptions = {}) {
  return {
    providers: ['openai', 'google', 'anthropic'],
    resume: opts.resume !== false,
    confirmExecute: opts.confirmExecute ?? opts.confirmSubset ?? false,
    confirmSubset: opts.confirmSubset ?? opts.confirmExecute ?? false,
    confirmFull: false,
    limit: opts.limit,
    systemFilter: opts.systemFilter ?? '',
    sampleIdFilter: opts.sampleIdFilter ?? '',
  };
}

export async function runBaselineBatchDry(opts?: BaselineBatchRunOptions) {
  return postJson<{ success: boolean; summary: BaselineBatchSummary; dryRun: boolean }>(
    '/agents/baseline/batch-dry-run',
    batchPayload(opts)
  );
}

export async function runBaselineBatchSmoke(opts?: BaselineBatchRunOptions) {
  return postJson<{
    success: boolean;
    jobId: string;
    limitFiles: number;
    expectedPasses: number;
    providers: string[];
    models: Record<string, string>;
  }>('/agents/baseline/batch-smoke-test', { ...batchPayload(opts), limit: opts?.limit ?? 3 });
}

export async function runBaselineBatchExecute(opts: BaselineBatchRunOptions) {
  return postJson<{
    success: boolean;
    jobId: string;
    files: number;
    expectedPasses: number;
    providers: string[];
    models: Record<string, string>;
  }>('/agents/baseline/batch-run', batchPayload(opts));
}

export type BatchLiveProgress = {
  passTotal: number;
  filesTotal: number;
  passesOk: number;
  passesFailed: number;
  passesDone: number;
  passesSkipped?: number;
  filesComplete: number;
  filesInProgress: number;
  providerOkOpenai: number;
  providerOkGoogle: number;
  providerOkAnthropic: number;
  providerFailOpenai: number;
  providerFailGoogle: number;
  providerFailAnthropic: number;
};

export async function fetchBaselineBatchLatest() {
  const res = await fetch(baselineApiUrl('/agents/baseline/batch-run/latest'));
  if (!res.ok) throw new Error(`Batch status failed (${res.status})`);
  return res.json() as Promise<{ success: boolean; latest: Record<string, unknown> | null }>;
}

export type BaselineProvider = 'openai' | 'google' | 'anthropic';

export type BaselineRunMode = 'dry_run' | 'smoke_test' | 'subset' | 'full';

export type BaselineConfig = {
  providerId: BaselineProvider;
  model: string;
  systemFilter: string;
  sampleIdFilter: string;
  subsetLimit: number;
};

export type RecoverySummary = {
  totalRecovered: number;
  uniqueJavaFiles: number;
  systemCount: number;
  perSystem: Record<string, number>;
  exactly450: boolean;
  refinePassesMatched: number;
  refinePassesExpected: number;
  refinePassesMatchedExactly: boolean;
  warnings: string[];
};

export type BaselineRunSummary = {
  filesAttempted: number;
  successfulOutputs: number;
  failedOutputs: number;
  totalFindingReduction: number;
  majorFindingReduction: number;
  publicMethodRemovalCases: number;
  criticalAssertFailFailures: number;
  averageChurn: number;
  warnings?: string[];
};

export type CompareSummary = {
  matchedPairs: number;
  unmatchedBaseline: number;
  unmatchedRefine: number;
  beforeValidationPass?: number;
  beforeValidationFail?: number;
  baselineImprovementTotalPmd?: number;
  refineImprovementTotalPmd?: number;
  warnings?: string[];
};

export type Select150Summary = {
  selectedCount: number;
  systemCount: number;
  perSystem: Record<string, number>;
  refinePassesMatched: number;
  refinePassesExpected: number;
  refineAllMatched: boolean;
  warnings: string[];
};

export type RefineCoverageSummary = {
  filesChecked: number;
  passesExpected: number;
  passesMatched: number;
  allMatched: boolean;
  warnings: string[];
};

const BASELINE_DOWNLOADS = [
  'baseline_selected_450_files.csv',
  'selected_150_baseline_files.csv',
  'selected_150_baseline_files.json',
  'refine_coverage_150.json',
  'direct_prompt_baseline_results.csv',
  'baseline_direct_prompt_results.csv',
  'baseline_direct_prompt_summary.md',
  'baseline_vs_refine_comparison.csv',
  'baseline_vs_refine_summary.csv',
  'baseline_vs_refine_summary.md',
  'baseline_vs_refine_stats.md',
  'baseline_prompt_and_config.md',
  'baseline_batch_run_latest.json',
  'baseline_batch_results.jsonl',
] as const;

export type BaselineDownloadName = (typeof BASELINE_DOWNLOADS)[number];

export function baselineApiUrl(path: string): string {
  const base = agentsBaseUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

export function baselineDownloadUrl(filename: BaselineDownloadName | string): string {
  return baselineApiUrl(`/agents/baseline/download/${encodeURIComponent(filename)}`);
}

const BATCH_PASS_TOTAL = 450;
const BATCH_FILES_TOTAL = 150;

function isExecuteJsonlRow(row: Record<string, unknown>): boolean {
  if (String(row.mode || '').toLowerCase() !== 'execute') return false;
  const dry = row.dry_run;
  return !(dry === true || dry === 'true' || dry === 'True' || dry === '1');
}

/** Client-side mirror of agents/baseline_comparison/batch_progress.py for JSONL fallback. */
export function aggregateBatchLiveProgressFromJsonl(
  text: string,
  passTotal = BATCH_PASS_TOTAL,
  filesTotal = BATCH_FILES_TOTAL
): BatchLiveProgress {
  const okByProvider: Record<string, number> = {};
  const failByProvider: Record<string, number> = {};
  const fileProviders = new Map<string, Set<string>>();

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!isExecuteJsonlRow(row)) continue;

    const pk = String(row.provider || row.provider_id || '').toLowerCase();
    const fileKey = [
      String(row.sample_id || ''),
      String(row.system || row.project_name || ''),
      String(row.relative_file_path || row.file_path || ''),
    ].join('|');
    const ok = String(row.ok).toLowerCase() === 'true' || row.ok === 1;

    if (ok) {
      okByProvider[pk] = (okByProvider[pk] || 0) + 1;
      const providers = fileProviders.get(fileKey) ?? new Set<string>();
      providers.add(pk);
      fileProviders.set(fileKey, providers);
    } else {
      failByProvider[pk] = (failByProvider[pk] || 0) + 1;
    }
  }

  const passesOk = Object.values(okByProvider).reduce((a, b) => a + b, 0);
  const passesFailed = Object.values(failByProvider).reduce((a, b) => a + b, 0);
  let filesComplete = 0;
  for (const providers of fileProviders.values()) {
    if (providers.size >= 3) filesComplete += 1;
  }
  const filesStarted = fileProviders.size;

  return {
    passTotal,
    filesTotal,
    passesOk,
    passesFailed,
    passesDone: passesOk + passesFailed,
    passesSkipped: 0,
    filesComplete,
    filesInProgress: Math.max(0, filesStarted - filesComplete),
    providerOkOpenai: okByProvider.openai || 0,
    providerOkGoogle: okByProvider.google || 0,
    providerOkAnthropic: okByProvider.anthropic || 0,
    providerFailOpenai: failByProvider.openai || 0,
    providerFailGoogle: failByProvider.google || 0,
    providerFailAnthropic: failByProvider.anthropic || 0,
  };
}

export async function fetchBatchLiveProgress(): Promise<{
  success: boolean;
  progress: BatchLiveProgress;
}> {
  try {
    const res = await fetch(baselineApiUrl('/agents/baseline/batch-live-progress'));
    if (res.ok) return res.json();
  } catch {
    /* fall through to JSONL download */
  }

  const jsonlRes = await fetch(baselineDownloadUrl('baseline_batch_results.jsonl'));
  if (!jsonlRes.ok) {
    throw new Error(`Live progress failed (${jsonlRes.status})`);
  }
  const text = await jsonlRes.text();
  return { success: true, progress: aggregateBatchLiveProgressFromJsonl(text) };
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(baselineApiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { detail?: string };
  if (!res.ok) {
    throw new Error((data as { detail?: string }).detail || `Request failed (${res.status})`);
  }
  return data;
}

export async function fetchBaselineStatus(): Promise<{ ready: boolean; latestJobStatus?: string }> {
  const res = await fetch(baselineApiUrl('/agents/baseline/status'));
  if (!res.ok) throw new Error(`Status check failed (${res.status})`);
  return res.json();
}

export async function recoverSelectedFiles(): Promise<RecoverySummary & { success: boolean }> {
  return postJson('/agents/baseline/recover-selected-files', {});
}

export async function select150Stratified(seed = 42): Promise<Select150Summary & { success: boolean }> {
  const res = await fetch(baselineApiUrl(`/agents/baseline/select-150-stratified?seed=${seed}`), {
    method: 'POST',
  });
  const data = (await res.json().catch(() => ({}))) as Select150Summary & { detail?: string; success?: boolean };
  if (!res.ok) throw new Error(data.detail || `Select 150 failed (${res.status})`);
  return { success: true, ...data };
}

export async function verifyRefineCoverage(): Promise<RefineCoverageSummary & { success: boolean }> {
  return postJson('/agents/baseline/verify-refine-coverage', {});
}

export function buildRunPayload(
  cfg: BaselineConfig,
  opts: {
    confirmSubset?: boolean;
    confirmFull?: boolean;
    limit?: number;
  } = {}
): Record<string, unknown> {
  return {
    providerId: cfg.providerId,
    model: cfg.model,
    systemFilter: cfg.systemFilter,
    sampleIdFilter: cfg.sampleIdFilter,
    limit: opts.limit,
    confirmSubset: opts.confirmSubset ?? false,
    confirmFull: opts.confirmFull ?? false,
  };
}

export async function runDryBaseline(cfg: BaselineConfig, limit?: number) {
  return postJson<{ success: boolean; summary: BaselineRunSummary; dryRun: boolean }>(
    '/agents/baseline/dry-run',
    buildRunPayload(cfg, { limit })
  );
}

export async function runSmokeBaseline(cfg: BaselineConfig) {
  return postJson<{ success: boolean; jobId: string; limit: number }>(
    '/agents/baseline/smoke-test',
    buildRunPayload(cfg, { limit: 3 })
  );
}

export async function runSubsetBaseline(cfg: BaselineConfig) {
  return postJson<{ success: boolean; jobId: string; limit: number }>(
    '/agents/baseline/run-subset',
    buildRunPayload(cfg, { confirmSubset: true, limit: cfg.subsetLimit })
  );
}

export async function runFullBaseline(cfg: BaselineConfig) {
  return postJson<{ success: boolean; jobId: string; expectedFiles: number }>(
    '/agents/baseline/run-full',
    buildRunPayload(cfg, { confirmFull: true })
  );
}

export async function compareBaselineRefine(cfg: BaselineConfig): Promise<
  CompareSummary & { success: boolean }
> {
  const data = await postJson<Record<string, unknown>>(
    '/agents/baseline/compare-refine',
    buildRunPayload(cfg)
  );
  return {
    success: Boolean(data.success),
    matchedPairs: Number(data.matchedPairs ?? 0),
    unmatchedBaseline: Number(data.unmatchedBaseline ?? 0),
    unmatchedRefine: Number(data.unmatchedRefine ?? 0),
    beforeValidationPass: Number(data.beforeValidationPass ?? 0),
    beforeValidationFail: Number(data.beforeValidationFail ?? 0),
    baselineImprovementTotalPmd: Number(data.baselineImprovementTotalPmd ?? 0),
    refineImprovementTotalPmd: Number(data.refineImprovementTotalPmd ?? 0),
    warnings: (data.warnings as string[]) || [],
  };
}

export async function fetchBaselineJob(jobId: string) {
  const res = await fetch(baselineApiUrl(`/agents/baseline/job/${encodeURIComponent(jobId)}`));
  if (!res.ok) throw new Error(`Job fetch failed (${res.status})`);
  return res.json() as Promise<{
    jobId: string;
    kind: string;
    status: string;
    progress: Record<string, unknown>;
    result?: { summary?: BaselineRunSummary };
    error?: string;
    logLines?: string[];
  }>;
}

export function watchBaselineJob(
  jobId: string,
  onUpdate: (evt: Record<string, unknown>) => void
): () => void {
  return subscribeAgentsProgress(jobId, (evt) => {
    onUpdate(evt as Record<string, unknown>);
  });
}

export { agentsProgressUrl, BASELINE_DOWNLOADS };
