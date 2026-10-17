'use client';

import { useEffect, useState } from 'react';
import type {
  CompletenessReport,
  CandidateResultsSummary,
  LiveCandidateInfo,
  FileRunProgress,
  RepoProgressRow,
  QwenCohortProgress,
} from '../lib/rippleRefStudy';
import { formatLivePhase } from '../lib/rippleRefStudy';

export type ExperimentProgress = {
  running: boolean;
  phase: 'idle' | 'preflight' | 'setup' | 'candidate' | 'done' | 'error';
  currentLabel?: string;
  planned: number;
  completed: number;
  failed: number;
  skipped: number;
  ranThisSession: number;
  lastMessage?: string;
};

type Props = {
  studyId?: string;
  studyStatus?: string;
  progress: ExperimentProgress;
  completeness: CompletenessReport | null;
  summary: CandidateResultsSummary | null;
  liveCandidate?: LiveCandidateInfo | null;
  lastCompleted?: LiveCandidateInfo | null;
  fileProgress?: FileRunProgress[];
  repoProgress?: RepoProgressRow[];
  qwenCohortProgress?: QwenCohortProgress | null;
  projectNames?: Record<string, string>;
  liveMonitoring?: boolean;
  batchStalled?: boolean;
  streamConnected?: boolean;
  lastStreamAt?: number | null;
  onRefresh: () => void;
  refreshing?: boolean;
  /** Override phase labels (e.g. MA multi-agent phases). */
  formatPhase?: (phase?: string) => string;
  /** e.g. "5 models × V1/V2" (B0) or "5 models × MA" (P-MA). */
  candidatesPerFileLabel?: string;
};

function repoLabel(
  workspaceId: string,
  repositoryName: string | undefined,
  projectNames?: Record<string, string>
): string {
  return projectNames?.[workspaceId] ?? repositoryName ?? workspaceId;
}

