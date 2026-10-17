/**
 * RIPPLE-REF Study API client and helpers.
 */
import { backendDirectUrl } from './backendClient';

export type RippleRefScale = 'pilot' | 'full' | 'extended' | 'custom';

export type RippleRefModelConfig = {
  provider: string;
  family: string;
  displayName: string;
  modelId: string;
  apiRoute: string;
  contextWindow: number;
  promptVersion?: string;
};

export type RippleRefStudyConfig = {
  studyId?: string;
  label?: string;
  scale: RippleRefScale;
  repositoryCount?: number;
  filesPerRepository?: number;
  randomSeed?: number;
  minSmellCount?: number;
  workspaceIds: string[];
  models?: RippleRefModelConfig[];
};

export type RepositoryScanResult = {
  projectId: string;
  repositoryName: string;
  repositoryPath: string;
  commitHash: string;
  javaFileCount: number;
  productionFileCount: number;
  excludedFileCount: number;
  totalLoc: number;
  productionLoc: number;
  analysisTimestamp: string;
};

export type EligibleFile = {
  filePath: string;
  loc: number;
  smellCount: number;
  fanIn: number;
  fanOut: number;
  publicApiCount: number;
  callerUsedApiCount: number;
  valueScore: number;
  dependencyRiskScore: number;
  samplingGroup?: string;
};

export type SelectedFile = EligibleFile & {
  projectId: string;
  selectionReason?: string;
};

export type StudyState = {
  config: RippleRefStudyConfig & { studyId?: string; createdAt?: number };
  studyDir: string;
  status: string;
  repositoryScans: Record<string, RepositoryScanResult>;
  dependencyScans?: Record<string, unknown>;
  eligibleByRepo?: Record<string, EligibleFile[]>;
  eligibleCountsByRepo?: Record<string, number>;
  selectedByRepo: Record<string, SelectedFile[]>;
  completedCandidates: string[];
  failedCandidates: string[];
};

export type RippleRefFileGraph = {
  projectId: string;
  filePath: string;
  packageName?: string;
  fanIn: number;
  fanOut: number;
  upstreamFiles: string[];
  downstreamCallers: string[];
  typeDependencies?: string[];
  publicApis?: string[];
  protectedApis?: string[];
  callerUsedApis?: string[];
  edges?: string[];
};

export type CompletenessReport = {
  plannedRuns: number;
  completedRuns: number;
  failedGenerations: number;
  failedParsing: number;
  missingArtifacts: number;
  completionPercentage: number;
  warnings: string[];
};

export type CandidateResultRow = {
  studyId?: string;
  projectId: string;
  filePath: string;
  modelId: string;
  variant: string;
  pairKey: string;
  status: string;
  riskLevel?: string;
  contractRiskLevel?: string;
  observedRiskLevel?: string;
  verificationLevel?: string;
  callersChecked?: number;
  observedBrokenCallerCount?: number;
  compileProbeStatus?: string;
  behavioralCorrect?: boolean;
  adoptionClass?: string;
  testProbeStatus?: string;
  testProbeBeforeStatus?: string;
  testsPassed?: number;
  testsFailed?: number;
  testsPassedBefore?: number;
  testsFailedBefore?: number;
  testRegression?: boolean;
  riskReasonsJson?: string;
  smellCountBefore?: number;
  smellCountAfter?: number;
  fanInBefore?: number;
  fanOutBefore?: number;
  fanOutAfter?: number;
  fanOutDelta?: number;
  callerUsedApiCountBefore?: number;
  publicApiCountBefore?: number;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  error?: string;
  completedAt?: string;
  orchestration?: string;
  graphVersion?: string;
  multiLlmAgentMode?: string;
  agentStepCount?: number;
  llmPlanStatus?: string;
  llmVerifyApproved?: boolean;
  staticVerifyAccept?: boolean;
  cohortId?: string;
};

export type CandidateResultsSummary = {
  totalRows: number;
  byStatus: Record<string, number>;
  byRisk: Record<string, number>;
  byAdoption: Record<string, number>;
  byVariant: Record<string, number>;
  behavioralPass: number;
  behavioralFail: number;
  observedCallerBreakage: number;
  pairedUnits: number;
  v2SaferThanV1: number;
  /** L4 heuristic pass (same as behavioralPass). */
  l4Pass?: number;
  l4Fail?: number;
  /** L5 targeted test probe counts (completed candidates only). */
  l5Success?: number;
  l5Fail?: number;
  l5Skipped?: number;
  l5Pending?: number;
  l5Preserved?: number;
  l5Regression?: number;
  l5Inconclusive?: number;
  completedCandidates?: number;
};

