'use client';

import React, { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import SideBySideBarFigure from './researchCharts/SideBySideBarFigure';
import ChurnFigure from './researchCharts/ChurnFigure';
import { buildCoreMetricRows, buildResearchMetricRows } from './researchCharts/buildRows';
import type { ChurnRow } from './researchCharts/types';

type Deltas = {
  before?: number;
  after?: number;
  qualityMetrics?: {
    before?: { complexity?: number; maintainability?: number; testability?: number };
    after?: { complexity?: number; maintainability?: number; testability?: number };
  };
  comprehensiveAnalysis?: {
    summary?: { overall_score?: number };
    metrics?: {
      lines_of_code?: { before: number; after: number };
      methods?: { before: number; after: number };
    };
  };
};

type Improvement = {
  before?: { total: number; critical: number; major: number; minor: number };
  after?: { total: number; critical: number; major: number; minor: number };
};

type Research = Parameters<typeof buildResearchMetricRows>[0] & {
  diff_churn?: {
    lines_added?: number;
    lines_removed?: number;
    lines_modified?: number;
    hunks?: number;
    churn_rate_percent?: number;
  };
};

export default function RefactoringVisualSummary({
  deltas,
  improvementStats,
  researchMetrics,
}: {
  deltas?: Deltas | null;
  improvementStats?: Improvement | null;
  researchMetrics?: Research | null;
}) {
  const coreRows = useMemo(
    () => buildCoreMetricRows(deltas, improvementStats),
    [deltas, improvementStats]
  );

  const researchRows = useMemo(
    () => buildResearchMetricRows(researchMetrics),
    [researchMetrics]
  );

  const churnData = useMemo((): ChurnRow[] => {
    const dc = researchMetrics?.diff_churn;
    if (!dc) return [];
    const rows: ChurnRow[] = [];
    if (typeof dc.lines_added === 'number')
      rows.push({ label: 'Lines added', value: dc.lines_added, color: '#059669' });
    if (typeof dc.lines_removed === 'number')
      rows.push({ label: 'Lines removed', value: dc.lines_removed, color: '#e11d48' });
    if (typeof dc.lines_modified === 'number')
      rows.push({ label: 'Lines modified', value: dc.lines_modified, color: '#ca8a04' });
    if (typeof dc.hunks === 'number')
      rows.push({ label: 'Hunks', value: dc.hunks, color: '#7c3aed' });
    return rows;
  }, [researchMetrics]);

  if (coreRows.length === 0 && researchRows.length === 0 && churnData.length === 0) return null;

  const score = deltas?.comprehensiveAnalysis?.summary?.overall_score;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-600/60 bg-gradient-to-br from-slate-900/95 via-slate-800/90 to-indigo-950/40 p-5 mb-4 shadow-xl shadow-indigo-950/20">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl"
        aria-hidden
      />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 text-white font-semibold tracking-tight">
            <Sparkles className="w-5 h-5 text-amber-400" />
            Before vs after — bar charts
          </div>
          <p className="mt-1 max-w-2xl text-xs text-slate-400 leading-relaxed">
            Simple grouped bars: grey = before, green = improved after, orange = worse after. Large metrics (e.g. LOC,
            Halstead volume) are split into separate panels so smaller values stay visible.
          </p>
        </div>
        {score != null && (
          <div className="flex shrink-0 items-center gap-3 rounded-xl border border-slate-600/50 bg-slate-950/50 px-4 py-2">
            <div
              className={`text-2xl font-bold tabular-nums ${
                score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-orange-400'
              }`}
            >
              {score.toFixed(0)}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Quality
              <br />
              score
            </div>
          </div>
        )}
      </div>

      {coreRows.length > 0 && (
        <SideBySideBarFigure
          title="Core metrics"
          subtitle="PMD smells, size, and quality indices."
          rows={coreRows}
          className="mb-4"
        />
      )}

      {researchRows.length > 0 && (
        <SideBySideBarFigure
          title="Research metrics"
          subtitle="Halstead, method length, nesting, coupling, cohesion."
          rows={researchRows}
          className="mb-4"
        />
      )}

      {churnData.length > 0 && (
        <ChurnFigure
          rows={churnData}
          churnRatePercent={researchMetrics?.diff_churn?.churn_rate_percent}
        />
      )}
    </div>
  );
}
