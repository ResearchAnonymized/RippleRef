'use client';

import React, { useMemo } from 'react';

export type RippleRefFileGraph = {
  projectId: string;
  filePath: string;
  packageName?: string;
  fanIn: number;
  fanOut: number;
  upstreamFiles: string[];
  downstreamCallers: string[];
  typeDependencies?: string[];
  publicApis?: string[];
  protectedApis?: string[];
  callerUsedApis?: string[];
  edges?: string[];
};

function shortName(path: string): string {
  const base = path.split('/').pop() || path;
  return base.replace(/\.java$/, '');
}

type Props = {
  graph: RippleRefFileGraph | null;
  loading?: boolean;
  error?: string | null;
};

const W = 820;
const NODE_H = 28;
const PAD = 10;

export default function RippleRefFileGraphView({ graph, loading, error }: Props) {
  const layout = useMemo(() => {
    if (!graph) return null;
    const upstream = graph.upstreamFiles.slice(0, 10);
    const downstream = graph.downstreamCallers.slice(0, 10);
    const upExtra = Math.max(0, graph.upstreamFiles.length - upstream.length);
    const downExtra = Math.max(0, graph.downstreamCallers.length - downstream.length);

    const leftLabels = [
      ...upstream.map(shortName),
      ...(upExtra > 0 ? [`+${upExtra} more`] : []),
    ];
    const rightLabels = [
      ...downstream.map(shortName),
      ...(downExtra > 0 ? [`+${downExtra} more`] : []),
    ];

    const rows = Math.max(leftLabels.length, rightLabels.length, 1);
    const height = Math.max(220, rows * (NODE_H + PAD) + 80);
    const cy = height / 2;
    const cx = W / 2;

    const leftNodes = leftLabels.map((label, i) => {
      const totalH = leftLabels.length * (NODE_H + PAD);
      const startY = cy - totalH / 2;
      return {
        id: `up-${i}`,
        x: 120,
        y: startY + i * (NODE_H + PAD) + NODE_H / 2,
        label,
        kind: 'upstream' as const,
      };
    });

    const rightNodes = rightLabels.map((label, i) => {
      const totalH = rightLabels.length * (NODE_H + PAD);
      const startY = cy - totalH / 2;
      return {
        id: `down-${i}`,
        x: W - 120,
        y: startY + i * (NODE_H + PAD) + NODE_H / 2,
        label,
        kind: 'downstream' as const,
      };
    });

    const focus = {
      id: 'focus',
      x: cx,
      y: cy,
      label: shortName(graph.filePath),
      kind: 'focus' as const,
    };

    return { height, focus, leftNodes, rightNodes };
  }, [graph]);

  if (loading) {
    return <div className="text-sm text-slate-400 p-4">Loading dependency graph…</div>;
  }
  if (error) {
    return <div className="text-sm text-amber-300 p-4 border border-amber-500/30 rounded-lg">{error}</div>;
  }
  if (!graph || !layout) {
    return (
      <div className="text-sm text-slate-500 p-4 border border-slate-700 rounded-lg">
        Select a file to visualize upstream dependencies and downstream callers.
      </div>
    );
  }

  const nodeColor = (kind: string) => {
    if (kind === 'focus') return { fill: '#7c3aed', stroke: '#a78bfa' };
    if (kind === 'upstream') return { fill: '#1e3a5f', stroke: '#60a5fa' };
    return { fill: '#3b2f1e', stroke: '#fbbf24' };
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="px-2 py-1 rounded bg-violet-950/50 text-violet-200">
          Fan-in: {graph.fanIn}
        </span>
        <span className="px-2 py-1 rounded bg-blue-950/50 text-blue-200">
          Fan-out: {graph.fanOut}
        </span>
        <span className="px-2 py-1 rounded bg-amber-950/50 text-amber-200">
          Callers: {graph.downstreamCallers.length}
        </span>
        <span className="px-2 py-1 rounded bg-slate-800 text-slate-300">
          Public APIs: {graph.publicApis?.length ?? 0}
        </span>
        <span className="px-2 py-1 rounded bg-red-950/40 text-red-200">
          Caller-used APIs: {graph.callerUsedApis?.length ?? 0}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-950/80 p-2">
        <svg width={W} height={layout.height} viewBox={`0 0 ${W} ${layout.height}`}>
          <text x={120} y={18} textAnchor="middle" fill="#94a3b8" fontSize="11">
            Upstream (imports / extends)
          </text>
          <text x={W - 120} y={18} textAnchor="middle" fill="#94a3b8" fontSize="11">
            Downstream callers
          </text>

          {layout.leftNodes.map((n) => (
            <line
              key={`l-${n.id}`}
              x1={n.x + 50}
              y1={n.y}
              x2={layout.focus.x - 55}
              y2={layout.focus.y}
              stroke="#475569"
              strokeWidth={1}
              opacity={0.7}
            />
          ))}
          {layout.rightNodes.map((n) => (
            <line
              key={`r-${n.id}`}
              x1={layout.focus.x + 55}
              y1={layout.focus.y}
              x2={n.x - 50}
              y2={n.y}
              stroke="#475569"
              strokeWidth={1}
              opacity={0.7}
            />
          ))}

          {[...layout.leftNodes, layout.focus, ...layout.rightNodes].map((n) => {
            const w = Math.min(140, Math.max(70, n.label.length * 7 + 20));
            const colors = nodeColor(n.kind);
            return (
              <g key={n.id}>
                <rect
                  x={n.x - w / 2}
                  y={n.y - NODE_H / 2}
                  width={w}
                  height={NODE_H}
                  rx={6}
                  fill={colors.fill}
                  stroke={colors.stroke}
                  strokeWidth={1.5}
                />
                <text
                  x={n.x}
                  y={n.y + 4}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="11"
                  fontFamily="ui-monospace, monospace"
                >
                  {n.label.length > 18 ? `${n.label.slice(0, 16)}…` : n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid md:grid-cols-2 gap-2 text-xs">
        <div className="bg-slate-900/60 rounded p-2 border border-slate-700 max-h-28 overflow-y-auto">
          <div className="text-slate-400 mb-1">Caller-used APIs (preserve in V2)</div>
          {(graph.callerUsedApis ?? []).slice(0, 8).map((api) => (
            <div key={api} className="font-mono text-violet-200 truncate">
              {api}
            </div>
          ))}
          {(graph.callerUsedApis?.length ?? 0) === 0 && (
            <div className="text-slate-500">None detected</div>
          )}
        </div>
        <div className="bg-slate-900/60 rounded p-2 border border-slate-700 max-h-28 overflow-y-auto">
          <div className="text-slate-400 mb-1">Type dependencies</div>
          {(graph.typeDependencies ?? []).slice(0, 8).map((dep) => (
            <div key={dep} className="font-mono text-slate-300 truncate">
              {dep}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
