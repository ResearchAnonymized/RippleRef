/**
 * One file through the same pipeline as Controlled Refactoring:
 * PMD smells → /agents/refactor → persist outcome → save full report bundle.
 */

import { apiClient } from '../api/client';
import {
  buildFullResearchApplyResult,
  getLlmCandidateContent,
  improvementStatsFromRefactorResponse,
  type RefactorApiResponse,
} from './ingestRefactorResponse';
import { jsonSafeForArchive } from './jsonSafeForArchive';
import { buildSavedRefactoringReportBundle } from './savedRefactoringReport';
import type { RefactoringReportShape } from './refactoringReportDocument';
import { computeSmellComparison } from './smellComparison';
import { extractBatchFileMetrics, type BatchFileMetrics } from './batchResultMetrics';
import { normalizeMultiLlmRuns } from './normalizeMultiLlmRuns';
import type { MultiLlmRunRecord } from './batchRunStorage';
import {
  agentsRefactorUrl,
  checkAgentsHealth,
  explainRefactorFetchError,
  getRefactorClientTimeoutMs,
  subscribeAgentsProgress,
} from './refactorClient';

export type BatchRefactorFileResult = {
  filePath: string;
  fileName: string;
  status: 'accepted' | 'proposed' | 'rejected' | 'error';
  smellsBefore?: number;
  smellsAfter?: number;
  smellDelta?: number;
  reportSaved: boolean;
  rejectionReason?: string;
  error?: string;
  durationMs?: number;
  agentSteps?: Array<{ name: string; status: string }>;
  metrics?: BatchFileMetrics | null;
  multiLlmRuns?: MultiLlmRunRecord[];
};

export type BatchRefactorOptions = {
  workspaceId: string;
  filePath: string;
  fileName: string;
  similarityThreshold?: number;
  methodPreservationThreshold?: number;
  skipSmellComparison?: boolean;
  multiLlmChain?: boolean;
  /** From research-sample-manifest.json — triggers baseline restore when live PMD is lower. */
  manifestSmellCount?: number;
  /** Research sample id for frozen baseline + multi-LLM artifact paths. */
  sampleId?: string;
  onProgress?: (message: string) => void;
  onLlmProgress?: (info: {
    provider: string;
    model: string;
    passIndex: number;
    passTotal: number;
    stepName?: string;
    agent?: string;
    stepStatus?: string;
  }) => void;
  /** Research batch uses independent parallel mode (same baseline per provider). */
  researchParallelMode?: boolean;
  signal?: AbortSignal;
};

async function persistRefactorOutcome(opts: {
  workspaceId: string;
  filePath: string;
  accepted: boolean;
  original: string;
  candidate: string;
  rejectionReason?: string | string[];
  smellsBefore?: number;
  smellsAfter?: number;
  researchMetrics?: Record<string, unknown> | null;
}): Promise<void> {
  const rejectionReason = Array.isArray(opts.rejectionReason)
    ? opts.rejectionReason.join(', ')
    : opts.rejectionReason;
  let researchSnapshot: string | undefined;
  if (opts.researchMetrics) {
    try {
      researchSnapshot = JSON.stringify({ research_metrics: opts.researchMetrics });
    } catch {
      /* ignore */
    }
  }
  const storedUserId =
    typeof window !== 'undefined' ? localStorage.getItem('refactai-user-id') : null;
  const storedUserName =
    typeof window !== 'undefined' ? localStorage.getItem('refactai-user-name') : null;
  const status = opts.accepted ? 'refactored' : 'rejected';
  try {
    await apiClient.recordRefactorAttempt(opts.workspaceId, {
      filePath: opts.filePath,
      originalContent: opts.original,
      candidateContent: opts.candidate || opts.original,
      accepted: opts.accepted,
      smellsBefore: opts.smellsBefore ?? 0,
      smellsAfter: opts.smellsAfter ?? 0,
      rejectionReason,
      researchSnapshot,
      userId: storedUserId,
      userName: storedUserName,
    });
  } catch {
    try {
      await apiClient.updateFileStatus(opts.workspaceId, opts.filePath, status, {
        smellsBefore: opts.smellsBefore,
        smellsAfter: opts.smellsAfter,
        rejectionReason,
        verifyAccepted: opts.accepted,
        researchSnapshot,
        userId: storedUserId ?? undefined,
        userName: storedUserName ?? undefined,
      });
    } catch {
      /* best effort */
    }
  }
}

