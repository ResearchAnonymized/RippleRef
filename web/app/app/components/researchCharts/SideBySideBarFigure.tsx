'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import type { BeforeAfterRow } from './types';
import { RESEARCH_CHART, formatValue, isImproved } from './theme';

type Props = {
  title: string;
  subtitle?: string;
  rows: BeforeAfterRow[];
  className?: string;
};

const TOOLTIP = {
  backgroundColor: 'rgba(15, 23, 42, 0.96)',
  border: '1px solid rgba(71, 85, 105, 0.8)',
  borderRadius: 8,
  color: '#f1f5f9',
  fontSize: 12,
};

/** Split large-scale metrics so side-by-side bars stay readable. */
function groupRowsForCharts(rows: BeforeAfterRow[]): BeforeAfterRow[][] {
  const volume = rows.filter((r) => /halstead volume/i.test(r.label));
  const size = rows.filter((r) => /lines of code|method count/i.test(r.label));
  const other = rows.filter((r) => !volume.includes(r) && !size.includes(r));

  const groups: BeforeAfterRow[][] = [];
  if (other.length) groups.push(other);
  if (size.length) groups.push(size);
  if (volume.length) groups.push(volume);
  return groups.length > 0 ? groups : [rows];
}

function GroupedBarPanel({ rows, panelLabel }: { rows: BeforeAfterRow[]; panelLabel?: string }) {
  const chartData = rows.map((r) => ({
    name: r.label,
    Before: r.before,
    After: r.after,
    lowerIsBetter: r.lowerIsBetter,
  }));

  const maxVal = Math.max(
    ...rows.flatMap((r) => [r.before, r.after]),
    1
  );

  return (
    <div className="mt-2">
      {panelLabel && (
        <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wide">{panelLabel}</p>
      )}
      <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 48)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: 28, left: 8, bottom: 4 }}
          barGap={2}
          barCategoryGap="18%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke={RESEARCH_CHART.grid} horizontal={false} />
          <XAxis
            type="number"
            domain={[0, Math.ceil(maxVal * 1.12)]}
            stroke={RESEARCH_CHART.textMuted}
            tick={{ fill: RESEARCH_CHART.textMuted, fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            stroke={RESEARCH_CHART.textMuted}
            tick={{ fill: RESEARCH_CHART.text, fontSize: 11 }}
          />
          <Tooltip contentStyle={TOOLTIP} />
          <Legend wrapperStyle={{ fontSize: 11, color: RESEARCH_CHART.textMuted }} />
          <Bar dataKey="Before" name="Before" fill={RESEARCH_CHART.before} radius={[0, 4, 4, 0]} barSize={16} />
          <Bar dataKey="After" name="After" radius={[0, 4, 4, 0]} barSize={16}>
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={
                  entry.Before === entry.After
                    ? RESEARCH_CHART.neutral
                    : isImproved(entry.lowerIsBetter, entry.Before, entry.After)
                      ? RESEARCH_CHART.improved
                      : RESEARCH_CHART.regressed
                }
              />
            ))}
            <LabelList
              dataKey="After"
              position="right"
              fill={RESEARCH_CHART.text}
              fontSize={10}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function SideBySideBarFigure({
  title,
  subtitle,
  rows,
  className = '',
}: Props) {
  if (rows.length === 0) return null;

  const groups = groupRowsForCharts(rows);
  const panelLabels =
    groups.length > 1
      ? ['Counts & quality', 'File size', 'Halstead volume'].slice(0, groups.length)
      : [];

  return (
    <figure className={`rounded-xl border border-slate-600/50 bg-slate-950/40 p-4 ${className}`}>
      <figcaption className="mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </div>
        {subtitle && (
          <p className="text-[10px] text-slate-500 mt-1 max-w-2xl leading-relaxed">{subtitle}</p>
        )}
        <p className="text-[10px] text-slate-500 mt-1">
          Grey = before, green = after (improved), orange = after (worse). Side-by-side bars per metric.
        </p>
      </figcaption>

      {groups.map((group, idx) => (
        <GroupedBarPanel
          key={idx}
          rows={group}
          panelLabel={groups.length > 1 ? panelLabels[idx] ?? `Panel ${idx + 1}` : undefined}
        />
      ))}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[10px] text-slate-400 border-collapse">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-1 pr-2 font-medium">Metric</th>
              <th className="text-right py-1 px-2 font-medium">Before</th>
              <th className="text-right py-1 px-2 font-medium">After</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-800/80">
                <td className="py-1 pr-2 text-slate-300">{r.label}</td>
                <td className="text-right py-1 px-2 font-mono">{formatValue(r.before)}</td>
                <td className="text-right py-1 px-2 font-mono text-slate-200">
                  {formatValue(r.after)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
