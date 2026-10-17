/**
 * Persist batch refactor runs (results + LLM passes) until user clears them.
 */

import { apiClient } from '../api/client';
import type { BatchFileMetrics } from './batchResultMetrics';

export type MultiLlmRunRecord = {
  passIndex: number;
  provider: string;
  model: string;
  ok: boolean;
  changed: boolean;
  linesBefore?: number;
  linesAfter?: number;
  smellsBefore?: number;
  smellsAfter?: number;
  smellDelta?: number;
  orchestration?: string;
  agentSteps?: Array<{ name: string; agent: string; status: string; details?: Record<string, unknown> }>;
  researchMetrics?: Record<string, unknown>;
  experiment?: Record<string, unknown>;
};

export type PersistedBatchFileResult = {
  filePath: string;
  fileName: string;
  status: 'pending' | 'running' | 'accepted' | 'proposed' | 'rejected' | 'error';
  smellsBefore?: number;
  smellsAfter?: number;
  smellDelta?: number;
  reportSaved: boolean;
  rejectionReason?: string;
  error?: string;
  durationMs?: number;
  progressMessage?: string;
  metrics?: BatchFileMetrics | null;
  multiLlmRuns?: MultiLlmRunRecord[];
  currentLlm?: {
    provider: string;
    model: string;
    passIndex: number;
    passTotal: number;
    stepName?: string;
    agent?: string;
    stepStatus?: string;
  };
  activeLlms?: Record<
    string,
    {
      provider: string;
      model: string;
      passIndex: number;
      passTotal: number;
      stepName?: string;
      agent?: string;
      stepStatus?: string;
    }
  >;
};

export type PersistedBatchRun = {
  workspaceId: string;
  projectLabel: string;
  savedAt: number;
  researchSampleId?: string;
  results: PersistedBatchFileResult[];
  completedAt?: number;
};

const localKey = (workspaceId: string) => `refactai-batch-run-${workspaceId}`;

export function loadBatchRunFromLocal(workspaceId: string): PersistedBatchRun | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(localKey(workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedBatchRun;
    if (!parsed?.results?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveBatchRunToLocal(record: PersistedBatchRun): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(localKey(record.workspaceId), JSON.stringify(record));
  } catch {
    /* quota */
  }
}

export async function loadBatchRun(workspaceId: string): Promise<PersistedBatchRun | null> {
  try {
    const remote = await apiClient.getBatchRun(workspaceId);
    if (remote && Array.isArray(remote.results) && remote.results.length > 0) {
      const record = remote as PersistedBatchRun;
      saveBatchRunToLocal(record);
      return record;
    }
  } catch {
    /* offline */
  }
  return loadBatchRunFromLocal(workspaceId);
}

export async function persistBatchRun(record: PersistedBatchRun): Promise<void> {
  saveBatchRunToLocal(record);
  try {
    await apiClient.saveBatchRun(record.workspaceId, record);
  } catch (e) {
    console.warn('Could not save batch run to workspace', e);
  }
}

export async function clearBatchRun(workspaceId: string): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(localKey(workspaceId));
    } catch {
      /* ignore */
    }
  }
  try {
    await apiClient.clearBatchRun(workspaceId);
  } catch {
    /* ignore */
  }
}
