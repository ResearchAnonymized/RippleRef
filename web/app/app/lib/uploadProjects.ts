import { apiClient, Workspace } from '../api/client';

export type BatchUploadResult = {
  succeeded: Workspace[];
  failed: Array<{ fileName: string; message: string }>;
};

/** Upload one ZIP per workspace — no PMD or assessment (run those per project later). */
export async function uploadProjectArchives(
  files: File[],
  userId?: string,
  userName?: string,
  onProgress?: (current: number, total: number, fileName: string) => void
): Promise<BatchUploadResult> {
  const succeeded: Workspace[] = [];
  const failed: BatchUploadResult['failed'] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i + 1, files.length, file.name);
    try {
      succeeded.push(await apiClient.uploadProject(file, userId, userName));
    } catch (error) {
      failed.push({
        fileName: file.name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { succeeded, failed };
}

export function formatBatchUploadSummary(result: BatchUploadResult): string {
  const lines: string[] = [];
  if (result.succeeded.length > 0) {
    lines.push(
      `Uploaded ${result.succeeded.length} project(s): ${result.succeeded.map((w) => w.name).join(', ')}`
    );
    lines.push('Run PMD analysis on each project from the Projects list when ready.');
  }
  if (result.failed.length > 0) {
    lines.push(
      `Failed (${result.failed.length}): ${result.failed.map((f) => `${f.fileName} — ${f.message}`).join('; ')}`
    );
  }
  return lines.join('\n\n');
}
