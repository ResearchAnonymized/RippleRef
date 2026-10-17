/**
 * MA-REF (P-MA) multi-agent study client — reuses ripple-ref backend APIs with studyId ma_ref_master.
 */
import {
  type CandidateResultsResponse,
  type CompletenessReport,
  type LiveCandidateInfo,
  type RippleRefFileGraph,
  type RippleRefLiveStatus,
  type StudyState,
  DEFAULT_RIPPLE_REF_MODELS,
  buildRippleRefContexts,
  fetchRippleRefFileGraph,
  fetchRippleRefLiveStatus,
  fetchRippleRefResults,
  getRippleRefStudy,
  isStudyIncomplete,
  isStudyLiveExecution,
  rippleFetch,
  rippleRefCompleteness,
  rippleRefExportInfo,
  rippleRefPreflight,
  subscribeRippleRefLiveStream,
  fetchVerificationSummary,
  type VerificationSummary,
} from './rippleRefStudy';

export const MA_REF_MASTER_STUDY_ID = 'ma_ref_master';
export const MA_VARIANT = 'MA';
export const COHORT_SOURCE_STUDY_ID = 'ripple_ref_master';
export const MA_PLANNED_CANDIDATES = 750;

/** LangGraph v2.0 pipeline nodes (observability). */
export const MA_GRAPH_NODES = [
  { id: 'load', label: 'File Loader', kind: 'static' as const },
  { id: 'analyze', label: 'Code Smell Detector', kind: 'static' as const },
  { id: 'dependency_context', label: 'Dependency Context Agent', kind: 'static' as const },
  { id: 'plan', label: 'Rule Planner', kind: 'static' as const },
  { id: 'llm_plan', label: 'LLM Planning Agent', kind: 'llm' as const },
  { id: 'feasibility', label: 'Size Advisor', kind: 'static' as const },
  { id: 'refactor', label: 'LLM Refactoring Agent', kind: 'llm' as const },
  { id: 'verify', label: 'Quality Verifier', kind: 'static' as const },
  { id: 'ripple_verify', label: 'Ripple Risk Verifier', kind: 'static' as const },
  { id: 'llm_verify', label: 'LLM Verification Agent', kind: 'llm' as const },
  { id: 'report', label: 'Analysis Reporter', kind: 'static' as const },
];

export type IntegrityPreflight = {
  studyId: string;
  orchestration: string;
  multiAgent: boolean;
  cohortFileCount: number;
  cohortLocked: boolean;
  expectedVariant?: string;
  expectedPlannedRuns?: number;
  cohortSourceStudyId?: string;
  cohortId?: string;
  integrityOk: boolean;
  integrityIssues: string[];
};

export type MaRefCandidateQueueItem = {
  workspaceId: string;
  filePath: string;
  modelId: string;
  pairKey: string;
};

export type AgentStepLog = {
  name: string;
  agent: string;
  status: string;
  startedAt?: number;
  endedAt?: number;
  details?: Record<string, unknown>;
  error?: string;
  nodeId?: string;
  framework?: string;
};

export type AgentTracePayload = {
  steps?: AgentStepLog[];
  graphVersion?: string;
  nodeTrace?: string[];
  orchestration?: string;
  multiLlmAgentMode?: string;
};

export type AgentsHealth = {
  multiLlmAgentMode?: string;
  orchestrator?: string;
  status?: string;
};

function agentsBase(): string {
  const port = process.env.NEXT_PUBLIC_AGENTS_PORT ?? '8092';
  return `http://127.0.0.1:${port}`;
}

export async function getMaRefStudy(studyId = MA_REF_MASTER_STUDY_ID): Promise<StudyState> {
  return getRippleRefStudy(studyId);
}

export async function maRefIntegrityPreflight(studyId = MA_REF_MASTER_STUDY_ID): Promise<IntegrityPreflight> {
  return rippleFetch<IntegrityPreflight>(`/ripple-ref/studies/${encodeURIComponent(studyId)}/integrity-preflight`);
}

