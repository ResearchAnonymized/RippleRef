/**
 * Line-oriented diff used for refactoring stats and hunks.
 * Keeps behavior aligned with CodeComparison's display.
 */

export type DiffRowType = 'same' | 'add' | 'del';

export type DiffRow = {
  type: DiffRowType;
  before?: string;
  after?: string;
  bi?: number;
  ai?: number;
};

export function computeSimpleDiffRows(before: string, after: string): DiffRow[] {
  const a = (before || '').split('\n');
  const b = (after || '').split('\n');
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  const lookahead = 3;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i].trim() === b[j].trim()) {
      rows.push({ type: 'same', before: a[i], after: b[j], bi: i + 1, ai: j + 1 });
      i++;
      j++;
      continue;
    }
    if (i < a.length && j < b.length) {
      const beforeTrim = a[i].trim();
      const afterTrim = b[j].trim();
      if (
        beforeTrim.length > 0 &&
        afterTrim.length > 0 &&
        beforeTrim.length > 10 &&
        afterTrim.length > 10 &&
        beforeTrim.substring(0, Math.min(20, beforeTrim.length)) ===
          afterTrim.substring(0, Math.min(20, afterTrim.length))
      ) {
        rows.push({ type: 'add', before: a[i], after: b[j], bi: i + 1, ai: j + 1 });
        i++;
        j++;
        continue;
      }
    }
    let added = false;
    for (let k = 1; k <= lookahead && j + k < b.length; k++) {
      if (i < a.length && a[i].trim() === b[j + k].trim()) {
        rows.push({ type: 'add', after: b[j], ai: j + 1 });
        j++;
        added = true;
        break;
      }
    }
    if (added) continue;
    let deleted = false;
    for (let k = 1; k <= lookahead && i + k < a.length; k++) {
      if (j < b.length && a[i + k].trim() === b[j].trim()) {
        rows.push({ type: 'del', before: a[i], bi: i + 1 });
        i++;
        deleted = true;
        break;
      }
    }
    if (deleted) continue;
    if (i < a.length && j < b.length) {
      rows.push({ type: 'add', before: a[i], after: b[j], bi: i + 1, ai: j + 1 });
      i++;
      j++;
    } else if (i < a.length) {
      rows.push({ type: 'del', before: a[i], bi: i + 1 });
      i++;
    } else if (j < b.length) {
      rows.push({ type: 'add', after: b[j], ai: j + 1 });
      j++;
    }
  }
  return rows;
}

export type LineChangeStats = {
  added: number;
  removed: number;
  modified: number;
  linesChanged: number;
};

/** Count insertions, deletions, and on-line replacements from diff rows. */
export function lineStatsFromRows(rows: DiffRow[]): LineChangeStats {
  let added = 0;
  let removed = 0;
  let modified = 0;
  for (const r of rows) {
    if (r.type === 'del') {
      removed++;
    } else if (r.type === 'add') {
      if (r.before !== undefined && r.after !== undefined) modified++;
      else added++;
    }
  }
  return {
    added,
    removed,
    modified,
    linesChanged: added + removed + modified,
  };
}

export function computeLineDiffStats(before: string, after: string): LineChangeStats {
  return lineStatsFromRows(computeSimpleDiffRows(before, after));
}

/**
 * Merge server change payload with stats derived from actual before/after text.
 * Server often returns only { hasChanges, linesChanged, charactersChanged }, which made the UI show zeros.
 */
export type BackendChangePayload = {
  added?: number;
  removed?: number;
  modified?: number;
  linesChanged?: number;
  charactersChanged?: number;
  hasChanges?: boolean;
};

export function mergeChangeStats(
  original: string,
  refactored: string,
  backend?: BackendChangePayload | null
): LineChangeStats & Pick<BackendChangePayload, 'charactersChanged' | 'hasChanges'> {
  const computed = computeLineDiffStats(original, refactored);
  const a = backend?.added;
  const r = backend?.removed;
  const m = backend?.modified;
  const explicit =
    typeof a === 'number' &&
    typeof r === 'number' &&
    typeof m === 'number' &&
    a + r + m > 0;

  const base = explicit
    ? {
        added: a!,
        removed: r!,
        modified: m!,
        linesChanged: backend?.linesChanged ?? a! + r! + m!,
      }
    : computed;

  return {
    ...base,
    ...(typeof backend?.charactersChanged === 'number' ? { charactersChanged: backend.charactersChanged } : {}),
    ...(typeof backend?.hasChanges === 'boolean' ? { hasChanges: backend.hasChanges } : {}),
  };
}