export type VerificationSummary = {
  studyId?: string;
  completedCandidates: number;
  l4Pass: number;
  l4Fail: number;
  l5Success: number;
  l5Fail: number;
  l5Skipped: number;
  l5Pending: number;
  l5Preserved?: number;
  l5Regression?: number;
  l5Inconclusive?: number;
};

export type CandidateResultsResponse = {
  studyId: string;
  rows: CandidateResultRow[];
  summary: CandidateResultsSummary;
};

export type RippleRefCandidateQueueItem = {
  workspaceId: string;
  filePath: string;
  modelId: string;
  variant: 'V1' | 'V2';
  pairKey: string;
};

export type RippleRefCandidateRunResult = {
  status: string;
  pairKey?: string;
  variant?: string;
  modelId?: string;
  latencyMs?: number;
  error?: string;
  rippleReport?: {
    riskLevel?: string;
    adoptionClass?: string;
    behavioral?: { behavioralCorrect?: boolean };
    tests?: { status?: string };
  };
};

export const RIPPLE_REF_SCALES: Record<
  RippleRefScale,
  { repos: number; filesPerRepo: number; label: string; plannedCandidates: number }
> = {
  pilot: { repos: 3, filesPerRepo: 5, label: 'Pilot (150 candidates)', plannedCandidates: 150 },
  full: { repos: 15, filesPerRepo: 10, label: 'Full (1,500 candidates)', plannedCandidates: 1500 },
  extended: { repos: 15, filesPerRepo: 15, label: 'Extended (2,250 candidates)', plannedCandidates: 2250 },
  custom: { repos: 0, filesPerRepo: 0, label: 'Custom', plannedCandidates: 0 },
};

export const DEFAULT_RIPPLE_REF_MODELS: RippleRefModelConfig[] = [
  {
    provider: 'google',
    family: 'gemini',
    displayName: 'Gemini 3.1 Pro',
    modelId: 'google/gemini-3.1-pro-preview',
    apiRoute: 'openrouter',
    contextWindow: 2_000_000,
  },
  {
    provider: 'openai',
    family: 'gpt',
    displayName: 'GPT-5.5',
    modelId: 'openai/gpt-5.5',
    apiRoute: 'openrouter',
    contextWindow: 1_000_000,
  },
  {
    provider: 'anthropic',
    family: 'claude',
    displayName: 'Claude Opus 4.8',
    modelId: 'anthropic/claude-opus-4.8',
    apiRoute: 'openrouter',
    contextWindow: 1_000_000,
  },
  {
    provider: 'deepseek',
    family: 'deepseek',
    displayName: 'DeepSeek V4 Pro',
    modelId: 'deepseek/deepseek-v4-pro',
    apiRoute: 'openrouter',
    contextWindow: 1_000_000,
  },
  {
    provider: 'qwen',
    family: 'qwen',
    displayName: 'Qwen 3.6 Plus',
    modelId: 'qwen/qwen3.6-plus',
    apiRoute: 'openrouter',
    contextWindow: 1_000_000,
  },
];

