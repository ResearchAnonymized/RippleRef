'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient, FileDependencyAnalysis, RippleEffectAnalysis } from '../api/client';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Maximize2,
  Move,
  Shield,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

type Props = {
  workspaceId: string;
  filePath: string;
};

function shortName(path: string): string {
  if (!path) return '';
  const base = path.split('/').pop() || path;
  return base.replace(/\.java$/, '');
}

function isExternal(path: string): boolean {
  return path.startsWith('external/');
}

function riskLevel(rippleCount: number) {
  if (rippleCount === 0) return { label: 'No Impact', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30', icon: CheckCircle, svgFill: '#34d399', svgStroke: '#10b981' };
  if (rippleCount <= 5) return { label: 'Low Risk', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', icon: Shield, svgFill: '#60a5fa', svgStroke: '#3b82f6' };
  if (rippleCount <= 20) return { label: 'Medium Risk', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', icon: AlertTriangle, svgFill: '#fbbf24', svgStroke: '#f59e0b' };
  return { label: 'High Risk', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', icon: AlertCircle, svgFill: '#f87171', svgStroke: '#ef4444' };
}

/* ─── layout constants ─── */
const W = 900;
const H_BASE = 200;
const CENTER_X = W / 2;
const NODE_RX = 8;
const NODE_H = 30;
const NODE_PAD = 8;
const MAX_UPSTREAM = 8;
const MAX_RIPPLE = 12;

function measureText(text: string): number {
  return text.length * 7.2 + 20;
}

type NodeInfo = { id: string; x: number; y: number; w: number; label: string; full: string; kind: 'upstream' | 'focus' | 'ripple'; external: boolean };

function initialLayout(focusName: string, upstream: string[], ripple: string[]): { nodes: NodeInfo[]; height: number } {
  const nodes: NodeInfo[] = [];
  const upShow = upstream.slice(0, MAX_UPSTREAM);
  const ripShow = ripple.slice(0, MAX_RIPPLE);
  const upExtra = upstream.length - upShow.length;
  const ripExtra = ripple.length - ripShow.length;

  const colUpX = 140;
  const colRipX = W - 140;

  const upLabels = [...upShow.map(shortName), ...(upExtra > 0 ? [`+${upExtra} more`] : [])];
  const upFull = [...upShow, ...(upExtra > 0 ? [`+${upExtra} more`] : [])];
  const upRowH = NODE_H + NODE_PAD;
  const upTotalH = upLabels.length * upRowH;

  const ripLabels = [...ripShow.map(shortName), ...(ripExtra > 0 ? [`+${ripExtra} more`] : [])];
  const ripFull = [...ripShow, ...(ripExtra > 0 ? [`+${ripExtra} more`] : [])];
  const ripRowH = NODE_H + NODE_PAD;
  const ripTotalH = ripLabels.length * ripRowH;

  const maxSideH = Math.max(upTotalH, ripTotalH, NODE_H);
  const chartH = Math.max(H_BASE, maxSideH + 80);
  const cy = chartH / 2;

  const focusW = measureText(focusName) + 20;
  nodes.push({ id: 'focus', x: CENTER_X, y: cy, w: focusW, label: focusName, full: focusName, kind: 'focus', external: false });

  const upStartY = cy - upTotalH / 2 + upRowH / 2;
  upLabels.forEach((label, i) => {
    const nw = measureText(label);
    nodes.push({ id: `up-${i}`, x: colUpX, y: upStartY + i * upRowH, w: nw, label, full: upFull[i], kind: 'upstream', external: isExternal(upFull[i]) });
  });

  const ripStartY = cy - ripTotalH / 2 + ripRowH / 2;
  ripLabels.forEach((label, i) => {
    const nw = measureText(label);
    nodes.push({ id: `rip-${i}`, x: colRipX, y: ripStartY + i * ripRowH, w: nw, label, full: ripFull[i], kind: 'ripple', external: isExternal(ripFull[i]) });
  });

  return { nodes, height: chartH };
}

/* ─── Interactive Graph ─── */
function ImpactGraph({ focusFile, upstream, ripple, risk }: { focusFile: string; upstream: string[]; ripple: string[]; risk: ReturnType<typeof riskLevel> }) {
  const focusName = shortName(focusFile);
  const layout = useMemo(() => initialLayout(focusName, upstream, ripple), [focusName, upstream, ripple]);

  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const lastMouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setPositions({});
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [focusName, upstream, ripple]);

  const getPos = useCallback((node: NodeInfo) => {
    const override = positions[node.id];
    return override ?? { x: node.x, y: node.y };
  }, [positions]);

  const svgToWorld = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const svgW = rect.width;
    const svgH = rect.height;
    const vbW = W;
    const vbH = layout.height;
    const scaleX = vbW / svgW;
    const scaleY = vbH / svgH;
    const scale = Math.max(scaleX, scaleY);
    return {
      x: (clientX - rect.left) * scale / zoom - pan.x / zoom,
      y: (clientY - rect.top) * scale / zoom - pan.y / zoom,
    };
  }, [zoom, pan, layout.height]);

  const handlePointerDown = useCallback((e: React.PointerEvent, nodeId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    lastMouse.current = { x: e.clientX, y: e.clientY };
    if (nodeId) {
      setDragging(nodeId);
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } else {
      setPanning(true);
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };

    if (dragging) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = layout.height / rect.height;
      const scale = Math.max(scaleX, scaleY);
      setPositions(prev => {
        const node = layout.nodes.find(n => n.id === dragging);
        const cur = prev[dragging] ?? (node ? { x: node.x, y: node.y } : { x: 0, y: 0 });
        return { ...prev, [dragging]: { x: cur.x + dx * scale / zoom, y: cur.y + dy * scale / zoom } };
      });
    } else if (panning) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = layout.height / rect.height;
      const scale = Math.max(scaleX, scaleY);
      setPan(prev => ({ x: prev.x + dx * scale, y: prev.y + dy * scale }));
    }
  }, [dragging, panning, zoom, layout]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
    setPanning(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.3, Math.min(3, z * delta)));
  }, []);

  const resetView = useCallback(() => {
    setPositions({});
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  if (upstream.length === 0 && ripple.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-500 text-sm">
        No dependencies detected for this file.
      </div>
    );
  }

  const nodes = layout.nodes;
  const focusNode = nodes.find(n => n.kind === 'focus')!;
  const upNodes = nodes.filter(n => n.kind === 'upstream');
  const ripNodes = nodes.filter(n => n.kind === 'ripple');
  const focusPos = getPos(focusNode);

  const vbX = -pan.x / zoom;
  const vbY = -pan.y / zoom;
  const vbW = W / zoom;
  const vbH = layout.height / zoom;

  return (
    <div className="relative">
      {/* Controls */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <button onClick={() => setZoom(z => Math.min(3, z * 1.2))}
          className="p-1.5 rounded bg-slate-700/80 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors" title="Zoom in">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setZoom(z => Math.max(0.3, z * 0.8))}
          className="p-1.5 rounded bg-slate-700/80 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors" title="Zoom out">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button onClick={resetView}
          className="p-1.5 rounded bg-slate-700/80 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors" title="Reset view">
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] text-slate-500 ml-1">{Math.round(zoom * 100)}%</span>
      </div>

      {/* Hint */}
      <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5 text-[10px] text-slate-500">
        <Move className="w-3 h-3" />
        <span>Drag nodes · Scroll zoom · Drag background to pan</span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        className="w-full select-none"
        style={{ minHeight: 220, cursor: panning ? 'grabbing' : dragging ? 'grabbing' : 'grab' }}
        onPointerDown={e => handlePointerDown(e)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      >
        <defs>
          <marker id="arrow-up" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6" fill="#67e8f9" />
          </marker>
          <marker id="arrow-rip" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6" fill={risk.svgFill} />
          </marker>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#334155" strokeWidth="0.5" strokeOpacity="0.3" />
          </pattern>
        </defs>

        {/* Background */}
        <rect x={vbX - 500} y={vbY - 500} width={vbW + 1000} height={vbH + 1000} fill="url(#grid)" />

        {/* Column labels */}
        {upNodes.length > 0 && (
          <text x={140} y={18} textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="600" letterSpacing="0.05em">
            UPSTREAM ({upstream.length})
          </text>
        )}
        <text x={CENTER_X} y={18} textAnchor="middle" fill="#e2e8f0" fontSize="11" fontWeight="600" letterSpacing="0.05em">
          FOCUS FILE
        </text>
        {ripNodes.length > 0 && (
          <text x={W - 140} y={18} textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="600" letterSpacing="0.05em">
            RIPPLE ({ripple.length})
          </text>
        )}

        {/* Edges: upstream → focus (curved, follow dragged positions) */}
        {upNodes.map((n, i) => {
          const p = getPos(n);
          const x1 = p.x + n.w / 2 + 4;
          const y1 = p.y;
          const x2 = focusPos.x - focusNode.w / 2 - 8;
          const y2 = focusPos.y;
          const mx = (x1 + x2) / 2;
          const isHl = hovered === n.id || hovered === 'focus';
          return (
            <path key={`ue-${i}`} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
              fill="none" stroke="#67e8f9" strokeWidth={isHl ? 2.5 : 1.5} strokeOpacity={isHl ? 0.8 : 0.35}
              markerEnd="url(#arrow-up)" style={{ transition: 'stroke-opacity 0.15s, stroke-width 0.15s' }} />
          );
        })}

        {/* Edges: focus → ripple (curved) */}
        {ripNodes.map((n, i) => {
          const p = getPos(n);
          const x1 = focusPos.x + focusNode.w / 2 + 8;
          const y1 = focusPos.y;
          const x2 = p.x - n.w / 2 - 4;
          const y2 = p.y;
          const mx = (x1 + x2) / 2;
          const isHl = hovered === n.id || hovered === 'focus';
          return (
            <path key={`re-${i}`} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
              fill="none" stroke={risk.svgFill} strokeWidth={isHl ? 2.5 : 1.5} strokeOpacity={isHl ? 0.8 : 0.35}
              markerEnd="url(#arrow-rip)" style={{ transition: 'stroke-opacity 0.15s, stroke-width 0.15s' }} />
          );
        })}

        {/* Flow labels */}
        {upNodes.length > 0 && (
          <text x={(140 + CENTER_X) / 2} y={focusPos.y - 30} textAnchor="middle" fill="#67e8f9" fontSize="10" fontStyle="italic" opacity="0.6">
            imports / uses
          </text>
        )}
        {ripNodes.length > 0 && (
          <text x={(CENTER_X + W - 140) / 2} y={focusPos.y - 30} textAnchor="middle" fill={risk.svgFill} fontSize="10" fontStyle="italic" opacity="0.6">
            may affect
          </text>
        )}

        {/* Upstream nodes (draggable) */}
        {upNodes.map((n) => {
          const p = getPos(n);
          const isHl = hovered === n.id;
          return (
            <g key={n.id}
              onPointerDown={e => handlePointerDown(e, n.id)}
              onPointerEnter={() => setHovered(n.id)}
              onPointerLeave={() => setHovered(null)}
              style={{ cursor: 'grab' }}
            >
              <rect x={p.x - n.w / 2} y={p.y - NODE_H / 2} width={n.w} height={NODE_H} rx={NODE_RX}
                fill={n.external ? '#1e3a5f' : '#164e63'} stroke="#67e8f9"
                strokeWidth={isHl ? 2 : 1} strokeOpacity={isHl ? 1 : 0.6}
                style={{ transition: 'stroke-width 0.15s, stroke-opacity 0.15s' }} />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fill="#a5f3fc" fontSize="11" fontWeight="500" pointerEvents="none">
                {n.label}
              </text>
              {/* Tooltip on hover */}
              {isHl && !n.label.startsWith('+') && (
                <g>
                  <rect x={p.x - measureText(n.full) / 2 - 6} y={p.y - NODE_H / 2 - 24} width={measureText(n.full) + 12} height={18} rx={4}
                    fill="#0f172a" stroke="#334155" strokeWidth="1" />
                  <text x={p.x} y={p.y - NODE_H / 2 - 12} textAnchor="middle" fill="#94a3b8" fontSize="9">
                    {n.full}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Focus node (draggable, glowing) */}
        {(() => {
          const isHl = hovered === 'focus';
          return (
            <g
              onPointerDown={e => handlePointerDown(e, 'focus')}
              onPointerEnter={() => setHovered('focus')}
              onPointerLeave={() => setHovered(null)}
              style={{ cursor: 'grab' }}
              filter="url(#glow)"
            >
              <rect x={focusPos.x - focusNode.w / 2} y={focusPos.y - 20} width={focusNode.w} height={40} rx={12}
                fill="#1e293b" stroke={risk.svgStroke} strokeWidth={isHl ? 3.5 : 2.5}
                style={{ transition: 'stroke-width 0.15s' }} />
              <text x={focusPos.x} y={focusPos.y + 5} textAnchor="middle" fill="#f8fafc" fontSize="13" fontWeight="700" pointerEvents="none">
                {focusNode.label}
              </text>
            </g>
          );
        })()}

        {/* Ripple nodes (draggable) */}
        {ripNodes.map((n) => {
          const p = getPos(n);
          const isHl = hovered === n.id;
          return (
            <g key={n.id}
              onPointerDown={e => handlePointerDown(e, n.id)}
              onPointerEnter={() => setHovered(n.id)}
              onPointerLeave={() => setHovered(null)}
              style={{ cursor: 'grab' }}
            >
              <rect x={p.x - n.w / 2} y={p.y - NODE_H / 2} width={n.w} height={NODE_H} rx={NODE_RX}
                fill={n.label.startsWith('+') ? '#1e293b' : '#422006'} stroke={risk.svgFill}
                strokeWidth={isHl ? 2 : 1} strokeOpacity={isHl ? 1 : 0.6}
                style={{ transition: 'stroke-width 0.15s, stroke-opacity 0.15s' }} />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fill={n.label.startsWith('+') ? '#94a3b8' : risk.svgFill}
                fontSize="11" fontWeight="500" pointerEvents="none">
                {n.label}
              </text>
              {isHl && !n.label.startsWith('+') && (
                <g>
                  <rect x={p.x - measureText(n.full) / 2 - 6} y={p.y + NODE_H / 2 + 4} width={measureText(n.full) + 12} height={18} rx={4}
                    fill="#0f172a" stroke="#334155" strokeWidth="1" />
                  <text x={p.x} y={p.y + NODE_H / 2 + 16} textAnchor="middle" fill="#94a3b8" fontSize="9">
                    {n.full}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ─── Table ─── */
type TableRow = { name: string; path: string; direction: 'Upstream' | 'Ripple'; external: boolean };

function buildTable(upstream: string[], ripple: string[]): TableRow[] {
  const rows: TableRow[] = [];
  upstream.forEach(p => rows.push({ name: shortName(p), path: p, direction: 'Upstream', external: isExternal(p) }));
  ripple.forEach(p => rows.push({ name: shortName(p), path: p, direction: 'Ripple', external: isExternal(p) }));
  return rows;
}

/* ─── Main Component ─── */
export default function FileImpactDependencyGraph({ workspaceId, filePath }: Props) {
  const [deps, setDeps] = useState<FileDependencyAnalysis | null>(null);
  const [ripple, setRipple] = useState<RippleEffectAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (!workspaceId || !filePath) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      apiClient.analyzeFileDependencies(workspaceId, filePath).catch(() => null),
      apiClient.getRippleEffectAnalysis(workspaceId, filePath).catch(() => null),
    ]).then(([d, r]) => {
      if (cancelled) return;
      setDeps(d);
      setRipple(r);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) { setError('Failed to load impact data'); setLoading(false); }
    });

    return () => { cancelled = true; };
  }, [workspaceId, filePath]);

  const upstream = deps?.dependencies ?? [];
  const rippleFiles = ripple?.affectedFiles ?? [];
  const rippleCount = ripple?.impactCount ?? rippleFiles.length;
  const risk = riskLevel(rippleCount);
  const RiskIcon = risk.icon;
  const tableRows = useMemo(() => buildTable(upstream, rippleFiles), [upstream, rippleFiles]);

  if (!filePath) return null;

  if (loading) {
    return (
      <div className="bg-slate-800/50 border border-slate-600 rounded-lg p-6 flex items-center justify-center gap-3 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Analyzing dependencies...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-800/50 border border-slate-600 rounded-lg p-4 flex items-center gap-2 text-red-400 text-sm">
        <AlertCircle className="w-4 h-4" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${risk.bg}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <RiskIcon className={`w-5 h-5 ${risk.color}`} />
          Refactoring Impact Map
        </h3>
        <span className={`text-sm font-medium px-2.5 py-0.5 rounded-full border ${risk.bg} ${risk.color}`}>
          {risk.label}
        </span>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-3 px-5 pb-4">
        <div className="bg-slate-800/60 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-cyan-400">{upstream.length}</div>
          <div className="text-xs text-slate-400 mt-0.5">Upstream</div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 text-center">
          <div className={`text-2xl font-bold ${risk.color}`}>{rippleCount}</div>
          <div className="text-xs text-slate-400 mt-0.5">Ripple Files</div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 text-center">
          <div className={`text-2xl font-bold ${risk.color}`}>
            {rippleCount === 0 ? 'Safe' : rippleCount <= 5 ? 'Low' : rippleCount <= 20 ? 'Med' : 'High'}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">Change Risk</div>
        </div>
      </div>

      {/* Interactive Graph */}
      <div className="px-5 pb-2">
        <div className="bg-slate-900/60 rounded-lg border border-slate-700/50 p-1 overflow-hidden">
          <ImpactGraph focusFile={filePath} upstream={upstream} ripple={rippleFiles} risk={risk} />
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg px-3 py-2">
            <span className="font-semibold text-cyan-400">Upstream Dependencies</span>
            <p className="text-slate-400 mt-0.5">Classes and interfaces that this file imports or extends. Changes in upstream files may break this file.</p>
          </div>
          <div className={`${risk.bg} rounded-lg px-3 py-2`}>
            <span className={`font-semibold ${risk.color}`}>Ripple Effect</span>
            <p className="text-slate-400 mt-0.5">Files that depend on this file. Refactoring here may require changes in these downstream files.</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2">
            <span className="font-semibold text-slate-300">Change Risk</span>
            <p className="text-slate-400 mt-0.5">Overall risk level based on ripple count: more affected files means higher risk of breaking changes.</p>
          </div>
        </div>
      </div>

      {/* Table toggle */}
      {tableRows.length > 0 && (
        <div className="px-5 pb-5 pt-2">
          <button
            onClick={() => setShowTable(!showTable)}
            className="w-full flex items-center justify-between text-sm text-slate-300 hover:text-white transition-colors py-2 px-4 rounded-md bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700/50"
          >
            <span className="font-medium">Dependency Details Table ({tableRows.length} files)</span>
            {showTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showTable && (
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-700/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/80 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="px-4 py-2.5 text-left font-semibold">#</th>
                    <th className="px-4 py-2.5 text-left font-semibold">File</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Direction</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Type</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Path</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {tableRows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-2 text-slate-500 text-xs">{i + 1}</td>
                      <td className="px-4 py-2 text-white font-medium">{row.name}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          row.direction === 'Upstream'
                            ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                            : `${risk.bg} ${risk.color}`
                        }`}>
                          {row.direction === 'Upstream' ? '← Upstream' : '→ Ripple'}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          row.external ? 'bg-slate-700 text-slate-400' : 'bg-indigo-500/10 text-indigo-400'
                        }`}>
                          {row.external ? 'External' : 'Project'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-400 text-xs font-mono truncate max-w-xs" title={row.path}>
                        {row.path.replace(/^.*?src\//, 'src/')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
