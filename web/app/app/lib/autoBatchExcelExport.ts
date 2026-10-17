/**
 * Auto-build and save Excel after a research-sample batch completes.
 */

import { apiClient } from '../api/client';
import {
  buildProjectRefactoringExcel,
  mergeExportCandidates,
  parseSavedReportListResponse,
} from './exportProjectRefactoringExcel';
import {
  saveProjectExcelToWorkspace,
  type SavedExcelExportIndex,
} from './projectExcelExportStorage';
import { parseSavedRefactoringReportBundle } from './savedRefactoringReport';
import {
  buildResearchSampleId,
  type StoredResearchSampleRecord,
} from './researchSampleStorage';
import type { ResearchSampleResult } from './researchSampling';
import type { WorkspaceStudyFileInput } from './exportWorkspaceStudyCsv';

export type BatchFileResult = {
  filePath: string;
  reportSaved: boolean;
};

export type AutoBatchExcelResult = {
  saved: SavedExcelExportIndex | null;
  exported: number;
  skipped: number;
  reason?: string;
};

function isResearchBatch(
  researchResult: ResearchSampleResult | null,
  savedResearchRecord: StoredResearchSampleRecord | null,
  stratifiedPaths: Set<string>
): boolean {
  if (researchResult || savedResearchRecord) return true;
  return stratifiedPaths.size > 0;
}

export async function autoExportAfterResearchBatch(params: {
  workspaceId: string;
  projectLabel: string;
  batchResults: BatchFileResult[];
  researchResult: ResearchSampleResult | null;
  savedResearchRecord: StoredResearchSampleRecord | null;
  stratifiedPaths: Set<string>;
}): Promise<AutoBatchExcelResult> {
  const {
    workspaceId,
    projectLabel,
    batchResults,
    researchResult,
    savedResearchRecord,
    stratifiedPaths,
  } = params;

  if (!isResearchBatch(researchResult, savedResearchRecord, stratifiedPaths)) {
    return { saved: null, exported: 0, skipped: 0, reason: 'not_research_batch' };
  }

  const withReports = batchResults.filter((r) => r.reportSaved);
  if (withReports.length === 0) {
    return { saved: null, exported: 0, skipped: 0, reason: 'no_saved_reports' };
  }

  const [prog, listRaw] = await Promise.all([
    apiClient.getProjectProgress(workspaceId),
    apiClient.listSavedRefactoringReports(workspaceId),
  ]);
  const saved = parseSavedReportListResponse(listRaw);
  const pathSet = new Set(withReports.map((r) => r.filePath));
  const candidates = mergeExportCandidates(
    (prog.files ?? []) as WorkspaceStudyFileInput[],
    saved
  ).filter((c) => pathSet.has(c.filePath));

  if (candidates.length === 0) {
    return { saved: null, exported: 0, skipped: 0, reason: 'no_candidates' };
  }

  const record = savedResearchRecord;
  const seed = record?.result.config.seed ?? researchResult?.config.seed ?? 0;
  const sampleSavedAt = record?.savedAt ?? Date.now();
  const researchSampleId =
    record?.sampleId ?? buildResearchSampleId(workspaceId, seed, sampleSavedAt);

  const built = await buildProjectRefactoringExcel({
    workspaceId,
    projectName: projectLabel,
    researchSampleId,
    candidates,
    loadBundle: async (filePath) => {
      const raw = await apiClient.getSavedRefactoringReport(workspaceId, filePath);
      return parseSavedRefactoringReportBundle(raw);
    },
  });

  const savedExport = await saveProjectExcelToWorkspace(workspaceId, projectLabel, built, {
    exportKind: 'batch_auto',
    researchSampleId,
    researchSampleSeed: seed,
    batchRunAt: Date.now(),
    replace: true,
  });

  return {
    saved: savedExport,
    exported: built.exported,
    skipped: built.skipped,
    reason: savedExport ? undefined : 'save_failed',
  };
}
