'use client';

import React from 'react';
import { FlaskConical, Shield, TestTube2 } from 'lucide-react';
import type { VerificationSummary } from '../lib/rippleRefStudy';

type Props = {
  title?: string;
  ma?: VerificationSummary | null;
  b0?: VerificationSummary | null;
  compact?: boolean;
  showChart?: boolean;
  /** Highlight MA or B0 block when that phase is active */
  highlightPhase?: 'ma' | 'b0' | null;
  pipelineRunning?: boolean;
};

function Metric({
  label,
  value,
  tone = 'slate',
  hint,
}: {
  label: string;
  value: number;
  tone?: 'green' | 'amber' | 'red' | 'slate' | 'cyan' | 'violet';
  hint?: string;
}) {
  const tones = {
    green: 'border-emerald-700/40 bg-emerald-950/30 text-emerald-200',
    amber: 'border-amber-700/40 bg-amber-950/30 text-amber-200',
    red: 'border-red-700/40 bg-red-950/30 text-red-200',
    slate: 'border-slate-700 bg-slate-900/50 text-slate-200',
    cyan: 'border-cyan-700/40 bg-cyan-950/30 text-cyan-200',
    violet: 'border-violet-700/40 bg-violet-950/30 text-violet-200',
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${tones[tone]}`} title={hint}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

type L5Segment = { key: string; label: string; value: number; color: string; hint: string };

function buildL5Segments(v: VerificationSummary): L5Segment[] {
  return [
    {
      key: 'preserved',
      label: 'Preserved',
      value: v.l5Preserved ?? 0,
      color: 'bg-cyan-500',
      hint: 'Baseline + refactored tests passed',
    },
    {
      key: 'regression',
      label: 'Regression',
      value: v.l5Regression ?? 0,
      color: 'bg-red-500',
      hint: 'Baseline passed, refactored failed',
    },
    {
      key: 'inconclusive',
      label: 'Inconclusive',
      value: v.l5Inconclusive ?? 0,
      color: 'bg-violet-500',
      hint: 'Baseline tests did not pass',
    },
    {
      key: 'skipped',
      label: 'Skipped',
      value: v.l5Skipped ?? 0,
      color: 'bg-slate-500',
      hint: 'No Maven module or no targeted tests',
    },
    {
      key: 'pending',
      label: 'Pending',
      value: v.l5Pending ?? 0,
      color: 'bg-amber-500/80',
      hint: 'Not yet backfilled',
    },
  ];
}

function L5BreakdownChart({ v, label }: { v: VerificationSummary; label: string }) {
  const segments = buildL5Segments(v);
  const total = Math.max(v.completedCandidates, 1);
  const probed = total - (v.l5Pending ?? 0);

  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-900/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-slate-300">{label} — L5 cohort breakdown</div>
        <div className="text-[10px] text-slate-500">
          probed {probed}/{total} completed
        </div>
      </div>
      <div className="h-3 w-full rounded-full bg-slate-800 overflow-hidden flex">
        {segments.map((s) =>
          s.value > 0 ? (
            <div
              key={s.key}
              className={`${s.color} h-full transition-all duration-500`}
              style={{ width: `${(s.value / total) * 100}%` }}
              title={`${s.label}: ${s.value} — ${s.hint}`}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
        {segments.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1" title={s.hint}>
            <span className={`inline-block w-2 h-2 rounded-sm ${s.color}`} />
            {s.label}: {s.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function StudyBlock({
  label,
  v,
  showChart,
  highlighted,
}: {
  label: string;
  v: VerificationSummary;
  showChart?: boolean;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`space-y-3 rounded-lg p-3 transition-all ${
        highlighted
          ? 'border border-cyan-500/40 bg-cyan-950/25 ring-1 ring-cyan-400/30'
          : ''
      }`}
    >
      <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</div>
      {showChart && <L5BreakdownChart v={v} label={label} />}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10 gap-2">
        <Metric label="Completed" value={v.completedCandidates} tone="slate" />
        <Metric
          label="L4 pass"
          value={v.l4Pass}
          tone="green"
          hint="Advisory heuristic (signatures, exceptions, control flow)"
        />
        <Metric label="L4 fail" value={v.l4Fail} tone="amber" hint="Heuristic red flags" />
        <Metric
          label="L5 preserved"
          value={v.l5Preserved ?? 0}
          tone="cyan"
          hint="Baseline tests passed and refactored tests passed (paired primary)"
        />
        <Metric
          label="L5 regression"
          value={v.l5Regression ?? 0}
          tone="red"
          hint="Baseline passed but refactored run failed"
        />
        <Metric label="L5 inconclusive" value={v.l5Inconclusive ?? 0} tone="violet" hint="Baseline tests did not pass" />
        <Metric label="L5 skipped" value={v.l5Skipped ?? 0} tone="slate" hint="No targeted tests / no Maven module" />
        <Metric label="L5 fail" value={v.l5Fail} tone="red" hint="Tests failed or timed out" />
        <Metric label="L5 pending" value={v.l5Pending} tone="amber" hint="Not yet backfilled" />
        <Metric label="L4→L5 done" value={Math.max(0, v.completedCandidates - v.l5Pending)} tone="green" hint="Candidates with any L5 probe result" />
      </div>
    </div>
  );
}

export default function VerificationMetricsPanel({
  title,
  ma,
  b0,
  compact,
  showChart,
  highlightPhase,
  pipelineRunning,
}: Props) {
  if (!ma && !b0) return null;

  return (
    <div
      className={`rounded-xl border bg-slate-950/40 ${compact ? 'p-3' : 'p-4'} space-y-4 ${
        pipelineRunning ? 'border-cyan-600/50' : 'border-slate-700'
      }`}
    >
      <div>
        <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          <TestTube2 className="w-4 h-4 text-cyan-400" />
          {title ?? 'Behavior verification (L4 advisory · L5 paired tests)'}
        </h4>
        {!compact && (
          <p className="text-xs text-slate-500 mt-1 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-1">
              <Shield className="w-3 h-3 text-amber-400" /> L4 = static heuristics (advisory)
            </span>
            <span className="inline-flex items-center gap-1">
              <FlaskConical className="w-3 h-3 text-cyan-400" /> L5 = same Maven tests on before + after file
            </span>
          </p>
        )}
      </div>
      {ma && (
        <StudyBlock
          label="P-MA (ma_ref_master)"
          v={ma}
          showChart={showChart ?? !compact}
          highlighted={highlightPhase === 'ma'}
        />
      )}
      {b0 && (
        <StudyBlock
          label="B0 (ripple_ref_master)"
          v={b0}
          showChart={showChart ?? !compact}
          highlighted={highlightPhase === 'b0'}
        />
      )}
    </div>
  );
}
