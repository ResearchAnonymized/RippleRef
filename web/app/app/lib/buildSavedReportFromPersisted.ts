import {
  buildPersistedFileResearchReport,
  type RefactoringHistoryEntry,
} from './buildPersistedFileReport';
import {
  buildSavedRefactoringReportBundle,
  type SavedRefactoringReportBundle,
} from './savedRefactoringReport';
import type { FileActivity } from './fileActivity';

/** Reconstruct a saveable bundle from history + artifacts when no archive exists yet. */
export function buildSavedReportFromPersisted(input: {
  workspaceId: string;
  filePath: string;
  original: string;
  refactored: string;
  historyEntry?: RefactoringHistoryEntry | null;
  fileActivity?: FileActivity | null;
  codeSmells?: Array<Record<string, unknown>>;
}): SavedRefactoringReportBundle {
  const report = buildPersistedFileResearchReport({
    filePath: input.filePath,
    original: input.original,
    refactored: input.refactored,
    codeSmells: input.codeSmells,
    fileActivity: input.fileActivity,
    historyEntry: input.historyEntry,
  });

  const changes = input.historyEntry?.changes;
  const applyResult: Record<string, unknown> = {
    changes,
    originalContent: input.original,
    refactoredContent: input.refactored,
    refactoringReport: report,
    deltas: {
      before: input.fileActivity?.smellsBefore ?? input.fileActivity?.analysisSmellCount,
      after: input.fileActivity?.smellsAfter ?? input.codeSmells?.length,
      comprehensiveAnalysis: null,
    },
    refactoredArtifactPath: input.fileActivity?.refactoredArtifactPath,
    originalArtifactPath: input.fileActivity?.originalArtifactPath,
    researchMetrics: null,
    pipelineMetadata: null,
  };

  const rejected = input.fileActivity?.status === 'rejected';
  return buildSavedRefactoringReportBundle({
    workspaceId: input.workspaceId,
    filePath: input.filePath,
    originalContent: input.original,
    refactoredContent: input.refactored,
    applyResult,
    refactoringReport: report,
    codeSmells: input.codeSmells,
    refactoringRejected: rejected
      ? {
          rejected: true,
          rejectionReason: input.fileActivity?.rejectionReason ?? undefined,
        }
      : null,
  });
}
