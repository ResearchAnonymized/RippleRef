/**
 * Normalize /agents/refactor responses for research review (adopted or rejected).
 */

import { mergeChangeStats } from './lineDiff';
import type { RefactoringReportShape } from './refactoringReportDocument';

export type RefactorApiResponse = Record<string, unknown>;

export function normalizeReportPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

/** True when the refactor API response belongs to the file currently open in the UI. */
export function refactorResponseMatchesFile(
  data: RefactorApiResponse | null | undefined,
  selectedFilePath: string
): boolean {
  if (!data || !selectedFilePath) return true;
  const fp = String(data.filePath || '').trim();
  if (!fp) return true;
  const nSel = normalizeReportPath(selectedFilePath);
  const nFp = normalizeReportPath(fp);
  if (nFp === nSel) return true;
  if (nSel.endsWith(nFp) || nSel.endsWith('/' + nFp)) return true;
  const selBase = (selectedFilePath.split(/[/\\]/).pop() || '').toLowerCase();
  const fpBase = (fp.split(/[/\\]/).pop() || nFp).toLowerCase();
  return !!selBase && selBase === fpBase;
}

export function getLlmCandidateContent(data: RefactorApiResponse | null | undefined, original: string): string {
  if (!data) return original;
  const llm = data.llmCandidateContent ?? data.proposedContent;
  if (typeof llm === 'string' && llm.length > 0) return llm;
  if (typeof data.refactoredContent === 'string' && data.refactoredContent.length > 0) {
    return data.refactoredContent;
  }
  return original;
}

export function isIdenticalRefactorCandidate(data: RefactorApiResponse | null | undefined, original: string): boolean {
  const orig = (typeof data?.originalContent === 'string' ? data.originalContent : original) || '';
  const candidate = getLlmCandidateContent(data ?? {}, orig);
  return candidate.trim() === orig.trim();
}

export function improvementStatsFromRefactorResponse(data: RefactorApiResponse | null | undefined): {
  before: { total: number; critical: number; major: number; minor: number };
  after: { total: number; critical: number; major: number; minor: number };
  delta: { total: number; critical: number; major: number; minor: number };
} | null {
  if (!data) return null;
  const deltas = data.deltas as Record<string, unknown> | undefined;
  const steps = Array.isArray(data.steps) ? (data.steps as Array<Record<string, unknown>>) : [];
  const verifyStep = steps.find((s) => s.name === 'Verify' && s.details);
  const vd = (verifyStep?.details as Record<string, unknown>) || {};
  const ro = data.researchOutcome as Record<string, unknown> | undefined;

  let before: number | undefined =
    typeof vd.before === 'number' ? vd.before : typeof ro?.smellsBefore === 'number' ? ro.smellsBefore : typeof deltas?.before === 'number' ? deltas.before : undefined;
  let after: number | undefined =
    typeof vd.after === 'number' ? vd.after : typeof ro?.smellsAfter === 'number' ? ro.smellsAfter : typeof deltas?.after === 'number' ? deltas.after : undefined;

  if (typeof before !== 'number' || typeof after !== 'number') return null;

  const sb = (deltas?.smellsBefore as Record<string, number>) || {};
  const sa = (deltas?.smellsAfter as Record<string, number>) || {};
  return {
    before: {
      total: before,
      critical: sb.critical || 0,
      major: sb.major || 0,
      minor: sb.minor || 0,
    },
    after: {
      total: after,
      critical: sa.critical || 0,
      major: sa.major || 0,
      minor: sa.minor || 0,
    },
    delta: {
      total: before - after,
      critical: (sb.critical || 0) - (sa.critical || 0),
      major: (sb.major || 0) - (sa.major || 0),
      minor: (sb.minor || 0) - (sa.minor || 0),
    },
  };
}

export function buildResearchApplyResultPartial(
  data: RefactorApiResponse,
  original: string,
  candidate: string,
  selectedFilePath: string
): Record<string, unknown> {
  const orig = (typeof data.originalContent === 'string' ? data.originalContent : original) || original;
  const ar =
    typeof data.applyResult === 'object' && data.applyResult
      ? (data.applyResult as Record<string, unknown>)
      : null;
  const origLines = orig.split('\n').length;
  const candLines = candidate.split('\n').length;
  const partialOutput =
    candLines > 0 && origLines > 0 && candLines < Math.floor(origLines * 0.85);
  return {
    originalContent: orig,
    refactoredContent: candidate,
    llmCandidateContent: (data.llmCandidateContent as string) ?? candidate,
    runFilePath: selectedFilePath,
    responseFilePath: typeof data.filePath === 'string' ? data.filePath : null,
    deltas: data.deltas ?? null,
    steps: data.steps,
    rejected: data.rejected,
    rejectionReason: data.rejectionReason,
    verificationRejectionReasons: data.verificationRejectionReasons,
    analysisConcerns: data.analysisConcerns,
    researchOutcome: data.researchOutcome,
    failureOutcome: data.failureOutcome ?? null,
    fileSizeAssessment: data.fileSizeAssessment ?? null,
    success: data.success,
    researchMetrics: data.researchMetrics ?? null,
    pipelineMetadata: data.pipelineMetadata ?? null,
    multiLlmRuns: Array.isArray(data.multiLlmRuns) ? data.multiLlmRuns : null,
    partialLlmOutput: partialOutput,
    originalLineCount: origLines,
    candidateLineCount: candLines,
    refactoredArtifactPath: ar?.refactoredArtifactPath,
    originalArtifactPath: ar?.originalArtifactPath,
  };
}

function applyResultWithLineStats(
  partial: Record<string, unknown> | null | undefined,
  original: string,
  refactored: string
): Record<string, unknown> {
  const p = partial && typeof partial === 'object' ? partial : {};
  const orig =
    typeof p.originalContent === 'string' && p.originalContent ? p.originalContent : original;
  const ref =
    typeof p.refactoredContent === 'string' && p.refactoredContent ? p.refactoredContent : refactored;
  return {
    ...p,
    originalContent: orig,
    refactoredContent: ref,
    changes: mergeChangeStats(orig, ref, p.changes as Parameters<typeof mergeChangeStats>[2]),
  };
}

/** Merge agents/refactor payload into applyResult (interactive review + batch save). */
export function buildFullResearchApplyResult(
  data: RefactorApiResponse,
  original: string,
  selectedFilePath: string
): Record<string, unknown> {
  const candidate = getLlmCandidateContent(data, original);
  const orig =
    (typeof data.originalContent === 'string' ? data.originalContent : original) || original;
  const partial = buildResearchApplyResultPartial(data, orig, candidate, selectedFilePath);
  const withLines = applyResultWithLineStats(partial, orig, candidate);
  const report = data.refactoringReport;
  if (report != null && typeof report === 'object') {
    return { ...withLines, refactoringReport: report as RefactoringReportShape };
  }
  return withLines;
}
