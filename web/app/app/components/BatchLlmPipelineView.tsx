'use client';

import React from 'react';
import { CheckCircle, XCircle, Minus, RefreshCw, AlertCircle, GitBranch } from 'lucide-react';
import type { MultiLlmRunRecord } from '../lib/batchRunStorage';
import type { ActiveLlmMap, LlmProviderProgress } from '../lib/multiLlmProgress';
import { providerColumnKey } from '../lib/multiLlmProgress';

type PipelineFile = {
  filePath: string;
  fileName: string;
  status: string;
  multiLlmRuns?: MultiLlmRunRecord[];
  /** @deprecated Legacy single-provider progress — use activeLlms in parallel mode */
  currentLlm?: LlmProviderProgress;
  activeLlms?: ActiveLlmMap;
  progressMessage?: string;
};

/** Fixed chain order — must match DEFAULT_MULTI_LLM_CHAIN in agents/main.py */
const CHAIN_COLUMNS: Array<{ key: string; label: string }> = [
  { key: 'openai', label: 'OpenAI' },
  { key: 'google', label: 'Google' },
  { key: 'anthropic', label: 'Claude' },
];

const PROVIDER_STYLE: Record<string, string> = {
  google: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
  openai: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  anthropic: 'text-orange-300 bg-orange-500/10 border-orange-500/30',
};

const PROVIDER_RING: Record<string, string> = {
  google: 'ring-sky-500/50 bg-sky-950/30',
  openai: 'ring-emerald-500/50 bg-emerald-950/30',
  anthropic: 'ring-orange-500/50 bg-orange-950/30',
};

function providerKey(model: string): string {
  return providerColumnKey('', model);
}

function formatSmellDelta(delta: number | undefined): string | null {
  if (delta == null) return null;
  if (delta === 0) return 'smells 0';
  if (delta > 0) return `smells −${delta}`;
  return `smells +${Math.abs(delta)}`;
}

