'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  HeartPulse,
  Pause,
  Play,
  RefreshCw,
  Workflow,
  Wrench,
} from 'lucide-react';
import {
  MA_PLANNED_CANDIDATES,
  MA_REF_MASTER_STUDY_ID,
  fetchMaPipelineStatus,
  formatMaLivePhase,
  healMaPipeline,
  startMaPipeline,
  stopMaPipeline,
  type MaPipelineStatus,
} from '../lib/maRefStudy';
import VerificationMetricsPanel from './VerificationMetricsPanel';

const STATE_STYLES: Record<string, string> = {
  idle: 'bg-slate-800 text-slate-300 border-slate-600',
  running: 'bg-emerald-950/50 text-emerald-200 border-emerald-500/40',
  healing: 'bg-amber-950/50 text-amber-200 border-amber-500/40 animate-pulse',
  stopped: 'bg-slate-900 text-slate-400 border-slate-700',
  complete: 'bg-cyan-950/50 text-cyan-200 border-cyan-500/40',
};

const PHASES = [
  { id: 'ma_generation', label: '1 · MA generation', hint: '750 candidates (systems 1→15)' },
  { id: 'backfill_b0', label: '2 · L5 backfill B0', hint: '~1182 saved B0 refactors' },
  { id: 'backfill_ma', label: '3 · L5 backfill MA', hint: '750 saved MA refactors' },
  { id: 'complete', label: 'Done', hint: 'MA + L5 complete' },
] as const;

function phaseIndex(phase?: string): number {
  const i = PHASES.findIndex((p) => p.id === phase);
  return i >= 0 ? i : 0;
}

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

type Props = {
  studyId?: string;
  onLog?: (msg: string) => void;
};

