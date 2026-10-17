/**
 * Persist and retrieve project Excel exports from workspace storage.
 */

import { apiClient } from '../api/client';

export type SavedExcelExportIndex = {
  exportId: string;
  filename: string;
  savedAt: number;
  sizeBytes: number;
  fileCount: number;
  exportedCount: number;
  skippedCount: number;
  projectLabel?: string;
  exportKind?: 'manual' | 'batch_auto' | 'cross_project';
  researchSampleId?: string;
  sourceWorkspaceIds?: string[];
};

export type ExcelExportSaveOptions = {
  exportKind?: 'manual' | 'batch_auto' | 'cross_project';
  researchSampleId?: string;
  researchSampleSeed?: number;
  batchRunAt?: number;
  sourceWorkspaceIds?: string[];
  sourceProjectLabels?: string[];
  /** When true, delete prior exports in workspace folder before saving */
  replace?: boolean;
};

type BuiltProjectExcel = {
  buffer: ArrayBuffer;
  filename: string;
  exported: number;
  skipped: number;
  filePaths: string[];
};

export async function listSavedExcelExports(
  workspaceId: string
): Promise<SavedExcelExportIndex[]> {
  try {
    const res = await apiClient.listExcelExports(workspaceId);
    return (res.exports ?? []).map((e) => ({
      ...e,
      exportKind: (e.exportKind as SavedExcelExportIndex['exportKind']) ?? 'manual',
    }));
  } catch {
    return [];
  }
}

export async function saveProjectExcelToWorkspace(
  workspaceId: string,
  projectLabel: string | undefined,
  built: BuiltProjectExcel,
  options?: ExcelExportSaveOptions
): Promise<SavedExcelExportIndex | null> {
  const savedAt = Date.now();
  const metadata: Record<string, unknown> = {
    filename: built.filename,
    savedAt,
    projectLabel: projectLabel ?? workspaceId,
    fileCount: built.filePaths.length,
    exportedCount: built.exported,
    skippedCount: built.skipped,
    filePaths: built.filePaths,
    exportKind: options?.exportKind ?? 'manual',
  };
  if (options?.researchSampleId) metadata.researchSampleId = options.researchSampleId;
  if (options?.researchSampleSeed != null) metadata.researchSampleSeed = options.researchSampleSeed;
  if (options?.batchRunAt != null) metadata.batchRunAt = options.batchRunAt;
  if (options?.sourceWorkspaceIds?.length) metadata.sourceWorkspaceIds = options.sourceWorkspaceIds;
  if (options?.sourceProjectLabels?.length) metadata.sourceProjectLabels = options.sourceProjectLabels;
  const blob = new Blob([built.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const file = new File([blob], built.filename, { type: blob.type });
  try {
    const res = await apiClient.saveExcelExport(workspaceId, file, metadata, options?.replace ?? false);
    return {
      exportId: res.exportId,
      filename: res.filename,
      savedAt: res.savedAt,
      sizeBytes: res.sizeBytes,
      fileCount: res.fileCount,
      exportedCount: res.exportedCount,
      skippedCount: res.skippedCount,
      projectLabel: projectLabel ?? workspaceId,
      exportKind: (options?.exportKind ?? 'manual') as SavedExcelExportIndex['exportKind'],
      researchSampleId: options?.researchSampleId,
      sourceWorkspaceIds: options?.sourceWorkspaceIds,
    };
  } catch (e) {
    console.warn('Could not save Excel export to workspace', e);
    return null;
  }
}

export async function downloadSavedExcelExport(
  workspaceId: string,
  exportId: string,
  filename: string
): Promise<void> {
  const buffer = await apiClient.downloadExcelExport(workspaceId, exportId);
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

export function formatExcelExportSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatExcelExportWhen(savedAt: number): string {
  try {
    return new Date(savedAt).toLocaleString();
  } catch {
    return String(savedAt);
  }
}
