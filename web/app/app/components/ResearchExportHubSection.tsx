'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FolderGit2,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { RESEARCH_SECTIONS } from '../lib/researchMetricSections';
import SavedResearchExportsPanel from './SavedResearchExportsPanel';

type ProjectExportStat = {
  id: string;
  name: string;
  savedReportCount: number;
  lastExcelAt?: number;
};

type Props = {
  userId?: string;
  projectIds: Array<{ id: string; name: string }>;
  onExportAllProjects: () => void;
  researchArchiveRefreshKey?: number;
};

export default function ResearchExportHubSection({
  userId,
  projectIds,
  onExportAllProjects,
  researchArchiveRefreshKey = 0,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ProjectExportStat[]>([]);
  const [sectionsOpen, setSectionsOpen] = useState(false);

  const projectIdsKey = useMemo(
    () => projectIds.map((p) => `${p.id}\t${p.name}`).join('\n'),
    [projectIds]
  );
  const projectIdsRef = useRef(projectIds);
  projectIdsRef.current = projectIds;

  const loadStats = useCallback(async () => {
    const ids = projectIdsRef.current;
    if (ids.length === 0) {
      setStats([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows: ProjectExportStat[] = [];
      const concurrency = 3;
      let index = 0;
      const worker = async () => {
        while (index < ids.length) {
          const i = index++;
          const p = ids[i];
          let savedReportCount = 0;
          try {
            const list = await apiClient.listSavedRefactoringReports(p.id);
            savedReportCount = list.count ?? list.reports?.length ?? 0;
          } catch {
            /* ignore */
          }
          rows[i] = { id: p.id, name: p.name, savedReportCount };
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(concurrency, ids.length) }, () => worker())
      );
      setStats(rows.filter(Boolean));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (projectIdsKey.length === 0) {
      setStats([]);
      setLoading(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void loadStats();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [loadStats, projectIdsKey]);

  const totalReports = stats.reduce((n, s) => n + s.savedReportCount, 0);
  const projectsWithReports = stats.filter((s) => s.savedReportCount > 0).length;
  const projectsWithExcel = stats.filter((s) => s.lastExcelAt).length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 to-slate-800/80 p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
              <h2 className="text-lg font-semibold text-white">Research Excel export</h2>
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                New
              </span>
            </div>
            <p className="text-sm text-slate-300 mb-3">
              Full per-file research workbooks aligned with the Research Metrics panel — 15 metric
              sections, provenance columns, per-file detail tabs, project statistics, and Excel
              formulas (mean, median, paired t-test, Cohen&apos;s d, Wilcoxon, CI).
            </p>
            <button
              type="button"
              onClick={() => setSectionsOpen((o) => !o)}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 mb-3"
            >
              {sectionsOpen ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              {sectionsOpen ? 'Hide' : 'Show'} 15 workbook sections
            </button>
            {sectionsOpen && (
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 text-[11px] text-slate-400 mb-3">
                {RESEARCH_SECTIONS.map((s) => (
                  <li key={s.id} className="flex items-center gap-1.5">
                    <span className="text-emerald-500/80">•</span>
                    <span className="text-slate-300">{s.title}</span>
                    <span className="text-slate-600 font-mono">({s.sheet})</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-3 text-xs">
              {loading ? (
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Scanning workspaces…
                </span>
              ) : (
                <>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-900/60 border border-slate-700 text-slate-300">
                    <strong className="text-white">{totalReports}</strong> saved full reports
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-900/60 border border-slate-700 text-slate-300">
                    <strong className="text-white">{projectsWithReports}</strong> / {projectIds.length}{' '}
                    projects with reports
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-900/60 border border-slate-700 text-slate-300">
                    <strong className="text-white">{projectsWithExcel}</strong> per-project Excel exports
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button
              type="button"
              onClick={onExportAllProjects}
              disabled={projectIds.length === 0}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium shadow-lg shadow-violet-900/30"
            >
              <FolderGit2 className="w-4 h-4" />
              Export all saved files (Excel)
            </button>
            <p className="text-[10px] text-slate-500 max-w-[240px] text-center">
              All saved reports · 15 metric sections · optional frontier master (sheets 00–44)
            </p>
          </div>
        </div>
      </div>

      {stats.some((s) => s.savedReportCount > 0) && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Per-project research data</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-700">
                  <th className="text-left py-2 pr-3 font-medium">Project</th>
                  <th className="text-right py-2 px-3 font-medium">Saved reports</th>
                  <th className="text-right py-2 pl-3 font-medium">Last Excel</th>
                </tr>
              </thead>
              <tbody>
                {stats
                  .filter((s) => s.savedReportCount > 0)
                  .sort((a, b) => b.savedReportCount - a.savedReportCount)
                  .map((s) => (
                    <tr key={s.id} className="border-b border-slate-700/50 text-slate-300">
                      <td className="py-2 pr-3 truncate max-w-[200px]" title={s.name}>
                        {s.name}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{s.savedReportCount}</td>
                      <td className="py-2 pl-3 text-right text-slate-500">—</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 flex items-center gap-1">
            <BarChart3 className="w-3 h-3" />
            Open a project → Files or Overview → Export Excel for per-project workbooks in{' '}
            <code className="text-slate-400">.refactai/exports/excel/</code>
          </p>
        </div>
      )}

      {userId ? (
        <SavedResearchExportsPanel
          userId={userId}
          refreshKey={researchArchiveRefreshKey}
          onCrossProjectExport={onExportAllProjects}
        />
      ) : (
        <p className="text-xs text-slate-500 px-1">
          Sign in with a user profile to persist cross-project exports in your research archive.
        </p>
      )}
    </div>
  );
}