export default function MaRefPipelinePanel({
  studyId = MA_REF_MASTER_STUDY_ID,
  onLog,
}: Props) {
  const [status, setStatus] = useState<MaPipelineStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchMaPipelineStatus(studyId);
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [studyId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 12_000);
    return () => clearInterval(id);
  }, [refresh]);

  const runAction = async (action: 'start' | 'stop' | 'heal') => {
    setBusy(true);
    setError(null);
    try {
      const fn =
        action === 'start' ? startMaPipeline : action === 'stop' ? stopMaPipeline : healMaPipeline;
      const s = await fn(studyId);
      setStatus(s);
      onLog?.(`Pipeline ${action}: ${s.state ?? 'ok'}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      onLog?.(`Pipeline ${action} failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const state = status?.staleRunning ? 'stopped' : (status?.state ?? 'idle');
  const phase = status?.phase ?? (state === 'complete' ? 'complete' : 'ma_generation');
  const pipelineUp = status?.wrapperAlive || status?.supervisorAlive;
  const completed = status?.completedRuns ?? status?.completeness?.completedRuns ?? 0;
  const planned = status?.plannedRuns ?? status?.completeness?.plannedRuns ?? MA_PLANNED_CANDIDATES;
  const pct = status?.completionPercentage ?? status?.completeness?.completionPercentage ?? 0;
  const issues = status?.issues ?? [];
  const heals = status?.healHistory ?? [];
  const live = status?.liveCandidate ?? status?.live?.liveCandidate ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Workflow className="w-5 h-5 text-violet-400" />
            Autonomous Overnight Pipeline
          </h3>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Phase 1: finish MA 750/750. Phase 2–3: automatic L5 test backfill on saved B0 + MA refactors
            (no LLM re-run). Watchdog heals stalls (~{status?.stallMinutes ?? 22} min).
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
            disabled={busy || (state === 'running' || state === 'healing') && !!pipelineUp}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-sm text-white disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            Start
          </button>
          <button
            type="button"
            onClick={() => runAction('stop')}
            disabled={busy || state === 'idle' || state === 'stopped'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-white disabled:opacity-50"
          >
            <Pause className="w-4 h-4" />
            Stop
          </button>
          <button
            type="button"
            onClick={() => runAction('heal')}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-800 hover:bg-amber-700 text-sm text-white disabled:opacity-50"
          >
            <HeartPulse className="w-4 h-4" />
            Heal now
          </button>
        </div>
      </div>

      {status?.staleRunning && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Pipeline reported running but the supervisor process has exited. Click <strong>Start</strong> to resume.
        </div>
      )}

      <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Pipeline phases</div>
        <div className="flex flex-wrap gap-2">
          {PHASES.map((p, i) => {
            const active = phaseIndex(phase) === i;
            const done = phaseIndex(phase) > i;
            return (
              <div
                key={p.id}
                title={p.hint}
                className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                  active
                    ? 'border-violet-500/50 bg-violet-950/40 text-violet-100'
                    : done
                      ? 'border-emerald-700/40 bg-emerald-950/30 text-emerald-200'
                      : 'border-slate-700 text-slate-500'
                }`}
              >
                {p.label}
              </div>
            );
          })}
        </div>
        {(phase === 'backfill_b0' || phase === 'backfill_ma') && (
          <div className="mt-2 text-sm text-cyan-200">
            Backfilling {status?.backfillStudyId ?? phase.replace('backfill_', '')}:{' '}
            {status?.backfillProcessed ?? 0}
            {status?.backfillTotal ? ` / ${status.backfillTotal}` : ''}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Pipeline state"
          value={
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-sm font-medium ${
                STATE_STYLES[state] ?? STATE_STYLES.idle
              }`}
            >
              {state === 'complete' && <CheckCircle2 className="w-3.5 h-3.5" />}
              {state === 'healing' && <Wrench className="w-3.5 h-3.5" />}
              {state}
            </span>
          }
        />
        <StatCard
          label="Progress"
          value={`${completed} / ${planned} (${pct.toFixed(1)}%)`}
        />
        <StatCard
          label="Current phase"
          value={PHASES.find((p) => p.id === phase)?.label ?? phase}
        />
        <StatCard
          label="Current system"
          value={
            phase === 'ma_generation' && status?.currentSystemLabel
              ? `#${status.currentSystemNum ?? '?'} ${status.currentSystemLabel}`
              : '—'
          }
        />
        <StatCard
          label="Supervisor PID"
          value={
            pipelineUp
              ? status?.wrapperPid || status?.supervisorPid || '—'
              : 'not running'
          }
          mono
        />
      </div>

      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-violet-600 to-emerald-500 transition-all duration-500"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>

      <VerificationMetricsPanel
        ma={status?.verificationMa ?? null}
        b0={status?.verificationB0 ?? null}
        compact
        showChart
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
        <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Runtime</div>
          <Row label="Round" value={status?.round != null ? String(status.round) : '—'} />
          <Row label="Batch PID" value={status?.batchPid || '—'} mono />
          <Row label="Last progress" value={fmtTime(status?.lastProgressAt)} />
          <Row label="Started" value={fmtTime(status?.startedAt)} />
          <Row label="Updated" value={fmtTime(status?.updatedAt)} />
          <Row label="Missing artifacts" value={String(status?.missingArtifacts ?? '—')} />
          <Row label="Failed generations" value={String(status?.failedGenerations ?? '—')} />
          <Row label="Agent mode" value={status?.multiLlmAgentMode ?? 'full'} />
        </div>

        {live ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-2">
            <div className="text-xs uppercase tracking-wide text-amber-400/80">Live candidate</div>
            <Row label="File" value={live.fileName ?? live.filePath} mono />
            <Row label="Model" value={live.modelDisplayName ?? live.modelId} />
            <Row label="Phase" value={formatMaLivePhase(live.phase)} />
            <Row label="Variant" value={live.variant} />
          </div>
        ) : (
          <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 flex items-center justify-center text-slate-500 text-sm">
            No live candidate
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EventList
          title="Issues (auto-reported)"
          empty="No issues recorded"
          items={issues.map((i) => ({
            at: i.at,
            headline: i.kind,
            body: i.message,
            extra: i.healAction ? `Heal: ${i.healAction}` : undefined,
            tone: 'red' as const,
          }))}
        />
        <EventList
          title="Heal history"
          empty="No heal actions yet"
          items={heals.map((h) => ({
            at: h.at,
            headline: h.action,
            body: h.detail || h.result,
            extra: h.result,
            tone: h.result === 'ok' ? ('emerald' as const) : ('amber' as const),
          }))}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2.5">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`mt-1 text-sm text-slate-100 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`text-slate-200 text-right truncate ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function EventList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: {
    at: string;
    headline: string;
    body?: string;
    extra?: string;
    tone: 'red' | 'amber' | 'emerald';
  }[];
}) {
  const border =
    items[0]?.tone === 'red'
      ? 'border-red-500/30'
      : items[0]?.tone === 'emerald'
        ? 'border-emerald-500/30'
        : 'border-slate-700';
  return (
    <div className={`rounded-lg border ${border} overflow-hidden`}>
      <div className="px-3 py-2 bg-slate-800/80 text-xs font-medium text-slate-300">{title}</div>
      {items.length === 0 ? (
        <div className="px-3 py-4 text-sm text-slate-500">{empty}</div>
      ) : (
        <div className="max-h-48 overflow-y-auto divide-y divide-slate-800">
          {items.map((item, i) => (
            <div key={i} className="px-3 py-2 text-xs">
              <div className="flex justify-between gap-2 text-slate-400">
                <span className="font-medium text-slate-300">{item.headline}</span>
                <span>{fmtTime(item.at)}</span>
              </div>
              {item.body && <div className="text-slate-400 mt-0.5">{item.body}</div>}
              {item.extra && <div className="text-slate-500 mt-0.5">{item.extra}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
