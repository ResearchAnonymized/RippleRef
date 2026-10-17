'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { computeSimpleDiffRows, type DiffRow } from '../lib/lineDiff';
import { buildGitUnifiedDiff } from '../lib/unifiedDiff';
import { monacoLanguageFromFilename } from '../lib/monacoLanguageFromPath';
import { loadMonacoDiffChunk } from '../lib/loadMonacoDiffChunk';
import MonacoDiffErrorBoundary from './MonacoDiffErrorBoundary';
import {
  Code,
  ArrowRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  GitBranch,
  FileText,
  CheckCircle,
  AlertTriangle,
  Info,
  Zap,
  Target,
  Layers,
  ChevronDown,
  ChevronRight,
  X,
  ExternalLink,
  Share2,
  Save,
  RefreshCw,
  Monitor
} from 'lucide-react';

const CodeComparisonMonacoDiff = dynamic(() => loadMonacoDiffChunk(), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg border border-slate-600 bg-slate-900 px-6 py-16 text-center text-slate-400 text-sm">
      Loading IDE diff editor…
    </div>
  ),
});

interface CodeComparisonProps {
  beforeCode: string;
  afterCode: string;
  title: string;
  description: string;
  changes: {
    added: number;
    removed: number;
    modified: number;
  };
  metrics: {
    complexityBefore: number;
    complexityAfter: number;
    maintainabilityBefore: number;
    maintainabilityAfter: number;
    testabilityBefore: number;
    testabilityAfter: number;
  };
  onApply?: () => void;
  onReject?: () => void;
  showLineNumbers?: boolean;
}

