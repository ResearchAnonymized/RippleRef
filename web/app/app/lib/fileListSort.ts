/**
 * Shared file-list sorting and PMD smell counts (main browser + batch refactor).
 */

import type { FileInfo } from '../api/client';
import type { FileProgressMap } from './fileActivity';

export type FileListSortKey = 'name' | 'size' | 'type' | 'smells-asc' | 'smells-desc';

/** Workspace file list `codeSmells` = static PMD enumeration from project scan. */
export function fileStaticSmellCount(file: FileInfo): number | null {
  const v = file.codeSmells;
  return typeof v === 'number' ? v : null;
}

export function effectivePmdCount(file: FileInfo, fileProgress: FileProgressMap): number | null {
  const fromList = fileStaticSmellCount(file);
  if (fromList !== null) return fromList;
  const fp = fileProgress[file.relativePath];
  if (fp?.analyzedAt && fp.analyzedAt > 0 && fp.analysisSmellCount != null) {
    return Math.max(0, fp.analysisSmellCount);
  }
  return null;
}

export function compareFilesBySmellCount(
  a: FileInfo,
  b: FileInfo,
  direction: 'asc' | 'desc',
  fileProgress: FileProgressMap
): number {
  const aN = effectivePmdCount(a, fileProgress);
  const bN = effectivePmdCount(b, fileProgress);
  if (aN === null && bN === null) return a.name.localeCompare(b.name);
  if (aN === null) return 1;
  if (bN === null) return -1;
  if (aN !== bN) return direction === 'asc' ? aN - bN : bN - aN;
  return a.name.localeCompare(b.name);
}

export function sortFileInfos(
  files: FileInfo[],
  sortBy: FileListSortKey,
  fileProgress: FileProgressMap
): FileInfo[] {
  const copy = [...files];
  copy.sort((a, b) => {
    switch (sortBy) {
      case 'size':
        return (b.metrics?.linesOfCode || 0) - (a.metrics?.linesOfCode || 0);
      case 'name':
        return a.name.localeCompare(b.name);
      case 'type': {
        const aType = a.name.split('.').pop() || '';
        const bType = b.name.split('.').pop() || '';
        return aType.localeCompare(bType);
      }
      case 'smells-asc':
        return compareFilesBySmellCount(a, b, 'asc', fileProgress);
      case 'smells-desc':
        return compareFilesBySmellCount(a, b, 'desc', fileProgress);
      default:
        return 0;
    }
  });
  return copy;
}

export function filterJavaFilesForBatch(
  files: FileInfo[],
  opts: {
    searchTerm: string;
    onlySmelly: boolean;
    fileProgress: FileProgressMap;
    excludeTestPaths?: boolean;
  }
): FileInfo[] {
  const q = opts.searchTerm.trim().toLowerCase();
  return files.filter((file) => {
    if (!file.name.endsWith('.java')) return false;
    if (opts.excludeTestPaths !== false) {
      const p = file.relativePath.replace(/\\/g, '/').toLowerCase();
      if (p.includes('/test/') || p.includes('/tests/')) return false;
    }
    const pmd = effectivePmdCount(file, opts.fileProgress);
    if (opts.onlySmelly && (pmd === null || pmd <= 0)) return false;
    if (!q) return true;
    return (
      file.name.toLowerCase().includes(q) ||
      file.relativePath.toLowerCase().includes(q)
    );
  });
}
