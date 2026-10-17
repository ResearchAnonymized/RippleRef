'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, FileSpreadsheet, CheckSquare, Square, Loader2, Download, Save } from 'lucide-react';
import { apiClient } from '../api/client';
import {
  mergeExportCandidates,
  buildProjectRefactoringExcel,
  downloadExcelBuffer,
  parseSavedReportListResponse,
  type ExportCandidate,
} from '../lib/exportProjectRefactoringExcel';
import {
  downloadSavedExcelExport,
  formatExcelExportSize,
  formatExcelExportWhen,
  listSavedExcelExports,
  saveProjectExcelToWorkspace,
  type SavedExcelExportIndex,
} from '../lib/projectExcelExportStorage';
import { parseSavedRefactoringReportBundle } from '../lib/savedRefactoringReport';
import { loadResearchSample } from '../lib/researchSampleStorage';
import { expandResearchSampleCandidates } from '../lib/researchExportCandidates';
import type { WorkspaceStudyFileInput } from '../lib/exportWorkspaceStudyCsv';
import { isRefineDemo } from '../lib/refineDemoMode';

type FilterMode = 'research_sample' | 'saved_reports' | 'refactored' | 'any_result' | 'all_listed';

type Props = {
  workspaceId: string;
  projectName?: string;
  onClose: () => void;
  onSaved?: () => void;
};

