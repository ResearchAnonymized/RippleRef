'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import type { ChurnRow } from './types';
import { RESEARCH_CHART } from './theme';

type Props = {
  rows: ChurnRow[];
  churnRatePercent?: number;
  className?: string;
};

const TOOLTIP = {
  backgroundColor: 'rgba(15, 23, 42, 0.96)',
  border: '1px solid rgba(71, 85, 105, 0.8)',
  borderRadius: 8,
  color: '#f1f5f9',
  fontSize: 12,
};

export default function ChurnFigure({ rows, churnRatePercent, className = '' }: Props) {
  if (rows.length === 0) return null;

  const maxVal = Math.max(...rows.map((r) => r.value), 1);

  return (
    <figure className={`rounded-xl border border-slate-600/50 bg-slate-950/40 p-4 ${className}`}>
      <figcaption className="mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Edit churn (this refactor)
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          Line-level diff statistics for the accepted or proposed change set. Churn rate = changed lines relative to file size.
        </p>
      </figcaption>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={rows} margin={{ top: 20, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={RESEARCH_CHART.grid} vertical={false} />
          <XAxis
            dataKey="label"
            stroke={RESEARCH_CHART.textMuted}
            tick={{ fill: RESEARCH_CHART.textMuted, fontSize: 10 }}
            interval={0}
          />
          <YAxis
            stroke={RESEARCH_CHART.textMuted}
            tick={{ fill: RESEARCH_CHART.textMuted, fontSize: 10 }}
            domain={[0, Math.ceil(maxVal * 1.15)]}
            allowDecimals={false}
          />
          <Tooltip contentStyle={TOOLTIP} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={36}>
            {rows.map((e, i) => (
              <Cell key={i} fill={e.color} />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              fill={RESEARCH_CHART.text}
              fontSize={11}
              fontWeight={600}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {typeof churnRatePercent === 'number' && (
        <p className="text-center text-[11px] text-slate-500 mt-2">
          Churn rate:{' '}
          <span className="font-mono font-medium text-slate-300">{churnRatePercent}%</span>
        </p>
      )}
    </figure>
  );
}
