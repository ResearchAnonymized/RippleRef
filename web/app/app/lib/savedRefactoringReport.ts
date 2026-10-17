import type { RefactoringReportShape } from './refactoringReportDocument';
import type { MultiLlmRunRecord } from './batchRunStorage';

/** Full post-refactoring review archive (restores the Review dashboard without re-running). */
export type SavedRefactoringReportBundle = {
  version: 1;
  workspaceId: string;
  filePath: string;
  savedAt: number;
  originalContent: string;
  refactoredContent: string;
  applyResult: Record<string, unknown> | null;
  refactoringReport?: RefactoringReportShape | null;
  researchMetrics?: Record<string, unknown> | null;
  pipelineMetadata?: Record<string, unknown> | null;
  /** Per-provider LLM passes (OpenAI → Google → Claude) when multiLlmChain was used. */
  multiLlmRuns?: MultiLlmRunRecord[] | null;
  improvementStats?: {
    before?: { total: number; critical: number; major: number; minor: number };
    after?: { total: number; critical: number; major: number; minor: number };
    delta?: { total: number; critical: number; major: number; minor: number };
  } | null;
  smellComparison?: {
    before: unknown[];
    after: unknown[];
    removed: unknown[];
    added: unknown[];
    unchanged?: unknown[];
  } | null;
  qualityMetrics?: Record<string, unknown> | null;
  codeSmells?: Array<Record<string, unknown>>;
  refactoringRejected?: {
    rejected?: boolean;
    message?: string;
    rejectionReason?: string | string[];
  } | null;
};

export function buildSavedRefactoringReportBundle(input: {
  workspaceId: string;
  filePath: string;
  originalContent: string;
  refactoredContent: string;
  applyResult: Record<string, unknown> | null;
  refactoringReport?: RefactoringReportShape | null;
  researchMetrics?: Record<string, unknown> | null;
  pipelineMetadata?: Record<string, unknown> | null;
  multiLlmRuns?: MultiLlmRunRecord[] | null;
  improvementStats?: SavedRefactoringReportBundle['improvementStats'];
  smellComparison?: SavedRefactoringReportBundle['smellComparison'];
  qualityMetrics?: Record<string, unknown> | null;
  codeSmells?: Array<Record<string, unknown>>;
  refactoringRejected?: SavedRefactoringReportBundle['refactoringRejected'];
}): SavedRefactoringReportBundle {
  return {
    version: 1,
    workspaceId: input.workspaceId,
    filePath: input.filePath,
    savedAt: Date.now(),
    originalContent: input.originalContent,
    refactoredContent: input.refactoredContent,
    applyResult: input.applyResult,
    refactoringReport: input.refactoringReport ?? null,
    researchMetrics:
      input.researchMetrics ??
      (input.applyResult?.researchMetrics as Record<string, unknown> | undefined) ??
      null,
    pipelineMetadata:
      input.pipelineMetadata ??
      (input.applyResult?.pipelineMetadata as Record<string, unknown> | undefined) ??
      null,
    multiLlmRuns:
      input.multiLlmRuns ??
      (input.applyResult?.multiLlmRuns as MultiLlmRunRecord[] | undefined) ??
      null,
    improvementStats: input.improvementStats ?? null,
    smellComparison: input.smellComparison ?? null,
    qualityMetrics: input.qualityMetrics ?? null,
    codeSmells: input.codeSmells ?? [],
    refactoringRejected: input.refactoringRejected ?? null,
  };
}

export function parseSavedRefactoringReportBundle(raw: unknown): SavedRefactoringReportBundle | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as SavedRefactoringReportBundle;
  if (b.version !== 1 || !b.filePath || !b.workspaceId) return null;
  return b;
}
