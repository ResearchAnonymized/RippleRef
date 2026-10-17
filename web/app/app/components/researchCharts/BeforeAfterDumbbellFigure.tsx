'use client';

import React, { useRef, useCallback } from 'react';
import type { BeforeAfterRow } from './types';
import {
  RESEARCH_CHART,
  formatDelta,
  formatPctChange,
  formatValue,
  isImproved,
} from './theme';

type Props = {
  title: string;
  subtitle?: string;
  rows: BeforeAfterRow[];
  figureId?: string;
  showExport?: boolean;
  className?: string;
};

function MetricDumbbellRow({ row }: { row: BeforeAfterRow }) {
  const max = Math.max(row.before, row.after, 1) * 1.12;
  const beforePct = (row.before / max) * 100;
  const afterPct = (row.after / max) * 100;
  const improved = isImproved(row.lowerIsBetter, row.before, row.after);
  const unchanged = row.before === row.after;
  const afterColor = unchanged
    ? RESEARCH_CHART.neutral
    : improved
      ? RESEARCH_CHART.improved
      : RESEARCH_CHART.regressed;
  const pct = formatPctChange(row.before, row.after);

  return (
    <div
      className="grid grid-cols-[minmax(7rem,9rem)_1fr_minmax(6.5rem,8.5rem)] gap-2 items-center py-2 border-b border-slate-700/40 last:border-0"
      title={row.definition}
    >
      <div className="text-xs text-slate-300 font-medium leading-tight pr-1">{row.label}</div>
      <div className="relative h-7 flex items-center">
        <div
          className="absolute inset-y-2 left-0 right-0 rounded-full"
          style={{ background: RESEARCH_CHART.track }}
          aria-hidden
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-slate-400 z-10"
          style={{ left: `calc(${beforePct}% - 6px)`, background: RESEARCH_CHART.before }}
          title={`Before: ${formatValue(row.before, row.unit)}`}
          aria-hidden
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white/30 z-20 shadow-sm"
          style={{ left: `calc(${afterPct}% - 7px)`, background: afterColor }}
          title={`After: ${formatValue(row.after, row.unit)}`}
          aria-hidden
        />
        <div
          className="absolute top-1/2 h-0.5 z-0 opacity-60"
          style={{
            left: `${Math.min(beforePct, afterPct)}%`,
            width: `${Math.abs(afterPct - beforePct)}%`,
            background: afterColor,
          }}
          aria-hidden
        />
      </div>
      <div className="text-right tabular-nums text-[11px] leading-snug">
        <span className="text-slate-500">{formatValue(row.before)}</span>
        <span className="text-slate-600 mx-0.5">→</span>
        <span style={{ color: afterColor }} className="font-semibold">
          {formatValue(row.after, row.unit)}
        </span>
        <div className="text-[10px] text-slate-500 mt-0.5">
          Δ {formatDelta(row.before, row.after, row.unit)}
          {pct != null && <span className="ml-1">({pct})</span>}
        </div>
      </div>
    </div>
  );
}

export default function BeforeAfterDumbbellFigure({
  title,
  subtitle,
  rows,
  figureId = 'research-figure',
  showExport = true,
  className = '',
}: Props) {
  const ref = useRef<HTMLElement>(null);

  const exportPng = useCallback(async () => {
    if (!ref.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(ref.current, {
        backgroundColor: '#0f172a',
        scale: 2,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `${figureId}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.warn('Figure export failed', e);
    }
  }, [figureId]);

  if (rows.length === 0) return null;

  return (
    <figure className={`rounded-xl border border-slate-600/50 bg-slate-950/40 p-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <figcaption>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {title}
          </div>
          {subtitle && (
            <p className="text-[10px] text-slate-500 mt-1 max-w-2xl leading-relaxed">{subtitle}</p>
          )}
        </figcaption>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-500" /> Before
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: RESEARCH_CHART.improved }} /> After (better)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: RESEARCH_CHART.regressed }} /> After (worse)
          </span>
          {showExport && (
            <button
              type="button"
              onClick={() => void exportPng()}
              className="ml-2 px-2 py-0.5 rounded border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
            >
              Export PNG
            </button>
          )}
        </div>
      </div>

      <div ref={ref as React.RefObject<HTMLDivElement>}>
        {rows.map((row) => (
          <MetricDumbbellRow key={row.id} row={row} />
        ))}
        <p className="text-[9px] text-slate-600 mt-3 italic">
          Each row uses an independent scale (small multiples). Values and Δ% shown at right — suitable for paper tables and figures.
        </p>
      </div>
    </figure>
  );
}