export async function importMaRefCohort(
  studyId = MA_REF_MASTER_STUDY_ID,
  sourceStudyId = COHORT_SOURCE_STUDY_ID
): Promise<StudyState & { integrity?: IntegrityPreflight }> {
  return rippleFetch(`/ripple-ref/studies/${encodeURIComponent(studyId)}/import-cohort`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceStudyId }),
  });
}

export async function setupMaRefStudy(): Promise<StudyState> {
  const models = DEFAULT_RIPPLE_REF_MODELS;
  const existing = await getRippleRefStudy(MA_REF_MASTER_STUDY_ID).catch(() => null);
  if (!existing) {
    await rippleFetch<StudyState>('/ripple-ref/studies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studyId: MA_REF_MASTER_STUDY_ID,
        label: 'ma-ref',
        orchestration: 'multi_agent',
        scale: 'full',
        variantCount: 1,
        cohortSourceStudyId: COHORT_SOURCE_STUDY_ID,
        cohortId: `${COHORT_SOURCE_STUDY_ID}_v1`,
        filesPerRepository: 10,
        randomSeed: 42,
        minSmellCount: 1,
        models,
      }),
    });
  }
  await importMaRefCohort();
  await buildRippleRefContexts(MA_REF_MASTER_STUDY_ID);
  return getMaRefStudy();
}

export function buildMaRefCandidateQueue(study: StudyState): MaRefCandidateQueueItem[] {
  const models = study.config?.models?.length ? study.config.models : DEFAULT_RIPPLE_REF_MODELS;
  const queue: MaRefCandidateQueueItem[] = [];
  for (const [workspaceId, files] of Object.entries(study.selectedByRepo ?? {})) {
    for (const file of files ?? []) {
      for (const model of models) {
        queue.push({
          workspaceId,
          filePath: file.filePath,
          modelId: model.modelId,
          pairKey: `${workspaceId}|${file.filePath}|${model.modelId}|${MA_VARIANT}`,
        });
      }
    }
  }
  return queue;
}

