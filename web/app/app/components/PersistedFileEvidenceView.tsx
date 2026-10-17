'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { GitCompare, AlertTriangle, Sparkles, FileCode } from 'lucide-react';
import { computeLineDiffStats } from '../lib/lineDiff';
import { extractRefactoringAnnotations, type RefactoringAnnotation } from '../lib/buildPersistedFileReport';
import type { RefactoringReportShape } from '../lib/refactoringReportDocument';
import { pmdCategoryBadgeClass, smellPmdCategory } from '../lib/pmdSmellCategory';

const CodeComparisonMonacoDiff = dynamic(() => import('./CodeComparisonMonacoDiff'), {
  ssr: false,
  loading: () => (
    <div className="h-64 flex items-center justify-center text-slate-400 text-sm border border-slate-700 rounded-lg">
      Loading diff viewer…
    </div>
  ),
});

type PersistedFileEvidenceViewProps = {
  original: string;
  refactored: string;
  filePath: string;
  report: RefactoringReportShape | null;
  codeSmells?: Array<Record<string, unknown>>;
  annotations?: RefactoringAnnotation[];
};

function smellLabel(s: Record<string, unknown>): string {
  return String(s.title || s.detectorId || s.type || s.name || 'Code smell');
}

export default function PersistedFileEvidenceView({
  original,
  refactored,
  filePath,
  report,
  codeSmells = [],
  annotations: annotationsProp,
}: PersistedFileEvidenceViewProps) {
  const annotations = useMemo(
    () => annotationsProp ?? extractRefactoringAnnotations(refactored),
    [annotationsProp, refactored]
  );

  const stats = useMemo(() => computeLineDiffStats(original, refactored), [original, refactored]);

  const language = filePath.endsWith('.java') ? 'java' : 'plaintext';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs bg-slate-800/80 border border-slate-700 rounded-lg px-4 py-3">
        <span className="text-slate-400">
          Lines changed: <strong className="text-white">{stats.linesChanged}</strong>
        </span>
        <span className="text-green-400">+{stats.added}</span>
        <span className="text-red-400">−{stats.removed}</span>
        <span className="text-yellow-300">~{stats.modified}</span>
        <span className="text-slate-500">|</span>
        <span className="text-slate-400">
          In-source refactor notes: <strong className="text-cyan-300">{annotations.length}</strong>
        </span>
        <span className="text-slate-500">|</span>
        <span className="text-slate-400">
          PMD findings (current): <strong className="text-amber-300">{codeSmells.length}</strong>
        </span>
      </div>

      {annotations.length > 0 && (
        <section className="border border-slate-700 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 border-b border-slate-700">
            <Sparkles className="w-4 h-4 text-green-400" />
            <h3 className="text-sm font-semibold text-white">Applied refactorings (from saved source)</h3>
          </div>
          <ul className="max-h-48 overflow-y-auto divide-y divide-slate-700/50">
            {annotations.map((a, i) => (
              <li key={`${a.line}-${i}`} className="px-3 py-2 text-xs hover:bg-slate-800/40">
                <span className="text-slate-500 font-mono mr-2">L{a.line}</span>
                <span className="text-green-400 font-medium">{a.type}</span>
                <p className="text-slate-400 mt-1 leading-relaxed">{a.description}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report?.detected_smells && report.detected_smells.length > 0 && (
        <section className="border border-slate-700 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 border-b border-slate-700">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-white">Detected smells (report)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-900/60 text-slate-500">
                  <th className="py-2 px-3 text-left">Smell</th>
                  <th className="py-2 px-3 text-left">Location</th>
                  <th className="py-2 px-3 text-left">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {report.detected_smells.map((s, i) => (
                  <tr key={i} className="border-t border-slate-700/40">
                    <td className="py-2 px-3 text-amber-300">{s.smell}</td>
                    <td className="py-2 px-3 text-slate-500 font-mono">{s.location}</td>
                    <td className="py-2 px-3 text-slate-400">{s.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {codeSmells.length > 0 && (
        <section className="border border-slate-700 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 border-b border-slate-700">
            <FileCode className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Current PMD analysis (post-refactor)</h3>
          </div>
          <ul className="max-h-40 overflow-y-auto divide-y divide-slate-700/50">
            {codeSmells.map((s, i) => (
              <li key={i} className="px-3 py-2 text-xs">
                <span className="text-amber-300 font-medium">{smellLabel(s)}</span>
                <span className={`ml-2 px-1.5 py-0.5 rounded border text-[10px] ${pmdCategoryBadgeClass(smellPmdCategory(s))}`}>
                  {smellPmdCategory(s)}
                </span>
                <span className="text-slate-500 ml-2">{String(s.severity ?? '')}</span>
                {s.startLine != null && (
                  <span className="text-slate-500 ml-2 font-mono">
                    L{s.startLine}
                    {s.endLine != null && s.endLine !== s.startLine ? `–${s.endLine}` : ''}
                  </span>
                )}
                {s.description && <p className="text-slate-400 mt-1">{String(s.description)}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border border-slate-700 rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 border-b border-slate-700">
          <GitCompare className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white">Before / after diff (saved copies)</h3>
        </div>
        <div className="p-2 min-h-[320px]">
          <CodeComparisonMonacoDiff
            original={original}
            modified={refactored}
            language={language}
            height="min(55vh, 520px)"
          />
        </div>
      </section>
    </div>
  );
}
