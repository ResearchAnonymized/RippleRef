'use client';

import React from 'react';
import { Bot, Cpu, Shield } from 'lucide-react';
import { MA_GRAPH_NODES, type AgentStepLog, type AgentTracePayload } from '../lib/maRefStudy';

type Props = {
  trace: AgentTracePayload | null;
  loading?: boolean;
  livePhase?: string | null;
  formatPhase: (phase?: string | null) => string;
};

function nodeStatus(
  nodeId: string,
  trace: AgentTracePayload | null,
  livePhase?: string | null
): 'done' | 'running' | 'pending' | 'error' {
  if (!trace && !livePhase) return 'pending';
  const steps = trace?.steps ?? [];
  const step = steps.find(
    (s) => s.nodeId === nodeId || s.name?.toLowerCase().includes(nodeId.replace('_', ' '))
  );
  if (step?.status === 'error') return 'error';
  if (step?.status === 'done') return 'done';
  if (livePhase === nodeId || livePhase === `${nodeId}_pipeline`) return 'running';
  const nodeTrace = trace?.nodeTrace ?? [];
  if (nodeTrace.includes(nodeId)) {
    if (livePhase && nodeTrace[nodeTrace.length - 1] === nodeId) return 'running';
    return 'done';
  }
  return 'pending';
}

const statusColor = {
  done: 'border-emerald-500/50 bg-emerald-950/30 text-emerald-200',
  running: 'border-amber-400/60 bg-amber-950/40 text-amber-100 animate-pulse',
  pending: 'border-slate-600 bg-slate-900/40 text-slate-500',
  error: 'border-red-500/50 bg-red-950/30 text-red-200',
};

export default function MaRefAgentPipelineView({ trace, loading, livePhase, formatPhase }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <Cpu className="w-3.5 h-3.5" /> Static agent
        </span>
        <span className="flex items-center gap-1 text-violet-300">
          <Bot className="w-3.5 h-3.5" /> LLM agent
        </span>
        <span className="flex items-center gap-1 text-cyan-300">
          <Shield className="w-3.5 h-3.5" /> Ripple verifier
        </span>
        {trace?.graphVersion && (
          <span className="ml-auto font-mono text-slate-500">graph v{trace.graphVersion}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {MA_GRAPH_NODES.map((node) => {
          const st = nodeStatus(node.id, trace, livePhase);
          const isRipple = node.id === 'ripple_verify';
          return (
            <div
              key={node.id}
              className={`rounded-lg border px-2.5 py-1.5 text-xs min-w-[140px] ${statusColor[st]} ${
                isRipple ? 'ring-1 ring-cyan-500/30' : ''
              }`}
              title={node.id}
            >
              <div className="font-medium truncate">{node.label}</div>
              <div className="text-[10px] opacity-70">{node.kind === 'llm' ? 'LLM' : 'static'}</div>
            </div>
          );
        })}
      </div>

      {livePhase && (
        <div className="text-sm text-amber-200 bg-amber-950/30 border border-amber-500/30 rounded-lg px-3 py-2">
          Live phase: <strong>{formatPhase(livePhase)}</strong>
        </div>
      )}

      {loading && <p className="text-sm text-slate-400">Loading agent trace…</p>}

      {trace?.steps && trace.steps.length > 0 && (
        <div className="border border-slate-700 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-slate-800/80 text-xs font-medium text-slate-300">
            Agent step log ({trace.steps.length} steps)
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-800">
            {trace.steps.map((step: AgentStepLog, i: number) => (
              <div key={i} className="px-3 py-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-violet-200 font-medium">{step.agent || step.name}</span>
                  <span
                    className={
                      step.status === 'done'
                        ? 'text-emerald-400'
                        : step.status === 'error'
                          ? 'text-red-400'
                          : 'text-slate-400'
                    }
                  >
                    {step.status}
                  </span>
                </div>
                {step.details && Object.keys(step.details).length > 0 && (
                  <pre className="mt-1 text-[10px] text-slate-500 overflow-x-auto">
                    {JSON.stringify(step.details, null, 0).slice(0, 200)}
                  </pre>
                )}
                {step.error && <div className="text-red-400 mt-0.5">{step.error}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !trace?.steps?.length && (
        <p className="text-sm text-slate-500">
          Select a completed candidate in Observability or run a pilot to view agent traces.
        </p>
      )}
    </div>
  );
}
