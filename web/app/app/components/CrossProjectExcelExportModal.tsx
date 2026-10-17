'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckSquare, FolderGit2, Loader2, Square, X } from 'lucide-react';
import { apiClient } from '../api/client';
import {
  buildCrossProjectRefactoringExcel,
  downloadExcelBuffer,
  mergeExportCandidates,
  parseSavedReportListResponse,
  type CrossProjectSlice,
} from '../lib/exportProjectRefactoringExcel';
import {
  buildCombinedFrontierMasterWorkbook,
  FRONTIER_MASTER_FILENAME,
} from '../lib/buildCombinedFrontierMasterExcel';
import type { FullExcelFileItem } from '../lib/buildFullResearchExcel';
import { expandResearchSampleCandidates } from '../lib/researchExportCandidates';
import { parseSavedRefactoringReportBundle } from '../lib/savedRefactoringReport';
import { loadResearchSample } from '../lib/researchSampleStorage';
import {
  saveProjectExcelToWorkspace,
  type SavedExcelExportIndex,
} from '../lib/projectExcelExportStorage';
import {
  saveCrossProjectToUserArchive,
  type SavedResearchExportIndex,
} from '../lib/userResearchArchiveStorage';
import type { WorkspaceStudyFileInput } from '../lib/exportWorkspaceStudyCsv';
import { isRefineDemo } from '../lib/refineDemoMode';

type WorkspaceOption = {
  id: string;
  label: string;
};

export type CrossProjectExportScope = 'all_saved' | 'research_sample' | 'frontier_master';

type Props = {
  userId?: string;
  storageWorkspaceId: string;
  /** Pre-select every workspace (Project Hub “export all”). */
  selectAllProjects?: boolean;
  /** Default file scope when the modal opens. */
  defaultExportScope?: CrossProjectExportScope;
  onClose: () => void;
  onSaved?: (item: SavedResearchExportIndex | SavedExcelExportIndex) => void;
};