async function saveFullReportForBatch(opts: {
  workspaceId: string;
  filePath: string;
  applyResult: Record<string, unknown>;
  originalContent: string;
  refactoredContent: string;
  improvementStats: NonNullable<ReturnType<typeof improvementStatsFromRefactorResponse>>;
  smellComparison: Awaited<ReturnType<typeof computeSmellComparison>>;
  codeSmells: Array<Record<string, unknown>>;
  refactoringRejected: {
    rejected?: boolean;
    rejectionReason?: string | string[];
    message?: string;
    success?: boolean;
  };
  qualityMetrics: Record<string, unknown> | null;
  multiLlmRuns?: MultiLlmRunRecord[];
}): Promise<boolean> {
  const refactoringReport =
    (opts.applyResult.refactoringReport as RefactoringReportShape | undefined) ?? null;
  const bundle = buildSavedRefactoringReportBundle({
    workspaceId: opts.workspaceId,
    filePath: opts.filePath,
    originalContent: opts.originalContent,
    refactoredContent: opts.refactoredContent,
    applyResult: opts.applyResult,
    refactoringReport,
    researchMetrics: (opts.applyResult.researchMetrics as Record<string, unknown>) || null,
    pipelineMetadata: (opts.applyResult.pipelineMetadata as Record<string, unknown>) || null,
    multiLlmRuns: opts.multiLlmRuns ?? null,
    improvementStats: opts.improvementStats,
    smellComparison: opts.smellComparison,
    qualityMetrics: opts.qualityMetrics,
    codeSmells: opts.codeSmells,
    refactoringRejected: opts.refactoringRejected,
  });
  const safeBundle = jsonSafeForArchive(bundle) as Record<string, unknown>;
  await apiClient.saveRefactoringReport(opts.workspaceId, safeBundle);
  try {
    sessionStorage.setItem(`refactai-full-report-saved:${opts.workspaceId}:${opts.filePath}`, '1');
  } catch {
    /* ignore */
  }
  return true;
}

