import { apiClient } from '../api/client';

/** Files per HTTP request — keeps each batch under a few minutes and survives backend restarts between batches. */
export const PMD_SCAN_BATCH_SIZE = 300;

export type PmdScanProgress = (done: number, total: number) => void;

/** Run persisted PMD across all Java sources in a workspace (batched). */
export async function runFullWorkspacePmdScan(
  workspaceId: string,
  javaSourceCount: number,
  onProgress?: PmdScanProgress
): Promise<Awaited<ReturnType<typeof apiClient.scanWorkspacePmd>>> {
  if (javaSourceCount <= 0) {
    return {
      totalJavaSourceFiles: 0,
      filesScanned: 0,
      totalSmells: 0,
      truncated: false,
      durationMs: 0,
    };
  }

  let filesScanned = 0;
  let totalSmells = 0;
  let durationMs = 0;
  let totalJavaSourceFiles = javaSourceCount;

  for (let offset = 0; offset < javaSourceCount; offset += PMD_SCAN_BATCH_SIZE) {
    const batchSize = Math.min(PMD_SCAN_BATCH_SIZE, javaSourceCount - offset);
    onProgress?.(offset, javaSourceCount);
    const batch = await apiClient.scanWorkspacePmd(workspaceId, batchSize, offset);
    totalJavaSourceFiles = batch.totalJavaSourceFiles;
    filesScanned += batch.filesScanned;
    totalSmells += batch.totalSmells;
    durationMs += batch.durationMs;
    onProgress?.(Math.min(offset + batchSize, totalJavaSourceFiles), totalJavaSourceFiles);
  }

  return {
    totalJavaSourceFiles,
    filesScanned,
    totalSmells,
    truncated: false,
    durationMs,
  };
}

/** After upload / project open — scan every Java source file when count is known. */
export async function bootstrapWorkspacePmdIfNeeded(
  workspaceId: string,
  javaSourceCount: number
): Promise<void> {
  await runFullWorkspacePmdScan(workspaceId, javaSourceCount);
}
