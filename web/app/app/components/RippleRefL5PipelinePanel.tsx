'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  TestTube2,
  Zap,
} from 'lucide-react';
import {
  RIPPLE_REF_MASTER_STUDY_ID,
  fetchRippleRefL5PipelineStatus,
  startRippleRefL5Pipeline,
  stopRippleRefL5Pipeline,
  type RippleRefL5PipelineStatus,
  type VerificationSummary,
} from '../lib/rippleRefStudy';
import VerificationMetricsPanel from './VerificationMetricsPanel';

const PHASES = [
  { id: 'backfill_ma', label: '1 · MA L5', hint: '750 P-MA refactors — paired before/after tests (v2)' },
  { id: 'backfill_b0', label: '2 · B0 L5', hint: '~1182 B0 refactors — module + targeted discovery' },
  { id: 'complete', label: 'Done', hint: 'Both cohorts probed — ready for RQ3 analysis' },
] as const;

const STATE_RING: Record<string, string> = {
  running: 'ring-2 ring-cyan-400/70 ring-offset-2 ring-offset-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.25)]',
  healing: 'ring-2 ring-amber-400/70 ring-offset-2 ring-offset-slate-950 animate-pulse',
  complete: 'ring-2 ring-emerald-400/50 ring-offset-2 ring-offset-slate-950',
  idle: '',
  stopped: '',
};

function phaseIndex(phase?: string): number {
  const i = PHASES.findIndex((p) => p.id === phase);
  return i >= 0 ? i : 0;
}

function pctDone(v: VerificationSummary | null | undefined): number {
  if (!v?.completedCandidates) return 0;
  const pending = v.l5Pending ?? 0;
  return Math.min(100, ((v.completedCandidates - pending) / v.completedCandidates) * 100);
}

type Props = {
  studyId?: string;
  onLog?: (msg: string) => void;
  /** Show compact banner only (for top-of-panel highlight) */
  bannerOnly?: boolean;
  /** Switch to L5 tab when banner "View details" is clicked */
  onViewDetails?: () => void;
};

