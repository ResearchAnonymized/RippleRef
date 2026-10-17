'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import ResearchMetricsPanel from './ResearchMetricsPanel';
import type { BatchFileMetrics, MetricBeforeAfter } from '../lib/batchResultMetrics';
import { deltaColorClass, formatBeforeAfter, formatDelta, normalizeBatchFileMetrics } from '../lib/batchResultMetrics';

type Props = {
  metrics: BatchFileMetrics | null | undefined;
  workspaceId: string;
  filePath: string;
};

function HeaderCell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <th
      className="px-2 py-1.5 text-right text-[10px] uppercase tracking-wide text-slate-400 font-medium whitespace-nowrap border-b border-slate-700"
      title={title}
    >
      {children}
    </th>
  );
}

function MetricPairCells({
  m,
  lowerIsBetter = true,
}: {
  m?: MetricBeforeAfter | null;
  lowerIsBetter?: boolean;
}) {
  const safe = m ?? {};
  return (
    <>
      <td className="px-2 py-2 text-right text-slate-300 text-xs whitespace-nowrap border-b border-slate-700/30">
        {formatBeforeAfter(safe)}
      </td>
      <td
        className={`px-2 py-2 text-right text-xs font-medium whitespace-nowrap border-b border-slate-700/30 ${deltaColorClass(safe, lowerIsBetter)}`}
      >
        {formatDelta(safe, lowerIsBetter)}
      </td>
    </>
  );
}

export function BatchResultsMetricHeaderRow() {
  return (
    <tr className="bg-slate-900/50">
      <th className="px-4 py-1.5 text-left text-[10px] uppercase text-slate-500 border-b border-slate-700">
        Status
      </th>
      <th className="px-4 py-1.5 text-left text-[10px] uppercase text-slate-500 border-b border-slate-700">
        File
      </th>
      <th className="px-2 py-1.5 text-center text-[10px] uppercase text-slate-500 border-b border-slate-700">
        Report
      </th>
      <HeaderCell title="PMD smell count from verification">PMD smells</HeaderCell>
      <HeaderCell title="Change in PMD smells (lower is better)">Δ</HeaderCell>
      <HeaderCell title="Lines of code">LOC</HeaderCell>
      <HeaderCell>Δ</HeaderCell>
      <HeaderCell title="Cyclomatic complexity">Complexity</HeaderCell>
      <HeaderCell>Δ</HeaderCell>
      <HeaderCell title="Maintainability index (higher is better)">Maint.</HeaderCell>
      <HeaderCell>Δ</HeaderCell>
      <HeaderCell title="Testability score">Testability</HeaderCell>
      <HeaderCell>Δ</HeaderCell>
      <HeaderCell title="Critical / major / minor smells before → after">Crit/Maj/Min</HeaderCell>
      <HeaderCell title="Overall quality score after refactor">Score</HeaderCell>
      <HeaderCell title="Semantic preservation rate">Semantic %</HeaderCell>
      <HeaderCell title="PMD smell resolution rate">Smell res. %</HeaderCell>
      <th className="px-4 py-1.5 text-left text-[10px] uppercase text-slate-500 border-b border-slate-700">
        Detail
      </th>
      <th className="px-4 py-1.5 text-right text-[10px] uppercase text-slate-500 border-b border-slate-700">
        Time
      </th>
    </tr>
  );
}

export function BatchResultsMetricCells({
  metrics,
}: {
  metrics: BatchFileMetrics | Partial<BatchFileMetrics> | null | undefined;
}) {
  const normalized = normalizeBatchFileMetrics(metrics);
  if (!normalized) {
    return (
      <>
        {Array.from({ length: 14 }).map((_, i) => (
          <td
            key={i}
            className="px-2 py-2 text-right text-slate-600 text-xs border-b border-slate-700/30"
          >
            —
          </td>
        ))}
      </>
    );
  }

  const sev = `${normalized.smellsCritical.before ?? '—'}/${normalized.smellsMajor.before ?? '—'}/${normalized.smellsMinor.before ?? '—'} → ${normalized.smellsCritical.after ?? '—'}/${normalized.smellsMajor.after ?? '—'}/${normalized.smellsMinor.after ?? '—'}`;

  return (
    <>
      <MetricPairCells m={normalized.pmdSmells} lowerIsBetter />
      <MetricPairCells m={normalized.linesOfCode} lowerIsBetter />
      <MetricPairCells m={normalized.complexity} lowerIsBetter />
      <MetricPairCells m={normalized.maintainability} lowerIsBetter={false} />
      <MetricPairCells m={normalized.testability} lowerIsBetter={false} />
      <td
        className="px-2 py-2 text-right text-[10px] text-slate-400 whitespace-nowrap border-b border-slate-700/30"
        title="Critical / Major / Minor PMD smells"
      >
        {sev}
      </td>
      <td className="px-2 py-2 text-right text-slate-300 text-xs border-b border-slate-700/30">
        {normalized.overallScore != null ? normalized.overallScore : '—'}
      </td>
      <td className="px-2 py-2 text-right text-slate-300 text-xs border-b border-slate-700/30">
        {normalized.semanticPreservationPct != null
          ? `${normalized.semanticPreservationPct.toFixed(1)}%`
          : '—'}
      </td>
      <td className="px-2 py-2 text-right text-slate-300 text-xs border-b border-slate-700/30">
        {normalized.smellResolutionPct != null ? `${normalized.smellResolutionPct.toFixed(1)}%` : '—'}
      </td>
    </>
  );
}

export default function BatchResultMetricsExpand({ metrics, workspaceId, filePath }: Props) {
  const [open, setOpen] = useState(false);
  if (!metrics?.researchMetrics) return null;

  return (
    <tr className="bg-slate-900/40">
      <td colSpan={19} className="px-4 py-3 border-b border-slate-700/50">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-xs text-blue-300 hover:text-blue-200 mb-2"
        >
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          {open ? 'Hide' : 'Show'} full research metrics (Halstead, coupling, cohesion, tokens, smell-by-type…)
        </button>
        {open && (
          <ResearchMetricsPanel
            metrics={metrics.researchMetrics}
            pipelineMetadata={metrics.pipelineMetadata}
            exportContext={{ workspaceId, filePath }}
          />
        )}
      </td>
    </tr>
  );
}
