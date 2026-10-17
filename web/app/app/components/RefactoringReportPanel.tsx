'use client';

import React, { useCallback, useState } from 'react';
import {
  FileText, Download, CheckCircle, Clipboard, ClipboardCheck, FileArchive,
  ChevronDown, ChevronUp, AlertTriangle, GitBranch, BarChart3, Sparkles,
  Layers, Shield, ArrowRight
} from 'lucide-react';
import {
  type RefactoringReportShape,
  type ReportNarrativeExtras,
  reportToMarkdown,
  reportToHtml,
} from '../lib/refactoringReportDocument';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJson(obj: unknown, filename: string) {
  downloadBlob(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), filename);
}

function Section({ title, icon: Icon, iconColor, defaultOpen = false, badge, children }: {
  title: string; icon: any; iconColor?: string; defaultOpen?: boolean; badge?: React.ReactNode; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-700/50 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-700/30 transition-colors text-left bg-slate-800/40">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${iconColor || 'text-slate-400'}`} />
          <span className="text-xs font-semibold text-slate-200 truncate">{title}</span>
          {badge}
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />}
      </button>
      {open && <div className="px-3 pb-3 pt-2">{children}</div>}
    </div>
  );
}

export default function RefactoringReportPanel({
  report,
  exportBasename = 'refactoring-report',
  narrativeExtras,
  expandSectionsForPaper = false,
}: {
  report: RefactoringReportShape | null | undefined;
  exportBasename?: string;
  narrativeExtras?: ReportNarrativeExtras;
  /** When true, expand smell/refactoring sections by default (persisted research report). */
  expandSectionsForPaper?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const base = exportBasename.replace(/\.(json|md|html|zip)$/i, '') || 'refactoring-report';
  const exportNameJson = `${base}.json`;

  const copyJson = useCallback(async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setCopied(false); }
  }, [report]);

  const downloadMd = useCallback(() => {
    if (!report) return;
    downloadBlob(new Blob([reportToMarkdown(report, narrativeExtras)], { type: 'text/markdown;charset=utf-8' }), `${base}.md`);
  }, [report, narrativeExtras, base]);

  const downloadHtml = useCallback(() => {
    if (!report) return;
    downloadBlob(new Blob([reportToHtml(report, narrativeExtras)], { type: 'text/html;charset=utf-8' }), `${base}.html`);
  }, [report, narrativeExtras, base]);

  const downloadZip = useCallback(async () => {
    if (!report) return;
    setZipping(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      zip.file(`${base}.json`, JSON.stringify(report, null, 2));
      zip.file(`${base}.md`, reportToMarkdown(report, narrativeExtras));
      zip.file(`${base}.html`, reportToHtml(report, narrativeExtras));
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `${base}-refactoring-docs.zip`);
    } catch (e) { console.error('ZIP export failed', e); }
    finally { setZipping(false); }
  }, [report, narrativeExtras, base]);

  if (!report || typeof report !== 'object') {
    return (
      <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg p-3 mb-4 text-amber-100 text-sm">
        <strong className="text-amber-200">No documentation report yet.</strong>
        <p className="mt-1 text-amber-100/90 text-xs">
          Finish a refactor and open the Review step.
        </p>
      </div>
    );
  }

  const m = report.change_metrics || { lines_added: 0, lines_removed: 0, lines_modified: 0, refactoring_operations: 0 };
  const smellCount = report.detected_smells?.length ?? 0;
  const refactCount = report.applied_refactorings?.length ?? 0;
  const mappingCount = report.smell_refactoring_mapping?.length ?? 0;

  return (
    <div className="bg-slate-800/60 border border-slate-600 rounded-lg p-4 mb-4 space-y-3">
      {/* Compact header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <h4 className="text-sm font-semibold text-white truncate">Refactoring Report</h4>
          <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full flex-shrink-0 font-mono">{report.file?.split('/').pop()}</span>
        </div>
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowExport(!showExport)}
            className="px-2.5 py-1 rounded-md text-xs border border-slate-600 bg-slate-700/80 hover:bg-slate-600 text-slate-200 flex items-center gap-1.5"
          >
            <Download className="w-3 h-3" />
            Export
            <ChevronDown className="w-3 h-3" />
          </button>
          {showExport && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[140px]">
              <button onClick={() => { copyJson(); setShowExport(false); }} className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 flex items-center gap-2">
                {copied ? <ClipboardCheck className="w-3 h-3 text-green-400" /> : <Clipboard className="w-3 h-3" />}
                {copied ? 'Copied!' : 'Copy JSON'}
              </button>
              <button onClick={() => { downloadJson(report, exportNameJson); setShowExport(false); }} className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 flex items-center gap-2">
                <Download className="w-3 h-3" /> JSON
              </button>
              <button onClick={() => { downloadMd(); setShowExport(false); }} className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 flex items-center gap-2">
                <FileText className="w-3 h-3" /> Markdown
              </button>
              <button onClick={() => { downloadHtml(); setShowExport(false); }} className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 flex items-center gap-2">
                <FileText className="w-3 h-3" /> HTML
              </button>
              <div className="border-t border-slate-700 my-1" />
              <button onClick={() => { void downloadZip(); setShowExport(false); }} disabled={zipping} className="w-full text-left px-3 py-1.5 text-xs text-cyan-300 hover:bg-slate-700 flex items-center gap-2 disabled:opacity-50">
                <FileArchive className="w-3 h-3" /> {zipping ? 'Zipping…' : 'All (ZIP)'}
              </button>
            </div>
          )}
        </div>
      </div>

      {report.meta && (report.meta as { source?: string }).source === 'client-fallback' && (
        <p className="text-amber-400/90 text-[10px]">
          Browser-built summary — restart agents service for the full server report.
        </p>
      )}

      <p className="text-[10px] leading-snug text-slate-500">
        Smell total = full static detector enumeration for this run (same backend engine as workspace analysis). Not Sonar-style “issues”; heuristic counts can be large on big files.
      </p>

      {/* Quick stats row */}
      <div className="flex flex-wrap items-center gap-3 text-xs bg-slate-900/40 rounded-lg px-3 py-2 border border-slate-700/50">
        <span className="text-slate-400">Smells: <span className="font-semibold text-amber-400">{smellCount}</span></span>
        <span className="text-slate-600">|</span>
        <span className="text-slate-400">Refactorings: <span className="font-semibold text-green-400">{refactCount}</span></span>
        <span className="text-slate-600">|</span>
        <span className="text-slate-400">
          Lines: <span className="text-green-400">+{m.lines_added}</span>
          {' '}<span className="text-red-400">-{m.lines_removed}</span>
          {' '}<span className="text-yellow-300">~{m.lines_modified}</span>
        </span>
        {m.refactoring_operations > 0 && <>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">Ops: <span className="font-semibold text-cyan-300">{m.refactoring_operations}</span></span>
        </>}
      </div>

      {/* Summary — always visible, compact */}
      {report.summary && (
        <div className="text-xs text-slate-400 leading-relaxed bg-slate-900/30 rounded-lg px-3 py-2 border border-slate-700/30">
          {report.summary}
        </div>
      )}

      {/* Detected Code Smells */}
      <Section
        title="Detected Code Smells"
        icon={AlertTriangle}
        iconColor="text-amber-400"
        defaultOpen={expandSectionsForPaper}
        badge={smellCount > 0 ? <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">{smellCount}</span> : undefined}
      >
        {smellCount === 0 ? (
          <p className="text-slate-500 text-xs">None listed for this run.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-700/50">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-900/60 text-slate-500">
                  <th className="py-1.5 px-2 text-left font-medium w-[30%]">Smell</th>
                  <th className="py-1.5 px-2 text-left font-medium w-[20%]">Location</th>
                  <th className="py-1.5 px-2 text-left font-medium">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {report.detected_smells.map((s, i) => (
                  <tr key={i} className="border-t border-slate-700/40 hover:bg-slate-800/40">
                    <td className="py-1.5 px-2 text-amber-300 font-medium">{s.smell}</td>
                    <td className="py-1.5 px-2 text-slate-500 font-mono">{s.location}</td>
                    <td className="py-1.5 px-2 text-slate-400 break-words max-w-xs">{s.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Applied Refactorings */}
      <Section
        title="Applied Refactorings (Smell-Linked)"
        icon={Sparkles}
        iconColor="text-green-400"
        defaultOpen={expandSectionsForPaper}
        badge={refactCount > 0 ? <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">{refactCount}</span> : undefined}
      >
        {refactCount === 0 ? (
          <p className="text-slate-500 text-xs">No major smell-driven operations reported.</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {report.applied_refactorings.map((r, i) => (
              <div key={i} className="bg-slate-900/40 rounded-md p-2.5 border border-slate-700/30 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-green-400 font-semibold">{r.type}</span>
                </div>
                <div className="flex items-center gap-1 text-slate-500 text-[10px]">
                  <span className="font-mono truncate max-w-[180px]" title={r.before_location}>{r.before_location}</span>
                  <ArrowRight className="w-3 h-3 text-slate-600 flex-shrink-0" />
                  <span className="font-mono truncate max-w-[180px]" title={r.after_location}>{r.after_location}</span>
                </div>
                {r.description && <p className="text-slate-400 mt-1.5 leading-relaxed">{r.description}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Smell → Refactoring → Benefit mapping table */}
      <Section
        title="Smell → Refactoring → Benefit"
        icon={GitBranch}
        iconColor="text-purple-400"
        defaultOpen={expandSectionsForPaper}
        badge={mappingCount > 0 ? <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full">{mappingCount}</span> : undefined}
      >
        {mappingCount === 0 ? (
          <p className="text-slate-500 text-xs">No mapping rows.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-700/50">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-900/60 text-slate-500">
                  <th className="py-1.5 px-2 text-left font-medium">Detected Smell</th>
                  <th className="py-1.5 px-2 text-left font-medium">Applied Refactoring</th>
                  <th className="py-1.5 px-2 text-left font-medium">Expected Benefit</th>
                </tr>
              </thead>
              <tbody>
                {report.smell_refactoring_mapping.map((row, i) => (
                  <tr key={i} className="border-t border-slate-700/40 hover:bg-slate-800/40">
                    <td className="py-1.5 px-2 text-amber-300">{row.smell}</td>
                    <td className="py-1.5 px-2 text-green-300">{row.refactoring}</td>
                    <td className="py-1.5 px-2 text-slate-400">{row.benefit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Behavior & Quality — compact side-by-side */}
      <Section title="Behavior Preservation &amp; Quality" icon={Shield} iconColor="text-emerald-400" defaultOpen={expandSectionsForPaper}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="bg-slate-900/40 rounded-md p-2.5 border border-slate-700/30">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-400" /> Behavior Preservation
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">{report.behavior_preservation || 'Not available.'}</p>
          </div>
          <div className="bg-slate-900/40 rounded-md p-2.5 border border-slate-700/30">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
              <Layers className="w-3 h-3 text-blue-400" /> Quality Improvement
            </div>
            {(report.quality_improvement?.length ?? 0) === 0 ? (
              <p className="text-xs text-slate-500">None listed.</p>
            ) : (
              <ul className="text-xs text-slate-400 space-y-0.5">
                {report.quality_improvement.map((q, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-green-400 mt-0.5">•</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      {/* Additional Cleanup */}
      {(report.additional_cleanup_changes?.length ?? 0) > 0 && (
        <Section title="Additional Cleanup (Non-Primary)" icon={BarChart3} iconColor="text-slate-400" defaultOpen={false}>
          <ul className="text-xs text-slate-400 space-y-0.5">
            {report.additional_cleanup_changes.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-slate-500 mt-0.5">•</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Technical meta */}
      {report.meta && Object.keys(report.meta).length > 0 && (
        <details className="text-[10px] text-slate-500">
          <summary className="cursor-pointer text-slate-500 hover:text-slate-400">Technical meta</summary>
          <pre className="mt-1 p-2 rounded bg-slate-950/80 overflow-x-auto text-slate-500 text-[10px] max-h-32 overflow-y-auto">
            {JSON.stringify(report.meta, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

export type { RefactoringReportShape } from '../lib/refactoringReportDocument';
