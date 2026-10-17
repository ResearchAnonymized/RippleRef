'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FolderGit2,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import {
  downloadSavedExcelExport,
  formatExcelExportSize,
  formatExcelExportWhen,
  listSavedExcelExports,
  type SavedExcelExportIndex,
} from '../lib/projectExcelExportStorage';

const STORAGE_KEY = 'refactai-excel-exports-panel-collapsed';

function readCollapsed(defaultCollapsed: boolean): boolean {
  if (typeof window === 'undefined') return defaultCollapsed;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* ignore */
  }
  return defaultCollapsed;
}

function exportKindLabel(kind?: string): string {
  switch (kind) {
    case 'batch_auto':
      return 'Auto (batch)';
    case 'cross_project':
      return 'Cross-project';
    default:
      return 'Manual';
  }
}

type Props = {
  workspaceId: string;
  onNewExport?: () => void;
  onCrossProjectExport?: () => void;
  refreshKey?: number;
};

export default function SavedExcelExportsPanel({
  workspaceId,
  onNewExport,
  onCrossProjectExport,
  refreshKey = 0,
}: Props) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(false));
  const [loading, setLoading] = useState(true);
  const [exports, setExports] = useState<SavedExcelExportIndex[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listSavedExcelExports(workspaceId);
      setExports(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const handleDownload = async (item: SavedExcelExportIndex) => {
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
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <button
        type="button"
        onClick={toggleCollapsed}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-700/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileSpreadsheet className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-white font-semibold">Analysis exports (Excel)</h3>
            <p className="text-xs text-slate-400 truncate">
              Saved in <code className="text-slate-300">.refactai/exports/excel/</code>
              {exports.length > 0 ? ` · ${exports.length} workbook${exports.length !== 1 ? 's' : ''}` : ''}
            </p>
          </div>
        </div>
        <span className="text-slate-500 text-xs shrink-0">{collapsed ? 'Show' : 'Hide'}</span>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700/80">
          <div className="flex flex-wrap gap-2 pt-3">
            {onNewExport && (
              <button
                type="button"
                onClick={onNewExport}
                className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                New export
              </button>
            )}
            {onCrossProjectExport && (
              <button
                type="button"
                onClick={onCrossProjectExport}
                className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white flex items-center gap-1.5"
              >
                <FolderGit2 className="w-3.5 h-3.5" />
                Cross-project merge
              </button>
            )}
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-300 bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {loading && exports.length === 0 ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading saved exports…
            </div>
          ) : exports.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">
              No Excel workbooks saved yet. Run a research batch (auto-saves) or use{' '}
              <strong className="text-slate-400">New export</strong>.
            </p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {exports.map((item) => (
                <li
                  key={item.exportId}
                  className="flex items-start justify-between gap-3 bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">{item.filename}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {formatExcelExportWhen(item.savedAt)} · {exportKindLabel(item.exportKind)} ·{' '}
                      {item.fileCount} files · {formatExcelExportSize(item.sizeBytes)}
                    </p>
                    {item.researchSampleId ? (
                      <p className="text-[10px] text-violet-300/90 truncate mt-0.5" title={item.researchSampleId}>
                        Sample: {item.researchSampleId}
                      </p>
                    ) : null}
                    {item.sourceWorkspaceIds && item.sourceWorkspaceIds.length > 1 ? (
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {item.sourceWorkspaceIds.length} projects merged
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDownload(item)}
                    disabled={downloadingId === item.exportId}
                    className="shrink-0 text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-1"
                  >
                    {downloadingId === item.exportId ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    Download
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