export default function ProjectRefactoringExcelExportModal({
  workspaceId,
  projectName,
  onClose,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ExportCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const refineDemo = isRefineDemo();
  const [filterMode, setFilterMode] = useState<FilterMode>(
    refineDemo ? 'saved_reports' : 'research_sample'
  );
  const [maxFiles, setMaxFiles] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, file: '' });
  const [saveToProject, setSaveToProject] = useState(true);
  const [alsoDownload, setAlsoDownload] = useState(true);
  const [savedExports, setSavedExports] = useState<SavedExcelExportIndex[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [researchSampleId, setResearchSampleId] = useState<string | undefined>();
  const [samplePaths, setSamplePaths] = useState<string[]>([]);

  useEffect(() => {
    void loadResearchSample(workspaceId).then((record) => {
      if (record?.sampleId) setResearchSampleId(record.sampleId);
    });
  }, [workspaceId]);

  const refreshSavedExports = useCallback(async () => {
    const list = await listSavedExcelExports(workspaceId);
    setSavedExports(list);
  }, [workspaceId]);

  useEffect(() => {
    void refreshSavedExports();
  }, [refreshSavedExports]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [prog, listRaw, sample] = await Promise.all([
          apiClient.getProjectProgress(workspaceId),
          apiClient.listSavedRefactoringReports(workspaceId),
          loadResearchSample(workspaceId),
        ]);
        const saved = parseSavedReportListResponse(listRaw);
        const savedPaths = new Set(saved.map((r) => r.filePath));
        let merged = mergeExportCandidates(
          (prog.files ?? []) as WorkspaceStudyFileInput[],
          saved
        );
        if (sample?.result?.paths?.length) {
          merged = expandResearchSampleCandidates(merged, sample.result.paths, savedPaths, {
            sampleOnly: true,
          });
          setSamplePaths(sample.result.paths);
          if (sample.sampleId) setResearchSampleId(sample.sampleId);
        } else {
          setSamplePaths([]);
        }
        if (!cancelled) {
          setCandidates(merged);
          const defaultSel =
            sample?.result?.paths?.length
              ? sample.result.paths.filter((fp) => merged.some((c) => c.filePath === fp))
              : merged.filter((c) => c.hasSavedReport).map((c) => c.filePath);
          setSelected(new Set(defaultSel));
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const filtered = useMemo(() => {
    switch (filterMode) {
      case 'research_sample':
        if (!samplePaths.length) return candidates;
        return candidates.filter((c) => samplePaths.includes(c.filePath));
      case 'saved_reports':
        return candidates.filter((c) => c.hasSavedReport);
      case 'refactored':
        return candidates.filter((c) => c.status === 'refactored');
      case 'any_result':
        return candidates;
      default:
        return candidates;
    }
  }, [candidates, filterMode, samplePaths]);

  const visiblePaths = useMemo(() => filtered.map((c) => c.filePath), [filtered]);

  const toggle = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAllVisible = () => setSelected(new Set(visiblePaths));
  const selectNone = () => setSelected(new Set());

  const applyMaxCap = useCallback(
    (paths: string[]) => {
      const cap = parseInt(maxFiles, 10);
      if (!Number.isFinite(cap) || cap <= 0) return paths;
      return paths.slice(0, cap);
    },
    [maxFiles]
  );

  const handleExport = async () => {
    const paths = applyMaxCap(Array.from(selected).filter((p) => visiblePaths.includes(p)));
    if (paths.length === 0) {
      setError('Select at least one file to export.');
      return;
    }
    setExporting(true);
    setError(null);
    setLastSavedId(null);
    try {
      const pick = candidates.filter((c) => paths.includes(c.filePath));
      const built = await buildProjectRefactoringExcel({
        workspaceId,
        projectName,
        researchSampleId,
        candidates: pick,
        loadBundle: async (filePath) => {
          const raw = await apiClient.getSavedRefactoringReport(workspaceId, filePath);
          return parseSavedRefactoringReportBundle(raw);
        },
        onProgress: (done, total, filePath) => setProgress({ done, total, file: filePath }),
      });

      if (saveToProject) {
        const saved = await saveProjectExcelToWorkspace(workspaceId, projectName, built, {
          exportKind: 'manual',
          researchSampleId,
        });
        if (saved) {
          setLastSavedId(saved.exportId);
          await refreshSavedExports();
          onSaved?.();
        } else if (!alsoDownload) {
          setError('Could not save Excel to project. Try again or enable download copy.');
        }
      }

      if (alsoDownload) {
        downloadExcelBuffer(built.buffer, built.filename);
      }

      if (built.skipped > 0 && built.exported === 0) {
        setError(
          'No full saved reports found for selected files. Complete a refactor and save the report first.'
        );
      } else if (saveToProject || alsoDownload) {
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadSaved = async (item: SavedExcelExportIndex) => {
    setDownloadingId(item.exportId);
    setError(null);
    try {
      await downloadSavedExcelExport(workspaceId, item.exportId, item.filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-800 border border-slate-600 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Export refactoring to Excel</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <p className="text-sm text-slate-400">
            Creates one <strong className="text-slate-300">.xlsx</strong> workbook for{' '}
            <span className="text-white">{projectName || workspaceId}</span>: an{' '}
            <strong className="text-slate-300">Overview</strong> sheet plus one sheet per selected
            file (metrics, smells, refactorings, code preview). Exports can be{' '}
            <strong className="text-slate-300">saved in the project</strong> (
            <code className="text-slate-300">.refactai/exports/excel/</code>) and downloaded later.
          </p>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={saveToProject}
                onChange={(e) => setSaveToProject(e.target.checked)}
                disabled={exporting}
                className="rounded border-slate-600"
              />
              <Save className="w-4 h-4 text-emerald-400" />
              Save to project
            </label>
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={alsoDownload}
                onChange={(e) => setAlsoDownload(e.target.checked)}
                disabled={exporting}
                className="rounded border-slate-600"
              />
              <Download className="w-4 h-4 text-slate-400" />
              Also download copy
            </label>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading saved reports and file progress…
            </div>
          )}

          {error && (
            <div className="text-sm text-red-300 bg-red-900/20 border border-red-500/30 rounded-lg p-3">
              {error}
            </div>
          )}

          {!loading && (
            <>
              <div className="flex flex-wrap gap-3 items-end">
                <label className="text-sm text-slate-400">
                  Show
                  <select
                    value={filterMode}
                    onChange={(e) => setFilterMode(e.target.value as FilterMode)}
                    className="mt-1 block w-full min-w-[200px] bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  >
                    {!refineDemo ? (
                      <option value="research_sample">Research sample (all 15 files)</option>
                    ) : null}
                    <option value="saved_reports">Files with full saved report</option>
                    <option value="refactored">Refactored status only</option>
                    <option value="any_result">Any file with refactor activity</option>
                  </select>
                </label>
                <label className="text-sm text-slate-400">
                  Max files (optional)
                  <input
                    type="number"
                    min={1}
                    placeholder="All selected"
                    value={maxFiles}
                    onChange={(e) => setMaxFiles(e.target.value)}
                    className="mt-1 block w-28 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={selectAllVisible}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white"
                >
                  Select all shown ({visiblePaths.length})
                </button>
                <button
                  type="button"
                  onClick={selectNone}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white"
                >
                  Clear selection
                </button>
                <span className="text-xs text-slate-500 self-center">
                  {selected.size} selected for export
                </span>
              </div>

              <ul className="border border-slate-700 rounded-lg divide-y divide-slate-700 max-h-64 overflow-y-auto">
                {filtered.length === 0 ? (
                  <li className="p-4 text-sm text-slate-500 text-center">
                    No files match this filter. Save a full refactoring report from the Review step
                    first.
                  </li>
                ) : (
                  filtered.map((c) => {
                    const on = selected.has(c.filePath);
                    return (
                      <li key={c.filePath}>
                        <button
                          type="button"
                          onClick={() => toggle(c.filePath)}
                          className="w-full flex items-start gap-3 p-3 text-left hover:bg-slate-700/50 transition-colors"
                        >
                          {on ? (
                            <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-white font-medium truncate">{c.label}</p>
                            <p className="text-[11px] text-slate-500 truncate">{c.filePath}</p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {c.hasSavedReport ? 'Full report' : 'Progress only'} ·{' '}
                              {c.status || '—'} · smells {c.smellsBefore ?? '?'} →{' '}
                              {c.smellsAfter ?? '?'}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>

              {exporting && (
                <p className="text-xs text-blue-300">
                  Building Excel… {progress.done}/{progress.total}
                  {progress.file ? ` — ${progress.file.split('/').pop()}` : ''}
                </p>
              )}

              {savedExports.length > 0 ? (
                <div className="border border-slate-700 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-slate-300 uppercase tracking-wide">
                    Saved in project ({savedExports.length})
                  </p>
                  <ul className="space-y-1 max-h-36 overflow-y-auto">
                    {savedExports.map((item) => (
                      <li
                        key={item.exportId}
                        className="flex items-center justify-between gap-2 text-xs bg-slate-900/40 rounded px-2 py-1.5"
                      >
                        <div className="min-w-0">
                          <p className="text-slate-200 truncate">{item.filename}</p>
                          <p className="text-slate-500">
                            {formatExcelExportWhen(item.savedAt)} · {item.fileCount} files ·{' '}
                            {formatExcelExportSize(item.sizeBytes)}
                            {lastSavedId === item.exportId ? ' · just saved' : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDownloadSaved(item)}
                          disabled={downloadingId === item.exportId}
                          className="shrink-0 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-1"
                        >
                          {downloadingId === item.exportId ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                          Download
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
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
              loading || exporting || selected.size === 0 || (!saveToProject && !alsoDownload)
            }
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium flex items-center gap-2"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            {saveToProject && alsoDownload
              ? `Save & download ${selected.size} file${selected.size !== 1 ? 's' : ''}`
              : saveToProject
                ? `Save ${selected.size} file${selected.size !== 1 ? 's' : ''} to project`
                : `Download ${selected.size} file${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
