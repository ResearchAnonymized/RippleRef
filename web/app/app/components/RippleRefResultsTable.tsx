'use client';

import React, { useMemo, useState } from 'react';
import type { CandidateResultRow, CandidateResultsSummary } from '../lib/rippleRefStudy';

function badgeClass(tone: 'green' | 'amber' | 'red' | 'slate' | 'violet') {
  const map = {
    green: 'bg-green-900/50 text-green-300 border-green-700/50',
    amber: 'bg-amber-900/50 text-amber-300 border-amber-700/50',
    red: 'bg-red-900/50 text-red-300 border-red-700/50',
    slate: 'bg-slate-800 text-slate-300 border-slate-600',
    violet: 'bg-violet-900/50 text-violet-300 border-violet-700/50',
  };
  return `inline-flex px-2 py-0.5 rounded border text-xs font-medium ${map[tone]}`;
}

function riskTone(level?: string): 'green' | 'amber' | 'red' | 'slate' {
  if (level === 'Low') return 'green';
  if (level === 'Medium') return 'amber';
  if (level === 'High') return 'red';
  return 'slate';
}

function adoptionTone(cls?: string): 'green' | 'amber' | 'red' | 'slate' | 'violet' {
  if (cls === 'safe') return 'green';
  if (cls === 'ripple_and_behavior_ok_tests_skipped' || cls === 'behavior_ok_tests_failed') return 'amber';
  if (cls === 'ripple_safe_behavior_uncertain') return 'violet';
  if (cls === 'risky') return 'red';
  if (cls === 'rejected') return 'slate';
  return 'slate';
}

function shortModel(id: string) {
  const slash = id.lastIndexOf('/');
  return slash >= 0 ? id.substring(slash + 1) : id;
}

function shortFile(filePath: string) {
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length <= 2) return filePath;
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

function testProbeTone(status?: string): 'green' | 'amber' | 'red' | 'slate' | 'violet' {
  if (!status) return 'slate';
  if (status === 'success') return 'green';
  if (status === 'skipped') return 'violet';
  if (status === 'failed' || status === 'timeout' || status === 'error') return 'red';
  return 'amber';
}

function formatTestProbe(r: CandidateResultRow): string {
  if (!r.testProbeStatus) return 'pending';
  if (r.testProbeStatus === 'success') {
    const total = (r.testsPassed ?? 0) + (r.testsFailed ?? 0);
    return total > 0 ? `pass (${r.testsPassed}/${total})` : 'pass';
  }
  return r.testProbeStatus;
}

type Props = {
  rows: CandidateResultRow[];
  summary: CandidateResultsSummary;
  /** B0 ripple-ref vs P-MA multi-agent study */
  studyMode?: 'ripple' | 'ma';
  onRowSelect?: (row: CandidateResultRow) => void;
};

