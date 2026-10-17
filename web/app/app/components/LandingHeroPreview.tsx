'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
  CartesianGrid,
} from 'recharts';

/** Illustrative sample data — not live project metrics. */
const BEFORE_AFTER = [
  { name: 'Smells', before: 54, after: 38 },
  { name: 'Complexity', before: 28, after: 21 },
  { name: 'Maintain.', before: 72, after: 84 },
];

const TREND = [
  { pass: 62 },
  { pass: 68 },
  { pass: 71 },
  { pass: 74 },
  { pass: 78 },
];

const tip = {
  backgroundColor: 'rgba(15, 23, 42, 0.92)',
  border: '1px solid rgba(71, 85, 105, 0.6)',
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: 12,
};

export default function LandingHeroPreview() {
  return (
    <div className="mx-auto mb-16 grid w-full min-w-0 max-w-5xl gap-6 lg:grid-cols-5">
      <div className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-600/50 bg-gradient-to-br from-slate-900/90 to-indigo-950/50 p-4 shadow-xl lg:col-span-3">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-blue-500/10 blur-3xl" aria-hidden />
        <p className="relative mb-1 text-[10px] font-semibold uppercase tracking-widest text-blue-300/90">
          Dashboard preview
        </p>
        <h3 className="relative mb-3 text-left text-lg font-bold text-white">Before vs after (example)</h3>
        <p className="relative mb-4 text-left text-xs text-slate-400">
          Real runs show smells, Halstead, churn, and verification — same chart style as the refactoring review.
        </p>
        <div className="relative h-[220px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={BEFORE_AFTER} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.5} />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#475569' }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#475569' }} />
              <Tooltip contentStyle={tip} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Bar dataKey="before" name="Before" fill="#64748b" radius={[6, 6, 0, 0]} maxBarSize={36} />
              <Bar dataKey="after" name="After" fill="#34d399" radius={[6, 6, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
        <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-emerald-500/20 bg-slate-900/80 p-4 shadow-lg">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-300/90">
            Quality trajectory
          </p>
          <h3 className="mb-2 text-sm font-bold text-white">Iterative passes (example)</h3>
          <div className="h-[120px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={TREND} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="passGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis hide />
                <YAxis domain={[55, 85]} tick={{ fill: '#64748b', fontSize: 10 }} width={32} />
                <Tooltip contentStyle={tip} formatter={(v: number) => [`${v}`, 'Score']} />
                <Area
                  type="monotone"
                  dataKey="pass"
                  name="Score"
                  stroke="#34d399"
                  strokeWidth={2}
                  fill="url(#passGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-600/50 bg-slate-800/40 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Pipeline</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-200">
            <span className="rounded-full bg-blue-500/20 px-3 py-1 text-blue-200">Assess</span>
            <span className="text-slate-600">→</span>
            <span className="rounded-full bg-amber-500/20 px-3 py-1 text-amber-200">Smells</span>
            <span className="text-slate-600">→</span>
            <span className="rounded-full bg-violet-500/20 px-3 py-1 text-violet-200">Refactor</span>
            <span className="text-slate-600">→</span>
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-emerald-200">Verify</span>
          </div>
        </div>
      </div>
    </div>
  );
}
