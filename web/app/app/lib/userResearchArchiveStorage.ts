/**
 * User profile research archive — persists until explicitly deleted.
 */

import { apiClient } from '../api/client';

export type SavedResearchExportIndex = {
  exportId: string;
  filename: string;
  savedAt: number;
  sizeBytes: number;
  fileCount: number;
  exportedCount: number;
  skippedCount: number;
  exportKind?: string;
  projectLabels?: string[];
  workspaceIds?: string[];
};

export async function listUserResearchExports(userId: string): Promise<SavedResearchExportIndex[]> {
  try {
    const res = await apiClient.listUserResearchExports(userId);
    return (res.exports ?? []).map((e) => ({
      exportId: e.exportId,
      filename: e.filename,
      savedAt: e.savedAt,
      sizeBytes: e.sizeBytes,
      fileCount: e.fileCount,
      exportedCount: e.exportedCount,
      skippedCount: e.skippedCount,
      exportKind: e.exportKind,
      projectLabels: e.projectLabels,
      workspaceIds: e.workspaceIds,
    }));
  } catch {
    return [];
  }
}

export async function saveCrossProjectToUserArchive(
  userId: string,
  built: { buffer: ArrayBuffer; filename: string; exported: number; skipped: number; filePaths: string[] },
  meta: {
    sourceProjectLabels: string[];
    sourceWorkspaceIds: string[];
    indexJson?: string;
  }
): Promise<SavedResearchExportIndex | null> {
  const blob = new Blob([built.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const file = new File([blob], built.filename, { type: blob.type });
  const indexBlob = meta.indexJson
    ? new File([meta.indexJson], 'files_index.json', { type: 'application/json' })
    : undefined;
  try {
    const res = await apiClient.saveUserResearchExport(userId, file, {
      filename: built.filename,
      savedAt: Date.now(),
      fileCount: built.filePaths.length,
      exportedCount: built.exported,
      skippedCount: built.skipped,
      exportKind: 'cross_project',
      sourceProjectLabels: meta.sourceProjectLabels,
      sourceWorkspaceIds: meta.sourceWorkspaceIds,
      fullMetrics: true,
      exportVersion: 2,
    }, indexBlob);
    return {
      exportId: res.exportId,
      filename: res.filename,
      savedAt: res.savedAt,
      sizeBytes: res.sizeBytes,
      fileCount: built.filePaths.length,
      exportedCount: built.exported,
      skippedCount: built.skipped,
      exportKind: 'cross_project',
      projectLabels: meta.sourceProjectLabels,
      workspaceIds: meta.sourceWorkspaceIds,
    };
  } catch (e) {
    console.warn('Could not save to user research archive', e);
    return null;
  }
}

export async function downloadUserResearchExport(
  userId: string,
  exportId: string,
  filename: string
): Promise<void> {
  const buffer = await apiClient.downloadUserResearchExport(userId, exportId);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function deleteUserResearchExport(userId: string, exportId: string): Promise<boolean> {
  try {
    await apiClient.deleteUserResearchExport(userId, exportId);
    return true;
  } catch {
    return false;
  }
}
