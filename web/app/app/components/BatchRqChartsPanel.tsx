'use client';

import React, { useMemo } from 'react';
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
} from 'recharts';
import { BarChart3, Beaker, Target, TrendingDown } from 'lucide-react';
import { buildRqSummary, type BatchFileForRq } from '../lib/buildBatchRqChartData';
import SideBySideBarFigure from './researchCharts/SideBySideBarFigure';
import type { BeforeAfterRow } from './researchCharts/types';

const TOOLTIP = {
  backgroundColor: 'rgba(15, 23, 42, 0.96)',
  border: '1px solid rgba(71, 85, 105, 0.8)',
  borderRadius: 8,
  color: '#f1f5f9',
  fontSize: 12,
};

const PROVIDER_COLORS: Record<string, string> = {
  OpenAI: '#34d399',
  Google: '#38bdf8',
  Anthropic: '#fb923c',
};

export default function BatchRqChartsPanel({ results }: { results: BatchFileForRq[] }) {
  const summary = useMemo(() => buildRqSummary(results), [results]);

  const smellByProvider = summary.providerAggregates.map((p) => ({
    name: p.provider,
    'Avg smell reduction': Math.round(p.avgSmellDelta * 10) / 10,
    'Changed passes': p.changedCount,
  }));

  const qualityByProvider = summary.providerAggregates.map((p) => ({
    name: p.provider,
    'Δ Complexity': Math.round(p.avgComplexityDelta * 100) / 100,
    'Δ Maintainability': Math.round(p.avgMaintainabilityDelta * 100) / 100,
    'Δ Testability': Math.round(p.avgTestabilityDelta * 100) / 100,
  }));

  const finalMetricRows: BeforeAfterRow[] = useMemo(() => {
    const rows: BeforeAfterRow[] = [];
    let pmdB = 0;
    let pmdA = 0;
    let n = 0;
    let ccB = 0;
    let ccA = 0;
    let miB = 0;
    let miA = 0;
    for (const r of results) {
      const m = r.metrics;
      if (!m) continue;
      if (m.pmdSmells.before != null && m.pmdSmells.after != null) {
        pmdB += m.pmdSmells.before;
        pmdA += m.pmdSmells.after;
        n += 1;
      }
      if (m.complexity.before != null && m.complexity.after != null) {
        ccB += m.complexity.before;
        ccA += m.complexity.after;
      }
      if (m.maintainability.before != null && m.maintainability.after != null) {
        miB += m.maintainability.before;
        miA += m.maintainability.after;
      }
    }
    if (n > 0) {
      rows.push({
        id: 'pmd-batch',
        label: 'PMD smells (batch mean)',
        before: Math.round(pmdB / n),
        after: Math.round(pmdA / n),
        lowerIsBetter: true,
      });
    }
    if (results.length > 0 && ccB > 0) {
      rows.push({
        id: 'cc-batch',
        label: 'Cyclomatic complexity (mean)',
        before: Math.round((ccB / results.length) * 10) / 10,
        after: Math.round((ccA / results.length) * 10) / 10,
        lowerIsBetter: true,
      });
      rows.push({
        id: 'mi-batch',
        label: 'Maintainability index (mean)',
        before: Math.round((miB / results.length) * 10) / 10,
        after: Math.round((miA / results.length) * 10) / 10,
        lowerIsBetter: false,
      });
    }
    return rows;
  }, [results]);

  if (results.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 text-center text-slate-400 text-sm">
        Run a batch to generate RQ charts (smell reduction, quality deltas, per-LLM agent passes).
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4">
        <h3 className="text-white font-semibold flex items-center gap-2 mb-1">
          <Beaker className="w-5 h-5 text-violet-400" />
          Research questions — batch summary
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Each LLM pass runs the full multi-agent pipeline (smell detection → planning → feasibility →
          refactor → verify). Charts compare providers across the batch.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700">
            <div className="text-2xl font-bold text-white">{summary.totalFiles}</div>
            <div className="text-xs text-slate-400">Files in batch</div>
          </div>
          <div className="bg-slate-900/60 rounded-lg p-3 border border-green-500/30">
            <div className="text-2xl font-bold text-green-400">{summary.accepted}</div>
            <div className="text-xs text-slate-400">RQ: accepted</div>
          </div>
          <div className="bg-slate-900/60 rounded-lg p-3 border border-blue-500/30">
            <div className="text-2xl font-bold text-blue-300">
              {summary.avgFinalSmellDelta > 0 ? '-' : ''}
              {Math.abs(Math.round(summary.avgFinalSmellDelta * 10) / 10)}
            </div>
            <div className="text-xs text-slate-400">RQ1: avg PMD Δ</div>
          </div>
          <div className="bg-slate-900/60 rounded-lg p-3 border border-indigo-500/30">
            <div className="text-2xl font-bold text-indigo-300">
              {summary.avgFinalOverallScore
                ? Math.round(summary.avgFinalOverallScore)
                : '—'}
            </div>
            <div className="text-xs text-slate-400">RQ2: overall score</div>
          </div>
        </div>
      </div>

      {summary.providerAggregates.length > 0 ? (
        <>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
              <TrendingDown className="w-4 h-4 text-emerald-400" />
              RQ1 — Smell reduction by LLM provider (per agent pass)
            </h4>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={smellByProvider} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={TOOLTIP} />
                <Legend />
                <Bar dataKey="Avg smell reduction" radius={[4, 4, 0, 0]}>
                  {smellByProvider.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={PROVIDER_COLORS[entry.name] ?? '#6366f1'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-sky-400" />
              RQ2 — Quality metric deltas by provider (after each agent pass)
            </h4>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={qualityByProvider} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={TOOLTIP} />
                <Legend />
                <Bar dataKey="Δ Complexity" fill="#f87171" />
                <Bar dataKey="Δ Maintainability" fill="#34d399" />
                <Bar dataKey="Δ Testability" fill="#a78bfa" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 overflow-x-auto">
            <h4 className="text-sm font-semibold text-white mb-3">RQ3 — Agent pass outcomes</h4>
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700">
                  <th className="py-2 pr-4">Provider</th>
                  <th className="py-2 pr-4">Model</th>
                  <th className="py-2 pr-4">Passes</th>
                  <th className="py-2 pr-4">OK</th>
                  <th className="py-2 pr-4">Changed</th>
                  <th className="py-2 pr-4">Avg smell Δ</th>
                  <th className="py-2">Orchestration</th>
                </tr>
              </thead>
              <tbody>
                {summary.providerAggregates.map((p) => (
                  <tr key={p.provider} className="border-b border-slate-700/50 text-slate-200">
                    <td className="py-2 pr-4 font-medium">{p.provider}</td>
                    <td className="py-2 pr-4 font-mono text-slate-400">{p.model.split('/').pop()}</td>
                    <td className="py-2 pr-4">{p.passCount}</td>
                    <td className="py-2 pr-4 text-green-400">{p.okCount}</td>
                    <td className="py-2 pr-4">{p.changedCount}</td>
                    <td className="py-2 pr-4">{Math.round(p.avgSmellDelta * 10) / 10}</td>
                    <td className="py-2 text-indigo-300">multi-agent</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {finalMetricRows.length > 0 ? (
        <SideBySideBarFigure
          title="RQ4 — Final batch outcome (before vs after verification)"
          subtitle="Mean metrics across all files after the full multi-LLM agent chain"
          rows={finalMetricRows}
        />
      ) : null}

      <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-3 text-[11px] text-slate-500 flex items-start gap-2">
        <BarChart3 className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Export CSV/JSON from the Results tab for paper tables. Per-file agent step logs are in each
          LLM pass record (<code className="text-slate-400">agentSteps</code>).
        </span>
      </div>
    </div>
  );
}
