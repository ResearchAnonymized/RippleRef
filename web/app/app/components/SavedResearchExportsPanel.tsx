'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  Download,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  formatExcelExportSize,
  formatExcelExportWhen,
} from '../lib/projectExcelExportStorage';
import {
  deleteUserResearchExport,
  downloadUserResearchExport,
  listUserResearchExports,
  type SavedResearchExportIndex,
} from '../lib/userResearchArchiveStorage';

const STORAGE_KEY = 'refactai-research-exports-panel-collapsed';

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

type Props = {
  userId: string;
  refreshKey?: number;
  onCrossProjectExport?: () => void;
};

export default function SavedResearchExportsPanel({
  userId,
  refreshKey = 0,
  onCrossProjectExport,
}: Props) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(false));
  const [loading, setLoading] = useState(true);
  const [exports, setExports] = useState<SavedResearchExportIndex[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listUserResearchExports(userId);
      setExports(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

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

  const handleDownload = async (item: SavedResearchExportIndex) => {
    setDownloadingId(item.exportId);
    setError(null);
    try {
      await downloadUserResearchExport(userId, item.exportId, item.filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (item: SavedResearchExportIndex) => {
    if (!window.confirm(`Delete "${item.filename}" from your profile archive?`)) return;
    setDeletingId(item.exportId);
    setError(null);
    try {
      const ok = await deleteUserResearchExport(userId, item.exportId);
      if (!ok) throw new Error('Delete failed');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-violet-500/30 overflow-hidden">
      <button
        type="button"
        onClick={toggleCollapsed}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-700/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Archive className="w-5 h-5 text-violet-400 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-white font-semibold">Profile research archive</h3>
            <p className="text-xs text-slate-400 truncate">
              Cross-project workbooks · persisted until you delete
              {exports.length > 0 ? ` · ${exports.length} export${exports.length !== 1 ? 's' : ''}` : ''}
            </p>
          </div>
        </div>
        <span className="text-slate-500 text-xs shrink-0">{collapsed ? 'Show' : 'Hide'}</span>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700/80">
          <div className="flex flex-wrap gap-2 pt-3">
            {onCrossProjectExport && (
              <button
                type="button"
                onClick={onCrossProjectExport}
                className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white"
              >
                New cross-project export
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
              Loading archive…
            </div>
          ) : exports.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">
              No cross-project workbooks saved yet. Use{' '}
              <strong className="text-slate-400">Export all projects</strong> to build a master
              workbook with all 15 research-metric sections.
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
                      {formatExcelExportWhen(item.savedAt)} · {item.exportedCount} files exported
                      {item.skippedCount > 0 ? ` · ${item.skippedCount} skipped` : ''} ·{' '}
                      {formatExcelExportSize(item.sizeBytes)}
                    </p>
                    {item.projectLabels && item.projectLabels.length > 0 ? (
                      <p className="text-[10px] text-violet-300/90 mt-0.5 truncate" title={item.projectLabels.join(', ')}>
                        {item.projectLabels.length} project{item.projectLabels.length !== 1 ? 's' : ''}:{' '}
                        {item.projectLabels.slice(0, 3).join(', ')}
                        {item.projectLabels.length > 3 ? '…' : ''}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => void handleDownload(item)}
                      disabled={downloadingId === item.exportId}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-1"
                      title="Download"
                    >
                      {downloadingId === item.exportId ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(item)}
                      disabled={deletingId === item.exportId}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-900/60 text-red-300 flex items-center"
                      title="Delete from archive"
                    >
                      {deletingId === item.exportId ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