/** Run one file: same agents endpoint + persistence as controlled refactoring. */
export async function runBatchRefactorForFile(
  opts: BatchRefactorOptions
): Promise<BatchRefactorFileResult> {
  const startTime = Date.now();
  const base: BatchRefactorFileResult = {
    filePath: opts.filePath,
    fileName: opts.fileName,
    status: 'error',
    reportSaved: false,
  };

  const progress = (msg: string) => opts.onProgress?.(msg);

  try {
    if (opts.signal?.aborted) {
      return { ...base, error: 'Stopped by user', durationMs: Date.now() - startTime };
    }

    progress('Loading PMD smells…');
    if (opts.manifestSmellCount != null && opts.manifestSmellCount > 0) {
      try {
        const restore = await apiClient.restoreResearchBaseline(
          opts.workspaceId,
          opts.filePath,
          opts.manifestSmellCount
        );
        if (restore.restored) {
          progress(
            `Restored pre-refactor baseline (PMD ${restore.smellsBeforeRestore} → ${restore.smellsAfterRestore})…`
          );
        }
      } catch (e) {
        console.warn('Research baseline restore failed', e);
      }
    }
    if (opts.sampleId) {
      try {
        await apiClient.snapshotResearchBaselineFile(opts.workspaceId, opts.sampleId, opts.filePath);
      } catch (e) {
        console.warn('Per-file baseline snapshot failed', e);
      }
    }
    let codeSmells: Array<Record<string, unknown>> = [];
    try {
      const enhanced = await apiClient.analyzeFileEnhanced(opts.workspaceId, opts.filePath);
      codeSmells = (enhanced.codeSmells || []) as unknown as Array<Record<string, unknown>>;
    } catch (e) {
      console.warn('Batch: smell preload failed, agents may analyze on server', e);
    }

    const health = await checkAgentsHealth();
    if (!health.ok) {
      return {
        ...base,
        error: health.message || 'Agents unavailable',
        durationMs: Date.now() - startTime,
      };
    }

    if (opts.signal?.aborted) {
      return { ...base, error: 'Stopped by user', durationMs: Date.now() - startTime };
    }

    progress('Checking source file…');
    try {
      const fc = await apiClient.getFileContent(opts.workspaceId, opts.filePath);
      if (!fc.content?.trim()) {
        return {
          ...base,
          error: `Empty file content: ${opts.fileName}`,
          durationMs: Date.now() - startTime,
        };
      }
    } catch {
      return {
        ...base,
        error:
          `Source file not found: ${opts.fileName}. The project may have been cleared — re-upload jhotdraw, run Analysis, then re-pick your sample.`,
        durationMs: Date.now() - startTime,
      };
    }

    progress('Running agent refactor…');
    let lineCount = 0;
    try {
      const fc = await apiClient.getFileContent(opts.workspaceId, opts.filePath);
      lineCount = (fc.content || '').split('\n').length;
    } catch {
      lineCount = codeSmells.length > 40 ? 900 : 200;
    }
    const smellCount = codeSmells.length;
    const refactorWaitMs = getRefactorClientTimeoutMs(lineCount, smellCount);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), refactorWaitMs);
    const abortLink = () => {
      if (opts.signal?.aborted) controller.abort();
    };
    opts.signal?.addEventListener('abort', abortLink);

    const jobId = `${opts.workspaceId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const stopSse = subscribeAgentsProgress(jobId, (evt) => {
      if (evt.type === 'llm' && evt.provider && evt.model) {
        opts.onLlmProgress?.({
          provider: String(evt.provider),
          model: String(evt.model),
          passIndex: Number(evt.passIndex ?? 0),
          passTotal: Number(evt.passTotal ?? 3),
          stepName: 'Pipeline',
          stepStatus: 'running',
        });
        if (!opts.researchParallelMode) {
          opts.onProgress?.(
            `LLM ${Number(evt.passIndex ?? 0) + 1}/${evt.passTotal ?? 3}: ${evt.provider} (${evt.model})`
          );
        }
      } else if (evt.type === 'step' && evt.stepName && evt.provider && evt.model) {
        opts.onLlmProgress?.({
          provider: String(evt.provider),
          model: String(evt.model),
          passIndex: Number(evt.passIndex ?? 0),
          passTotal: Number(evt.passTotal ?? 3),
          stepName: String(evt.stepName),
          agent: evt.agent ? String(evt.agent) : undefined,
          stepStatus: evt.status ? String(evt.status) : undefined,
        });
        if (!opts.researchParallelMode) {
          progress(`${evt.stepName}${evt.agent ? ` (${evt.agent})` : ''}`);
        }
      } else if (evt.type === 'step' && evt.stepName) {
        progress(`${evt.stepName}${evt.agent ? ` (${evt.agent})` : ''}`);
      } else if (evt.type === 'detail' && evt.message) {
        progress(evt.message.slice(0, 120));
      }
    });
    const storedUserId =
      typeof window !== 'undefined' ? localStorage.getItem('refactai-user-id') : null;
    const storedUserName =
      typeof window !== 'undefined' ? localStorage.getItem('refactai-user-name') : null;

    const requestBody: Record<string, unknown> = {
      workspaceId: opts.workspaceId,
      filePath: opts.filePath,
      goals: ['reduce code smells', 'improve readability', 'enhance maintainability'],
      userId: storedUserId,
      userName: storedUserName,
      jobId,
    };
    if (codeSmells.length > 0) {
      requestBody.providedSmells = codeSmells;
    }
    if (opts.similarityThreshold != null) {
      requestBody.similarityThreshold = opts.similarityThreshold;
    }
    if (opts.methodPreservationThreshold != null) {
      requestBody.methodPreservationThreshold = opts.methodPreservationThreshold;
    }
    if (opts.multiLlmChain === true) {
      requestBody.multiLlmChain = true;
    } else if (opts.multiLlmChain !== false && lineCount >= 250) {
      requestBody.multiLlmChain = true;
    } else {
      requestBody.multiLlmChain = false;
    }
    requestBody.researchBatchMode = true;
    if (opts.sampleId) {
      requestBody.sampleId = opts.sampleId;
    }

    const doFetch = () =>
      fetch(agentsRefactorUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

    let refactorRes: Response;
    try {
      try {
        refactorRes = await doFetch();
      } catch (firstErr: unknown) {
        const first = firstErr as Error;
        const retryable =
          first.name !== 'AbortError' &&
          (first.message.includes('Failed to fetch') ||
            first.message.includes('NetworkError') ||
            first.message.includes('Load failed'));
        if (retryable && !opts.signal?.aborted) {
          progress('Connection lost — retrying once…');
          await new Promise((r) => setTimeout(r, 3000));
          refactorRes = await doFetch();
        } else {
          throw firstErr;
        }
      }
    } catch (fetchErr: unknown) {
      const err = fetchErr as Error;
      stopSse();
      if (err.name === 'AbortError') {
        return {
          ...base,
          error: opts.signal?.aborted
            ? 'Stopped by user'
            : explainRefactorFetchError(err, smellCount),
          durationMs: Date.now() - startTime,
        };
      }
      return {
        ...base,
        error: explainRefactorFetchError(fetchErr, smellCount),
        durationMs: Date.now() - startTime,
      };
    } finally {
      stopSse();
      clearTimeout(timeoutId);
      opts.signal?.removeEventListener('abort', abortLink);
    }

    if (!refactorRes.ok) {
      const text = await refactorRes.text().catch(() => '');
      return {
        ...base,
        error: `Refactor failed (${refactorRes.status}): ${text.slice(0, 200)}`,
        durationMs: Date.now() - startTime,
      };
    }

    const data = (await refactorRes.json()) as RefactorApiResponse;
    const orig = (typeof data.originalContent === 'string' ? data.originalContent : '') || '';
    const candidate = getLlmCandidateContent(data, orig);
    const rejected = Boolean(data.rejected ?? data.success === false);
    const adopted = Boolean(
      (data.researchOutcome as { adopted?: boolean } | undefined)?.adopted ?? !rejected
    );
    const candidateDiffers = orig.trim() !== (candidate || '').trim();
    const stats = improvementStatsFromRefactorResponse(data);
    const smellsBefore = stats?.before?.total;
    const smellsAfter = stats?.after?.total;
    const metrics = extractBatchFileMetrics(data);
    const multiLlmRuns = normalizeMultiLlmRuns(data.multiLlmRuns);

    const rejectionReason = Array.isArray(data.rejectionReason)
      ? data.rejectionReason.join('; ')
      : String(data.rejectionReason || data.error || '');

    progress('Saving outcome…');
    await persistRefactorOutcome({
      workspaceId: opts.workspaceId,
      filePath: opts.filePath,
      accepted: adopted,
      original: orig,
      candidate: candidate || orig,
      rejectionReason: data.rejectionReason as string | string[] | undefined,
      smellsBefore,
      smellsAfter,
      researchMetrics: (data.researchMetrics as Record<string, unknown>) || null,
    });

    let reportSaved = false;
    if (stats) {
      progress('Building research report…');
      const applyResult = buildFullResearchApplyResult(data, orig, opts.filePath);
      const qm = (data.deltas as { qualityMetrics?: unknown })?.qualityMetrics;
      let smellComparison = null;
      if (!opts.skipSmellComparison && orig && candidate && orig.trim() !== candidate.trim()) {
        try {
          progress('Comparing smells…');
          smellComparison = await computeSmellComparison(
            opts.workspaceId,
            opts.filePath,
            orig,
            candidate
          );
        } catch (e) {
          console.warn('Batch smell comparison failed', e);
        }
      }
      try {
        await saveFullReportForBatch({
          workspaceId: opts.workspaceId,
          filePath: opts.filePath,
          applyResult,
          originalContent: orig,
          refactoredContent: candidate,
          improvementStats: stats,
          smellComparison,
          codeSmells,
          refactoringRejected: {
            rejected,
            rejectionReason: data.rejectionReason as string | string[] | undefined,
            message: data.message as string | undefined,
            success: data.success as boolean | undefined,
          },
          qualityMetrics: (qm as Record<string, unknown>) || null,
          multiLlmRuns,
        });
        reportSaved = true;
      } catch (e) {
        console.error('Batch save full report failed', e);
      }
    }

    const steps = Array.isArray(data.steps)
      ? (data.steps as Array<Record<string, unknown>>).map((s) => ({
          name: String(s.name ?? ''),
          status: String(s.status ?? ''),
        }))
      : undefined;

    const batchStatus: BatchRefactorFileResult['status'] = adopted
      ? 'accepted'
      : candidateDiffers
        ? 'proposed'
        : rejected
          ? 'rejected'
          : 'accepted';

    return {
      filePath: opts.filePath,
      fileName: opts.fileName,
      status: batchStatus,
      smellsBefore,
      smellsAfter,
      smellDelta:
        smellsBefore != null && smellsAfter != null ? smellsBefore - smellsAfter : undefined,
      reportSaved,
      rejectionReason: !adopted ? rejectionReason : undefined,
      durationMs: Date.now() - startTime,
      agentSteps: steps,
      metrics,
      multiLlmRuns,
    };
  } catch (e) {
    return {
      ...base,
      error: explainRefactorFetchError(e, 0),
      durationMs: Date.now() - startTime,
    };
  }
}