export default function CodeComparison({
  beforeCode,
  afterCode,
  title,
  description,
  changes,
  metrics,
  onApply,
  onReject,
  showLineNumbers = true
}: CodeComparisonProps) {
  const [activeTab, setActiveTab] = useState<'side-by-side' | 'unified' | 'diff' | 'monaco-diff'>('side-by-side');
  const [monacoMountKey, setMonacoMountKey] = useState(0);
  /** Unified tab: official git-style patch vs stacked before/after panels */
  const [unifiedSubTab, setUnifiedSubTab] = useState<'patch' | 'stacked'>('patch');
  const [showMetrics, setShowMetrics] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copyFailedKey, setCopyFailedKey] = useState<string | null>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
        copyResetTimerRef.current = null;
      }
    };
  }, []);

  /** Avoid stale "Copied" after a new diff is loaded */
  useEffect(() => {
    setCopiedKey(null);
    setCopyFailedKey(null);
    if (copyResetTimerRef.current) {
      clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = null;
    }
  }, [beforeCode, afterCode]);

  const patchFileLabel = useMemo(() => {
    const raw = (title || 'Source').trim().replace(/[^\w.\/-]+/g, '_').replace(/^_+|_+$/g, '');
    const base = raw || 'Source';
    return base.includes('.') ? base : `${base}.java`;
  }, [title]);

  const monacoLanguage = useMemo(() => monacoLanguageFromFilename(patchFileLabel), [patchFileLabel]);

  const gitUnifiedPatch = useMemo(
    () => buildGitUnifiedDiff(beforeCode, afterCode, { fileLabel: patchFileLabel, context: 3 }),
    [beforeCode, afterCode, patchFileLabel]
  );

  const renderGitUnifiedPatch = (patch: string) => {
    const lines = (patch || '').split('\n');
    return (
      <pre className="text-sm max-h-[70vh] overflow-auto rounded-md bg-slate-950/80 border border-slate-700 p-3 font-mono">
        {lines.map((line, idx) => {
          let rowClass = '';
          let textClass = 'text-slate-200';
          if (line.startsWith('@@')) {
            rowClass = 'bg-sky-900/35';
            textClass = 'text-sky-200';
          } else if (line.startsWith('+') && !line.startsWith('+++')) {
            rowClass = 'bg-green-900/25';
            textClass = 'text-green-300';
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            rowClass = 'bg-red-900/25';
            textClass = 'text-red-300';
          } else if (
            line.startsWith('diff --git') ||
            line.startsWith('index ') ||
            line.startsWith('--- ') ||
            line.startsWith('+++ ') ||
            line === '\\ No newline at end of file'
          ) {
            textClass = 'text-slate-500';
          }
          return (
            <div key={idx} className={`flex min-h-[1.35em] ${rowClass}`}>
              <code className={`whitespace-pre flex-1 min-w-0 overflow-x-auto py-0.5 ${textClass}`}>{line}</code>
            </div>
          );
        })}
      </pre>
    );
  };

  const scheduleCopyUiReset = (kind: 'success' | 'fail') => {
    if (copyResetTimerRef.current) {
      clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = null;
    }
    const ms = kind === 'success' ? 2200 : 2800;
    copyResetTimerRef.current = setTimeout(() => {
      copyResetTimerRef.current = null;
      if (kind === 'success') setCopiedKey(null);
      else setCopyFailedKey(null);
    }, ms);
  };

  /**
   * Copy full source reliably: execCommand from a focused textarea works best for large Java files
   * and avoids gesture / permission quirks from async clipboard API in some browsers.
   */
  const copyToClipboard = (text: string, type: string) => {
    const payload = String(text ?? '');

    const onSuccess = () => {
      setCopyFailedKey(null);
      setCopiedKey(type);
      scheduleCopyUiReset('success');
    };
    const onFail = () => {
      setCopiedKey(null);
      setCopyFailedKey(type);
      scheduleCopyUiReset('fail');
      console.warn('CodeComparison: clipboard copy failed for', type);
    };

    const tryExecCommand = (): boolean => {
      try {
        const ta = document.createElement('textarea');
        ta.value = payload;
        ta.setAttribute('readonly', '');
        ta.setAttribute('aria-hidden', 'true');
        ta.style.cssText =
          'position:fixed;top:0;left:0;width:2px;height:2px;margin:0;padding:0;border:none;outline:none;' +
          'opacity:0;pointer-events:none;box-shadow:none;background:transparent;';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        if (typeof ta.setSelectionRange === 'function') {
          ta.setSelectionRange(0, payload.length);
        }
        const done = document.execCommand('copy');
        ta.blur();
        document.body.removeChild(ta);
        return done;
      } catch {
        return false;
      }
    };

    if (tryExecCommand()) {
      onSuccess();
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && window.isSecureContext) {
      void navigator.clipboard
        .writeText(payload)
        .then(() => onSuccess())
        .catch(() => {
          if (tryExecCommand()) onSuccess();
          else onFail();
        });
      return;
    }

    if (tryExecCommand()) onSuccess();
    else onFail();
  };

  const CopyPanelButton = ({
    label,
    copyKey,
    code,
  }: {
    label: string;
    copyKey: string;
    code: string;
  }) => {
    const isCopied = copiedKey === copyKey;
    const isErr = copyFailedKey === copyKey;
    return (
      <button
        type="button"
        onClick={() => copyToClipboard(code, copyKey)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors bg-slate-700/90 hover:bg-slate-600 text-slate-100 border-slate-600 shrink-0"
        title={`Copy ${label} (full source)`}
        aria-label={`Copy ${label} to clipboard`}
      >
        {isCopied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        {isCopied ? 'Copied' : isErr ? 'Failed' : `Copy ${label}`}
      </button>
    );
  };

  const getComplexityColor = (complexity: number) => {
    if (complexity <= 3) return 'text-green-400';
    if (complexity <= 7) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getImprovementColor = (before: number, after: number) => {
    if (after > before) return 'text-green-400';
    if (after < before) return 'text-red-400';
    return 'text-slate-400';
  };

  const getImprovementIcon = (before: number, after: number) => {
    if (after > before) return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (after < before) return <AlertTriangle className="w-4 h-4 text-red-400" />;
    return <Info className="w-4 h-4 text-slate-400" />;
  };

  const formatMetricDelta = (before: number, after: number) => {
    const d = Number((after - before).toFixed(1));
    return (d > 0 ? '+' : '') + d;
  };

  const buildHunks = (rows: DiffRow[]) => {
    const hunks: Array<{ startBefore?: number; endBefore?: number; startAfter?: number; endAfter?: number; added: number; removed: number; }>
      = [];
    let current: any = null;
    for (const r of rows) {
      if (r.type === 'same') {
        if (current) { hunks.push(current); current = null; }
        continue;
      }
      if (!current) {
        current = { startBefore: r.bi, endBefore: r.bi, startAfter: r.ai, endAfter: r.ai, added: 0, removed: 0 };
      }
      current.endBefore = r.bi ?? current.endBefore;
      current.endAfter = r.ai ?? current.endAfter;
      if (r.type === 'add') current.added++;
      if (r.type === 'del') current.removed++;
    }
    if (current) hunks.push(current);
    return hunks;
  };

  const renderCodeWithLineNumbers = (code: string, textClass: string) => {
    const lines = (code || '').split('\n');
    return (
      <pre className={`text-sm ${textClass} max-h-[70vh] overflow-auto rounded-md`}>
        {lines.map((line, idx) => (
          <div key={idx} className="flex min-h-[1.25em]">
            {showLineNumbers && (
              <span className="select-none shrink-0 w-10 sm:w-12 text-right pr-2 text-slate-500 tabular-nums">
                {idx + 1}
              </span>
            )}
            {/* Preserve exact line text; scroll horizontally instead of breaking tokens */}
            <code className="whitespace-pre flex-1 min-w-0 overflow-x-auto">{line}</code>
          </div>
        ))}
      </pre>
    );
  };

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700">
      {/* Header */}
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center">
              <Code className="w-5 h-5 mr-2 text-blue-400" />
              {title}
            </h3>
            <p className="text-slate-400 mt-1">{description}</p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowMetrics(!showMetrics)}
              className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm flex items-center"
            >
              {showMetrics ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
              {showMetrics ? 'Hide' : 'Show'} Metrics
            </button>
          </div>
        </div>

        {/* Change Statistics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-700 rounded-lg p-3">
            <div className="text-2xl font-bold text-green-400">+{changes.added}</div>
            <div className="text-sm text-slate-400">Lines Added</div>
          </div>
          <div className="bg-slate-700 rounded-lg p-3">
            <div className="text-2xl font-bold text-red-400">-{changes.removed}</div>
            <div className="text-sm text-slate-400">Lines Removed</div>
          </div>
          <div className="bg-slate-700 rounded-lg p-3">
            <div className="text-2xl font-bold text-blue-400">{changes.modified}</div>
            <div className="text-sm text-slate-400">Lines Modified</div>
          </div>
        </div>
        {/* Change hunks summary */}
        <div className="mt-4">
          {(() => {
            const rows = computeSimpleDiffRows(beforeCode, afterCode);
            const hunks = buildHunks(rows);
            if (hunks.length === 0) return null;
            return (
              <div className="mt-3 bg-slate-800 rounded-lg border border-slate-700 p-3">
                <div className="text-slate-300 font-medium mb-2">Change Summary</div>
                <ul className="text-slate-400 text-sm space-y-1">
                  {hunks.map((h, idx) => (
                    <li key={idx}>
                      Hunk {idx + 1}: -{h.removed} +{h.added} at
                      {h.startBefore ? ` before L${h.startBefore}${h.endBefore && h.endBefore !== h.startBefore ? `-L${h.endBefore}` : ''}` : ''},
                      {h.startAfter ? ` after L${h.startAfter}${h.endAfter && h.endAfter !== h.startAfter ? `-L${h.endAfter}` : ''}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Metrics Panel */}
      {showMetrics && (
        <div className="p-6 border-b border-slate-700 bg-slate-900/50">
          <h4 className="text-white font-semibold mb-4 flex items-center">
            <Target className="w-4 h-4 mr-2 text-purple-400" />
            Quality Metrics Comparison
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h5 className="text-white font-medium mb-3">Complexity</h5>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Before:</span>
                  <span className={`${getComplexityColor(metrics.complexityBefore)}`}>
                    {metrics.complexityBefore}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">After:</span>
                  <span className={`${getComplexityColor(metrics.complexityAfter)}`}>
                    {metrics.complexityAfter}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Change:</span>
                  <div className="flex items-center space-x-1">
                    {getImprovementIcon(metrics.complexityBefore, metrics.complexityAfter)}
                    <span className={`${getImprovementColor(metrics.complexityBefore, metrics.complexityAfter)}`}>
                      {formatMetricDelta(metrics.complexityBefore, metrics.complexityAfter)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h5 className="text-white font-medium mb-3">Maintainability</h5>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Before:</span>
                  <span className="text-slate-300">{Number(metrics.maintainabilityBefore).toFixed(1)}/100</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">After:</span>
                  <span className="text-slate-300">{Number(metrics.maintainabilityAfter).toFixed(1)}/100</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Change:</span>
                  <div className="flex items-center space-x-1">
                    {getImprovementIcon(metrics.maintainabilityBefore, metrics.maintainabilityAfter)}
                    <span className={`${getImprovementColor(metrics.maintainabilityBefore, metrics.maintainabilityAfter)}`}>
                      {formatMetricDelta(metrics.maintainabilityBefore, metrics.maintainabilityAfter)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h5 className="text-white font-medium mb-3">Testability</h5>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Before:</span>
                  <span className="text-slate-300">{Number(metrics.testabilityBefore).toFixed(1)}/100</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">After:</span>
                  <span className="text-slate-300">{Number(metrics.testabilityAfter).toFixed(1)}/100</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Change:</span>
                  <div className="flex items-center space-x-1">
                    {getImprovementIcon(metrics.testabilityBefore, metrics.testabilityAfter)}
                    <span className={`${getImprovementColor(metrics.testabilityBefore, metrics.testabilityAfter)}`}>
                      {formatMetricDelta(metrics.testabilityBefore, metrics.testabilityAfter)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-700">
        {[
          { id: 'side-by-side', label: 'Side by Side', icon: <Code className="w-4 h-4" /> },
          { id: 'unified', label: 'Unified / Patch', icon: <Layers className="w-4 h-4" /> },
          { id: 'diff', label: 'Diff View', icon: <GitBranch className="w-4 h-4" /> },
          { id: 'monaco-diff', label: 'IDE Diff', icon: <Monitor className="w-4 h-4" /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/10'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            {tab.icon}
            <span className="ml-2">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Code Comparison Content */}
      <div className="p-6">
        {activeTab === 'side-by-side' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h4 className="text-white font-semibold flex items-center min-w-0">
                  <FileText className="w-4 h-4 mr-2 text-red-400 shrink-0" />
                  Before
                </h4>
                <CopyPanelButton label="before" copyKey="before" code={beforeCode} />
              </div>
              <div className="bg-slate-900 rounded-lg p-4 border border-red-500/50 overflow-x-auto">
                {renderCodeWithLineNumbers(beforeCode, 'text-red-300')}
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h4 className="text-white font-semibold flex items-center min-w-0">
                  <FileText className="w-4 h-4 mr-2 text-green-400 shrink-0" />
                  After
                </h4>
                <CopyPanelButton label="after" copyKey="after" code={afterCode} />
              </div>
              <div className="bg-slate-900 rounded-lg p-4 border border-green-500/50 overflow-x-auto">
                {renderCodeWithLineNumbers(afterCode, 'text-green-300')}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'unified' && (
          <div className="space-y-4">
            <div className="bg-slate-900 rounded-lg p-4 border border-slate-600">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between mb-3">
                <div>
                  <h4 className="text-white font-semibold">Unified diff</h4>
                  <p className="text-slate-500 text-xs mt-1">
                    Git-style unified patch (Myers via <code className="text-slate-400">diff</code>); paste into reviews or{' '}
                    <code className="text-slate-400">git apply --check</code>.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex rounded-md border border-slate-600 overflow-hidden text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setUnifiedSubTab('patch')}
                      className={`px-3 py-1.5 ${unifiedSubTab === 'patch' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                    >
                      Unified patch
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnifiedSubTab('stacked')}
                      className={`px-3 py-1.5 border-l border-slate-600 ${unifiedSubTab === 'stacked' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                    >
                      Stacked
                    </button>
                  </div>
                  <CopyPanelButton label="before" copyKey="unified-before" code={beforeCode} />
                  <CopyPanelButton label="after" copyKey="unified-after" code={afterCode} />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(gitUnifiedPatch, 'unified-patch')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border bg-slate-700/90 hover:bg-slate-600 text-slate-100 border-slate-600"
                    title="Copy full unified patch"
                  >
                    {copiedKey === 'unified-patch' ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    {copiedKey === 'unified-patch' ? 'Copied' : copyFailedKey === 'unified-patch' ? 'Failed' : 'Copy patch'}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${beforeCode}\n\n---\n\n${afterCode}`, 'unified')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border bg-slate-700/90 hover:bg-slate-600 text-slate-100 border-slate-600"
                    title="Copy before and after, separated by ---"
                  >
                    {copiedKey === 'unified' ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    {copiedKey === 'unified' ? 'Copied both' : copyFailedKey === 'unified' ? 'Failed' : 'Copy both (raw)'}
                  </button>
                </div>
              </div>
              {unifiedSubTab === 'patch' ? (
                <div className="overflow-x-auto">{renderGitUnifiedPatch(gitUnifiedPatch)}</div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="text-sm text-red-400 font-medium mb-2">Before:</div>
                    <div className="bg-slate-800 rounded p-3 overflow-x-auto">
                      {renderCodeWithLineNumbers(beforeCode, 'text-red-300')}
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    <ArrowRight className="w-5 h-5 text-slate-400" />
                  </div>
                  <div>
                    <div className="text-sm text-green-400 font-medium mb-2">After:</div>
                    <div className="bg-slate-800 rounded p-3 overflow-x-auto">
                      {renderCodeWithLineNumbers(afterCode, 'text-green-300')}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'diff' && (
          <div className="bg-slate-900 rounded-lg p-4 border border-slate-600">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h4 className="text-white font-semibold">Diff View</h4>
              <div className="flex flex-wrap gap-2">
                <CopyPanelButton label="before" copyKey="diff-before" code={beforeCode} />
                <CopyPanelButton label="after" copyKey="diff-after" code={afterCode} />
                <button
                  type="button"
                  onClick={() => copyToClipboard(`--- Before\n${beforeCode}\n\n+++ After\n${afterCode}`, 'diff')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border bg-slate-700/90 hover:bg-slate-600 text-slate-100 border-slate-600"
                  title="Copy labeled before/after block"
                >
                  {copiedKey === 'diff' ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  {copiedKey === 'diff' ? 'Copied both' : copyFailedKey === 'diff' ? 'Failed' : 'Copy both (labeled)'}
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(gitUnifiedPatch, 'diff-patch')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border bg-slate-700/90 hover:bg-slate-600 text-slate-100 border-slate-600"
                  title="Copy git unified patch"
                >
                  {copiedKey === 'diff-patch' ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  {copiedKey === 'diff-patch' ? 'Copied' : copyFailedKey === 'diff-patch' ? 'Failed' : 'Copy patch'}
                </button>
              </div>
            </div>
            <div className="text-sm">
              {(() => {
                const rows = computeSimpleDiffRows(beforeCode, afterCode);
                return (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-red-400 mb-2">--- Before</div>
                      <div className="bg-slate-800 rounded p-3 overflow-auto max-h-96">
                        {rows.filter(r => r.type !== 'add').map((r, idx) => (
                          <div key={idx} className={`flex ${r.type === 'del' ? 'bg-red-900/30' : ''}`}>
                            {showLineNumbers && (
                              <span className="select-none mr-4 w-12 text-right pr-2 text-slate-500">{r.bi ?? ''}</span>
                            )}
                            <code className="text-red-300 whitespace-pre flex-1 min-w-0 overflow-x-auto">{r.before ?? ''}</code>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-green-400 mb-2">+++ After</div>
                      <div className="bg-slate-800 rounded p-3 overflow-auto max-h-96">
                        {rows.filter(r => r.type !== 'del').map((r, idx) => (
                          <div key={idx} className={`flex ${r.type === 'add' ? 'bg-green-900/30' : ''}`}>
                            {showLineNumbers && (
                              <span className="select-none mr-4 w-12 text-right pr-2 text-slate-500">{r.ai ?? ''}</span>
                            )}
                            <code className="text-green-300 whitespace-pre flex-1 min-w-0 overflow-x-auto">{r.after ?? ''}</code>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {activeTab === 'monaco-diff' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-slate-500 text-xs max-w-xl">
                Monaco <code className="text-slate-400">DiffEditor</code>: synchronized panes, syntax highlighting, and inline or side-by-side layout (read-only).
              </p>
              <div className="flex flex-wrap gap-2 shrink-0">
                <CopyPanelButton label="before" copyKey="monaco-before" code={beforeCode} />
                <CopyPanelButton label="after" copyKey="monaco-after" code={afterCode} />
              </div>
            </div>
            <MonacoDiffErrorBoundary onRetry={() => setMonacoMountKey(k => k + 1)}>
              <CodeComparisonMonacoDiff
                key={monacoMountKey}
                original={beforeCode}
                modified={afterCode}
                language={monacoLanguage}
              />
            </MonacoDiffErrorBoundary>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="p-6 border-t border-slate-700 bg-slate-900/50">
        <div className="flex items-center justify-between">
          <div className="flex space-x-3">
            <button
              onClick={() => copyToClipboard(afterCode, 'final')}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Refactored Code
            </button>
            <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center">
              <Download className="w-4 h-4 mr-2" />
              Download
            </button>
            <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center">
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </button>
          </div>
          
          <div className="flex space-x-3">
            {onReject && (
              <button
                onClick={onReject}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center"
              >
                <X className="w-4 h-4 mr-2" />
                Reject Changes
              </button>
            )}
            {onApply && (
              <button
                onClick={onApply}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Apply Changes
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}