export default function RippleRefResultsTable({
  rows,
  summary,
  studyMode = 'ripple',
  onRowSelect,
}: Props) {
  const isMa = studyMode === 'ma';
  const [variantFilter, setVariantFilter] = useState<'all' | 'V1' | 'V2' | 'MA'>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [adoptionFilter, setAdoptionFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');

  const models = useMemo(
    () => Array.from(new Set(rows.map((r) => r.modelId).filter(Boolean))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (variantFilter !== 'all' && r.variant !== variantFilter) return false;
      if (riskFilter !== 'all' && r.riskLevel !== riskFilter) return false;
      if (adoptionFilter !== 'all' && r.adoptionClass !== adoptionFilter) return false;
      if (modelFilter !== 'all' && r.modelId !== modelFilter) return false;
      return true;
    });
  }, [rows, variantFilter, riskFilter, adoptionFilter, modelFilter]);

  const maStats = useMemo(() => {
    if (!isMa) return null;
    const completed = rows.filter((r) => r.status === 'completed');
    const steps = completed.map((r) => r.agentStepCount ?? 0).filter((n) => n > 0);
    const avgSteps = steps.length ? Math.round(steps.reduce((a, b) => a + b, 0) / steps.length) : 0;
    const llmVerifyApproved = completed.filter((r) => r.llmVerifyApproved === true).length;
    return { avgSteps, llmVerifyApproved };
  }, [isMa, rows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        <StatCard label="Candidates" value={summary.totalRows} />
        <StatCard label="L4 pass (advisory)" value={summary.l4Pass ?? summary.behavioralPass} tone="green" />
        <StatCard label="L4 fail" value={summary.l4Fail ?? summary.behavioralFail} tone="amber" />
        <StatCard label="L5 pass (tests)" value={summary.l5Success ?? 0} tone="green" />
        <StatCard label="L5 pending" value={summary.l5Pending ?? 0} tone="amber" />
        <StatCard label="Caller breakage" value={summary.observedCallerBreakage} tone="red" />
        <StatCard label="Paired units" value={summary.pairedUnits} />
        {isMa ? (
          <>
            <StatCard label="Avg agent steps" value={maStats?.avgSteps ?? 0} tone="violet" />
            <StatCard label="LLM verify OK" value={maStats?.llmVerifyApproved ?? 0} tone="green" />
          </>
        ) : (
          <StatCard label="V2 safer than V1" value={summary.v2SaferThanV1} tone="violet" />
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <FilterSelect
          label="Variant"
          value={variantFilter}
          onChange={(v) => setVariantFilter(v as typeof variantFilter)}
          options={isMa ? ['all', 'MA'] : ['all', 'V1', 'V2']}
        />
        <FilterSelect
          label="Risk"
          value={riskFilter}
          onChange={setRiskFilter}
          options={['all', 'Low', 'Medium', 'High']}
        />
        <FilterSelect
          label="Adoption"
          value={adoptionFilter}
          onChange={setAdoptionFilter}
          options={[
            'all',
            'safe',
            'ripple_and_behavior_ok_tests_skipped',
            'ripple_safe_behavior_uncertain',
            'behavior_ok_tests_failed',
            'risky',
            'rejected',
          ]}
        />
        <FilterSelect label="Model" value={modelFilter} onChange={setModelFilter} options={['all', ...models]} />
        <span className="text-slate-500 self-center ml-auto">{filtered.length} shown</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-950 text-slate-400">
            <tr>
              <th className="px-2 py-2 text-left">File</th>
              <th className="px-2 py-2 text-left">Model</th>
              <th className="px-2 py-2">Var</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Risk</th>
              <th className="px-2 py-2">Contract</th>
              <th className="px-2 py-2">Observed</th>
              <th className="px-2 py-2">Broken</th>
              <th className="px-2 py-2">L4 heuristic</th>
              <th className="px-2 py-2">Adoption</th>
              <th className="px-2 py-2">L5 tests</th>
              <th className="px-2 py-2">Smells</th>
              <th className="px-2 py-2">L</th>
              {isMa && (
                <>
                  <th className="px-2 py-2">Steps</th>
                  <th className="px-2 py-2">LLM verify</th>
                  <th className="px-2 py-2">Graph</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={isMa ? 16 : 13} className="px-3 py-6 text-center text-slate-500">
                  No results yet. Run the experiment or load a study with completed candidates.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.pairKey}
                  className={`hover:bg-slate-800/40 ${onRowSelect ? 'cursor-pointer' : ''}`}
                  onClick={onRowSelect ? () => onRowSelect(r) : undefined}
                >
                  <td className="px-2 py-1.5 font-mono text-slate-300" title={r.filePath}>
                    {shortFile(r.filePath)}
                  </td>
                  <td className="px-2 py-1.5 text-slate-400" title={r.modelId}>
                    {shortModel(r.modelId)}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={badgeClass(r.variant === 'V2' || r.variant === 'MA' ? 'violet' : 'slate')}>
                      {r.variant}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-center text-slate-400">{r.status}</td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={badgeClass(riskTone(r.riskLevel))}>{r.riskLevel || '—'}</span>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={badgeClass(riskTone(r.contractRiskLevel))}>{r.contractRiskLevel || '—'}</span>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={badgeClass(riskTone(r.observedRiskLevel))}>{r.observedRiskLevel || '—'}</span>
                  </td>
                  <td className="px-2 py-1.5 text-center text-slate-300">{r.observedBrokenCallerCount ?? 0}</td>
                  <td className="px-2 py-1.5 text-center">
                    {r.status === 'completed' ? (
                      <span
                        className={badgeClass(r.behavioralCorrect ? 'green' : 'red')}
                        title="L4 advisory heuristic"
                      >
                        {r.behavioralCorrect ? 'pass' : 'fail'}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={badgeClass(adoptionTone(r.adoptionClass))}>
                      {(r.adoptionClass || '—').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span
                      className={badgeClass(testProbeTone(r.testProbeStatus))}
                      title="L5 targeted Maven tests in sandbox"
                    >
                      {formatTestProbe(r)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-center text-slate-400">
                    {r.smellCountBefore}→{r.smellCountAfter}
                  </td>
                  <td className="px-2 py-1.5 text-center text-slate-500">{r.verificationLevel || '—'}</td>
                  {isMa && (
                    <>
                      <td className="px-2 py-1.5 text-center text-violet-300">{r.agentStepCount ?? '—'}</td>
                      <td className="px-2 py-1.5 text-center">
                        {r.llmVerifyApproved === true ? (
                          <span className={badgeClass('green')}>yes</span>
                        ) : r.llmVerifyApproved === false ? (
                          <span className={badgeClass('red')}>no</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center text-slate-500">{r.graphVersion || '—'}</td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: number;
  tone?: 'green' | 'amber' | 'red' | 'slate' | 'violet';
}) {
  const tones = {
    green: 'border-green-700/40 bg-green-950/30',
    amber: 'border-amber-700/40 bg-amber-950/30',
    red: 'border-red-700/40 bg-red-950/30',
    slate: 'border-slate-700 bg-slate-950/50',
    violet: 'border-violet-700/40 bg-violet-950/30',
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-slate-400">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-slate-200"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o === 'all' ? 'All' : o}
          </option>
        ))}
      </select>
    </label>
  );
}