export function computeMaRepoProgress(study: StudyState, projectNames?: Record<string, string>) {
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
        planned: fileCount * modelCount,
        completed: done,
        failed: fail,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function runMaRefCandidate(item: MaRefCandidateQueueItem, studyId = MA_REF_MASTER_STUDY_ID) {
  const body = {
    studyId,
    workspaceId: item.workspaceId,
    filePath: item.filePath,
    model: { modelId: item.modelId },
    resume: false,
  };
  const res = await fetch(`${agentsBase()}/agents/ma-ref/run-candidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `MA candidate failed: ${res.status}`);
  }
  return res.json();
}

export async function maRefCompleteness(studyId = MA_REF_MASTER_STUDY_ID): Promise<CompletenessReport> {
  return rippleRefCompleteness(studyId);
}

export async function refreshMaRefStudyStatus(studyId = MA_REF_MASTER_STUDY_ID) {
  const [study, liveStatus, results] = await Promise.all([
    getMaRefStudy(studyId),
    fetchRippleRefLiveStatus(studyId),
    fetchRippleRefResults(studyId),
  ]);
  return { study, completeness: liveStatus.completeness, results, liveStatus };
}

export async function fetchMaRefAgentTrace(
  studyId: string,
  workspaceId: string,
  filePath: string,
  modelId: string,
  variant = MA_VARIANT
): Promise<AgentTracePayload | null> {
  const params = new URLSearchParams({ workspaceId, filePath, modelId, variant });
  try {
    return await rippleFetch<AgentTracePayload>(
      `/ripple-ref/studies/${encodeURIComponent(studyId)}/artifacts/agent-steps?${params}`
    );
  } catch {
    return null;
  }
}

export async function fetchAgentsHealth(): Promise<AgentsHealth> {
  const base = agentsBase();
  const res = await fetch(`${base}/agents/health`).catch(() => null);
  if (res?.ok) return res.json();
  const fallback = await fetch(`${base}/health`);
  if (!fallback.ok) return {};
  return fallback.json();
}

export type MaPipelineIssue = {
  at: string;
  kind: string;
  message: string;
  healAction?: string;
};

export type MaPipelineHealEvent = {
  at: string;
  action: string;
  result: string;
  detail?: string;
};

export type MaPipelineStatus = {
  studyId?: string;
  state?: 'idle' | 'running' | 'healing' | 'stopped' | 'complete';
  supervisorPid?: string;
  batchPid?: string;
  round?: number;
  currentSystemNum?: number;
  currentSystemLabel?: string;
  completedRuns?: number;
  plannedRuns?: number;
  missingArtifacts?: number;
  failedGenerations?: number;
  completionPercentage?: number;
  stallMinutes?: number;
  lastProgressAt?: string;
  startedAt?: string;
  updatedAt?: string;
  multiLlmAgentMode?: string;
  liveCandidate?: LiveCandidateInfo | null;
  issues?: MaPipelineIssue[];
  healHistory?: MaPipelineHealEvent[];
  completeness?: CompletenessReport;
  live?: RippleRefLiveStatus;
  wrapperPid?: string;
  wrapperAlive?: boolean;
  supervisorAlive?: boolean;
  staleRunning?: boolean;
  phase?: 'idle' | 'ma_generation' | 'backfill_b0' | 'backfill_ma' | 'complete';
  backfillStudyId?: string;
  backfillProcessed?: number;
  backfillTotal?: number;
  backfillDetail?: string;
  verificationMa?: VerificationSummary;
  verificationB0?: VerificationSummary;
};

export async function fetchMaPipelineStatus(
  studyId = MA_REF_MASTER_STUDY_ID
): Promise<MaPipelineStatus> {
  return rippleFetch<MaPipelineStatus>(
    `/ripple-ref/studies/${encodeURIComponent(studyId)}/pipeline-status`
  );
}

export async function startMaPipeline(studyId = MA_REF_MASTER_STUDY_ID): Promise<MaPipelineStatus> {
  return rippleFetch<MaPipelineStatus>(
    `/ripple-ref/studies/${encodeURIComponent(studyId)}/pipeline/start`,
    { method: 'POST' }
  );
}

export async function stopMaPipeline(studyId = MA_REF_MASTER_STUDY_ID): Promise<MaPipelineStatus> {
  return rippleFetch<MaPipelineStatus>(
    `/ripple-ref/studies/${encodeURIComponent(studyId)}/pipeline/stop`,
    { method: 'POST' }
  );
}

export async function healMaPipeline(studyId = MA_REF_MASTER_STUDY_ID): Promise<MaPipelineStatus> {
  return rippleFetch<MaPipelineStatus>(
    `/ripple-ref/studies/${encodeURIComponent(studyId)}/pipeline/heal`,
    { method: 'POST' }
  );
}

export async function fetchMaVerificationSummaries() {
  const [ma, b0] = await Promise.all([
    fetchVerificationSummary(MA_REF_MASTER_STUDY_ID),
    fetchVerificationSummary(COHORT_SOURCE_STUDY_ID),
  ]);
  return { ma, b0 };
}

export {
  fetchVerificationSummary,
  buildRippleRefContexts,
  fetchRippleRefFileGraph,
  fetchRippleRefResults,
  rippleRefExportInfo,
  rippleRefPreflight,
  isStudyIncomplete,
  isStudyLiveExecution,
  subscribeRippleRefLiveStream as subscribeMaRefLiveStream,
  type RippleRefLiveStatus as MaRefLiveStatus,
  type LiveCandidateInfo,
  type CompletenessReport,
  type CandidateResultsResponse,
  type RippleRefFileGraph,
  type VerificationSummary,
};

export function formatMaLivePhase(phase?: string | null): string {
  const map: Record<string, string> = {
    queued: 'Queued — waiting for agent',
    langgraph_pipeline: 'LangGraph multi-agent pipeline',
    ripple_verification: 'Ripple Risk Verifier (L1–L2)',
    llm_plan: 'LLM Planning Agent',
    refactor: 'LLM Refactoring Agent',
    llm_verify: 'LLM Verification Agent',
    dependency_context: 'Dependency Context Agent',
    analyze: 'Code Smell Detector (PMD)',
    plan: 'Rule Planner',
    verify: 'Quality Verifier',
    report: 'Analysis Reporter',
    load: 'File Loader',
    feasibility: 'Size Advisor',
  };
  if (!phase) return 'Running';
  return map[phase] ?? phase.replace(/_/g, ' ');
}
