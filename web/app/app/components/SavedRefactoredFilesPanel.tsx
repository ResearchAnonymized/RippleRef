'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileCode,
  FileSpreadsheet,
  FolderOpen,
  XCircle,
} from 'lucide-react';
import type { FileInfo } from '../api/client';
import type { FileActivity } from '../lib/fileActivity';

const STORAGE_KEY = 'refactai-refactored-panel-collapsed';

function readCollapsedPreference(defaultCollapsed: boolean): boolean {
  if (typeof window === 'undefined') return defaultCollapsed;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch {
    /* ignore */
  }
  return defaultCollapsed;
}

export type RefactoredFileEntry = {
  file: FileInfo;
  activity: FileActivity;
};

type SavedRefactoredFilesPanelProps = {
  entries: RefactoredFileEntry[];
  onOpenFile: (relativePath: string) => void;
  onShowAll?: () => void;
  onExportExcel?: () => void;
  compact?: boolean;
  /** When true, panel starts collapsed (Files tab). Preference is remembered in localStorage. */
  defaultCollapsed?: boolean;
};

function formatWhen(ts: number | null | undefined): string {
  if (!ts || ts <= 0) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export default function SavedRefactoredFilesPanel({
  entries,
  onOpenFile,
  onShowAll,
  onExportExcel,
  compact = false,
  defaultCollapsed = false,
}: SavedRefactoredFilesPanelProps) {
  const [collapsed, setCollapsed] = useState(() =>
    readCollapsedPreference(compact ? true : defaultCollapsed)
  );

  const { accepted, rejected } = useMemo(() => {
    let a = 0;
    let r = 0;
    for (const e of entries) {
      if (e.activity.status === 'rejected') r += 1;
      else a += 1;
    }
    return { accepted: a, rejected: r };
  }, [entries]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  if (entries.length === 0) return null;

  const hasMixed = accepted > 0 && rejected > 0;

  return (
    <div
      className={`rounded-xl border ${
        hasMixed || rejected > 0
          ? 'border-slate-600/60 bg-slate-900/40'
          : 'border-green-500/40 bg-green-950/30'
      } ${compact ? 'p-3' : 'p-4'}`}
    >
      <div
        className={`flex flex-wrap items-start justify-between gap-2 ${collapsed ? '' : 'mb-3'}`}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center gap-2 min-w-0 text-left group flex-1"
          aria-expanded={!collapsed}
          aria-controls="refactored-files-list"
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0 group-hover:text-slate-200" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400 shrink-0 group-hover:text-slate-200" />
          )}
          <FileCode className="w-5 h-5 text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <h3 className={`font-semibold text-white ${compact ? 'text-sm' : 'text-base'}`}>
              Refactoring outcomes ({entries.length})
            </h3>
            {!collapsed && (
              <p className="text-xs text-slate-400 mt-0.5">
                {accepted > 0 && (
                  <span>
                    <span className="text-green-400">{accepted} accepted</span>
                    {' → '}
                    <code className="text-green-300/80">.refactai/refactored/</code>
                  </span>
                )}
                {accepted > 0 && rejected > 0 && ' · '}
                {rejected > 0 && (
                  <span>
                    <span className="text-red-400">{rejected} rejected</span>
                    {' → '}
                    <code className="text-red-300/80">.refactai/rejected/</code>
                  </span>
                )}
              </p>
            )}
            {collapsed && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                Click to expand · {accepted} accepted
                {rejected > 0 ? `, ${rejected} rejected` : ''}
              </p>
            )}
          </div>
        </button>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onExportExcel && (
            <button
              type="button"
              onClick={onExportExcel}
              className="text-xs px-2.5 py-1 rounded-md font-medium border border-violet-500/40 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25 flex items-center gap-1"
              title="One .xlsx workbook: Overview sheet + one sheet per file"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Excel
            </button>
          )}
          {onShowAll && !collapsed && (
            <button
              type="button"
              onClick={onShowAll}
              className="text-xs text-cyan-300 hover:text-cyan-200 underline-offset-2 hover:underline"
            >
              Filter file list
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <ul
          id="refactored-files-list"
          className={`space-y-2 ${compact ? 'max-h-48' : 'max-h-64'} overflow-y-auto`}
        >
          {entries.map(({ file, activity }) => {
            const when = formatWhen(activity.savedToProjectAt ?? activity.lastRefactorAt);
            const isRejected = activity.status === 'rejected';
            const savedHint = activity.refactoredArtifactPath
              ? isRejected
                ? 'rejected candidate saved'
                : 'applied copy saved'
              : null;
            const reason = activity.rejectionReason
              ? String(activity.rejectionReason).split(',')[0].trim()
              : null;

            return (
              <li
                key={file.relativePath}
                className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${
                  isRejected
                    ? 'border-red-500/25 bg-red-950/20'
                    : 'border-green-500/20 bg-slate-900/50'
                }`}
              >
                {isRejected ? (
                  <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm text-white font-medium truncate" title={file.relativePath}>
                      {file.name}
                    </p>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        isRejected
                          ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                          : 'bg-green-500/20 text-green-300 border border-green-500/30'
                      }`}
                    >
                      {isRejected ? 'Rejected' : 'Accepted'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate" title={file.relativePath}>
                    {file.relativePath}
                  </p>
                  {isRejected && reason && (
                    <p className="text-[10px] text-red-300/80 mt-0.5 truncate" title={reason}>
                      {reason}
                    </p>
                  )}
                  {savedHint && (
                    <p className="text-[10px] text-slate-500 mt-0.5">{savedHint}</p>
                  )}
                </div>
                {when && <span className="text-[10px] text-slate-500 shrink-0">{when}</span>}
                <button
                  type="button"
                  onClick={() => onOpenFile(file.relativePath)}
                  className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-white transition-colors ${
                    isRejected ? 'bg-red-700 hover:bg-red-600' : 'bg-green-600 hover:bg-green-500'
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Open
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
