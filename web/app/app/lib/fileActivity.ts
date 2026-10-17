/** Per-file activity from backend file-status.json (via /progress). */

export type FileActivity = {
  status: string;
  smellsBefore: number;
  smellsAfter: number;
  humanVerdict: string | null;
  analyzedAt?: number | null;
  analysisSmellCount?: number;
  lastRefactorAt?: number | null;
  verifyAccepted?: boolean | null;
  runId?: string | null;
  rejectionReason?: string | null;
  refactoredArtifactPath?: string | null;
  originalArtifactPath?: string | null;
  savedToProjectAt?: number | null;
  researchSnapshot?: string | null;
};

export type FileProgressMap = Record<string, FileActivity>;

export function mapProgressFiles(
  files: Array<Record<string, unknown>> | undefined
): FileProgressMap {
  const map: FileProgressMap = {};
  if (!files) return map;
  for (const f of files) {
    const path = String(f.filePath ?? '');
    if (!path) continue;
    map[path] = {
      status: String(f.status ?? 'pending'),
      smellsBefore: Number(f.smellsBefore ?? 0),
      smellsAfter: Number(f.smellsAfter ?? 0),
      humanVerdict: (f.humanVerdict as string | null) ?? null,
      analyzedAt: f.analyzedAt != null ? Number(f.analyzedAt) : null,
      analysisSmellCount: f.analysisSmellCount != null ? Number(f.analysisSmellCount) : undefined,
      lastRefactorAt: f.lastRefactorAt != null ? Number(f.lastRefactorAt) : null,
      verifyAccepted:
        f.verifyAccepted === true || f.verifyAccepted === false
          ? Boolean(f.verifyAccepted)
          : null,
      runId: f.runId != null ? String(f.runId) : null,
      rejectionReason: f.rejectionReason != null ? String(f.rejectionReason) : null,
      refactoredArtifactPath:
        f.refactoredArtifactPath != null ? String(f.refactoredArtifactPath) : null,
      originalArtifactPath:
        f.originalArtifactPath != null ? String(f.originalArtifactPath) : null,
      savedToProjectAt: f.savedToProjectAt != null ? Number(f.savedToProjectAt) : null,
      researchSnapshot:
        f.researchSnapshot != null ? String(f.researchSnapshot) : null,
    };
  }
  return map;
}

export function isFileAnalyzed(fp: FileActivity | undefined): boolean {
  return !!(fp?.analyzedAt && fp.analyzedAt > 0);
}

export function normalizeFilePath(p: string): string {
  return String(p || '').replace(/\\/g, '/');
}

const REFACTOR_OUTCOME_STATUSES = new Set(['refactored', 'rejected']);

function outcomeSortKey(activity: FileActivity): number {
  return activity.lastRefactorAt ?? activity.savedToProjectAt ?? 0;
}

/** Workspace files with a completed refactor attempt (accepted or rejected). */
export function getRefactoringOutcomeFiles<T extends { relativePath: string }>(
  files: T[],
  fileProgress: FileProgressMap
): Array<T & { activity: FileActivity }> {
  const out: Array<T & { activity: FileActivity }> = [];
  for (const file of files) {
    const activity = fileProgress[file.relativePath];
    if (activity && REFACTOR_OUTCOME_STATUSES.has(activity.status)) {
      out.push({ ...file, activity });
    }
  }
  out.sort((a, b) => outcomeSortKey(b.activity) - outcomeSortKey(a.activity));
  return out;
}

/** @deprecated Use getRefactoringOutcomeFiles — kept for callers that only need accepted. */
export function getRefactoredWorkspaceFiles<T extends { relativePath: string }>(
  files: T[],
  fileProgress: FileProgressMap
): Array<T & { activity: FileActivity }> {
  return getRefactoringOutcomeFiles(files, fileProgress).filter(
    (f) => f.activity.status === 'refactored'
  );
}

export function countRefactoredFiles(fileProgress: FileProgressMap): number {
  return Object.values(fileProgress).filter((fp) => fp.status === 'refactored').length;
}

export function countRejectedFiles(fileProgress: FileProgressMap): number {
  return Object.values(fileProgress).filter((fp) => fp.status === 'rejected').length;
}

export function countRefactoringOutcomes(fileProgress: FileProgressMap): number {
  return Object.values(fileProgress).filter((fp) =>
    REFACTOR_OUTCOME_STATUSES.has(fp.status)
  ).length;
}