export async function rippleFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(backendDirectUrl(path), {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      msg.includes('fetch')
        ? 'Backend unreachable — ensure Java server is running on port 8084 and hard-refresh the page.'
        : msg
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `RIPPLE-REF API ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

export function agentsBase(): string {
  const port = process.env.NEXT_PUBLIC_AGENTS_PORT || '8092';
  return `http://127.0.0.1:${port}`;
}

export async function createRippleRefStudy(config: RippleRefStudyConfig): Promise<StudyState> {
  const scale = RIPPLE_REF_SCALES[config.scale] ?? RIPPLE_REF_SCALES.pilot;
  const body: RippleRefStudyConfig = {
    ...config,
    scale: config.scale,
    filesPerRepository: config.filesPerRepository ?? scale.filesPerRepo,
    randomSeed: config.randomSeed ?? 42,
    minSmellCount: config.minSmellCount ?? 1,
    models: config.models?.length ? config.models : DEFAULT_RIPPLE_REF_MODELS,
  };
  return rippleFetch<StudyState>('/ripple-ref/studies', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getRippleRefStudy(studyId: string): Promise<StudyState> {
  return rippleFetch<StudyState>(`/ripple-ref/studies/${encodeURIComponent(studyId)}`);
}

export async function listRippleRefStudies(): Promise<string[]> {
  return rippleFetch<string[]>('/ripple-ref/studies');
}

export async function scanRippleRefRepository(studyId: string, workspaceId: string): Promise<StudyState> {
  return rippleFetch<StudyState>(
    `/ripple-ref/studies/${encodeURIComponent(studyId)}/scan/${encodeURIComponent(workspaceId)}`,
    { method: 'POST' }
  );
}

export async function selectRippleRefFiles(studyId: string): Promise<StudyState> {
  return rippleFetch<StudyState>(`/ripple-ref/studies/${encodeURIComponent(studyId)}/select-files`, {
    method: 'POST',
  });
}

export async function buildRippleRefContexts(studyId: string): Promise<StudyState> {
  return rippleFetch<StudyState>(`/ripple-ref/studies/${encodeURIComponent(studyId)}/build-contexts`, {
    method: 'POST',
  });
}

export async function fetchRippleRefFileGraph(
  studyId: string,
  workspaceId: string,
  filePath: string
): Promise<RippleRefFileGraph> {
  const params = new URLSearchParams({ workspaceId, filePath });
  return rippleFetch<RippleRefFileGraph>(
    `/ripple-ref/studies/${encodeURIComponent(studyId)}/file-dependency-graph?${params}`
  );
}

export async function rippleRefPreflight(studyId: string): Promise<{
  ready: boolean;
  plannedRuns: number;
  issues: string[];
  warnings: string[];
}> {
  return rippleFetch(`/ripple-ref/studies/${encodeURIComponent(studyId)}/preflight`);
}

export async function rippleRefCompleteness(studyId: string): Promise<CompletenessReport> {
  return rippleFetch(`/ripple-ref/studies/${encodeURIComponent(studyId)}/completeness`);
}

export async function fetchVerificationSummary(studyId: string): Promise<VerificationSummary> {
  return rippleFetch(`/ripple-ref/studies/${encodeURIComponent(studyId)}/verification-summary`);
}

export type RippleRefL5PipelineStatus = {
  studyId?: string;
  state?: 'idle' | 'running' | 'healing' | 'stopped' | 'complete';
  phase?: 'idle' | 'backfill_ma' | 'backfill_b0' | 'complete';
  backfillStudyId?: string;
  backfillProcessed?: number;
  backfillTotal?: number;
  backfillDetail?: string;
  l5PipelinePid?: string;
  l5PipelineAlive?: boolean;
  staleRunning?: boolean;
  updatedAt?: string;
  verificationMa?: VerificationSummary;
  verificationB0?: VerificationSummary;
};

export async function fetchRippleRefL5PipelineStatus(
  studyId = RIPPLE_REF_MASTER_STUDY_ID
): Promise<RippleRefL5PipelineStatus> {
  return rippleFetch(`/ripple-ref/studies/${encodeURIComponent(studyId)}/pipeline-status`);
}

export async function startRippleRefL5Pipeline(
  studyId = RIPPLE_REF_MASTER_STUDY_ID
): Promise<RippleRefL5PipelineStatus> {
  return rippleFetch(`/ripple-ref/studies/${encodeURIComponent(studyId)}/pipeline/l5/start`, {
    method: 'POST',
  });
}

export async function stopRippleRefL5Pipeline(
  studyId = RIPPLE_REF_MASTER_STUDY_ID
): Promise<RippleRefL5PipelineStatus> {
  return rippleFetch(`/ripple-ref/studies/${encodeURIComponent(studyId)}/pipeline/l5/stop`, {
    method: 'POST',
  });
}

export async function fetchRippleRefVerificationSummaries() {
  const [b0, ma] = await Promise.all([
    fetchVerificationSummary(RIPPLE_REF_MASTER_STUDY_ID),
    fetchVerificationSummary('ma_ref_master'),
  ]);
  return { b0, ma };
}

export async function rippleRefExportInfo(studyId: string): Promise<{
  studyId: string;
  studyDir: string;
  completeness: CompletenessReport;
}> {
  return rippleFetch(`/ripple-ref/studies/${encodeURIComponent(studyId)}/export-info`);
}

export type RippleRefLiveStatus = {
  studyId: string;
  studyStatus: string;
  liveCandidate: LiveCandidateInfo | null;
  lastCompleted: LiveCandidateInfo | null;
  fileProgress: FileRunProgress[];
  completeness: CompletenessReport;
};

export type LiveCandidateInfo = {
  workspaceId: string;
  repositoryName?: string;
  filePath: string;
  fileName?: string;
  modelId: string;
  modelDisplayName?: string;
  variant: string;
  phase?: string;
  pairKey?: string;
  startedAt?: number;
  updatedAt?: number;
};

export type FileRunProgress = {
  filePath: string;
  fileName?: string;
  samplingGroup?: string;
  planned: number;
  completed: number;
  failed: number;
};

export async function fetchRippleRefLiveStatus(studyId: string): Promise<RippleRefLiveStatus> {
  return rippleFetch<RippleRefLiveStatus>(
    `/ripple-ref/studies/${encodeURIComponent(studyId)}/live-status`
  );
}

/** SSE live stream — pushes live-status every ~2s until closed. */
export function subscribeRippleRefLiveStream(
  studyId: string,
  onUpdate: (status: RippleRefLiveStatus) => void,
  onConnectionChange?: (connected: boolean) => void
): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }
  const url = backendDirectUrl(
    `/ripple-ref/studies/${encodeURIComponent(studyId)}/live-stream`
  );
  const es = new EventSource(url);
  es.onopen = () => onConnectionChange?.(true);
  es.addEventListener('status', (event) => {
    try {
      const data = JSON.parse((event as MessageEvent).data) as RippleRefLiveStatus;
      onUpdate(data);
    } catch {
      /* ignore malformed frame */
    }
  });
  es.onerror = () => onConnectionChange?.(false);
  return () => {
    es.close();
    onConnectionChange?.(false);
  };
}

export function formatLivePhase(phase?: string): string {
  const map: Record<string, string> = {
    queued: 'Queued — waiting for agent',
    preparing_prompt: 'Building prompt',
    llm_generation: 'LLM refactoring',
    ripple_verification: 'Ripple + behavioral verification',
    running: 'Running',
  };
  if (!phase) return 'Running';
  return map[phase] ?? phase.replace(/_/g, ' ');
}

export async function fetchRippleRefResults(studyId: string): Promise<CandidateResultsResponse> {
  return rippleFetch<CandidateResultsResponse>(
    `/ripple-ref/studies/${encodeURIComponent(studyId)}/results`
  );
}

export const RIPPLE_REF_MASTER_STUDY_ID = 'ripple_ref_master';

export type RepoProgressRow = {
  workspaceId: string;
  label: string;
  selectedFiles: number;
  planned: number;
  completed: number;
  failed: number;
};

export function computeMasterRepoProgress(
  study: StudyState,
  projectNames?: Record<string, string>
): RepoProgressRow[] {
  const modelCount = study.config?.models?.length ?? DEFAULT_RIPPLE_REF_MODELS.length;
  const completed = study.completedCandidates ?? [];
  const failed = study.failedCandidates ?? [];

  return Object.entries(study.selectedByRepo ?? {})
    .map(([workspaceId, files]) => {
      const prefix = `${workspaceId}|`;
      const done = completed.filter((k) => k.startsWith(prefix)).length;
      const fail = failed.filter((k) => k.startsWith(prefix)).length;
      const fileCount = files?.length ?? 0;
      return {
        workspaceId,
        label: projectNames?.[workspaceId] ?? workspaceId,
        selectedFiles: fileCount,
        planned: fileCount * modelCount * 2,
        completed: done,
        failed: fail,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Latest row per pairKey wins (reruns / slug fixes should not double-count). */
export function dedupeCandidateRowsByPairKey(rows: CandidateResultRow[]): CandidateResultRow[] {
  const byPair = new Map<string, CandidateResultRow>();
  for (const row of rows) {
    const key =
      row.pairKey ||
      `${row.projectId}|${row.filePath}|${row.modelId}|${row.variant}`;
    byPair.set(key, row);
  }
  return [...byPair.values()];
}

export function computeMasterRepoProgressFromResults(
  study: StudyState,
  rows: CandidateResultRow[],
  projectNames?: Record<string, string>
): RepoProgressRow[] {
  const modelCount = study.config?.models?.length ?? DEFAULT_RIPPLE_REF_MODELS.length;
  const deduped = dedupeCandidateRowsByPairKey(rows);
  return Object.entries(study.selectedByRepo ?? {})
    .map(([workspaceId, files]) => {
      const repoRows = deduped.filter((r) => r.projectId === workspaceId);
      const done = repoRows.filter((r) => r.status === 'completed').length;
      const fail = repoRows.filter((r) => r.status?.startsWith('failed')).length;
      const fileCount = files?.length ?? 0;
      return {
        workspaceId,
        label: projectNames?.[workspaceId] ?? workspaceId,
        selectedFiles: fileCount,
        planned: fileCount * modelCount * 2,
        completed: done,
        failed: fail,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

const QWEN_V2_MODEL = 'qwen/qwen3.6-plus';
const QWEN_COHORT_PLANNED = 150;

export type QwenCohortProgress = {
  planned: number;
  completed: number;
  failed: number;
  attempted: number;
  remaining: number;
};

/** Locked 150-file Qwen B0-V2 recovery cohort (10 files × 15 systems). */
export function computeQwenV2CohortProgress(rows: CandidateResultRow[]): QwenCohortProgress {
  const qwen = dedupeCandidateRowsByPairKey(rows).filter(
    (r) => r.modelId === QWEN_V2_MODEL && r.variant === 'V2'
  );
  const completed = qwen.filter((r) => r.status === 'completed').length;
  const failed = qwen.filter((r) => r.status?.startsWith('failed')).length;
  const attempted = qwen.length;
  return {
    planned: QWEN_COHORT_PLANNED,
    completed,
    failed,
    attempted,
    remaining: Math.max(0, QWEN_COHORT_PLANNED - completed),
  };
}

export function isStudyLiveExecution(
  liveCandidate: LiveCandidateInfo | null | undefined,
  guiRunning: boolean
): boolean {
  return guiRunning || !!liveCandidate;
}

export function isStudyIncomplete(
  completeness: CompletenessReport | null | undefined
): boolean {
  if (!completeness || completeness.plannedRuns <= 0) return false;
  return (
    completeness.completedRuns + completeness.failedGenerations < completeness.plannedRuns ||
    completeness.missingArtifacts > 0
  );
}

/** @deprecated use isStudyLiveExecution + isStudyIncomplete */
export function isStudyActivelyRunning(
  study: StudyState | null | undefined,
  completeness: CompletenessReport | null | undefined,
  guiRunning: boolean,
  liveCandidate?: LiveCandidateInfo | null
): boolean {
  if (isStudyLiveExecution(liveCandidate, guiRunning)) return true;
  if (!study) return false;
  if (study.status === 'scanning') return true;
  return false;
}

export function buildRippleRefCandidateQueue(study: StudyState): RippleRefCandidateQueueItem[] {
  const models = study.config?.models?.length ? study.config.models : DEFAULT_RIPPLE_REF_MODELS;
  const queue: RippleRefCandidateQueueItem[] = [];
  for (const [workspaceId, files] of Object.entries(study.selectedByRepo ?? {})) {
    for (const file of files ?? []) {
      for (const model of models) {
        for (const variant of ['V1', 'V2'] as const) {
          queue.push({
            workspaceId,
            filePath: file.filePath,
            modelId: model.modelId,
            variant,
            pairKey: `${workspaceId}|${file.filePath}|${model.modelId}|${variant}`,
          });
        }
      }
    }
  }
  return queue;
}

export async function runRippleRefCandidate(args: {
  studyId: string;
  workspaceId: string;
  filePath: string;
  modelId: string;
  variant: 'V1' | 'V2';
}): Promise<RippleRefCandidateRunResult> {
  const res = await fetch(`${agentsBase()}/agents/ripple-ref/run-candidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studyId: args.studyId,
      workspaceId: args.workspaceId,
      filePath: args.filePath,
      variant: args.variant,
      model: { modelId: args.modelId, apiRoute: 'openrouter', contextWindow: 1_000_000 },
      resume: false,
    }),
  });
  if (!res.ok) {
    throw new Error(await res.text().catch(() => `Candidate run failed (${res.status})`));
  }
  return res.json() as Promise<RippleRefCandidateRunResult>;
}

export async function refreshRippleRefStudyStatus(studyId: string): Promise<{
  study: StudyState;
  completeness: CompletenessReport;
  results: CandidateResultsResponse;
  liveStatus: RippleRefLiveStatus;
}> {
  const [study, liveStatus, results] = await Promise.all([
    getRippleRefStudy(studyId),
    fetchRippleRefLiveStatus(studyId),
    fetchRippleRefResults(studyId),
  ]);
  return { study, completeness: liveStatus.completeness, results, liveStatus };
}

export async function runRippleRefBatch(
  studyId: string,
  opts?: { resume?: boolean; maxCandidates?: number }
): Promise<unknown> {
  const res = await fetch(`${agentsBase()}/agents/ripple-ref/run-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studyId,
      resume: opts?.resume ?? true,
      maxCandidates: opts?.maxCandidates,
    }),
  });
  if (!res.ok) {
    throw new Error(await res.text().catch(() => `Batch run failed (${res.status})`));
  }
  return res.json();
}

export function plannedCandidateCount(
  repoCount: number,
  filesPerRepo: number,
  modelCount = 5,
  variants = 2
): number {
  return repoCount * filesPerRepo * modelCount * variants;
}
