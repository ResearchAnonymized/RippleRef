import type { FileActivity } from './fileActivity';
import {
  buildClientRefactoringReport,
  type RefactoringReportShape,
} from './refactoringReportDocument';

export type RefactoringHistoryEntry = {
  id: string;
  timestamp: number;
  workspaceId?: string;
  filePath: string;
  operationType: string;
  success: boolean;
  backupPath?: string;
  originalContent?: string;
  refactoredContent?: string;
  changes?: {
    added?: number;
    removed?: number;
    modified?: number;
    linesChanged?: number;
  };
  userId?: string;
  userName?: string;
};

export type RefactoringAnnotation = {
  line: number;
  type: string;
  description: string;
};

/** Inline `// REFACTORED:` markers left in saved source (research traceability). */
export function extractRefactoringAnnotations(source: string): RefactoringAnnotation[] {
  const out: RefactoringAnnotation[] = [];
  const lines = (source || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*\/\/\s*REFACTORED:\s*(.+)\s*$/);
    if (!m) continue;
    const description = m[1].trim();
    const type = description.split(' - ')[0]?.trim() || description;
    out.push({ line: i + 1, type, description });
  }
  return out;
}

function parseResearchSnapshot(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw || !String(raw).trim()) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function buildPersistedFileResearchReport(input: {
  filePath: string;
  original: string;
  refactored: string;
  codeSmells?: Array<Record<string, unknown>>;
  fileActivity?: FileActivity | null;
  historyEntry?: RefactoringHistoryEntry | null;
}): RefactoringReportShape | null {
  const { filePath, original, refactored, codeSmells, fileActivity, historyEntry } = input;
  const annotations = extractRefactoringAnnotations(refactored);

  const refactoringPlan = annotations.map((a) => ({
    smellId: a.type,
    technique: a.type,
    location: `annotation at line ${a.line}`,
    description: a.description,
    action: a.description,
    priority: 'applied',
  }));

  const snapshot = parseResearchSnapshot(fileActivity?.researchSnapshot ?? null);
  const snapMetrics = snapshot?.research_metrics ?? snapshot?.metrics ?? snapshot;

  const applyResult: Record<string, unknown> = {
    deltas: {
      before: fileActivity?.smellsBefore ?? fileActivity?.analysisSmellCount,
      after: fileActivity?.smellsAfter ?? codeSmells?.length,
      improvement:
        fileActivity?.smellsBefore != null && fileActivity?.smellsAfter != null
          ? Math.max(0, fileActivity.smellsBefore - fileActivity.smellsAfter)
          : undefined,
      comprehensiveAnalysis: snapMetrics,
    },
    changes: historyEntry?.changes,
    savedToProjectAt: fileActivity?.savedToProjectAt,
    refactoredArtifactPath: fileActivity?.refactoredArtifactPath,
    originalArtifactPath: fileActivity?.originalArtifactPath,
    verifyAccepted: fileActivity?.verifyAccepted,
    runId: fileActivity?.runId,
  };

  const report =
    buildClientRefactoringReport({
      filePath,
      original,
      refactored,
      smells: codeSmells ?? [],
      agentAnalysis: {
        decision: fileActivity?.status === 'refactored' ? 'accepted (persisted)' : 'recorded',
        reason: 'Reconstructed from saved project history and artifacts — no new refactoring run.',
        refactoringPlan,
      },
      applyResult,
      agentSteps: [
        {
          name: 'Load persisted history',
          agent: 'RefactAI',
          status: historyEntry ? 'completed' : 'skipped',
          details: historyEntry
            ? {
                entryId: historyEntry.id,
                timestamp: historyEntry.timestamp,
                operationType: historyEntry.operationType,
              }
            : 'No history entry; used .refactai artifacts only.',
        },
      ],
    }) ?? null;

  if (!report) return null;

  if (annotations.length > 0 && report.applied_refactorings.length === 0) {
    report.applied_refactorings = annotations.map((a) => ({
      type: a.type,
      before_location: `line ${a.line} (pre-change context)`,
      after_location: `line ${a.line + 1} or following hunk`,
      description: a.description,
    }));
    report.smell_refactoring_mapping = annotations.map((a) => ({
      smell: a.type,
      refactoring: a.type,
      benefit: 'Documented in-source for empirical study traceability.',
    }));
  }

  if (historyEntry?.changes?.linesChanged != null) {
    report.change_metrics = {
      lines_added: historyEntry.changes.added ?? report.change_metrics.lines_added,
      lines_removed: historyEntry.changes.removed ?? report.change_metrics.lines_removed,
      lines_modified: historyEntry.changes.modified ?? report.change_metrics.lines_modified,
      refactoring_operations: Math.max(
        report.change_metrics.refactoring_operations,
        annotations.length
      ),
    };
    report.meta = {
      ...(report.meta || {}),
      historyEntryId: historyEntry.id,
      historyTimestamp: historyEntry.timestamp,
      linesChangedRecorded: historyEntry.changes.linesChanged,
    };
  }

  report.meta = {
    ...(report.meta || {}),
    readOnly: true,
    dataSources: [
      historyEntry ? 'refactoring history' : null,
      fileActivity?.originalArtifactPath ? 'original artifact' : null,
      fileActivity?.refactoredArtifactPath ? 'refactored artifact' : null,
      annotations.length ? 'REFACTORED source annotations' : null,
      codeSmells?.length ? 'current PMD analysis (post-refactor)' : null,
      fileActivity?.researchSnapshot ? 'research snapshot' : null,
    ].filter(Boolean),
  };

  return report;
}