function CandidateCard({
  title,
  info,
  projectNames,
  tone,
  formatPhase = formatLivePhase,
}: {
  title: string;
  info: LiveCandidateInfo;
  projectNames?: Record<string, string>;
  tone: 'amber' | 'slate';
  formatPhase?: (phase?: string) => string;
}) {
  const border = tone === 'amber' ? 'border-amber-500/40 bg-amber-950/20' : 'border-slate-600 bg-slate-900/40';
  return (
    <div className={`rounded-lg border p-3 space-y-2 ${border}`}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <Detail label="System" value={repoLabel(info.workspaceId, info.repositoryName, projectNames)} />
        <Detail label="Variant" value={info.variant} highlight />
        <Detail label="Model" value={info.modelDisplayName ?? info.modelId} highlight />
        <Detail label="File" value={info.fileName ?? info.filePath.split('/').pop() ?? info.filePath} mono />
        {info.phase && <Detail label="Phase" value={formatPhase(info.phase)} />}
      </div>
      <div className="text-xs text-slate-500 font-mono truncate" title={info.filePath}>
        {info.filePath}
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  highlight,
  mono,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="text-slate-500">{label}: </span>
      <span
        className={`${highlight ? 'text-violet-200 font-medium' : 'text-slate-200'} ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

function StackedProgressBar({
  planned,
  completed,
  failed,
  heightClass = 'h-1.5',
  active = false,
}: {
  planned: number;
  completed: number;
  failed: number;
  heightClass?: string;
  active?: boolean;
}) {
  const donePct = planned > 0 ? Math.min(100, (completed / planned) * 100) : 0;
  const failPct =
    planned > 0 ? Math.min(Math.max(0, 100 - donePct), (failed / planned) * 100) : 0;
  const successClass = active ? 'bg-emerald-400' : 'bg-emerald-600';
  const failedClass = active ? 'bg-red-400' : 'bg-red-600';

  return (
    <div className={`${heightClass} rounded-full bg-slate-800 overflow-hidden flex`}>
      {donePct > 0 && (
        <div
          className={`h-full transition-all duration-500 ${successClass}`}
          style={{ width: `${donePct}%` }}
          title={`${completed} completed`}
        />
      )}
      {failPct > 0 && (
        <div
          className={`h-full transition-all duration-500 ${failedClass}`}
          style={{ width: `${failPct}%` }}
          title={`${failed} failed`}
        />
      )}
    </div>
  );
}

function ProgressLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
      <span className="inline-flex items-center gap-1">
        <span className="inline-block w-2.5 h-2 rounded-sm bg-emerald-600" />
        completed
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block w-2.5 h-2 rounded-sm bg-red-600" />
        failed
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block w-2.5 h-2 rounded-sm bg-slate-800 border border-slate-700" />
        pending
      </span>
    </div>
  );
}

type RepoRowPhase = 'active' | 'partial' | 'stalled' | 'pending' | 'done';

/** Per-repo suffix: "active" only while a batch is executing; otherwise partial/stalled/pending. */
export function repoProgressPhase(
  row: RepoProgressRow,
  opts: {
    batchStalled: boolean;
    globallyActive: boolean;
    liveWorkspaceId?: string;
  }
): { phase: RepoRowPhase; suffix: string; barActive: boolean } {
  const accounted = row.completed + row.failed;
  const allDone = row.planned > 0 && accounted >= row.planned;
  const incomplete = row.planned > 0 && accounted < row.planned;
  const repoRunning = !!opts.liveWorkspaceId && opts.liveWorkspaceId === row.workspaceId;

  if (allDone) {
    return { phase: 'done', suffix: ' · done', barActive: false };
  }
  if (!incomplete) {
    return { phase: 'pending', suffix: '', barActive: false };
  }

  if (opts.globallyActive || repoRunning) {
    return { phase: 'active', suffix: ' · active', barActive: true };
  }
  if (accounted > 0) {
    return { phase: 'partial', suffix: ' · partial', barActive: false };
  }
  if (opts.batchStalled) {
    return { phase: 'stalled', suffix: ' · stalled', barActive: false };
  }
  return { phase: 'pending', suffix: ' · pending', barActive: false };
}

function repoRowLabelClass(phase: RepoRowPhase, failed: number): string {
  if (phase === 'active') return 'text-violet-200';
  if (phase === 'partial') return 'text-amber-200';
  if (phase === 'done' && failed === 0) return 'text-emerald-300';
  return '';
}

function repoSuffixClass(phase: RepoRowPhase): string {
  if (phase === 'active') return 'text-violet-300';
  if (phase === 'partial') return 'text-amber-300';
  if (phase === 'stalled') return 'text-amber-400';
  if (phase === 'pending') return 'text-slate-500';
  return 'text-slate-400';
}

export default function RippleRefStudyStatusBar({
  studyId,
  studyStatus,
  progress,
  completeness,
  summary,
  liveCandidate,
  lastCompleted,
  fileProgress = [],
  repoProgress = [],
  qwenCohortProgress = null,
  projectNames,
  liveMonitoring = false,
  batchStalled = false,
  streamConnected = false,
  lastStreamAt = null,
  onRefresh,
  refreshing,
  formatPhase = formatLivePhase,
  candidatesPerFileLabel = '5 models × V1/V2',
}: Props) {
  const planned = completeness?.plannedRuns ?? progress.planned;
  const completed = completeness?.completedRuns ?? progress.completed;
  const failed = completeness?.failedGenerations ?? progress.failed;
  const accountedPct =
    planned > 0 ? Math.min(100, ((completed + failed) / planned) * 100) : 0;
  const active = progress.running || liveMonitoring;
  const streamLabel = lastStreamAt
    ? new Date(lastStreamAt).toLocaleTimeString()
    : null;
  const [streamAgeSec, setStreamAgeSec] = useState<number | null>(null);
  useEffect(() => {
    if (!lastStreamAt) {
      setStreamAgeSec(null);
      return;
    }
    const tick = () => setStreamAgeSec(Math.max(0, Math.floor((Date.now() - lastStreamAt) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [lastStreamAt]);

  const currentLabel = liveCandidate
    ? `${liveCandidate.variant} · ${liveCandidate.modelDisplayName ?? liveCandidate.modelId} · ${liveCandidate.fileName ?? liveCandidate.filePath.split('/').pop()}`
    : progress.currentLabel;

  const phaseLabel: Record<ExperimentProgress['phase'], string> = {
    idle: liveMonitoring
      ? liveCandidate
        ? formatPhase(liveCandidate.phase)
        : 'Monitoring batch run (CLI/agents)…'
      : 'Idle',
    preflight: 'Preflight check…',
    setup: 'Setting up study…',
    candidate: currentLabel ?? 'Running candidate…',
    done: 'Experiment finished',
    error: 'Error',
  };

  return (
    <div className="rounded-lg border border-violet-500/40 bg-slate-950/80 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Study status</div>
          <div className="flex flex-wrap items-center gap-2 mt-0.5">
            {studyId && (
              <span className="font-mono text-xs text-violet-300 bg-violet-950/60 px-2 py-0.5 rounded">
                {studyId}
              </span>
            )}
            <span className="text-sm text-slate-300">{studyStatus ?? 'not started'}</span>
            {progress.running && (
              <span className="text-xs text-amber-300 animate-pulse">● GUI running</span>
            )}
            {streamConnected && (
              <span className="text-xs text-cyan-300 animate-pulse">● live stream</span>
            )}
            {streamConnected && streamLabel && (
              <span className="text-xs text-slate-500">
                updated {streamLabel}
                {streamAgeSec != null && streamAgeSec <= 5 ? ` (${streamAgeSec}s ago)` : ''}
              </span>
            )}
            {!streamConnected && liveMonitoring && !progress.running && (
              <span className="text-xs text-green-300 animate-pulse">● polling</span>
            )}
            {batchStalled && !liveMonitoring && !progress.running && (
              <span className="text-xs text-amber-400">● batch stopped — resume to continue</span>
            )}
            {liveMonitoring && (
              <span className="text-xs text-slate-500">
                {streamConnected ? 'streaming ~2s' : 'fallback poll 5s'}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing || !studyId}
          className="text-xs px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200"
        >
          {refreshing ? 'Refreshing…' : 'Refresh status'}
        </button>
      </div>

      {liveCandidate && (
        <CandidateCard
          title="Now running"
          info={liveCandidate}
          projectNames={projectNames}
          tone="amber"
          formatPhase={formatPhase}
        />
      )}

      {!liveCandidate && batchStalled && (
        <div className="text-sm text-amber-200 bg-amber-950/40 border border-amber-500/30 rounded-lg px-3 py-2">
          No candidate is running right now. The CLI batch finished but{' '}
          <strong>{completeness?.missingArtifacts ?? 0} candidate(s)</strong> were never saved (connection
          timeout). Use <strong>Resume batch</strong> below or run the CLI resume command.
        </div>
      )}

      {!liveCandidate && active && liveMonitoring && (
        <div className="text-sm text-slate-400 border border-slate-700 rounded-lg px-3 py-2">
          Waiting for next candidate signal… (batch may be between runs)
        </div>
      )}

      {lastCompleted && (
        <CandidateCard
          title="Last completed"
          info={lastCompleted}
          projectNames={projectNames}
          tone="slate"
          formatPhase={formatPhase}
        />
      )}

      <div>
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>{phaseLabel[progress.phase]}</span>
          <span>
            {completed} / {planned} completed ({accountedPct.toFixed(1)}% accounted)
            {failed > 0 ? (
              <>
                {' '}
                · <span className="text-red-400">{failed} failed</span>
              </>
            ) : (
              ''
            )}
            {progress.skipped > 0 ? ` · ${progress.skipped} skipped` : ''}
          </span>
        </div>
        <StackedProgressBar
          planned={planned}
          completed={completed}
          failed={failed}
          heightClass="h-2"
          active={active}
        />
        <div className="mt-1">
          <ProgressLegend />
        </div>
        {qwenCohortProgress && qwenCohortProgress.planned > 0 && (
          <div className="mt-2 text-xs text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
            <span className="text-violet-300 font-medium">Qwen B0-V2 cohort (150 files)</span>
            <span>
              <span className="text-emerald-400">{qwenCohortProgress.completed}</span> /{' '}
              {qwenCohortProgress.planned} completed
            </span>
            {qwenCohortProgress.failed > 0 && (
              <span className="text-red-400">{qwenCohortProgress.failed} failed</span>
            )}
            {qwenCohortProgress.remaining > 0 && (
              <span>{qwenCohortProgress.remaining} remaining (success target)</span>
            )}
            <span className="text-slate-500">auto-refresh 5s</span>
          </div>
        )}
      </div>

      {repoProgress.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wide">Per-system progress</div>
              <div className="text-[10px] text-slate-600 normal-case tracking-normal">
                100 = 10 files × 5 models × V1/V2 · counts refresh when each file finishes (~1–2
                min) · “done” repos update when Qwen V2 completes their remaining files
              </div>
            </div>
            <ProgressLegend />
          </div>
          {repoProgress.map((row) => {
            const repoIsLive = !!liveCandidate && liveCandidate.workspaceId === row.workspaceId;
            const { phase, suffix, barActive } = repoProgressPhase(row, {
              batchStalled,
              globallyActive: progress.running || !!liveCandidate || liveMonitoring,
              liveWorkspaceId: liveCandidate?.workspaceId,
            });
            return (
              <div
                key={row.workspaceId}
                className={`text-xs ${repoIsLive ? 'rounded-md ring-1 ring-violet-500/50 bg-violet-950/20 px-1 -mx-1' : ''}`}
              >
                <div className="flex justify-between text-slate-400 mb-0.5">
                  <span className={repoRowLabelClass(phase, row.failed)}>{row.label}</span>
                  <span>
                    <span className="text-emerald-400">{row.completed}</span>
                    /{row.planned}
                    {row.failed > 0 ? (
                      <>
                        {' '}
                        · <span className="text-red-400">{row.failed} failed</span>
                      </>
                    ) : (
                      ''
                    )}
                    {suffix ? <span className={repoSuffixClass(phase)}>{suffix}</span> : null}
                  </span>
                </div>
                <StackedProgressBar
                  planned={row.planned}
                  completed={row.completed}
                  failed={row.failed}
                  active={barActive}
                />
              </div>
            );
          })}
        </div>
      )}

      {fileProgress.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-slate-500 uppercase tracking-wide">
            Selected files ({fileProgress.length}) — candidates per file ({candidatesPerFileLabel})
          </div>
          <div className="max-h-40 overflow-y-auto rounded border border-slate-800">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-900 text-slate-500">
                <tr>
                  <th className="text-left py-1 px-2 font-medium">File</th>
                  <th className="text-left py-1 px-2 font-medium">Group</th>
                  <th className="text-right py-1 px-2 font-medium">Done</th>
                  <th className="text-right py-1 px-2 font-medium">Failed</th>
                </tr>
              </thead>
              <tbody>
                {fileProgress.map((fp) => {
                  const isCurrent = liveCandidate?.filePath === fp.filePath;
                  const done = fp.completed + fp.failed >= fp.planned && fp.planned > 0;
                  return (
                    <tr
                      key={fp.filePath}
                      className={`border-t border-slate-800/80 ${isCurrent ? 'bg-amber-950/30' : done ? 'opacity-70' : ''}`}
                    >
                      <td className="py-1 px-2 text-slate-200 font-mono truncate max-w-[200px]" title={fp.filePath}>
                        {isCurrent && <span className="text-amber-400 mr-1">▶</span>}
                        {fp.fileName ?? fp.filePath.split('/').pop()}
                      </td>
                      <td className="py-1 px-2 text-slate-500">{fp.samplingGroup ?? '—'}</td>
                      <td className="py-1 px-2 text-right text-green-300">
                        {fp.completed}/{fp.planned}
                      </td>
                      <td className="py-1 px-2 text-right text-red-300">{fp.failed || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {summary && summary.totalRows > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <MiniStat label="Results rows" value={summary.totalRows} />
          <MiniStat label="Behavioral pass" value={summary.behavioralPass} tone="green" />
          <MiniStat label="Behavioral fail" value={summary.behavioralFail} tone="amber" />
          <MiniStat label="Caller breakage" value={summary.observedCallerBreakage} tone="red" />
          <MiniStat label="V2 safer" value={summary.v2SaferThanV1} tone="violet" />
        </div>
      )}

      {progress.lastMessage && !liveCandidate && (
        <div className="text-xs text-slate-500 font-mono truncate">{progress.lastMessage}</div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: number;
  tone?: 'green' | 'amber' | 'red' | 'violet' | 'slate';
}) {
  const tones = {
    green: 'text-green-300',
    amber: 'text-amber-300',
    red: 'text-red-300',
    violet: 'text-violet-300',
    slate: 'text-slate-200',
  };
  return (
    <div className="bg-slate-900/60 rounded px-2 py-1.5 border border-slate-800">
      <div className="text-slate-500">{label}</div>
      <div className={`font-semibold ${tones[tone]}`}>{value}</div>
    </div>
  );
}
