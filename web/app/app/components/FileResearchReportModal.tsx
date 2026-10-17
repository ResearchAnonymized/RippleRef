'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X, FileText, Loader2, Shield, GitCompare, BarChart3, BookOpen, Download, Save,
} from 'lucide-react';
import { apiClient } from '../api/client';
import type { FileActivity } from '../lib/fileActivity';
import {
  buildPersistedFileResearchReport,
  type RefactoringHistoryEntry,
} from '../lib/buildPersistedFileReport';
import { buildSavedReportFromPersisted } from '../lib/buildSavedReportFromPersisted';
import {
  parseSavedRefactoringReportBundle,
  type SavedRefactoringReportBundle,
} from '../lib/savedRefactoringReport';
import RefactoringReportPanel from './RefactoringReportPanel';
import PersistedFileEvidenceView from './PersistedFileEvidenceView';
import FullSavedRefactoringReportView from './FullSavedRefactoringReportView';
import { extractRefactoringAnnotations } from '../lib/buildPersistedFileReport';
import { reportToMarkdown } from '../lib/refactoringReportDocument';
import ResearchMetricsPanel from './ResearchMetricsPanel';
import { buildRefactoringReportCsv, downloadTextFile } from '../lib/exportRefactoringReportCsv';
import type { RefactoringReportShape } from '../lib/refactoringReportDocument';

type TabId = 'full' | 'summary' | 'evidence' | 'metrics' | 'export';