function PassCell({
  run,
  live,
  isActive,
  parallelMode,
}: {
  run?: MultiLlmRunRecord;
  live?: LlmProviderProgress;
  isActive: boolean;
  parallelMode: boolean;
}) {
  if (isActive && !run) {
    return (
      <div
        className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg ring-1 ring-inset ${
          live ? PROVIDER_RING[providerColumnKey(live.provider, live.model)] ?? 'ring-blue-500/40 bg-blue-950/20' : ''
        }`}
      >
        <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
        <span className="text-[10px] text-blue-300 font-medium">Running…</span>
        {live?.stepName ? (
          <span className="text-[9px] text-slate-400 text-center leading-tight max-w-[100px]">
            {live.stepName}
            {live.agent ? ` · ${live.agent.split(' ')[0]}` : ''}
          </span>
        ) : parallelMode ? (
          <span className="text-[9px] text-slate-500">same baseline</span>
        ) : null}
        {live?.model ? (
          <span className="text-[8px] text-slate-600 font-mono truncate max-w-[90px]">
            {live.model.split('/').pop()}
          </span>
        ) : null}
      </div>
    );
  }
  if (!run && !live) {
    return (
      <div className="flex flex-col items-center gap-0.5 py-2 text-center">
        <Minus className="w-4 h-4 text-slate-600" />
        <span className="text-[10px] text-slate-600">{parallelMode ? 'queued' : 'pending'}</span>
      </div>
    );
  }
  if (!run) {
    return (
      <div className="flex flex-col items-center gap-0.5 py-2 text-center">
        <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin" />
        <span className="text-[10px] text-slate-500">waiting</span>
      </div>
    );
  }

  const locDelta =
    run.linesBefore != null && run.linesAfter != null
      ? run.linesAfter - run.linesBefore
      : null;
  const smellText = formatSmellDelta(run.smellDelta);
  const modelShort = run.model?.split('/').pop() ?? '';
  const errMsg =
    run.experiment && typeof run.experiment === 'object'
      ? String((run.experiment as Record<string, unknown>).llmMessage ?? '').slice(0, 40)
      : '';

  return (
    <div
      className="flex flex-col items-center gap-0.5 py-2 text-center"
      title={[run.model, errMsg].filter(Boolean).join(' — ')}
    >
      {run.ok ? (
        run.changed ? (
          <CheckCircle className="w-4 h-4 text-green-400" />
        ) : (
          <Minus className="w-4 h-4 text-slate-400" />
        )
      ) : (
        <XCircle className="w-4 h-4 text-red-400" />
      )}
      <span className="text-[10px] text-slate-400">
        {run.changed ? 'changed' : run.ok ? 'unchanged' : 'failed'}
      </span>
      {locDelta != null ? (
        <span
          className={`text-[10px] font-mono ${locDelta < 0 ? 'text-green-400' : locDelta > 0 ? 'text-amber-300' : 'text-slate-500'}`}
        >
          LOC {locDelta > 0 ? '+' : ''}
          {locDelta}
        </span>
      ) : null}
      {smellText ? (
        <span
          className={`text-[10px] font-mono ${
            (run.smellDelta ?? 0) > 0
              ? 'text-emerald-300/90'
              : (run.smellDelta ?? 0) < 0
                ? 'text-red-300/90'
                : 'text-slate-500'
          }`}
        >
          {smellText}
        </span>
      ) : null}
      {run.agentSteps?.length ? (
        <span className="text-[9px] text-indigo-300/80">{run.agentSteps.length} agents</span>
      ) : null}
      {modelShort ? (
        <span className="text-[8px] text-slate-600 font-mono truncate max-w-[90px]">{modelShort}</span>
      ) : null}
      {!run.ok && errMsg ? (
        <span className="text-[8px] text-red-300/70 max-w-[100px] truncate flex items-center gap-0.5">
          <AlertCircle className="w-2.5 h-2.5 shrink-0" />
          {errMsg}
        </span>
      ) : null}
    </div>
  );
}

function ParallelArchitectureStrip({ file }: { file: PipelineFile }) {
  if (file.status !== 'running') return null;
  const active = file.activeLlms ?? {};
  const activeCount = Object.keys(active).length;

  return (
    <div className="mx-4 mt-3 mb-1 rounded-lg border border-violet-500/30 bg-violet-950/20 px-3 py-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold text-violet-200 mb-2">
        <GitBranch className="w-3.5 h-3.5" />
        Independent parallel — same frozen baseline
        {activeCount > 0 ? (
          <span className="text-emerald-300 font-normal">({activeCount}/3 active)</span>
        ) : null}
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className="text-[10px] font-mono text-violet-100/90 bg-slate-900/60 border border-violet-500/25 rounded px-3 py-1.5 w-full max-w-md text-center truncate">
          BASELINE · {file.fileName}
        </div>
        <div className="text-violet-400/60 text-xs leading-none">│</div>
        <div className="grid grid-cols-3 gap-2 w-full max-w-lg">
          {CHAIN_COLUMNS.map((col) => {
            const live = active[col.key];
            const running = Boolean(live);
            return (
              <div
                key={col.key}
                className={`rounded-lg border px-2 py-2 text-center ${
                  running
                    ? `${PROVIDER_STYLE[col.key]} ring-1 ring-inset`
                    : 'border-slate-700/50 bg-slate-900/30 text-slate-500'
                }`}
              >
                <div className="text-[10px] font-semibold">{col.label}</div>
                {running ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mx-auto mt-1 text-blue-400 animate-spin" />
                    <div className="text-[9px] mt-1 text-slate-300 truncate">
                      {live?.stepName ?? 'Pipeline'}
                    </div>
                  </>
                ) : (
                  <div className="text-[9px] mt-2 text-slate-600">starting…</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function BatchLlmPipelineView({
  results,
  parallelMode = true,
}: {
  results: PipelineFile[];
  /** Research batch: independent parallel on same baseline (default true). */
  parallelMode?: boolean;
}) {
  if (results.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 text-center text-slate-400 text-sm">
        No batch run yet. Start a research batch to see OpenAI, Google, and Claude run in parallel
        on the same frozen baseline per file.
      </div>
    );
  }

  const runningFile = results.find((r) => r.status === 'running');

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700">
        <h3 className="text-white font-semibold">Multi-LLM pipeline</h3>
        {parallelMode ? (
          <p className="text-xs text-slate-400 mt-1">
            <strong className="text-violet-200">Research mode:</strong> each provider runs the full
            5-agent pipeline on the <em>same frozen baseline</em> (not chained). All three run in
            parallel per file. Cells show per-provider outcome, LOC delta, and smell delta.
          </p>
        ) : (
          <p className="text-xs text-slate-400 mt-1">
            Each file is refactored sequentially: OpenAI → Google Gemini → Claude. Each pass runs
            the full multi-agent orchestration (Analyze → Plan → Feasibility → LLM → Verify).
          </p>
        )}
      </div>

      {parallelMode && runningFile ? <ParallelArchitectureStrip file={runningFile} /> : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400 text-xs">
              <th className="text-left px-4 py-2 font-medium">File</th>
              <th className="text-center px-2 py-2 font-medium w-20">Status</th>
              {CHAIN_COLUMNS.map((col) => (
                <th key={col.key} className="text-center px-2 py-2 font-medium min-w-[110px]">
                  <span
                    className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded border ${PROVIDER_STYLE[col.key] ?? 'text-slate-300 bg-slate-700 border-slate-600'}`}
                  >
                    {col.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const runsByIndex = new Map(
                (r.multiLlmRuns ?? []).map((run) => [run.passIndex, run])
              );
              const activeMap = r.activeLlms ?? {};
              const legacyActive = r.currentLlm;

              return (
                <tr key={r.filePath} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                  <td className="px-4 py-2">
                    <span
                      className="text-white font-mono text-xs truncate block max-w-[220px]"
                      title={r.filePath}
                    >
                      {r.fileName}
                    </span>
                    {r.status === 'running' && parallelMode && Object.keys(activeMap).length > 0 ? (
                      <span className="text-[10px] text-violet-300 mt-0.5 block">
                        Parallel · {Object.keys(activeMap).length}/3 providers active
                      </span>
                    ) : r.status === 'running' && legacyActive && !parallelMode ? (
                      <span className="text-[10px] text-blue-300 mt-0.5 block">
                        Pass {legacyActive.passIndex + 1}/{legacyActive.passTotal}:{' '}
                        {legacyActive.model.split('/').pop()}
                      </span>
                    ) : null}
                    {r.progressMessage && r.status === 'running' ? (
                      <span className="text-[10px] text-slate-500 mt-0.5 block truncate max-w-[220px]">
                        {r.progressMessage}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span
                      className={`text-[10px] font-medium uppercase ${
                        r.status === 'accepted'
                          ? 'text-green-400'
                          : r.status === 'proposed'
                            ? 'text-cyan-400'
                            : r.status === 'rejected'
                              ? 'text-amber-400'
                              : r.status === 'error'
                                ? 'text-red-400'
                                : r.status === 'running'
                                  ? 'text-blue-400'
                                  : 'text-slate-500'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  {CHAIN_COLUMNS.map((col, colIdx) => {
                    const run =
                      runsByIndex.get(colIdx) ??
                      r.multiLlmRuns?.find(
                        (x) =>
                          providerColumnKey(x.provider ?? '', x.model) === col.key ||
                          providerKey(x.model) === col.key
                      );
                    const live = activeMap[col.key];
                    const isActive =
                      r.status === 'running' &&
                      !run &&
                      (parallelMode
                        ? Boolean(live)
                        : legacyActive != null &&
                          (legacyActive.passIndex === colIdx ||
                            providerColumnKey(legacyActive.provider, legacyActive.model) ===
                              col.key));
                    return (
                      <td key={col.key} className="px-2 py-1 border-l border-slate-700/30">
                        <PassCell
                          run={run}
                          live={live}
                          isActive={isActive}
                          parallelMode={parallelMode}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