export default function RippleRefL5PipelinePanel({
  studyId = RIPPLE_REF_MASTER_STUDY_ID,
  onLog,
  bannerOnly = false,
  onViewDetails,
}: Props) {
  const [status, setStatus] = useState<RippleRefL5PipelineStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchRippleRefL5PipelineStatus(studyId);
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [studyId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  const state = status?.staleRunning ? 'stopped' : (status?.state ?? 'idle');
  const phase = status?.phase ?? (state === 'complete' ? 'complete' : 'backfill_ma');
  const pipelineUp = status?.l5PipelineAlive || state === 'running';
  const ma = status?.verificationMa ?? null;
  const b0 = status?.verificationB0 ?? null;
  const maPct = pctDone(ma);
  const b0Pct = pctDone(b0);
  const activeStudy = phase === 'backfill_b0' ? 'b0' : 'ma';

  const headline = useMemo(() => {
    if (state === 'complete') return 'L5 behavioral testing complete';
    if (!pipelineUp && (ma?.l5Pending ?? 0) > 0 && (b0?.l5Pending ?? 0) === (b0?.completedCandidates ?? 0)) {
      return 'MA L5 backfill in progress (external supervisor)';
    }
    if (phase === 'backfill_b0') {
      return `B0 L5 probing — ${status?.backfillProcessed ?? 0} / ${status?.backfillTotal ?? b0?.completedCandidates ?? '?'}`;
    }
    return `MA L5 probing — ${status?.backfillProcessed ?? 0} / ${status?.backfillTotal ?? ma?.completedCandidates ?? '?'}`;
  }, [state, pipelineUp, phase, status, ma, b0]);

  const runAction = async (action: 'start' | 'stop') => {
    setBusy(true);
    setError(null);
    try {
      const fn = action === 'start' ? startRippleRefL5Pipeline : stopRippleRefL5Pipeline;
      const s = await fn(studyId);
      setStatus(s);
      onLog?.(`L5 pipeline ${action}: ${s.state ?? 'ok'}`);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      onLog?.(`L5 pipeline ${action} failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const showLiveBanner = pipelineUp || state === 'running' || (maPct > 0 && maPct < 100);

  if (bannerOnly) {
    if (!showLiveBanner && state !== 'complete') return null;
    const bannerTitle =
      state === 'complete' ? 'L5 Behavioral Testing — COMPLETE' : 'L5 Behavioral Testing — LIVE';
    return (
      <div
        className={`rounded-xl border border-cyan-500/40 bg-gradient-to-r from-cyan-950/60 via-slate-900/80 to-violet-950/50 px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${STATE_RING[state === 'complete' ? 'complete' : state] ?? STATE_RING.running}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <TestTube2 className="w-6 h-6 text-cyan-400" />
            {pipelineUp && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-cyan-100 flex items-center gap-2">
              {state === 'complete' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <Zap className="w-4 h-4 text-amber-300" />
              )}
              {bannerTitle}
            </div>
            <div className="text-xs text-slate-300 truncate">{headline}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right text-xs">
            <div className="text-cyan-300/90">MA {maPct.toFixed(0)}%</div>
            <div className="text-violet-300/90">B0 {b0Pct.toFixed(0)}%</div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (onViewDetails) {
                onViewDetails();
              } else {
                setActiveTabScroll();
              }
            }}
            className="text-xs px-2 py-1 rounded border border-cyan-600/50 text-cyan-200 hover:bg-cyan-950/50"
          >
            View details ↓
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      id="ripple-ref-l5-pipeline"
      className={`rounded-xl border border-cyan-500/35 bg-gradient-to-b from-slate-950/90 to-slate-900/60 p-5 space-y-5 scroll-mt-4 ${showLiveBanner ? (STATE_RING[state] ?? STATE_RING.running) : ''}`}
    >
      {showLiveBanner && (
        <div className="rounded-lg border border-cyan-400/30 bg-cyan-950/40 px-3 py-2 flex items-center gap-2 text-sm text-cyan-100">
          <Sparkles className="w-4 h-4 text-cyan-300 animate-pulse shrink-0" />
          <span className="font-medium">{headline}</span>
          {status?.l5PipelineAlive && (
            <span className="ml-auto text-[10px] font-mono text-cyan-400/80">PID {status.l5PipelinePid}</span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-cyan-100 flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-cyan-400" />
            L5 Behavioral Testing Pipeline
          </h3>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Paired Maven tests on <strong className="text-slate-300">original</strong> then{' '}
            <strong className="text-slate-300">refactored</strong> file (v2: targeted + module fallback).
            Runs MA cohort first, then B0 — same research integrity as the MA panel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => refresh()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-600 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => runAction('start')}
            disabled={busy || (pipelineUp && state === 'running')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-sm text-white disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            Start L5 pipeline
          </button>
          <button
            type="button"
            onClick={() => runAction('stop')}
            disabled={busy || !pipelineUp}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-white disabled:opacity-50"
          >
            <Pause className="w-4 h-4" />
            Stop
          </button>
        </div>
      </div>

      {status?.staleRunning && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Pipeline reported running but supervisor exited. Click <strong>Start L5 pipeline</strong> to resume.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 space-y-4">
        <div className="text-xs uppercase tracking-wide text-slate-500">Pipeline phases</div>
        <div className="flex flex-wrap gap-2">
          {PHASES.map((p, i) => {
            const active = phaseIndex(phase) === i;
            const done = phaseIndex(phase) > i;
            return (
              <div
                key={p.id}
                title={p.hint}
                className={`rounded-lg border px-3 py-2 text-xs transition-all ${
                  active
                    ? 'border-cyan-400/60 bg-cyan-950/50 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.2)] scale-105'
                    : done
                      ? 'border-emerald-700/40 bg-emerald-950/30 text-emerald-200'
                      : 'border-slate-700 text-slate-500'
                }`}
              >
                {done && <CheckCircle2 className="w-3 h-3 inline mr-1 text-emerald-400" />}
                {active && pipelineUp && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse mr-1.5 align-middle" />
                )}
                {p.label}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PhaseProgressBar
            label="P-MA (ma_ref_master)"
            pct={maPct}
            probed={(ma?.completedCandidates ?? 0) - (ma?.l5Pending ?? 0)}
            total={ma?.completedCandidates ?? 750}
            pending={ma?.l5Pending ?? 0}
            active={activeStudy === 'ma' && pipelineUp}
            tone="cyan"
          />
          <PhaseProgressBar
            label="B0 (ripple_ref_master)"
            pct={b0Pct}
            probed={(b0?.completedCandidates ?? 0) - (b0?.l5Pending ?? 0)}
            total={b0?.completedCandidates ?? 1182}
            pending={b0?.l5Pending ?? 0}
            active={activeStudy === 'b0' && pipelineUp}
            tone="violet"
          />
        </div>

        {(phase === 'backfill_b0' || phase === 'backfill_ma') && status?.backfillStudyId && (
          <div className="text-sm text-cyan-200/90">
            Active backfill: <span className="font-mono">{status.backfillStudyId}</span>
            {' — '}
            {status.backfillProcessed ?? 0}
            {status.backfillTotal ? ` / ${status.backfillTotal}` : ''} probed
            {status.backfillDetail ? (
              <span className="text-slate-500 text-xs ml-2">({status.backfillDetail})</span>
            ) : null}
          </div>
        )}
      </div>

      <L5SkipReasonsPanel ma={ma} b0={b0} />

      <VerificationMetricsPanel
        title="Live L5 verification metrics"
        ma={ma}
        b0={b0}
        showChart
        highlightPhase={activeStudy}
        pipelineRunning={pipelineUp}
      />
    </div>
  );
}

function PhaseProgressBar({
  label,
  pct,
  probed,
  total,
  pending,
  active,
  tone,
}: {
  label: string;
  pct: number;
  probed: number;
  total: number;
  pending: number;
  active: boolean;
  tone: 'cyan' | 'violet';
}) {
  const bar = tone === 'cyan' ? 'bg-cyan-500' : 'bg-violet-500';
  const glow = active ? (tone === 'cyan' ? 'shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'shadow-[0_0_10px_rgba(167,139,250,0.5)]') : '';
  return (
    <div className={`rounded-lg border p-3 ${active ? 'border-cyan-500/40 bg-cyan-950/20' : 'border-slate-700/80 bg-slate-900/30'}`}>
      <div className="flex justify-between text-xs mb-1.5">
        <span className={active ? 'text-cyan-200 font-medium' : 'text-slate-400'}>{label}</span>
        <span className="text-slate-500">
          {probed}/{total} · {pending} pending
        </span>
      </div>
      <div className={`h-2.5 w-full rounded-full bg-slate-800 overflow-hidden ${glow}`}>
        <div
          className={`h-full ${bar} transition-all duration-700 ${active ? 'animate-pulse' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-[10px] text-slate-500 mt-1 text-right">{pct.toFixed(1)}% probed</div>
    </div>
  );
}

function setActiveTabScroll() {
  const el = document.getElementById('ripple-ref-l5-pipeline');
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function L5SkipReasonsPanel({
  ma,
  b0,
}: {
  ma: VerificationSummary | null;
  b0: VerificationSummary | null;
}) {
  if (!ma && !b0) return null;
  return (
    <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-4 space-y-3">
      <div className="text-sm font-semibold text-amber-100">Why were tests skipped?</div>
      <p className="text-xs text-slate-400 leading-relaxed">
        L5 only runs when Maven can find tests. A row is <strong className="text-slate-300">skipped</strong>{' '}
        (not failed) when we cannot run any test at all — this is different from{' '}
        <strong className="text-slate-300">inconclusive</strong>, where tests ran on the original file but
        did not pass, so we cannot claim behavior was preserved.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <SkipReasonBlock
          label="Skip reason A — no Maven module"
          pct="~85%"
          detail="File lives in a repo area with no pom.xml (Gradle-only, Ant, or non-build tree). Examples: ganttproject, xerces-j, ant, jEdit, mockito, jabref."
          count={ma?.l5Skipped ?? 0}
          sublabel="MA skipped total"
        />
        <SkipReasonBlock
          label="Skip reason B — no tests in module"
          pct="~15%"
          detail="Maven module exists but neither targeted tests (FooTest / TestFoo) nor module-level mvn test discovered runnable tests."
          count={b0?.l5Skipped ?? 0}
          sublabel="B0 skipped total"
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <MetricChip label="MA skipped" value={ma?.l5Skipped ?? 0} tone="slate" />
        <MetricChip label="MA inconclusive" value={ma?.l5Inconclusive ?? 0} tone="violet" hint="Tests ran; baseline failed" />
        <MetricChip label="B0 skipped" value={b0?.l5Skipped ?? 0} tone="slate" />
        <MetricChip label="B0 inconclusive" value={b0?.l5Inconclusive ?? 0} tone="violet" hint="Tests ran; baseline failed" />
      </div>
      <p className="text-[11px] text-slate-500">
        Actual breakdown from test reports: MA — 300 no_maven_project + 55 no_module_tests_found; B0 — 476
        no_maven_project + 85 no_module_tests_found. These repos were sampled for refactoring research, not
        because every file has a paired unit test.
      </p>
    </div>
  );
}

function SkipReasonBlock({
  label,
  pct,
  detail,
  count,
  sublabel,
}: {
  label: string;
  pct: string;
  detail: string;
  count: number;
  sublabel: string;
}) {
  return (
    <div className="rounded border border-slate-700/80 bg-slate-900/40 p-3 space-y-1">
      <div className="font-medium text-slate-200">{label}</div>
      <div className="text-amber-300/90">{pct} of skips</div>
      <div className="text-slate-500">{detail}</div>
      <div className="text-slate-400 pt-1">
        {sublabel}: <span className="text-slate-200 font-semibold">{count}</span>
      </div>
    </div>
  );
}

function MetricChip({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: 'slate' | 'violet';
  hint?: string;
}) {
  const cls =
    tone === 'violet'
      ? 'border-violet-700/40 bg-violet-950/30 text-violet-200'
      : 'border-slate-700 bg-slate-900/50 text-slate-200';
  return (
    <div className={`rounded border px-2 py-1.5 ${cls}`} title={hint}>
      <div className="text-[10px] uppercase opacity-70">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}