export default function CrossProjectExcelExportModal({
  userId,
  storageWorkspaceId,
  selectAllProjects = false,
  defaultExportScope = 'all_saved',
  onClose,
  onSaved,
}: Props) {
  const refineDemo = isRefineDemo();
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportScope, setExportScope] = useState<CrossProjectExportScope>(defaultExportScope);
  const [saveToProfile, setSaveToProfile] = useState(true);
  const [saveToProject, setSaveToProject] = useState(false);
  const [alsoDownload, setAlsoDownload] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [error, setError] = useState<string | null>(null);
  const [previewCounts, setPreviewCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = userId
          ? await apiClient.listProjectProfiles(userId)
          : await apiClient.listWorkspaces();
        if (cancelled) return;
        const opts = list.map((w) => ({
          id: w.id,
          label: w.name?.trim() || w.id,
        }));
        setWorkspaces(opts);
        if (selectAllProjects && opts.length > 0) {
          setSelected(new Set(opts.map((w) => w.id)));
        } else if (storageWorkspaceId) {
          setSelected(new Set([storageWorkspaceId]));
        } else {
          setSelected(new Set());
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('Failed to fetch') || msg.includes('Network error')) {
            setError(
              'Cannot reach the REFINE backend. Start services from the repository root: ./start-refine.sh — then hard-refresh this page.'
            );
          } else {
            setError(msg);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageWorkspaceId, userId, selectAllProjects]);

  const selectedList = useMemo(
    () => workspaces.filter((w) => selected.has(w.id)),
    [workspaces, selected]
  );

  const loadSlice = useCallback(
    async (ws: WorkspaceOption): Promise<CrossProjectSlice> => {
      const [prog, listRaw, sample] = await Promise.all([
        apiClient.getProjectProgress(ws.id),
        apiClient.listSavedRefactoringReports(ws.id),
        loadResearchSample(ws.id),
      ]);
      const savedList = parseSavedReportListResponse(listRaw);
      const savedPaths = new Set(savedList.map((r) => r.filePath));
      let candidates = mergeExportCandidates(
        (prog.files ?? []) as WorkspaceStudyFileInput[],
        savedList
      );

      const samplePaths = sample?.result?.paths;
      if (exportScope === 'research_sample' && samplePaths?.length) {
        candidates = expandResearchSampleCandidates(candidates, samplePaths, savedPaths, {
          sampleOnly: true,
        });
      } else {
        candidates = candidates.filter((c) => c.hasSavedReport);
      }

      const samplePathSet = samplePaths?.length ? new Set(samplePaths) : undefined;

      return {
        workspaceId: ws.id,
        projectName: ws.label,
        sourceFolder: ws.label,
        researchSampleId: sample?.sampleId,
        samplePathSet,
        candidates,
        loadBundle: async (filePath) => {
          const raw = await apiClient.getSavedRefactoringReport(ws.id, filePath);
          return parseSavedRefactoringReportBundle(raw);
        },
      };
    },
    [exportScope]
  );

  useEffect(() => {
    if (selectedList.length === 0) {
      setPreviewCounts({});
      return;
    }
    let cancelled = false;
    (async () => {
      const counts: Record<string, number> = {};
      for (const ws of selectedList) {
        if (cancelled) return;
        try {
          const slice = await loadSlice(ws);
          counts[ws.id] = slice.candidates.length;
        } catch {
          counts[ws.id] = 0;
        }
      }
      if (!cancelled) setPreviewCounts(counts);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedList, loadSlice]);

  const totalFiles = useMemo(
    () => Object.values(previewCounts).reduce((s, n) => s + n, 0),
    [previewCounts]
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(workspaces.map((w) => w.id)));
  const selectNone = () => setSelected(new Set());

  const buildWorkbook = async (withFiles: CrossProjectSlice[]) => {
    if (exportScope === 'frontier_master') {
      const lockedSampleSlots = Object.fromEntries(
        withFiles.map((s) => [s.projectName, s.samplePathSet?.size ?? 0])
      );
      const items: FullExcelFileItem[] = [];
      let progressIdx = 0;
      const totalCandidates = withFiles.reduce((n, sl) => n + sl.candidates.length, 0);

      for (const slice of withFiles) {
        const sourceFolder = slice.sourceFolder || slice.projectName;
        for (const c of slice.candidates) {
          setProgress({
            done: progressIdx,
            total: totalCandidates,
            label: `${slice.projectName}: ${c.label}`,
          });
          progressIdx += 1;
          const bundle = await slice.loadBundle(c.filePath);
          items.push({
            filePath: c.filePath,
            fileName: c.label,
            bundle,
            savedReportId: bundle ? encodeURIComponent(c.filePath) : '',
            missingReason: bundle ? '' : 'no saved full report',
            candidate: c,
            projectName: slice.projectName,
            sourceFolder,
            workspaceId: slice.workspaceId,
            inCurrentSample: slice.samplePathSet?.has(c.filePath) ?? false,
          });
        }
      }
      setProgress({ done: totalCandidates, total: totalCandidates, label: 'Building master workbook…' });

      const combined = await buildCombinedFrontierMasterWorkbook(items, {
        lockedSampleSlots,
      });
      return {
        buffer: combined.buffer,
        filename: combined.filename,
        exported: combined.frontierFileCount,
        skipped: combined.totalFileCount - combined.frontierFileCount,
        filePaths: items.map((i) => `${i.workspaceId}:${i.filePath}`),
        projectCount: withFiles.length,
      };
    }

    return buildCrossProjectRefactoringExcel({
      slices: withFiles,
      onProgress: (done, total, label) => setProgress({ done, total, label }),
      includePerFileSheets: false,
      addProjectSummarySheets: true,
      includeResearchAnalysisSheets: !refineDemo,
    });
  };

  const handleExport = async () => {
    if (selectedList.length === 0) {
      setError('Select at least one project.');
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const slices: CrossProjectSlice[] = [];
      for (const ws of selectedList) {
        slices.push(await loadSlice(ws));
      }
      const withFiles = slices.filter((s) => s.candidates.length > 0);
      if (withFiles.length === 0) {
        setError(
          'No exportable files in selected projects. Complete refactors with saved reports first.'
        );
        return;
      }

      const built = await buildWorkbook(withFiles);

      if (saveToProfile && userId) {
        const saved = await saveCrossProjectToUserArchive(userId, built, {
          sourceWorkspaceIds: withFiles.map((s) => s.workspaceId),
          sourceProjectLabels: withFiles.map((s) => s.projectName),
          exportKind:
            exportScope === 'frontier_master' ? 'frontier_master_complete' : 'cross_project_all_saved',
        });
        if (saved) onSaved?.(saved);
        else if (!alsoDownload && !saveToProject) {
          setError(refineDemo ? 'Could not save workbook to your profile.' : 'Could not save workbook to your profile research archive.');
          return;
        }
      }

      if (saveToProject) {
        const saved = await saveProjectExcelToWorkspace(
          storageWorkspaceId,
          exportScope === 'frontier_master' ? 'frontier-master' : 'cross-project',
          built,
          {
            exportKind:
              exportScope === 'frontier_master' ? 'frontier_master_complete' : 'cross_project',
            sourceWorkspaceIds: withFiles.map((s) => s.workspaceId),
            sourceProjectLabels: withFiles.map((s) => s.projectName),
            replace: false,
          }
        );
        if (saved) onSaved?.(saved);
        else if (!alsoDownload && !saveToProfile) {
          setError('Could not save workbook to workspace.');
          return;
        }
      }

      if (alsoDownload) {
        downloadExcelBuffer(built.buffer, built.filename);
      }

      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Failed to fetch') || msg.includes('Network error')) {
        setError(
          'Cannot reach the REFINE backend. Start services from the repository root: ./start-refine.sh — then retry export.'
        );
      } else {
        setError(msg);
      }
    } finally {
      setExporting(false);
    }
  };

  const scopeHelp: Record<CrossProjectExportScope, string> = refineDemo
    ? {
        all_saved: 'Every saved full report across selected projects — metrics summary sheets and per-file detail.',
        research_sample: '',
        frontier_master: '',
      }
    : {
        all_saved:
          'Every saved full report across selected projects — metrics sheets 00–30 plus RQ analysis (24–30).',
        research_sample:
          'Only files in each project’s locked research-sample manifest (~15 per project).',
        frontier_master:
          `Frontier LLMs only — one combined file (${FRONTIER_MASTER_FILENAME}) with sheets 00–44.`,
      };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-800 border border-slate-600 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-5 h-5 text-violet-400" />
            <h2 className="text-lg font-semibold text-white">Export saved files — master Excel</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <p className="text-sm text-slate-400">
            Build one workbook from <strong className="text-slate-300">all saved refactoring reports</strong>{' '}
            in the projects you select. Download a copy
            {!refineDemo && ' and/or save to your profile research archive below'}
            {refineDemo && ' and/or save to your profile below'}.
          </p>

          {error && (
            <div className="text-sm text-red-300 bg-red-900/20 border border-red-500/30 rounded-lg p-3">
              {error}
            </div>
          )}

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              What to include
            </legend>
            {(
              refineDemo
                ? ([['all_saved', 'All saved reports (recommended)']] as const)
                : ([
                    ['all_saved', 'All saved reports (recommended)'],
                    ['frontier_master', 'Frontier LLMs — combined master (sheets 00–44)'],
                    ['research_sample', 'Research sample only (~150 files)'],
                  ] as const)
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex items-start gap-2 text-sm text-slate-300 cursor-pointer"
              >
                <input
                  type="radio"
                  name="exportScope"
                  checked={exportScope === value}
                  onChange={() => setExportScope(value)}
                  disabled={exporting}
                  className="mt-1"
                />
                <span>
                  <span className="text-white font-medium">{label}</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">{scopeHelp[value]}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={saveToProfile}
                onChange={(e) => setSaveToProfile(e.target.checked)}
                disabled={exporting || !userId}
                className="rounded border-slate-600"
              />
              Save to my profile archive
            </label>
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={alsoDownload}
                onChange={(e) => setAlsoDownload(e.target.checked)}
                disabled={exporting}
                className="rounded border-slate-600"
              />
              Download copy now
            </label>
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={saveToProject}
                onChange={(e) => setSaveToProject(e.target.checked)}
                disabled={exporting}
                className="rounded border-slate-600"
              />
              Also save to project folder
            </label>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Projects</p>
            <div className="flex gap-2 text-[11px]">
              <button
                type="button"
                onClick={selectAll}
                disabled={exporting || workspaces.length === 0}
                className="text-violet-400 hover:text-violet-300"
              >
                Select all
              </button>
              <span className="text-slate-600">|</span>
              <button
                type="button"
                onClick={selectNone}
                disabled={exporting}
                className="text-slate-400 hover:text-slate-200"
              >
                Clear
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading workspaces…
            </div>
          ) : (
            <ul className="border border-slate-700 rounded-lg divide-y divide-slate-700 max-h-56 overflow-y-auto">
              {workspaces.length === 0 ? (
                <li className="p-4 text-sm text-slate-500 text-center">No workspaces found.</li>
              ) : (
                workspaces.map((w) => {
                  const on = selected.has(w.id);
                  const count = previewCounts[w.id];
                  return (
                    <li key={w.id}>
                      <button
                        type="button"
                        onClick={() => toggle(w.id)}
                        className="w-full flex items-start gap-3 p-3 text-left hover:bg-slate-700/50"
                      >
                        {on ? (
                          <CheckSquare className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-white font-medium truncate">{w.label}</p>
                          <p className="text-[11px] text-slate-500 truncate">{w.id}</p>
                          {on && count !== undefined ? (
                            <p className="text-[10px] text-slate-400 mt-1">
                              {count} saved report{count !== 1 ? 's' : ''}
                            </p>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}

          {selectedList.length > 0 && totalFiles > 0 ? (
            <p className="text-xs text-violet-300">
              Ready to export: <strong>{totalFiles}</strong> saved file
              {totalFiles !== 1 ? 's' : ''} across {selectedList.length} project
              {selectedList.length !== 1 ? 's' : ''}
            </p>
          ) : null}

          {exporting && (
            <p className="text-xs text-blue-300">
              Building… {progress.done}/{progress.total}
              {progress.label ? ` — ${progress.label}` : ''}
            </p>
          )}
        </div>

        <div className="p-4 border-t border-slate-700 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="px-4 py-2 rounded-lg text-slate-300 hover:text-white text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={
              loading ||
              exporting ||
              selectedList.length === 0 ||
              (!saveToProfile && !saveToProject && !alsoDownload)
            }
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            Export {totalFiles > 0 ? `${totalFiles} files` : `${selectedList.length} projects`}
          </button>
        </div>
      </div>
    </div>
  );
}
