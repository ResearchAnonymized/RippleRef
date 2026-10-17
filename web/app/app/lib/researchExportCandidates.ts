/**
 * Build export candidate lists for research Excel — includes accepted AND rejected
 * sample files even when a full saved-report JSON is missing.
 */

import type { ExportCandidate } from './exportProjectRefactoringExcel';

type SampleManifestLike = {
  result?: {
    paths?: string[];
    picked?: Array<string | { path?: string; filePath?: string }>;
  };
};

/** Paths from research-sample-manifest (prefers result.paths, falls back to picked[].path). */
export function getResearchSamplePaths(manifest: SampleManifestLike | null | undefined): string[] {
  if (!manifest?.result) return [];
  if (manifest.result.paths?.length) return [...manifest.result.paths];
  const out: string[] = [];
  for (const item of manifest.result.picked ?? []) {
    if (typeof item === 'string') out.push(item);
    else {
      const p = item?.path ?? item?.filePath;
      if (p) out.push(p);
    }
  }
  return out;
}

export type ExpandResearchSampleOptions = {
  /**
   * When true (default for new-study exports), return ONLY paths in the current
   * research-sample manifest — do not attach older saved reports from seed-42 runs.
   */
  sampleOnly?: boolean;
};

/** Ensure every path in the research sample appears in export (150 = 15 × 10 projects). */
export function expandResearchSampleCandidates(
  candidates: ExportCandidate[],
  samplePaths: string[] | undefined,
  savedReportPaths: Set<string>,
  options: ExpandResearchSampleOptions = {}
): ExportCandidate[] {
  if (!samplePaths?.length) {
    return candidates;
  }
  const sampleOnly = options.sampleOnly !== false;
  const pickSet = new Set(samplePaths);
  const byPath = new Map(candidates.map((c) => [c.filePath, c]));
  const out: ExportCandidate[] = [];

  for (const fp of samplePaths) {
    const existing = byPath.get(fp);
    if (existing) {
      out.push(existing);
      continue;
    }
    out.push({
      filePath: fp,
      label: fp.split('/').pop() || fp,
      hasSavedReport: savedReportPaths.has(fp),
      status: savedReportPaths.has(fp) ? 'refactored' : 'rejected',
    });
  }

  if (!sampleOnly) {
    for (const c of candidates) {
      if (!pickSet.has(c.filePath) && !out.some((o) => o.filePath === c.filePath)) {
        out.push(c);
      }
    }
  }

  return out;
}
