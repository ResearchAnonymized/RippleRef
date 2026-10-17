/**
 * Git-style unified diff (same family as `git diff` / unified format).
 * Uses the `diff` package (Myers algorithm), not the UI heuristic in lineDiff.ts.
 */
import { createTwoFilesPatch } from 'diff';

export type UnifiedDiffOptions = {
  /** Shown in ---/+++ headers, e.g. org/example/Foo.java */
  fileLabel?: string;
  /** Lines of context around each hunk (git default is 3). */
  context?: number;
};

export function buildGitUnifiedDiff(
  before: string,
  after: string,
  options: UnifiedDiffOptions = {}
): string {
  const { fileLabel = 'Source.java', context = 3 } = options;
  const oldPath = `a/${fileLabel}`;
  const newPath = `b/${fileLabel}`;
  return createTwoFilesPatch(oldPath, newPath, before ?? '', after ?? '', '', '', { context });
}