export default function FileResearchReportModal({
  workspaceId,
  filePath,
  fileName,
  fileActivity,
  codeSmells = [],
  onClose,
}: {
  workspaceId: string;
  filePath: string;
  fileName: string;
  fileActivity?: FileActivity | null;
  codeSmells?: Array<Record<string, unknown>>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabId>('summary');
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);
  const [showDiff, setShowDiff] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [original, setOriginal] = useState('');
  const [refactored, setRefactored] = useState('');
  const [historyEntry, setHistoryEntry] = useState<RefactoringHistoryEntry | null>(null);
  const [report, setReport] = useState<RefactoringReportShape | null>(null);
  const [savedBundle, setSavedBundle] = useState<SavedRefactoringReportBundle | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setSavedBundle(null);
      try {
        const archived = await apiClient.getSavedRefactoringReport(workspaceId, filePath);
        const parsed = parseSavedRefactoringReportBundle(archived);
        if (parsed) {
          if (cancelled) return;
          setSavedBundle(parsed);
          setOriginal(parsed.originalContent);
          setRefactored(parsed.refactoredContent);
          setReport(parsed.refactoringReport ?? null);
          setTab('full');
          return;
        }

        const historyRes = await fetch(
          `/api/refactoring/workspaces/${workspaceId}/history/full?filePath=${encodeURIComponent(filePath)}`
        );
        let entry: RefactoringHistoryEntry | null = null;
        if (historyRes.ok) {
          const list = (await historyRes.json()) as RefactoringHistoryEntry[];
          entry =
            list.find((h) => h.originalContent && h.refactoredContent) ??
            list[0] ??
            null;
        }

        let orig = entry?.originalContent ?? '';
        let ref = entry?.refactoredContent ?? '';

        if (!orig || !ref) {
          try {
            const candidateKind =
              fileActivity?.status === 'rejected' ? 'rejected' : 'refactored';
            const [o, r] = await Promise.all([
              apiClient.getFileArtifact(workspaceId, filePath, 'original'),
              apiClient.getFileArtifact(workspaceId, filePath, candidateKind),
            ]);
            orig = orig || o.content || '';
            ref = ref || r.content || '';
          } catch {
            /* optional */
          }
        }

        if (!ref) {
          const live = await apiClient.getFileContent(workspaceId, filePath);
          ref = live.content || '';
        }

        if (!orig) {
          throw new Error(
            'No saved before/after pair found. Refactor this file once so history and .refactai artifacts exist.'
          );
        }

        if (cancelled) return;
        setHistoryEntry(entry);
        setOriginal(orig);
        setRefactored(ref);
        setReport(
          buildPersistedFileResearchReport({
            filePath,
            original: orig,
            refactored: ref,
            codeSmells,
            fileActivity,
            historyEntry: entry,
          })
        );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load research report');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, filePath, fileActivity, codeSmells]);

  const researchMetrics = useMemo(() => {
    const raw = fileActivity?.researchSnapshot;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return (parsed?.research_metrics ?? parsed?.metrics ?? parsed) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [fileActivity?.researchSnapshot]);

  const exportBasename = useMemo(() => {
    const base = fileName.replace(/\.[^.]+$/, '') || 'file';
    return `${base}-research-report`;
  }, [fileName]);

  const annotations = useMemo(
    () => extractRefactoringAnnotations(refactored),
    [refactored]
  );

  const markdownPreview = useMemo(() => {
    if (!report) return '';
    return reportToMarkdown(report, { workspaceLabel: workspaceId, generatedAt: new Date().toISOString() });
  }, [report, workspaceId]);

  const downloadStudyCsv = useCallback(() => {
    if (!report) return;
    const csv = buildRefactoringReportCsv({
      workspaceId,
      filePath,
      exportedAtIso: new Date().toISOString(),
      applyResult: {
        originalContent: original,
        refactoredContent: refactored,
        refactoringReport: report,
        deltas: { comprehensiveAnalysis: researchMetrics },
      },
      codeSmells,
    });
    downloadTextFile(`${exportBasename}.csv`, csv);
  }, [report, workspaceId, filePath, original, refactored, researchMetrics, codeSmells, exportBasename]);

  const archiveFromPersisted = useCallback(async () => {
    if (!original || !refactored) return;
    setArchiving(true);
    try {
      const bundle = buildSavedReportFromPersisted({
        workspaceId,
        filePath,
        original,
        refactored,
        historyEntry,
        fileActivity,
        codeSmells,
      });
      await apiClient.saveRefactoringReport(workspaceId, bundle as unknown as Record<string, unknown>);
      setSavedBundle(bundle);
      setTab('full');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to archive report');
    } finally {
      setArchiving(false);
    }
  }, [workspaceId, filePath, original, refactored, historyEntry, fileActivity, codeSmells]);

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = savedBundle
    ? [
        { id: 'full', label: 'Full report', icon: BookOpen },
        { id: 'export', label: 'Export', icon: Download },
      ]
    : [
        { id: 'summary', label: 'Report', icon: FileText },
        { id: 'evidence', label: 'Diff & evidence', icon: GitCompare },
        { id: 'metrics', label: 'Metrics', icon: BarChart3 },
        { id: 'export', label: 'Export', icon: Download },
      ];

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 md:p-6">
      <div className="bg-slate-900 border border-slate-600 rounded-xl w-full max-w-6xl h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-700">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-cyan-400 shrink-0" />
              <h2 className="text-lg font-semibold text-white truncate">Research report — {fileName}</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1 truncate">{filePath}</p>
            <p className="text-xs text-emerald-400/90 mt-1 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5" />
              Read-only — saved history and artifacts only (no refactoring will run)
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-wrap gap-1 px-4 pt-2 border-b border-slate-800">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3 py-2 text-xs font-medium rounded-t-lg flex items-center gap-1.5 ${
                tab === id
                  ? 'bg-slate-800 text-cyan-300 border border-slate-600 border-b-transparent'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-cyan-400" />
              <p className="text-sm">Loading saved refactoring data…</p>
            </div>
          )}
          {!loading && error && (
            <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-4 text-red-200 text-sm">{error}</div>
          )}
          {!loading && !error && (
            <>
              {tab === 'full' && savedBundle && (
                <FullSavedRefactoringReportView
                  bundle={savedBundle}
                  showDiff={showDiff}
                  onToggleDiff={() => setShowDiff((v) => !v)}
                />
              )}

              {!savedBundle && tab === 'summary' && (
                <div className="space-y-4">
                  <button
                    type="button"
                    disabled={archiving || !original}
                    onClick={() => void archiveFromPersisted()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium"
                  >
                    <Save className="w-4 h-4" />
                    {archiving ? 'Archiving…' : 'Save full report archive (restore complete dashboard later)'}
                  </button>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-xs">
                    <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                      <p className="text-slate-400">Status</p>
                      <p className="text-green-400 font-semibold mt-1 capitalize">{fileActivity?.status ?? 'refactored'}</p>
                    </div>
                    <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                      <p className="text-slate-400">PMD smells (current)</p>
                      <p className="text-white font-semibold mt-1">{codeSmells.length}</p>
                    </div>
                    <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                      <p className="text-slate-400">Line hunks recorded</p>
                      <p className="text-white font-semibold mt-1">{historyEntry?.changes?.linesChanged ?? '—'}</p>
                    </div>
                    <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                      <p className="text-slate-400">Saved</p>
                      <p className="text-white font-semibold mt-1 text-[10px]">
                        {fileActivity?.savedToProjectAt
                          ? new Date(fileActivity.savedToProjectAt).toLocaleString()
                          : historyEntry?.timestamp
                            ? new Date(historyEntry.timestamp).toLocaleString()
                            : '—'}
                      </p>
                    </div>
                  </div>
                  {!report && (
                    <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg p-4 text-amber-100 text-sm">
                      Could not build report document. Check the <strong>Diff &amp; evidence</strong> tab or try Export
                      after reloading.
                    </div>
                  )}
                  <RefactoringReportPanel
                    report={report}
                    exportBasename={exportBasename}
                    expandSectionsForPaper
                    narrativeExtras={{ workspaceLabel: workspaceId, generatedAt: new Date().toISOString() }}
                  />
                  {report && (
                    <div className="border border-slate-700 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowMarkdownPreview((v) => !v)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/80 text-sm text-slate-200 hover:bg-slate-800"
                      >
                        <span>Paper-ready Markdown preview</span>
                        <span className="text-xs text-slate-500">{showMarkdownPreview ? 'Hide' : 'Show'}</span>
                      </button>
                      {showMarkdownPreview && (
                        <pre className="text-xs text-slate-300 p-4 max-h-64 overflow-auto whitespace-pre-wrap font-mono bg-slate-950/80">
                          {markdownPreview}
                        </pre>
                      )}
                    </div>
                  )}
                  {fileActivity?.refactoredArtifactPath && (
                    <p className="text-xs text-slate-500">
                      Artifacts: <code className="text-slate-400">{fileActivity.originalArtifactPath}</code>
                      {' → '}
                      <code className="text-slate-400">{fileActivity.refactoredArtifactPath}</code>
                    </p>
                  )}
                </div>
                </div>
              )}
              {!savedBundle && tab === 'evidence' && (
                <PersistedFileEvidenceView
                  original={original}
                  refactored={refactored}
                  filePath={filePath}
                  report={report}
                  codeSmells={codeSmells}
                  annotations={annotations}
                />
              )}
              {!savedBundle && tab === 'metrics' &&
                (researchMetrics ? (
                  <ResearchMetricsPanel metrics={researchMetrics as never} exportContext={{ workspaceId, filePath }} />
                ) : (
                  <div className="bg-slate-800/60 border border-slate-600 rounded-lg p-6 text-center text-slate-400 text-sm">
                    <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p>No research metrics snapshot was stored for this run.</p>
                    <p className="mt-2 text-xs">Use Diff &amp; evidence and Export for your paper.</p>
                  </div>
                ))}
              {tab === 'export' && (
                <div className="space-y-4 max-w-lg">
                  {savedBundle ? (
                    <RefactoringReportPanel
                      report={savedBundle.refactoringReport ?? report}
                      exportBasename={exportBasename}
                      expandSectionsForPaper
                    />
                  ) : (
                    <>
                      <p className="text-sm text-slate-300">Export for empirical studies (tables, appendices).</p>
                      <RefactoringReportPanel report={report} exportBasename={exportBasename} expandSectionsForPaper />
                      <button
                        type="button"
                        onClick={downloadStudyCsv}
                        disabled={!report}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium"
                      >
                        <Download className="w-4 h-4" />
                        Download study CSV
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
