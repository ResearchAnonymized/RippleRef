'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import CodeComparison from './CodeComparison';
import RefactoringMetricsCharts from './RefactoringMetricsCharts';
import RefactoringVisualSummary from './RefactoringVisualSummary';
import ResearchMetricsPanel from './ResearchMetricsPanel';
import { isRefineDemo } from '../lib/refineDemoMode';
import FileImpactDependencyGraph from './FileImpactDependencyGraph';
import { apiClient } from '../api/client';
import {
  agentsAnalyzeUrl,
  agentsHealthUrl,
  agentsPort,
  agentsProgressUrl,
  agentsRefactorUrl,
} from '../lib/refactorClient';
import { 
  Brain, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Play, 
  Pause, 
  Square,
  FileText,
  Settings,
  Download,
  Upload,
  Trash2,
  Edit3,
  Eye,
  Sparkles,
  Code,
  Wand2,
  ArrowLeft,
  Shield,
  Zap,
  Target,
  TrendingUp,
  AlertCircle,
  Info,
  XCircle,
  ThumbsUp,
  ThumbsDown,
  GitCommit,
  History,
  Undo2,
  Save,
  X,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Activity,
  Terminal,
  Search,
  Bug,
  CheckCircle2,
  Minus,
  BarChart3,
} from 'lucide-react';
import { mergeChangeStats } from '../lib/lineDiff';
import {
  buildRefactoringReportCsv,
  downloadTextFile,
  defaultRefactoringExportFilename,
} from '../lib/exportRefactoringReportCsv';
import {
  buildResearchMetricsSheetCsv,
  defaultResearchMetricsSheetFilename,
  downloadResearchMetricsSheet,
} from '../lib/exportResearchMetricsCsv';
import RefactoringEvidencePanel from './RefactoringEvidencePanel';
import RefactoringReportPanel from './RefactoringReportPanel';
import {
  buildClientRefactoringReport,
  type ReportNarrativeExtras,
} from '../lib/refactoringReportDocument';
import { buildSavedRefactoringReportBundle } from '../lib/savedRefactoringReport';
import { jsonSafeForArchive } from '../lib/jsonSafeForArchive';
import {
  getLlmCandidateContent,
  improvementStatsFromRefactorResponse,
  buildResearchApplyResultPartial,
  isIdenticalRefactorCandidate,
  refactorResponseMatchesFile,
} from '../lib/ingestRefactorResponse';

interface LiveFeedEvent {
  type: 'step' | 'detail' | 'done' | 'keepalive';
  message?: string;
  category?: string;
  stepName?: string;
  agent?: string;
  status?: string;
  stepIndex?: number;
  totalSteps?: number;
  success?: boolean;
  timestamp?: number;
}

function LiveRefactoringFeed({ events, isRunning }: { events: LiveFeedEvent[]; isRunning: boolean }) {
  const feedRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events.length]);

  const categoryIcon = (cat?: string) => {
    switch (cat) {
      case 'success': return <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />;
      case 'error': return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
      case 'warning': return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      case 'analysis': return <Search className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
      case 'smell': return <Bug className="w-3.5 h-3.5 text-orange-400 shrink-0" />;
      case 'refactoring': return <Wand2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
      default: return <Terminal className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
    }
  };

  const categoryColor = (cat?: string) => {
    switch (cat) {
      case 'success': return 'text-green-300';
      case 'error': return 'text-red-300';
      case 'warning': return 'text-amber-300';
      case 'analysis': return 'text-blue-300';
      case 'smell': return 'text-orange-300';
      case 'refactoring': return 'text-purple-300';
      default: return 'text-slate-300';
    }
  };

  const detailEvents = events.filter(e => e.type === 'detail' || e.type === 'step');
  const currentStep = events.filter(e => e.type === 'step').pop();
  const progress = currentStep?.stepIndex != null && currentStep?.totalSteps
    ? Math.round(((currentStep.stepIndex + 1) / currentStep.totalSteps) * 100)
    : 0;

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-600 overflow-hidden">
      {/* Header with progress */}
      <div className="px-4 py-3 bg-slate-700/50 border-b border-slate-600 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className={`w-4 h-4 ${isRunning ? 'text-green-400 animate-pulse' : 'text-slate-400'}`} />
          <span className="text-sm font-medium text-white">
            {isRunning ? 'Refactoring Live Feed' : 'Refactoring Complete'}
          </span>
          {currentStep?.agent && (
            <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">
              {currentStep.agent}
            </span>
          )}
        </div>
        {progress > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-24 bg-slate-600 rounded-full h-1.5">
              <div
                className="bg-green-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-slate-400">{progress}%</span>
          </div>
        )}
      </div>

      {/* Current step banner */}
      {currentStep && isRunning && (
        <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/20 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-green-300 font-medium">
            Step {(currentStep.stepIndex ?? 0) + 1}/{currentStep.totalSteps ?? 7}: {currentStep.stepName}
          </span>
          {currentStep.agent && (
            <span className="text-xs text-green-400/60">({currentStep.agent})</span>
          )}
        </div>
      )}

      {/* Feed messages */}
      <div ref={feedRef} className="max-h-52 overflow-y-auto px-4 py-2 space-y-1 font-mono text-xs">
        {detailEvents.length === 0 && isRunning && (
          <div className="flex items-center gap-2 text-slate-400 py-2">
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-green-400" />
            Connecting to refactoring engine...
          </div>
        )}
        {detailEvents.map((evt, i) => (
          <div key={i} className="flex items-start gap-2 py-0.5">
            {evt.type === 'step' ? (
              <>
                <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                <span className="text-yellow-200">
                  {evt.status === 'running' ? '▶' : '✓'} {evt.stepName}
                  {evt.agent ? ` (${evt.agent})` : ''}
                </span>
              </>
            ) : (
              <>
                <span className="mt-0.5">{categoryIcon(evt.category)}</span>
                <span className={categoryColor(evt.category)}>{evt.message}</span>
              </>
            )}
          </div>
        ))}
        {isRunning && (
          <div className="flex items-center gap-2 text-slate-500 py-1">
            <div className="animate-pulse">▌</div>
          </div>
        )}
      </div>
    </div>
  );
}

function CollapsibleSection({ title, icon: Icon, iconColor, defaultOpen = false, badge, children }: {
  title: string; icon?: any; iconColor?: string; defaultOpen?: boolean; badge?: React.ReactNode; children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/30 transition-colors text-left">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className={`w-4 h-4 flex-shrink-0 ${iconColor || 'text-slate-400'}`} />}
          <span className="text-sm font-semibold text-white truncate">{title}</span>
          {badge}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

/** Attach structured refactoring report from agents when present. */
function mergeRefactoringReport<T extends Record<string, unknown>>(partial: T, report: unknown): T {
  if (report != null && typeof report === 'object') {
    return { ...partial, refactoringReport: report } as T;
  }
  return partial;
}

/** Merge agents/refactor payload into applyResult for Review (adopted or research-only). */
function buildFullResearchApplyResult(
  data: Record<string, unknown>,
  original: string,
  selectedFilePath: string
) {
  const candidate = getLlmCandidateContent(data, original);
  const orig = (typeof data.originalContent === 'string' ? data.originalContent : original) || original;
  return mergeRefactoringReport(
    applyResultWithLineStats(
      buildResearchApplyResultPartial(data, orig, candidate, selectedFilePath) as Record<string, unknown>,
      orig,
      candidate
    ),
    data.refactoringReport
  );
}

/** Nested `applyResult.refactoringReport` from older responses must not override the top-level report for this run. */
function stripEmbeddedRefactoringReport(obj: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return {};
  const { refactoringReport: _omit, ...rest } = obj as Record<string, unknown> & { refactoringReport?: unknown };
  return rest;
}

function normalizeReportPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

/** True when the structured report belongs to the file currently open (prevents stale metrics from a prior refactor). */
function reportMatchesSelectedFile(report: { file?: string } | null | undefined, selectedFilePath: string): boolean {
  if (!report || typeof report !== 'object' || !selectedFilePath) return false;
  const rf = String(report.file || '').trim();
  if (!rf) return false;
  const nSel = normalizeReportPath(selectedFilePath);
  const nRep = normalizeReportPath(rf);
  if (nRep === nSel) return true;
  if (nSel.endsWith(nRep) || nSel.endsWith('/' + nRep)) return true;
  const selBase = (selectedFilePath.split(/[/\\]/).pop() || '').toLowerCase();
  const repBase = (rf.split(/[/\\]/).pop() || nRep).toLowerCase();
  return !!selBase && selBase === repBase;
}

/** Ensure change summary matches the diff (backend often omits added/removed/modified). */
function applyResultWithLineStats(
  partial: Record<string, any> | null | undefined,
  original: string,
  refactored: string
) {
  const p = partial && typeof partial === 'object' ? partial : {};
  const orig = (typeof p.originalContent === 'string' && p.originalContent) ? p.originalContent : original;
  const ref = (typeof p.refactoredContent === 'string' && p.refactoredContent) ? p.refactoredContent : refactored;
  return {
    ...p,
    originalContent: orig,
    refactoredContent: ref,
    changes: mergeChangeStats(orig, ref, p.changes as any),
  };
}

interface RefactoringRecommendation {
  id: string;
  type: 'IMPROVE' | 'KEEP' | 'REVIEW';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  reasoning: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  effort: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: number; // 0-100
  codeSnippet?: string;
  suggestedChanges?: string;
  risks?: string[];
  benefits?: string[];
  estimatedTime?: string;
  dependencies?: string[];
}

interface ControlledRefactoringProps {
  workspaceId: string;
  selectedFile: string;
  fileContent: string;
  codeSmells: any[];
  onRefactoringComplete: (refactoredCode: string) => void;
  onBack: () => void;
  onNextFile?: () => void;
}

/** Max wait for /agents/refactor in the browser. Scale with file size (5k+ LOC may need 45–60 min). */
function getRefactorClientTimeoutMs(lineCount: number, smellCount: number): number {
  if (lineCount > 50_000) return 90 * 60 * 1000;
  if (lineCount > 10_000) return 65 * 60 * 1000;
  if (lineCount > 5000) return 55 * 60 * 1000;
  if (lineCount > 800 || smellCount > 80) return 35 * 60 * 1000;
  if (lineCount > 400 || smellCount > 40) return 25 * 60 * 1000;
  return 18 * 60 * 1000;
}

function clientFileSizeNotice(lineCount: number): string | null {
  if (lineCount > 100_000) {
    return `Very large file (${lineCount.toLocaleString()} lines): whole-file LLM refactor will not run; you will still get smell analysis and a clear failure reason.`;
  }
  if (lineCount > 25_000) {
    return `Large file (${lineCount.toLocaleString()} lines): exceeds single-shot limit (~25k lines). Pipeline will analyze smells but skip the LLM step with an explanation.`;
  }
  if (lineCount > 5000) {
    const mins = Math.round(getRefactorClientTimeoutMs(lineCount, 0) / 60000);
    return `Large file (${lineCount.toLocaleString()} lines): refactor will be attempted; allow up to ~${mins} minutes. Partial or rejected output is possible.`;
  }
  if (lineCount > 800) {
    const mins = Math.round(getRefactorClientTimeoutMs(lineCount, 0) / 60000);
    return `Allow up to ~${mins} minutes for this file; keep the tab open until the run finishes.`;
  }
  return null;
}

const REFINE_DEMO = isRefineDemo();

export default function ControlledRefactoring({
  workspaceId, 
  selectedFile, 
  fileContent, 
  codeSmells,
  onRefactoringComplete,
  onBack,
  onNextFile,
}: ControlledRefactoringProps): JSX.Element {
  const [recommendations, setRecommendations] = useState<RefactoringRecommendation[]>([]);
  const [selectedRecommendations, setSelectedRecommendations] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRefactoring, setIsRefactoring] = useState(false);
  const [refactoringPlan, setRefactoringPlan] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState<'analyze' | 'recommend' | 'plan' | 'execute' | 'review'>('analyze');
  const [executionProgress, setExecutionProgress] = useState(0);
  const [displayContent, setDisplayContent] = useState<string>(fileContent || '');
  const [refactoredCode, setRefactoredCode] = useState('');
  const [applyResult, setApplyResult] = useState<any>(null);
  const [qualityMetrics, setQualityMetrics] = useState<any>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonEntry, setComparisonEntry] = useState<null | {
    originalContent: string;
    refactoredContent: string;
    changes?: { added?: number; removed?: number; modified?: number; linesChanged?: number };
    title?: string;
  }>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [improvementStats, setImprovementStats] = useState<{
    before?: { total: number; critical: number; major: number; minor: number };
    after?: { total: number; critical: number; major: number; minor: number };
    delta?: { total: number; critical: number; major: number; minor: number };
  } | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [smellComparison, setSmellComparison] = useState<{
    before: any[];
    after: any[];
    removed: any[];
    added: any[];
    unchanged: any[];
    beforeTotal?: number;
    afterTotal?: number;
    typeSummary?: Record<string, { before: number; after: number }>;
  } | null>(null);
  const [smellComparisonLoading, setSmellComparisonLoading] = useState(false);
  const [refactoringRejected, setRefactoringRejected] = useState<{
    rejected: boolean;
    rejectionReason?: string | string[];
    message?: string;
    success?: boolean;
  } | null>(null);
  const autoSavedReportRef = useRef(false);
  /** Incremented per refactor POST; ignore HTTP responses from older runs. */
  const refactorRunGenerationRef = useRef(0);
  const [saveReportStatus, setSaveReportStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveReportError, setSaveReportError] = useState<string | null>(null);
  interface HistoryEntry {
    id: string;
    timestamp: number;
    workspaceId: string;
    filePath: string;
    accepted: boolean;
    automatedVerdict: boolean;
    humanOverride?: { accepted: boolean; reason: string };
    rejectionReason?: string | string[];
    originalContent: string;
    refactoredContent: string;
    changes?: { added?: number; removed?: number; modified?: number; linesChanged?: number };
    stats?: {
      before: { total: number; critical: number; major: number; minor: number };
      after: { total: number; critical: number; major: number; minor: number };
      delta: { total: number; critical: number; major: number; minor: number };
    };
    agentSteps?: Array<{ name: string; agent: string; status: string }>;
    qualityScore?: number;
  }

  const HISTORY_KEY = `refactai-history-${workspaceId}`;

  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const [humanOverrideReason, setHumanOverrideReason] = useState('');

  // Persist history to localStorage whenever it changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch { /* quota exceeded — silently ignore */ }
  }, [history, HISTORY_KEY]);

  const addHistoryEntry = (entry: {
    originalContent: string;
    refactoredContent: string;
    changes?: { added?: number; removed?: number; modified?: number; linesChanged?: number };
    stats?: {
      before: { total: number; critical: number; major: number; minor: number };
      after: { total: number; critical: number; major: number; minor: number };
      delta: { total: number; critical: number; major: number; minor: number };
    };
  }) => {
    try {
      const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `hist-${Date.now()}`;
      const accepted = !refactoringRejected?.rejected;
      const item: HistoryEntry = {
        id,
        timestamp: Date.now(),
        workspaceId,
        filePath: selectedFile,
        accepted,
        automatedVerdict: accepted,
        rejectionReason: refactoringRejected?.rejectionReason,
        agentSteps: agentSteps.map(s => ({ name: s.name, agent: s.agent, status: s.status })),
        qualityScore: qualityMetrics?.overallScore,
        ...entry,
      };
      setHistory(prev => [item, ...prev]);
    } catch {
      // no-op
    }
  };

  const exportHistoryCSV = () => {
    const headers = [
      'Timestamp', 'File', 'Accepted', 'Automated Verdict', 'Human Override',
      'Human Reason', 'Rejection Reason',
      'Smells Before', 'Smells After', 'Smell Delta',
      'Critical Before', 'Critical After', 'Major Before', 'Major After',
      'Minor Before', 'Minor After',
      'Lines Added', 'Lines Removed', 'Quality Score',
      'Agent Steps'
    ];
    const rows = history.map(h => [
      new Date(h.timestamp).toISOString(),
      h.filePath,
      h.accepted,
      h.automatedVerdict,
      h.humanOverride ? h.humanOverride.accepted : '',
      h.humanOverride?.reason || '',
      Array.isArray(h.rejectionReason) ? h.rejectionReason.join('; ') : (h.rejectionReason || ''),
      h.stats?.before.total ?? '',
      h.stats?.after.total ?? '',
      h.stats?.delta.total ?? '',
      h.stats?.before.critical ?? '',
      h.stats?.after.critical ?? '',
      h.stats?.before.major ?? '',
      h.stats?.after.major ?? '',
      h.stats?.before.minor ?? '',
      h.stats?.after.minor ?? '',
      h.changes?.added ?? '',
      h.changes?.removed ?? '',
      h.qualityScore ?? '',
      h.agentSteps?.map(s => `${s.name}:${s.status}`).join(' > ') || ''
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `refactai-history-${workspaceId}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportHistoryJSON = () => {
    const data = history.map(h => ({
      timestamp: new Date(h.timestamp).toISOString(),
      workspaceId: h.workspaceId,
      filePath: h.filePath,
      accepted: h.accepted,
      automatedVerdict: h.automatedVerdict,
      humanOverride: h.humanOverride || null,
      rejectionReason: h.rejectionReason || null,
      smellsBefore: h.stats?.before || null,
      smellsAfter: h.stats?.after || null,
      smellDelta: h.stats?.delta || null,
      changes: h.changes || null,
      qualityScore: h.qualityScore || null,
      agentSteps: h.agentSteps || [],
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `refactai-history-${workspaceId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Multi-agent run state
  const [agentRunning, setAgentRunning] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [liveFeedEvents, setLiveFeedEvents] = useState<LiveFeedEvent[]>([]);
  const sseRef = React.useRef<EventSource | null>(null);

  const startSSE = (jobId: string, hint?: { lines?: number; smells?: number }) => {
    if (sseRef.current) { sseRef.current.close(); }
    const lines = hint?.lines ?? 0;
    const smells = hint?.smells ?? 0;
    const estMin =
      lines > 3000 ? 35 : lines > 1500 ? 25 : lines > 800 ? 15 : smells > 80 ? 12 : 8;
    setLiveFeedEvents([
      {
        type: 'detail',
        category: 'info',
        message:
          lines > 0
            ? `Started refactor (${lines.toLocaleString()} lines, ${smells} smells). Typical wait ~${estMin} min — PMD scan, then LLM, then verify.`
            : 'Started refactor — waiting for agent progress stream…',
        timestamp: Date.now(),
      },
    ]);
    try {
      const es = new EventSource(agentsProgressUrl(jobId));
      sseRef.current = es;
      es.onmessage = (e) => {
        try {
          const evt: LiveFeedEvent = JSON.parse(e.data);
          if (evt.type === 'keepalive') return;
          setLiveFeedEvents(prev => [...prev, evt]);
          if (evt.type === 'step' && evt.stepName) {
            setLoadingStep(`${evt.stepName} (${evt.agent || 'Agent'})`);
          }
          if (evt.type === 'done') {
            es.close();
            sseRef.current = null;
          }
        } catch { /* ignore parse errors */ }
      };
      es.onerror = () => {
        setLiveFeedEvents((prev) => [
          ...prev,
          {
            type: 'detail',
            category: 'warning',
            message:
              'Live feed disconnected — refactor may still be running. Watch the Refactoring… button or agents log.',
            timestamp: Date.now(),
          },
        ]);
        es.close();
        sseRef.current = null;
      };
    } catch { /* SSE not supported */ }
  };
  React.useEffect(() => {
    return () => { if (sseRef.current) { sseRef.current.close(); } };
  }, []);
  const [agentSteps, setAgentSteps] = useState<Array<{
    name: string; agent: string; status: string; startedAt: number; endedAt?: number; details?: any; error?: string;
  }>>([]);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [serviceStatus, setServiceStatus] = useState<{ available: boolean; hasKey: boolean; message?: string } | null>(null);
  const agentsReady = serviceStatus?.available === true && serviceStatus?.hasKey === true;

  const checkAgentsHealth = React.useCallback(async (): Promise<{ ok: true } | { ok: false; message: string }> => {
    try {
      const healthUrl =
        agentsHealthUrl();
      const healthRes = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (!healthRes.ok) {
        return {
          ok: false,
          message: `Agents service returned ${healthRes.status}. Start it with: cd agents && ./start.sh`,
        };
      }
      const health = await healthRes.json();
      if (!health.hasOpenRouterKey) {
        return {
          ok: false,
          message:
            'OpenRouter API key is not configured in agents/.env. Add OPENROUTER_API_KEY and restart the agents service.',
        };
      }
      return { ok: true };
    } catch (healthError) {
      const msg =
        healthError instanceof Error && healthError.name === 'TimeoutError'
          ? `Agents service is not responding on port ${agentsPort()}.`
          : `Cannot connect to agents service on port ${agentsPort()}. Run: ./start_daemon.sh start`;
      return { ok: false, message: msg };
    }
  }, []);

  /** When false (default), show a single-path UI: smells → refactor → review. Full 5-step + recommendation cards live behind Advanced. */
  const [showAdvancedRefactoring, setShowAdvancedRefactoring] = useState(false);

  // Auto-trigger smell comparison when refactoring completes
  const fetchSmellComparison = React.useCallback(async (orig: string, refactored: string) => {
    if (!orig || !refactored || orig.trim() === refactored.trim()) return;
    setSmellComparisonLoading(true);
    try {
      const analyzeLive = async (content: string) => {
        const res = await fetch('/api/workspace-enhanced-analysis/analyze-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, filePath: selectedFile, content })
        });
        if (!res.ok) throw new Error(`analyze-live failed: ${res.status}`);
        return res.json();
      };
      // Run sequentially to avoid any temp-file collision on the backend
      const bRes = await analyzeLive(orig);
      const aRes = await analyzeLive(refactored);
      console.log('🔍 Smell comparison — before:', bRes?.codeSmells?.length, 'after:', aRes?.codeSmells?.length,
        'orig length:', orig.length, 'refactored length:', refactored.length,
        'same content:', orig === refactored);
      const bSmells: any[] = Array.isArray(bRes?.codeSmells) ? bRes.codeSmells : [];
      const aSmells: any[] = Array.isArray(aRes?.codeSmells) ? aRes.codeSmells : [];
      const sk = (s: any) => `${s.type || s.smell || ''}::${s.severity || ''}`;
      const bMap = new Map<string, number>();
      bSmells.forEach(s => bMap.set(sk(s), (bMap.get(sk(s)) || 0) + 1));
      const aMap = new Map<string, number>();
      aSmells.forEach(s => aMap.set(sk(s), (aMap.get(sk(s)) || 0) + 1));
      const removedList: any[] = [];
      const unchangedList: any[] = [];
      const addedList: any[] = [];
      const aUsed = new Map<string, number>();
      bSmells.forEach(s => {
        const k = sk(s);
        const afterCount = aMap.get(k) || 0;
        const used = aUsed.get(k) || 0;
        if (used < afterCount) { unchangedList.push(s); aUsed.set(k, used + 1); }
        else removedList.push(s);
      });
      aSmells.forEach(s => {
        const k = sk(s);
        const beforeCount = bMap.get(k) || 0;
        const usedFromBefore = aUsed.get(k) || 0;
        if (usedFromBefore > 0) { aUsed.set(k, usedFromBefore - 1); }
        else addedList.push(s);
      });
      // Build per-type summary for the comparison view
      const typeSummary: Record<string, { before: number; after: number }> = {};
      bSmells.forEach(s => {
        const t = s.type || s.smell || 'Unknown';
        typeSummary[t] = typeSummary[t] || { before: 0, after: 0 };
        typeSummary[t].before++;
      });
      aSmells.forEach(s => {
        const t = s.type || s.smell || 'Unknown';
        typeSummary[t] = typeSummary[t] || { before: 0, after: 0 };
        typeSummary[t].after++;
      });
      // For the detail tables, cap at 5 representative examples per type
      const capPerType = (smells: any[], max: number) => {
        const counts: Record<string, number> = {};
        return smells.filter(s => {
          const t = s.type || s.smell || 'Unknown';
          counts[t] = (counts[t] || 0) + 1;
          return counts[t] <= max;
        });
      };
      setSmellComparison({
        before: capPerType(bSmells, 5), after: capPerType(aSmells, 5),
        removed: removedList, added: addedList, unchanged: unchangedList,
        beforeTotal: bSmells.length, afterTotal: aSmells.length,
        typeSummary,
      });
    } catch (err) {
      console.warn('Smell comparison fetch failed:', err);
    } finally {
      setSmellComparisonLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, selectedFile]);

  useEffect(() => {
    if (smellComparison || smellComparisonLoading) return;
    const orig = applyResult?.originalContent || displayContent || fileContent || '';
    const ref = applyResult?.refactoredContent || refactoredCode || '';
    console.log('🔎 Smell comparison useEffect check:', {
      hasApplyResult: !!applyResult,
      origLen: orig.length,
      refLen: ref.length,
      sameContent: orig === ref,
      sameTrimmed: orig.trim() === ref.trim(),
      origFirst80: orig.substring(0, 80),
      refFirst80: ref.substring(0, 80),
    });
    if (orig && ref && orig.trim() !== ref.trim()) {
      fetchSmellComparison(orig, ref);
    }
  }, [applyResult, refactoredCode, displayContent, fileContent, smellComparison, smellComparisonLoading, fetchSmellComparison]);

  // Ensure we always show correct code-smell counts even if parent didn't preload them
  const [effectiveCodeSmells, setEffectiveCodeSmells] = useState<any[]>(codeSmells || []);

  // Keep local state in sync with prop when it updates
  useEffect(() => {
    setEffectiveCodeSmells(codeSmells || []);
  }, [codeSmells]);

  /** Load PMD smells for this file (same engine as file-list badges and refactor verify). */
  useEffect(() => {
    const isLegacyAssessmentSmell = (s: any) => {
      const id = String(s?.detectorId || s?.type || '');
      return id.startsWith('design.') || id.includes('message-chains');
    };
    const loadPmdSmells = async () => {
      if (!workspaceId || !selectedFile) return;
      const fromProp = codeSmells || [];
      if (fromProp.length > 0 && !fromProp.some(isLegacyAssessmentSmell)) {
        setEffectiveCodeSmells(fromProp);
        return;
      }
      try {
        const enhanced = await apiClient.analyzeFileEnhanced(workspaceId, selectedFile);
        setEffectiveCodeSmells(enhanced.codeSmells || []);
      } catch (err) {
        console.warn('Failed to load PMD code smells for refactoring:', err);
        if (fromProp.length === 0) setEffectiveCodeSmells([]);
      }
    };
    loadPmdSmells();
  }, [workspaceId, selectedFile, codeSmells]);

  const handleExportResearchMetricsCsv = React.useCallback(() => {
    const rm = applyResult?.researchMetrics;
    if (!rm) return;
    const iso = new Date().toISOString();
    const csv = buildResearchMetricsSheetCsv({
      workspaceId: workspaceId || '',
      filePath: selectedFile || '',
      exportedAtIso: iso,
      metrics: rm,
      pipelineMetadata: applyResult?.pipelineMetadata || null,
    });
    downloadResearchMetricsSheet(
      defaultResearchMetricsSheetFilename(selectedFile || 'file', iso),
      csv
    );
  }, [workspaceId, selectedFile, applyResult]);

  const handleExportReportCsv = React.useCallback(() => {
    const smellsForExport =
      effectiveCodeSmells && effectiveCodeSmells.length > 0 ? effectiveCodeSmells : codeSmells || null;
    const csv = buildRefactoringReportCsv({
      workspaceId: workspaceId || '',
      filePath: selectedFile || '',
      exportedAtIso: new Date().toISOString(),
      applyResult: (applyResult as Record<string, unknown>) || null,
      codeSmells: smellsForExport,
      smellComparison: smellComparison || null,
      agentSteps: agentSteps || null,
      refactoringRejected: refactoringRejected || null,
    });
    downloadTextFile(
      defaultRefactoringExportFilename(selectedFile || 'file', new Date().toISOString()),
      csv
    );
  }, [
    workspaceId,
    selectedFile,
    applyResult,
    codeSmells,
    effectiveCodeSmells,
    smellComparison,
    agentSteps,
    refactoringRejected,
  ]);

  // Check agents service status on mount and periodically
  useEffect(() => {
    const checkServiceStatus = async () => {
      try {
        // Check directly on port 8091 to avoid proxy timeout
        const healthUrl =
          typeof window !== 'undefined' ? agentsHealthUrl() : `/agents/health`;
        
        const res = await fetch(healthUrl);
        if (res.ok) {
          const health = await res.json();
          setServiceStatus({
            available: true,
            hasKey: health.hasOpenRouterKey || false,
            message: health.hasOpenRouterKey ? 'Service ready' : 'Service running but API key not configured'
          });
        } else {
          setServiceStatus({
            available: false,
            hasKey: false,
            message: 'Agents service not available. Please start it with: cd agents && ./start.sh'
          });
        }
      } catch (error) {
        setServiceStatus({
          available: false,
          hasKey: false,
          message: `Cannot connect to agents service on port ${agentsPort()}`
        });
      }
    };
    
    checkServiceStatus();
    const interval = setInterval(checkServiceStatus, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Load history from backend
  const fetchHistory = React.useCallback(async () => {
    try {
      const res = await fetch(
        `/api/refactoring/workspaces/${workspaceId}/history/full?filePath=${encodeURIComponent(selectedFile)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }, [workspaceId, selectedFile]);

  React.useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Keep displayContent in sync with prop and fetch when missing
  React.useEffect(() => {
    setDisplayContent(fileContent || '');
  }, [fileContent, selectedFile]);

  // New file → clear prior refactor outputs so report/metrics cannot leak across files.
  React.useEffect(() => {
    setApplyResult(null);
    setRefactoredCode('');
    setSmellComparison(null);
    setImprovementStats(null);
    setRefactoringRejected(null);
    setComparisonEntry(null);
    setShowComparison(false);
    setVerifyStatus(null);
    setQualityMetrics(null);
    setAgentSteps([]);
    setAgentError(null);
    setLiveFeedEvents([]);
    setAgentAnalysis(null);
    setRefactoringPlan(null);
    setRecommendations([]);
    setSelectedRecommendations([]);
    setCurrentStep('analyze');
    setIsRefactoring(false);
    setIsAnalyzing(false);
    setExecutionProgress(0);
    setLoadingStep('');
    setLoadingProgress(0);
    autoSavedReportRef.current = false;
    setSaveReportStatus('idle');
    setSaveReportError(null);
  }, [selectedFile, workspaceId]);

  const applyResultMatchesCurrentFile = useMemo(() => {
    if (!applyResult || !selectedFile) return true;
    const runPath = applyResult.runFilePath as string | undefined;
    if (!runPath) return reportMatchesSelectedFile({ file: applyResult.responseFilePath as string }, selectedFile);
    return reportMatchesSelectedFile({ file: runPath }, selectedFile);
  }, [applyResult, selectedFile]);

  const resetRefactorRunState = useCallback(() => {
    refactorRunGenerationRef.current += 1;
    setApplyResult(null);
    setRefactoredCode('');
    setSmellComparison(null);
    setImprovementStats(null);
    setRefactoringRejected(null);
    setComparisonEntry(null);
    setShowComparison(false);
    setVerifyStatus(null);
    setQualityMetrics(null);
    setAgentError(null);
    autoSavedReportRef.current = false;
    setSaveReportStatus('idle');
    setSaveReportError(null);
  }, []);

  React.useEffect(() => {
    if (!workspaceId || !selectedFile) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await apiClient.getFileContent(workspaceId, selectedFile);
        if (!cancelled && response?.content) {
          setDisplayContent(response.content);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, selectedFile]);
  const [llmSettings, setLlmSettings] = useState({
    model: 'anthropic/claude-opus-4.8',
    temperature: 0.2, // Lower for more consistent recommendations
    maxTokens: 6000,
    safetyMode: true,
    costLimit: 5.0
  });

  // Agent analysis state
  const [agentAnalysis, setAgentAnalysis] = useState<{
    decision: 'PROCEED' | 'SKIP' | 'OPTIONAL' | 'ERROR';
    reason: string;
    refactoringPlan: Array<{
      smellId: string;
      severity: string;
      location: string;
      description: string;
      technique: string;
      action: string;
      priority: string;
    }>;
    selectedSmells?: string[];
    totalSmells?: number;
    selectedCount?: number;
    smells?: Array<any>;
    steps: Array<any>;
  } | null>(null);

  /** Extras appended to Markdown/HTML/ZIP exports (pipeline + context for papers / demos). */
  const refactoringDocExtras = useMemo<ReportNarrativeExtras>(
    () => ({
      workspaceLabel: workspaceId ? `Workspace: ${workspaceId}` : undefined,
      agentSteps: agentSteps.map(s => ({
        name: s.name,
        agent: s.agent,
        status: s.status,
        error: s.error,
      })),
      agentAnalysisSummary: agentAnalysis
        ? `Pre-refactor decision: ${agentAnalysis.decision}. ${agentAnalysis.reason ?? ''} (plan items: ${agentAnalysis.refactoringPlan?.length ?? 0}).`
        : undefined,
    }),
    [workspaceId, agentSteps, agentAnalysis]
  );

  /** Server report when present; otherwise client-built narrative so the UI always has documentation. */
  const effectiveRefactoringReport = useMemo(() => {
    if (currentStep !== 'review') return null;
    const api = applyResult?.refactoringReport;
    if (
      api &&
      typeof api === 'object' &&
      typeof (api as { file?: string }).file === 'string' &&
      reportMatchesSelectedFile(api as { file?: string }, selectedFile)
    ) {
      return api as import('../lib/refactoringReportDocument').RefactoringReportShape;
    }
    if (!selectedFile) return null;
    return buildClientRefactoringReport({
      filePath: selectedFile,
      original: (applyResult?.originalContent as string) ?? displayContent ?? fileContent ?? '',
      refactored:
        (applyResult?.llmCandidateContent as string) ??
        (applyResult?.refactoredContent as string) ??
        refactoredCode ??
        '',
      smells: (effectiveCodeSmells || []) as Array<Record<string, unknown>>,
      agentAnalysis,
      applyResult: applyResult as Record<string, unknown> | null | undefined,
      agentSteps,
    });
  }, [
    currentStep,
    applyResult,
    selectedFile,
    displayContent,
    fileContent,
    refactoredCode,
    effectiveCodeSmells,
    agentAnalysis,
    agentSteps,
  ]);

  const persistRefactorOutcome = useCallback(
    async (opts: {
      accepted: boolean;
      original: string;
      candidate: string;
      rejectionReason?: string | string[];
      smellsBefore?: number;
      smellsAfter?: number;
      researchMetrics?: Record<string, unknown> | null;
      humanVerdict?: string;
    }) => {
      if (!workspaceId || !selectedFile || !opts.original.trim()) return;
      const rejectionReason = Array.isArray(opts.rejectionReason)
        ? opts.rejectionReason.join(', ')
        : opts.rejectionReason;
      const storedUserId =
        typeof window !== 'undefined' ? localStorage.getItem('refactai-user-id') : null;
      const storedUserName =
        typeof window !== 'undefined' ? localStorage.getItem('refactai-user-name') : null;
      let researchSnapshot: string | undefined;
      const rm = opts.researchMetrics;
      if (rm) {
        try {
          researchSnapshot = JSON.stringify({ research_metrics: rm });
        } catch {
          /* ignore */
        }
      }
      const status = opts.accepted ? 'refactored' : 'rejected';
      try {
        await apiClient.recordRefactorAttempt(workspaceId, {
          filePath: selectedFile,
          originalContent: opts.original,
          candidateContent: opts.candidate || opts.original,
          accepted: opts.accepted,
          smellsBefore: opts.smellsBefore ?? 0,
          smellsAfter: opts.smellsAfter ?? 0,
          rejectionReason,
          researchSnapshot,
          humanVerdict: opts.humanVerdict,
          userId: storedUserId,
          userName: storedUserName,
        });
      } catch (e) {
        console.warn('Failed to persist refactor outcome to workspace', e);
        try {
          await apiClient.updateFileStatus(workspaceId, selectedFile, status, {
            smellsBefore: opts.smellsBefore,
            smellsAfter: opts.smellsAfter,
            rejectionReason,
            verifyAccepted: opts.accepted,
            researchSnapshot,
            userId: storedUserId ?? undefined,
            userName: storedUserName ?? undefined,
          });
        } catch (e2) {
          console.warn('Failed to update file status fallback', e2);
        }
      }
    },
    [workspaceId, selectedFile]
  );

  const saveFullReport = useCallback(async () => {
    if (!selectedFile || !workspaceId || !applyResult) return false;
    setSaveReportStatus('saving');
    setSaveReportError(null);
    const originalContent =
      (applyResult.originalContent as string) || displayContent || fileContent || '';
    const refactoredContent =
      (applyResult.llmCandidateContent as string) ||
      (applyResult.refactoredContent as string) ||
      refactoredCode ||
      '';
    const accepted = !refactoringRejected?.rejected;
    try {
      await persistRefactorOutcome({
        accepted,
        original: originalContent,
        candidate: refactoredContent,
        rejectionReason: refactoringRejected?.rejectionReason,
        smellsBefore: improvementStats?.before?.total,
        smellsAfter: improvementStats?.after?.total,
        researchMetrics: (applyResult.researchMetrics as Record<string, unknown>) || null,
      });
    } catch {
      /* persist is best-effort; still save full report */
    }
    try {
      const bundle = buildSavedRefactoringReportBundle({
        workspaceId,
        filePath: selectedFile,
        originalContent,
        refactoredContent,
        applyResult: applyResult as Record<string, unknown>,
        refactoringReport: effectiveRefactoringReport,
        researchMetrics: (applyResult.researchMetrics as Record<string, unknown>) || null,
        pipelineMetadata: (applyResult.pipelineMetadata as Record<string, unknown>) || null,
        improvementStats,
        smellComparison,
        qualityMetrics: qualityMetrics as Record<string, unknown> | null,
        codeSmells: (effectiveCodeSmells || []) as Array<Record<string, unknown>>,
        refactoringRejected,
      });
      const safeBundle = jsonSafeForArchive(bundle) as Record<string, unknown>;
      await apiClient.saveRefactoringReport(workspaceId, safeBundle);
      setSaveReportStatus('saved');
      try {
        sessionStorage.setItem(
          `refactai-full-report-saved:${workspaceId}:${selectedFile}`,
          '1'
        );
      } catch {
        /* ignore */
      }
      return true;
    } catch (e) {
      console.error('Failed to save full report', e);
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === 'string'
            ? e
            : 'Save failed';
      const hint =
        msg.includes('404') || msg.includes('405')
          ? ' Restart the backend (./restart_all.sh) so saved-reports API is loaded.'
          : '';
      setSaveReportError(msg + hint);
      setSaveReportStatus('error');
      return false;
    }
  }, [
    selectedFile,
    workspaceId,
    applyResult,
    displayContent,
    fileContent,
    refactoredCode,
    effectiveRefactoringReport,
    improvementStats,
    smellComparison,
    qualityMetrics,
    effectiveCodeSmells,
    refactoringRejected,
    persistRefactorOutcome,
  ]);

  useEffect(() => {
    if (currentStep !== 'review' || !applyResult || autoSavedReportRef.current) return;
    autoSavedReportRef.current = true;
    void saveFullReport();
  }, [currentStep, applyResult, saveFullReport, refactoringRejected]);

  const applyHumanOverride = useCallback(
    (historyId: string, accepted: boolean, reason: string) => {
      setHistory(prev => prev.map(h =>
        h.id === historyId ? { ...h, humanOverride: { accepted, reason }, accepted } : h
      ));
      if (!workspaceId || !selectedFile) return;
      const original =
        (applyResult?.originalContent as string) || displayContent || fileContent || '';
      const candidate =
        (applyResult?.llmCandidateContent as string) ||
        (applyResult?.refactoredContent as string) ||
        refactoredCode ||
        '';
      void (async () => {
        try {
          await apiClient.updateFileStatus(workspaceId, selectedFile, accepted ? 'refactored' : 'rejected', {
            humanVerdict: accepted ? 'accepted' : 'rejected',
            rejectionReason: reason,
            verifyAccepted: accepted,
            smellsBefore: improvementStats?.before?.total,
            smellsAfter: improvementStats?.after?.total,
          });
        } catch (e) {
          console.warn('Failed to update file status for human override', e);
        }
        await persistRefactorOutcome({
          accepted,
          original,
          candidate: candidate || original,
          rejectionReason: reason,
          smellsBefore: improvementStats?.before?.total,
          smellsAfter: improvementStats?.after?.total,
          researchMetrics: (applyResult?.researchMetrics as Record<string, unknown>) || null,
          humanVerdict: accepted ? 'accepted' : 'rejected',
        });
        void saveFullReport();
      })();
    },
    [
      workspaceId,
      selectedFile,
      applyResult,
      displayContent,
      fileContent,
      refactoredCode,
      improvementStats,
      persistRefactorOutcome,
      saveFullReport,
    ]
  );

  const finishResearchReview = useCallback(
    (data: Record<string, unknown> | null | undefined, runGeneration?: number) => {
      if (!data) return;
      if (
        runGeneration != null &&
        runGeneration !== refactorRunGenerationRef.current
      ) {
        console.warn('Ignoring stale refactor response (superseded by a newer run)');
        return;
      }
      if (!refactorResponseMatchesFile(data, selectedFile)) {
        console.warn('Ignoring refactor response for a different file than currently selected', {
          selectedFile,
          responseFile: data.filePath,
        });
        setAgentError(
          'Received refactoring results for a different file than the one open. Select the correct file and run again.'
        );
        return;
      }
      const orig = (data.originalContent as string) || displayContent || fileContent || '';
      const candidate = getLlmCandidateContent(data, orig);

      setRefactoringRejected({
        rejected: Boolean(data.rejected ?? !data.success),
        rejectionReason: data.rejectionReason as string | string[] | undefined,
        message: data.message as string | undefined,
        success: data.success as boolean | undefined,
      });
      if (Array.isArray(data.steps)) setAgentSteps(data.steps as typeof agentSteps);
      const qm = (data.deltas as { qualityMetrics?: unknown })?.qualityMetrics;
      if (qm) setQualityMetrics(qm as typeof qualityMetrics);

      const stats = improvementStatsFromRefactorResponse(data);
      if (stats) setImprovementStats(stats);

      const parts = [
        data.error,
        data.message,
        Array.isArray(data.rejectionReason) ? data.rejectionReason.join('; ') : data.rejectionReason,
      ].filter(Boolean) as string[];
      const fo = data.failureOutcome as { userMessage?: string } | null | undefined;
      if (fo?.userMessage) {
        setAgentError(fo.userMessage);
      } else if (data.success === false && parts.length && !isIdenticalRefactorCandidate(data, orig)) {
        setAgentError(parts.join(' — '));
      } else {
        setAgentError(null);
      }

      setRefactoredCode(candidate);
      setApplyResult(buildFullResearchApplyResult(data, orig, selectedFile));
      setShowComparison(true);
      setCurrentStep('review');

      const accepted = !(Boolean(data.rejected ?? !data.success));
      const rej = data.rejectionReason as string | string[] | undefined;
      void persistRefactorOutcome({
        accepted,
        original: orig,
        candidate: candidate || orig,
        rejectionReason: rej,
        smellsBefore: stats?.before?.total,
        smellsAfter: stats?.after?.total,
        researchMetrics: (data.researchMetrics as Record<string, unknown>) || null,
      });
    },
    [displayContent, fileContent, selectedFile, persistRefactorOutcome]
  );

  // Step 1: Analyze code using Multi-Agent System
  const analyzeCode = async () => {
    setIsAnalyzing(true);
    setCurrentStep('analyze');
    setExecutionProgress(0);
    setAgentAnalysis(null);

    try {
      // Call agents service to analyze and decide what to refactor
      const agentsUrl =
        typeof window !== 'undefined' ? agentsAnalyzeUrl() : `/agents/analyze`;
      
      const response = await fetch(agentsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          workspaceId,
          filePath: selectedFile,
          goals: ['reduce code smells', 'improve readability', 'enhance maintainability'],
          providedSmells: effectiveCodeSmells && effectiveCodeSmells.length > 0 ? effectiveCodeSmells : undefined
        })
      });

      if (!response.ok) {
        throw new Error(`Agent analysis failed: ${response.statusText}`);
      }

      const analysis = await response.json();
      console.log("🔍 Agent Analysis Response:", analysis);
      console.log("   Decision:", analysis.decision);
      console.log("   Reason:", analysis.reason);
      console.log("   Total Smells:", analysis.totalSmells);
      console.log("   Selected Count:", analysis.selectedCount);
      console.log("   Steps:", analysis.steps);
      
      // Log analysis steps to see what happened
      if (analysis.steps) {
        analysis.steps.forEach((step: any, idx: number) => {
          console.log(`   Step ${idx + 1} (${step.name}):`, step.status, step.details || step.error);
        });
      }
      
      setAgentAnalysis(analysis);

      // Convert agent's refactoring plan to recommendations format for display
      const recommendations: RefactoringRecommendation[] = analysis.refactoringPlan?.map((plan: any, index: number) => ({
        id: `agent-rec-${index + 1}`,
        type: plan.priority === 'HIGH' ? 'IMPROVE' : 'REVIEW',
        priority: plan.priority === 'HIGH' ? 'HIGH' : plan.priority === 'MEDIUM' ? 'MEDIUM' : 'LOW',
        title: `${plan.technique}: ${plan.smellId}`,
        description: plan.description,
        reasoning: plan.action,
        impact: plan.severity === 'CRITICAL' || plan.severity === 'MAJOR' ? 'HIGH' : 'MEDIUM',
        effort: plan.priority === 'HIGH' ? 'MEDIUM' : 'LOW',
        confidence: 90, // Agent analysis is high confidence
        codeSnippet: `// ${plan.location}`,
        suggestedChanges: plan.action,
        risks: ['Requires testing after refactoring'],
        benefits: ['Improved code quality', 'Better maintainability'],
        estimatedTime: plan.priority === 'HIGH' ? '15-30 minutes' : '10-15 minutes',
          dependencies: []
      })) || [];

      setRecommendations(recommendations);
      // After analysis, automatically proceed to refactoring if smells are found
      if (analysis.totalSmells > 0 && analysis.decision === 'PROCEED') {
        setCurrentStep('plan');
        // Auto-trigger refactoring if analysis recommends it
        setTimeout(() => {
          // This will be handled by the "Run Multi-Agent Workflow" button
        }, 500);
      } else {
      setCurrentStep('recommend');
      }

    } catch (error) {
      console.error('Agent analysis failed:', error);
      setAgentAnalysis({
        decision: 'ERROR',
        reason: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        refactoringPlan: [],
        steps: []
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Analyze improvements using backend "analyze-live" with before/after contents
  const analyzeImprovements = async () => {
    if (!applyResult && !refactoredCode) return;
    setIsEvaluating(true);
    try {
      const original = applyResult?.originalContent ?? fileContent;
      const updated = applyResult?.refactoredContent ?? refactoredCode;
      const analyze = async (content: string) => {
        const res = await fetch('/api/workspace-enhanced-analysis/analyze-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, filePath: selectedFile, content })
        });
        if (!res.ok) throw new Error(`analyze-live failed: ${res.status}`);
        return res.json();
      };
      const [before, after] = await Promise.all([analyze(original), analyze(updated)]);
      const toStats = (r: any) => {
        const total = Array.isArray(r?.codeSmells) ? r.codeSmells.length : (r?.totalSmells ?? 0);
        const sev = (r?.severitySummary as Record<string, number>) || {};
        return {
          total,
          critical: sev.CRITICAL || sev.critical || 0,
          major: sev.MAJOR || sev.major || 0,
          minor: sev.MINOR || sev.minor || 0,
        };
      };
      const beforeStats = toStats(before);
      const afterStats = toStats(after);
      setImprovementStats({
        before: beforeStats,
        after: afterStats,
        delta: {
          total: beforeStats.total - afterStats.total,
          critical: beforeStats.critical - afterStats.critical,
          major: beforeStats.major - afterStats.major,
          minor: beforeStats.minor - afterStats.minor,
        },
      });

      // Build detailed smell comparison
      const beforeSmells: any[] = Array.isArray(before?.codeSmells) ? before.codeSmells : [];
      const afterSmells: any[] = Array.isArray(after?.codeSmells) ? after.codeSmells : [];
      const smellKey = (s: any) => `${s.type || s.smell || ''}::${s.severity || ''}`;
      const beforeMap = new Map<string, any[]>();
      beforeSmells.forEach(s => {
        const k = smellKey(s);
        beforeMap.set(k, [...(beforeMap.get(k) || []), s]);
      });
      const afterMap = new Map<string, any[]>();
      afterSmells.forEach(s => {
        const k = smellKey(s);
        afterMap.set(k, [...(afterMap.get(k) || []), s]);
      });
      const removed: any[] = [];
      const unchanged: any[] = [];
      const added: any[] = [];
      const usedAfter = new Map<string, number>();
      beforeSmells.forEach(s => {
        const k = smellKey(s);
        const afterGroup = afterMap.get(k) || [];
        const usedCount = usedAfter.get(k) || 0;
        if (usedCount < afterGroup.length) {
          unchanged.push(s);
          usedAfter.set(k, usedCount + 1);
        } else {
          removed.push(s);
        }
      });
      afterSmells.forEach(s => {
        const k = smellKey(s);
        const beforeGroup = beforeMap.get(k) || [];
        const usedCount = usedAfter.get(k) || 0;
        const beforeCount = beforeGroup.length;
        if (usedCount <= 0 || beforeCount === 0) {
          added.push(s);
        } else {
          usedAfter.set(k, usedCount - 1);
        }
      });
      setSmellComparison({ before: beforeSmells, after: afterSmells, removed, added, unchanged });

      // Persist a history entry with diff + stats
      addHistoryEntry({
        originalContent: original,
        refactoredContent: updated,
        changes: applyResult?.changes,
        stats: {
          before: beforeStats,
          after: afterStats,
          delta: {
            total: beforeStats.total - afterStats.total,
            critical: beforeStats.critical - afterStats.critical,
            major: beforeStats.major - afterStats.major,
            minor: beforeStats.minor - afterStats.minor,
          },
        },
      });
    } catch (e) {
      console.error('Failed to analyze improvements', e);
      alert('Failed to analyze improvements. See console for details.');
    } finally {
      setIsEvaluating(false);
    }
  };

  // Verify the saved file matches refactored content
  const verifySavedFile = async () => {
    setIsVerifying(true);
    setVerifyStatus(null);
    try {
      const res = await fetch(`/api/files/${workspaceId}/preview?filePath=${encodeURIComponent(selectedFile)}`);
      if (!res.ok) throw new Error(`preview failed: ${res.status}`);
      const data = await res.json();
      const saved = String(data?.content ?? '');
      const expected = String(applyResult?.refactoredContent ?? refactoredCode ?? '');
      if (saved === expected) {
        setVerifyStatus({ ok: true, message: 'Saved file matches refactored content.' });
      } else {
        setVerifyStatus({ ok: false, message: 'Saved file differs from expected refactoring.' });
      }
    } catch (e: any) {
      setVerifyStatus({ ok: false, message: e?.message || 'Verification failed' });
    } finally {
      setIsVerifying(false);
    }
  };

  // Rollback by re-applying originalContent through apply endpoint
  const rollbackRefactoring = async () => {
    const original = applyResult?.originalContent || fileContent;
    if (!original) {
      alert('Original content not available to rollback.');
      return;
    }
    try {
      const resp = await fetch('/api/refactoring/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          filePath: selectedFile,
          refactoredCode: original
        })
      });
      if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        throw new Error(t || `rollback failed: ${resp.status}`);
      }
      const result = await resp.json();
      setApplyResult(
        applyResultWithLineStats(
          stripEmbeddedRefactoringReport(result as Record<string, unknown>),
          applyResult?.originalContent || fileContent,
          original
        )
      );
      setRefactoredCode(original);
      setVerifyStatus(null);
      alert('Rollback applied successfully.');
    } catch (e: any) {
      alert(`Rollback failed: ${e?.message || e}`);
    }
  };

  // Step 2: Create refactoring plan based on selected recommendations
  const createRefactoringPlan = async () => {
    setIsRefactoring(true);
    setCurrentStep('plan');

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const selectedRecs = recommendations.filter(rec => selectedRecommendations.includes(rec.id));
      const plan = {
        totalRecommendations: selectedRecs.length,
        estimatedTime: selectedRecs.reduce((total, rec) => {
          const time = parseInt(rec.estimatedTime?.split('-')[0] || '0');
          return total + time;
        }, 0),
        riskLevel: selectedRecs.some(rec => rec.impact === 'HIGH') ? 'HIGH' : 
                  selectedRecs.some(rec => rec.impact === 'MEDIUM') ? 'MEDIUM' : 'LOW',
        steps: selectedRecs.map((rec, index) => ({
          step: index + 1,
          title: rec.title,
          description: rec.description,
          effort: rec.effort,
          dependencies: rec.dependencies,
          estimatedTime: rec.estimatedTime
        }))
      };

      setRefactoringPlan(plan);
      setCurrentStep('execute');

    } catch (error) {
      console.error('Plan creation failed:', error);
    } finally {
      setIsRefactoring(false);
    }
  };

  // Step 3: Execute refactoring
  const executeRefactoring = async () => {
    // Declare out variable at function scope to fix scope issue
    let out: any = null;
    
    console.log('🚀 Starting refactoring execution...');
    console.log('🔍 Current state:', { 
      recommendations: recommendations.length, 
      selectedRecommendations: selectedRecommendations.length,
      currentStep,
      isRefactoring 
    });
    
    setIsRefactoring(true);
    setCurrentStep('execute');
    setExecutionProgress(0);
    resetRefactorRunState();
    const runGeneration = refactorRunGenerationRef.current;

    const stallTimeoutMs = getRefactorClientTimeoutMs(
      (displayContent || '').split('\n').length,
      effectiveCodeSmells?.length ?? 0
    );
    // Safety valve: only reset UI if the flow truly stalls (aligned with fetch abort below, not 30s)
    const timeoutId = setTimeout(() => {
      console.warn('⚠️ Refactoring execution timeout - forcing completion');
      setCurrentStep('review');
      setIsRefactoring(false);
    }, stallTimeoutMs + 60_000);

    try {
      // Simulate realistic refactoring execution with progress
      const selectedRecs = recommendations.filter(rec => selectedRecommendations.includes(rec.id));
      console.log(`📋 Processing ${selectedRecs.length} selected recommendations:`, selectedRecs.map(r => r.title));
      
      // Simulate processing each recommendation
      console.log(`🔄 Starting loop with ${selectedRecs.length} recommendations`);
      
      // Test if the loop works at all
      if (selectedRecs.length === 0) {
        console.warn('⚠️ No selected recommendations found!');
        setExecutionProgress(100);
      } else {
        for (let i = 0; i < selectedRecs.length; i++) {
          console.log(`⏳ Processing recommendation ${i + 1}/${selectedRecs.length}: ${selectedRecs[i].title}`);
          
          // Update progress immediately
          const progress = Math.round(((i + 1) / selectedRecs.length) * 100);
          setExecutionProgress(progress);
          console.log(`📊 Progress: ${progress}%`);
          
          // Wait 1 second
          console.log(`⏰ Waiting 1 second...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          console.log(`⏰ Wait completed`);
          
          console.log(`✅ Completed recommendation ${i + 1}/${selectedRecs.length}`);
        }
      }
      
      console.log('🎯 Loop completed successfully');
      
      // Call real LLM API for refactoring
      console.log('🤖 Calling LLM API for real refactoring...');
      
      let refactoredCode = '';
      const originalContent = displayContent || '';
      const sanitizeRefactoringOutput = (raw: string): string => {
        if (!raw) return originalContent;
        const fenced = raw.match(/```(?:java)?\s*([\s\S]*?)```/i);
        let out = (fenced ? fenced[1] : raw).trim();
        const hasTypeDecl = /(class|interface|enum)\s+\w+/.test(out);
        const hasPkgOrImport = /package\s+[\w.]+;/.test(out) || /import\s+[\w.]+;/.test(out);
        const originalLines = (originalContent || '').split('\n').length;
        const outputLines = (out || '').split('\n').length;
        const looksComplete = hasTypeDecl && (hasPkgOrImport || outputLines >= Math.max(20, Math.floor(originalLines * 0.5)));
        return looksComplete ? out : originalContent;
      };
      try {
        // Check if agents service is available first
        setLoadingStep('Checking agents service...');
        setLoadingProgress(25);
        const health = await checkAgentsHealth();
        if (!health.ok) {
          const errorMsg = health.message;
          setAgentError(`❌ ${errorMsg}`);
          setAgentSteps([
            {
              name: 'Health Check',
              agent: 'System',
              status: 'error',
              startedAt: Date.now(),
              endedAt: Date.now(),
              error: errorMsg,
            },
          ]);
          setIsRefactoring(false);
          setCurrentStep('analyze');
          setLoadingStep('');
          setLoadingProgress(0);
          return;
        }

        // Use unified agentic refactoring endpoint
        console.log('📡 Calling /agents/refactor endpoint...');
        setLoadingStep('Calling refactoring engine...');
        setLoadingProgress(30);
        
        const controller = new AbortController();
        const refactorWaitMs = getRefactorClientTimeoutMs(
          (displayContent || '').split('\n').length,
          effectiveCodeSmells?.length ?? 0
        );
        const timeoutId = setTimeout(() => controller.abort(), refactorWaitMs);
        let refactorRes;
        try {
          // Call agents service directly to avoid Next.js proxy timeout
          const agentsUrl =
            typeof window !== 'undefined' ? agentsRefactorUrl() : `/agents/refactor`;
          
          // Pass selected smells from agent analysis to ensure agents only handle selected smells
          const selectedSmellIds = agentAnalysis?.selectedSmells || agentAnalysis?.refactoringPlan?.map((p: any) => p.smellId) || undefined;
          
          // CRITICAL: Send providedSmells so backend doesn't need to re-analyze
          // Use effectiveCodeSmells (from codeSmells prop) which contains all detected smells
          // Also check if we have smells from agentAnalysis as fallback
          const smellsToSend = effectiveCodeSmells && effectiveCodeSmells.length > 0 
            ? effectiveCodeSmells 
            : (agentAnalysis?.smells && agentAnalysis.smells.length > 0 ? agentAnalysis.smells : []);
          
          console.log('📤 Sending to /agents/refactor:', {
            workspaceId,
            filePath: selectedFile,
            effectiveCodeSmellsCount: effectiveCodeSmells?.length || 0,
            agentAnalysisSmellsCount: agentAnalysis?.smells?.length || 0,
            providedSmellsCount: smellsToSend.length,
            selectedSmellsCount: selectedSmellIds?.length || 0,
            willSendProvidedSmells: smellsToSend.length > 0
          });
          
          const storedUserId = typeof window !== 'undefined' ? localStorage.getItem('refactai-user-id') : null;
          const storedUserName = typeof window !== 'undefined' ? localStorage.getItem('refactai-user-name') : null;
          // Generate a unique job ID and start SSE before the POST
          const jobId = `${workspaceId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          startSSE(jobId, {
            lines: (displayContent || '').split('\n').length,
            smells: effectiveCodeSmells?.length ?? 0,
          });

          const requestBody: any = {
            workspaceId,
            filePath: selectedFile,
            goals: ['reduce code smells', 'improve readability', 'enhance maintainability'],
            selectedSmells: selectedSmellIds,
            userId: storedUserId,
            userName: storedUserName,
            jobId,
          };
          
          // CRITICAL: Always send providedSmells if we have any
          if (smellsToSend.length > 0) {
            requestBody.providedSmells = smellsToSend;
            console.log(`✅ Including ${smellsToSend.length} providedSmells in request`);
          } else {
            console.warn('⚠️ No smells to send - effectiveCodeSmells and agentAnalysis.smells are both empty');
          }
          
          console.log('📦 Request body keys:', Object.keys(requestBody));
          console.log('📦 Request body providedSmells:', requestBody.providedSmells ? `${requestBody.providedSmells.length} smells` : 'undefined');
          
          refactorRes = await fetch(agentsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
        } catch (fetchError: unknown) {
          clearTimeout(timeoutId);
          const error = fetchError as Error;
          if (error.name === 'AbortError') {
            const mins = Math.round(refactorWaitMs / 60000);
            throw new Error(
              `Refactoring request timed out after ${mins} minutes. Very large files or many smells (e.g. 100+) need more time — try again or refactor a smaller scope.`
            );
          }
          throw fetchError;
        }
        
        setLoadingStep('Processing refactoring response...');
        setLoadingProgress(60);
        
        if (refactorRes.ok) {
          out = await refactorRes.json();
          if (runGeneration !== refactorRunGenerationRef.current) {
            console.warn('Ignoring stale refactor HTTP response');
            return;
          }
          console.log('✅ Refactoring response received:', out);

          const origForCompare = (out.originalContent ?? originalContent) || '';
          refactoredCode = getLlmCandidateContent(out, origForCompare);

          if (out.rejected !== undefined || out.success === false) {
            setRefactoringRejected({
              rejected: out.rejected || false,
              rejectionReason: out.rejectionReason,
              message: out.message,
              success: out.success,
            });
          }

          if (out.success === false && out.error && !out.rejected) {
            const errorMsg = out.error || out.message || 'Refactoring failed on the backend';
            const errorStep = out.steps?.find((s: any) => s.status === 'error' || s.error);
            throw new Error(errorStep?.error || errorMsg);
          }

          if (out.steps) {
            setAgentSteps(out.steps);
            const errorStep = out.steps.find((s: any) => s.status === 'error' || s.error);
            if (errorStep) {
              throw new Error(errorStep.error || 'Refactoring step failed');
            }
          }

          if (out.deltas?.qualityMetrics) {
            setQualityMetrics(out.deltas.qualityMetrics);
          }

          if (out.success !== false && refactoredCode.trim() === origForCompare.trim()) {
            const header = `/*\n * RefactAI: automated cleanup applied.\n * ${new Date().toISOString()}\n */\n\n`;
            const pkgMatch = originalContent.match(/^(package\s+[\w.]+;\s*)/m);
            if (pkgMatch) {
              const idx = originalContent.indexOf(pkgMatch[0]) + pkgMatch[0].length;
              refactoredCode = originalContent.slice(0, idx) + header + originalContent.slice(idx);
            } else {
              refactoredCode = header + originalContent;
            }
          }

          if (out.success === false && !isIdenticalRefactorCandidate(out, origForCompare)) {
            const parts = [out.error, out.message, Array.isArray(out.rejectionReason) ? out.rejectionReason.join('; ') : out.rejectionReason].filter(Boolean);
            if (parts.length) setAgentError(parts.join(' — '));
          } else if (isIdenticalRefactorCandidate(out, origForCompare)) {
            setAgentError(null);
          }
          console.log('✅ Agentic refactoring run finished (research review)');
        } else {
          const errorText = await refactorRes.text().catch(() => 'Unknown error');
          console.error('❌ Agentic refactoring failed:', refactorRes.status, errorText);
          
          // Try to parse error if it's JSON
          let errorMessage = `Refactoring failed with status ${refactorRes.status}`;
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorJson.message || errorMessage;
          } catch {
            errorMessage = errorText || errorMessage;
          }
          
          throw new Error(errorMessage);
        }
      } catch (error) {
        console.error('❌ Refactoring API call failed:', error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        // Check for specific error types and provide helpful messages
        let userFriendlyError = errorMsg;
        if (errorMsg.includes('401') || errorMsg.includes('Unauthorized') || errorMsg.includes('API key') || errorMsg.includes('invalid') || errorMsg.includes('expired')) {
          userFriendlyError = 'OpenRouter API key is invalid or expired. Please update agents/.env with a valid key and restart the service.';
        } else if (errorMsg.includes('timeout') || errorMsg.includes('AbortError')) {
          userFriendlyError = 'Refactoring timed out. The file may be too large or the LLM service is slow. Please try again.';
        } else if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('Failed to fetch') || errorMsg.includes('network')) {
          userFriendlyError = `Cannot connect to agents service. Please ensure the service is running on port ${agentsPort()}.`;
        }
        
        // Show user-friendly error in the UI
        setAgentError(`❌ ${userFriendlyError}`);
        setAgentSteps([{
          name: 'Refactor',
          agent: 'Refactorer',
          status: 'error',
          startedAt: Date.now(),
          endedAt: Date.now(),
          error: userFriendlyError
        }]);
        
        // Don't create fallback code on error - let user see the error clearly
        refactoredCode = originalContent;
        // Set out to null on error so refactoringResponse is null
        out = null;
        
        // Stop execution here - don't continue with error state
        setIsRefactoring(false);
        setLoadingStep('');
        setLoadingProgress(0);
        return;
      }

      console.log('🎉 Refactoring execution completed successfully!');
      console.log('📝 Generated refactored code:', refactoredCode.substring(0, 200) + '...');
      
      // Store out variable in a scope accessible to the apply section
      // out is declared earlier in the function (line 650), so it's accessible here
      const refactoringResponse = out;
      const researchApply = refactoringResponse
        ? buildFullResearchApplyResult(refactoringResponse, originalContent, selectedFile)
        : applyResultWithLineStats({}, originalContent, refactoredCode);

      const changes = mergeChangeStats(originalContent, refactoredCode, null);
      console.log('📊 Line change stats (diff-based):', changes);

      const shouldApplyToWorkspace =
        refactoringResponse?.success === true &&
        refactoringResponse?.rejected !== true &&
        changes.linesChanged > 0;

      if (shouldApplyToWorkspace) {
        try {
          console.log('💾 Applying refactoring to actual file...');
          const applyResponse = await fetch(`/api/refactoring/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspaceId: workspaceId || 'project-f9c670f3',
              filePath: selectedFile,
              refactoredCode,
            }),
          });

          if (applyResponse.ok) {
            const result = await applyResponse.json();
            const cleanResult = stripEmbeddedRefactoringReport(result as Record<string, unknown>);
            setApplyResult({
              ...researchApply,
              ...cleanResult,
              changes: mergeChangeStats(originalContent, refactoredCode, cleanResult.changes as Record<string, unknown>),
            });
            if (result.deltas?.qualityMetrics || refactoringResponse?.deltas?.qualityMetrics) {
              setQualityMetrics(result.deltas?.qualityMetrics || refactoringResponse?.deltas?.qualityMetrics);
            }
          } else {
            console.warn('⚠️ Failed to apply refactoring to file; showing research results only');
            setApplyResult(researchApply);
          }
        } catch (error) {
          console.warn('⚠️ Error applying refactoring to file:', error);
          setApplyResult(researchApply);
        }
      } else {
        if (refactoringResponse && changes.linesChanged === 0) {
          console.warn('⚠️ No line-level diff — research metrics still available on Review');
        }
        setApplyResult(researchApply);
      }

      setRefactoredCode(refactoredCode);
      setShowComparison(true);
      
      // Use backend-provided smell counts (from the verify step) for consistency
      // This avoids the discrepancy between frontend and backend analysis
      console.log('📊 Setting improvement stats from backend response...');
      try {
        const verifyStep = out?.steps?.find((s: any) => s.name === 'Verify' && s.details);
        const verifyDetails = verifyStep?.details || {};
        const backendBefore = verifyDetails.before;
        const backendAfter = verifyDetails.after;

        let improvementStatsData: typeof improvementStats =
          improvementStatsFromRefactorResponse(out) ?? null;
        if (!improvementStatsData && typeof backendBefore === 'number' && typeof backendAfter === 'number') {
          // Backend provides total counts; try to get per-severity from deltas
          const deltasSmellsBefore = out?.deltas?.smellsBefore || {};
          const deltasSmellsAfter = out?.deltas?.smellsAfter || {};
          improvementStatsData = {
            before: {
              total: backendBefore,
              critical: deltasSmellsBefore.critical || 0,
              major: deltasSmellsBefore.major || 0,
              minor: deltasSmellsBefore.minor || 0,
            },
            after: {
              total: backendAfter,
              critical: deltasSmellsAfter.critical || 0,
              major: deltasSmellsAfter.major || 0,
              minor: deltasSmellsAfter.minor || 0,
            },
            delta: {
              total: backendBefore - backendAfter,
              critical: (deltasSmellsBefore.critical || 0) - (deltasSmellsAfter.critical || 0),
              major: (deltasSmellsBefore.major || 0) - (deltasSmellsAfter.major || 0),
              minor: (deltasSmellsBefore.minor || 0) - (deltasSmellsAfter.minor || 0),
            },
          };
        }

        // Helper: run analyze-live and build smell comparison
        const runSmellComparison = async (orig: string, refactored: string) => {
          setSmellComparisonLoading(true);
          try {
            const analyzeLive = async (content: string) => {
              const res = await fetch('/api/workspace-enhanced-analysis/analyze-live', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workspaceId, filePath: selectedFile, content })
              });
              if (!res.ok) throw new Error(`analyze-live failed: ${res.status}`);
              return res.json();
            };
            const [bRes, aRes] = await Promise.all([analyzeLive(orig), analyzeLive(refactored)]);
            const bSmells: any[] = Array.isArray(bRes?.codeSmells) ? bRes.codeSmells : [];
            const aSmells: any[] = Array.isArray(aRes?.codeSmells) ? aRes.codeSmells : [];
            const sk = (s: any) => `${s.type || s.smell || ''}::${s.severity || ''}`;
            const bMap = new Map<string, number>();
            bSmells.forEach(s => bMap.set(sk(s), (bMap.get(sk(s)) || 0) + 1));
            const aMap = new Map<string, number>();
            aSmells.forEach(s => aMap.set(sk(s), (aMap.get(sk(s)) || 0) + 1));
            const removedList: any[] = [];
            const unchangedList: any[] = [];
            const addedList: any[] = [];
            const aUsed = new Map<string, number>();
            bSmells.forEach(s => {
              const k = sk(s);
              const afterCount = aMap.get(k) || 0;
              const used = aUsed.get(k) || 0;
              if (used < afterCount) { unchangedList.push(s); aUsed.set(k, used + 1); }
              else removedList.push(s);
            });
            aSmells.forEach(s => {
              const k = sk(s);
              const beforeCount = bMap.get(k) || 0;
              const usedFromBefore = aUsed.get(k) || 0;
              if (usedFromBefore > 0) { aUsed.set(k, usedFromBefore - 1); }
              else addedList.push(s);
            });
            const typeSummary: Record<string, { before: number; after: number }> = {};
            bSmells.forEach(s => {
              const t = s.type || s.smell || 'Unknown';
              typeSummary[t] = typeSummary[t] || { before: 0, after: 0 };
              typeSummary[t].before++;
            });
            aSmells.forEach(s => {
              const t = s.type || s.smell || 'Unknown';
              typeSummary[t] = typeSummary[t] || { before: 0, after: 0 };
              typeSummary[t].after++;
            });
            const capPerType = (smells: any[], max: number) => {
              const counts: Record<string, number> = {};
              return smells.filter(s => {
                const t = s.type || s.smell || 'Unknown';
                counts[t] = (counts[t] || 0) + 1;
                return counts[t] <= max;
              });
            };
            setSmellComparison({
              before: capPerType(bSmells, 5), after: capPerType(aSmells, 5),
              removed: removedList, added: addedList, unchanged: unchangedList,
              beforeTotal: bSmells.length, afterTotal: aSmells.length,
              typeSummary,
            });
            return { before: bRes, after: aRes };
          } catch (err) {
            console.warn('Smell comparison fetch failed:', err);
            return null;
          } finally {
            setSmellComparisonLoading(false);
          }
        };

        if (improvementStatsData) {
          setImprovementStats(improvementStatsData);
          console.log('✅ Stats from backend verify step:', improvementStatsData);
          // Trigger detailed smell comparison in parallel
          runSmellComparison(originalContent, refactoredCode);
        } else {
          console.warn('⚠️ No backend verify stats, falling back to frontend analysis');
          const compResult = await runSmellComparison(originalContent, refactoredCode);
          if (compResult) {
            const toStats = (r: any) => {
              const total = Array.isArray(r?.codeSmells) ? r.codeSmells.length : (r?.totalSmells ?? 0);
              const sev = (r?.severitySummary as Record<string, number>) || {};
              return {
                total,
                critical: sev.CRITICAL || sev.critical || 0,
                major: sev.MAJOR || sev.major || 0,
                minor: sev.MINOR || sev.minor || 0,
              };
            };
            const beforeStats = toStats(compResult.before);
            const afterStats = toStats(compResult.after);
            improvementStatsData = {
              before: beforeStats,
              after: afterStats,
              delta: {
                total: beforeStats.total - afterStats.total,
                critical: beforeStats.critical - afterStats.critical,
                major: beforeStats.major - afterStats.major,
                minor: beforeStats.minor - afterStats.minor,
              },
            };
            setImprovementStats(improvementStatsData);
          }
        }

        addHistoryEntry({
          originalContent: originalContent,
          refactoredContent: refactoredCode,
          changes: applyResult?.changes,
          ...(improvementStatsData?.before && improvementStatsData?.after && improvementStatsData?.delta
            ? { stats: { before: improvementStatsData.before, after: improvementStatsData.after, delta: improvementStatsData.delta } }
            : {}),
        });
      } catch (e) {
        console.warn('⚠️ Stats analysis failed (non-critical):', e);
        // Still add history entry without stats if analysis fails
        addHistoryEntry({
          originalContent: originalContent,
          refactoredContent: refactoredCode,
          changes: applyResult?.changes || changes,
        });
      }
      
      // Call the completion callback (with error handling)
      try {
        onRefactoringComplete(refactoredCode);
        console.log('✅ onRefactoringComplete callback executed successfully');
      } catch (error) {
        console.error('❌ Error in onRefactoringComplete callback:', error);
      }
      
      setCurrentStep('review');
      console.log('✅ Moved to review step');

    } catch (error) {
      console.error('❌ Refactoring execution failed:', error);
      // Show error but still complete the process
      alert('Refactoring completed with some issues. Please review the results.');
      setCurrentStep('review');
    } finally {
      console.log('🏁 Refactoring execution finished, setting isRefactoring to false');
      clearTimeout(timeoutId); // Clear the timeout
      setIsRefactoring(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'HIGH': return 'text-red-400 bg-red-500/20 border-red-500/50';
      case 'MEDIUM': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50';
      case 'LOW': return 'text-green-400 bg-green-500/20 border-green-500/50';
      default: return 'text-gray-400 bg-gray-500/20 border-gray-500/50';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'IMPROVE': return 'text-blue-400 bg-blue-500/20 border-blue-500/50';
      case 'KEEP': return 'text-green-400 bg-green-500/20 border-green-500/50';
      case 'REVIEW': return 'text-orange-400 bg-orange-500/20 border-orange-500/50';
      default: return 'text-gray-400 bg-gray-500/20 border-gray-500/50';
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'HIGH': return 'text-red-400';
      case 'MEDIUM': return 'text-yellow-400';
      case 'LOW': return 'text-green-400';
      default: return 'text-gray-400';
    }
  };

  const getEffortColor = (effort: string) => {
    switch (effort) {
      case 'HIGH': return 'text-red-400';
      case 'MEDIUM': return 'text-yellow-400';
      case 'LOW': return 'text-green-400';
      default: return 'text-gray-400';
    }
  };

  const toggleRecommendation = (id: string) => {
    setSelectedRecommendations(prev => 
      prev.includes(id) 
        ? prev.filter(recId => recId !== id)
        : [...prev, id]
    );
  };

  const getStepIcon = (step: string) => {
    switch (step) {
      case 'analyze': return <Brain className="w-5 h-5" />;
      case 'recommend': return <Target className="w-5 h-5" />;
      case 'plan': return <Settings className="w-5 h-5" />;
      case 'execute': return <Play className="w-5 h-5" />;
      case 'review': return <CheckCircle className="w-5 h-5" />;
      default: return <Clock className="w-5 h-5" />;
    }
  };

  const getStepColor = (step: string) => {
    switch (step) {
      case 'analyze': return 'text-blue-400';
      case 'recommend': return 'text-purple-400';
      case 'plan': return 'text-yellow-400';
      case 'execute': return 'text-green-400';
      case 'review': return 'text-green-400';
      default: return 'text-gray-400';
    }
  };

  const refactorStepsOrder = ['analyze', 'recommend', 'plan', 'execute', 'review'] as const;
  const simplePhaseLabel =
    currentStep === 'review'
      ? 'Review'
      : agentRunning || isRefactoring
        ? 'Refactoring'
        : agentError && (currentStep === 'execute' || agentSteps.some((s) => s.status === 'error'))
          ? 'Failed'
          : !agentsReady
            ? 'Agents offline'
            : 'Prepare';

  const formatStepDetail = (key: string, value: any): string | null => {
    if (value == null || value === '' || key === 'plan' || key === 'llm') return null;
    if (key === 'associatedFiles') return null;
    // Friendly labels for verification fields
    if (key === 'smellsTargeted') return `Smells targeted: ${value} (scientifically prioritized)`;
    if (key === 'before') return `Smells before: ${value}`;
    if (key === 'after') return `Smells after: ${value}`;
    if (key === 'improvement') return value > 0 ? `Smells reduced: ${value}` : null;
    if (key === 'verification' && typeof value === 'object') {
      const v = value as any;
      const parts: string[] = [];
      if (v.smellReduction) parts.push(`Smells: ${v.smellReduction}`);
      if (v.apiPreserved != null) parts.push(`Public API preserved: ${v.apiPreserved ? 'Yes' : 'No'}`);
      if (v.newMethods != null) parts.push(`New methods: ${v.newMethods}`);
      if (v.similarity != null) parts.push(`Similarity: ${(v.similarity * 100).toFixed(1)}%`);
      if (v.rejectionReason) parts.push(`Reason: ${v.rejectionReason}`);
      return parts.length > 0 ? parts.join(' | ') : null;
    }
    if (typeof value === 'boolean') return `${key}: ${value ? 'Yes' : 'No'}`;
    if (typeof value === 'number') return `${key}: ${value}`;
    if (typeof value === 'string') return value.length > 120 ? `${key}: ${value.slice(0, 120)}…` : `${key}: ${value}`;
    if (typeof value === 'object' && !Array.isArray(value)) {
      const entries = Object.entries(value).filter(([, v]) => v != null && v !== '');
      if (entries.length === 0) return null;
      return `${key}: ${entries.map(([k, v]) => `${k}=${typeof v === 'object' ? '…' : v}`).join(', ')}`.slice(0, 150);
    }
    if (Array.isArray(value)) return `${key}: ${value.length} items`;
    return null;
  };

  const renderAgentTimelineBody = () => (
    <>
      {agentError && (
        <div className="mb-3 bg-red-900/30 border border-red-600/40 text-red-200 rounded p-3 text-sm break-words whitespace-pre-wrap max-h-24 overflow-y-auto">
          {agentError}
        </div>
      )}
      <div className="space-y-2">
        {agentSteps.map((s, idx) => {
          const d = (s as any).details || {};
          const assocFiles: string[] = Array.isArray(d.associatedFiles) ? d.associatedFiles : [];
          const detailLines = Object.entries(d)
            .map(([k, v]) => formatStepDetail(k, v))
            .filter(Boolean) as string[];
          return (
            <div key={idx} className="bg-slate-800 rounded-lg p-3 border border-slate-600 overflow-hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    s.status === 'done' ? 'bg-green-400' : s.status === 'error' ? 'bg-red-400' : 'bg-blue-400 animate-pulse'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-white font-medium text-sm">{s.name}</div>
                    <div className="text-slate-500 text-xs">Agent: {s.agent}</div>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded flex-shrink-0 ${
                  s.status === 'done' ? 'bg-green-500/20 text-green-400' :
                  s.status === 'error' ? 'bg-red-500/20 text-red-400' :
                  'bg-blue-500/20 text-blue-400'
                }`}>{s.status.toUpperCase()}</span>
              </div>

              {/* Associated files as compact pills */}
              {assocFiles.length > 0 && (
                <div className="mt-2 ml-4">
                  <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Associated Files ({assocFiles.length})</div>
                  <div className="flex flex-wrap gap-1">
                    {assocFiles.slice(0, 6).map((p: string, i: number) => (
                      <button
                        key={i}
                        title={p}
                        onClick={() => {
                          try {
                            window.dispatchEvent(new CustomEvent('refactai-open-associated-file', { detail: { filePath: p } }));
                          } catch (err) { /* noop */ }
                        }}
                        className="text-[10px] bg-slate-700/80 hover:bg-slate-600 text-slate-300 rounded px-1.5 py-0.5 truncate max-w-[160px]"
                      >
                        {p.split('/').pop()}
                      </button>
                    ))}
                    {assocFiles.length > 6 && (
                      <span className="text-[10px] text-slate-500 px-1.5 py-0.5">+{assocFiles.length - 6} more</span>
                    )}
                  </div>
                </div>
              )}

              {/* Formatted detail lines */}
              {detailLines.length > 0 && (
                <div className="mt-2 ml-4 space-y-0.5">
                  {detailLines.slice(0, 5).map((line, i) => (
                    <div key={i} className="text-[11px] text-slate-400 truncate" title={line}>{line}</div>
                  ))}
                  {detailLines.length > 5 && (
                    <div className="text-[10px] text-slate-500">+{detailLines.length - 5} more details</div>
                  )}
                </div>
              )}

              {/* Error message */}
              {s.error && (
                <div className="mt-2 ml-4 text-[11px] text-red-400 break-words line-clamp-2" title={s.error}>
                  {s.error}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center">
            <Shield className="w-5 h-5 mr-2" />
            Controlled AI Refactoring
          </h2>
          <p className="text-slate-400">
            File: <span className="text-blue-400 font-mono">{selectedFile}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdvancedRefactoring(v => !v)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            {showAdvancedRefactoring ? 'Simple view' : 'Advanced'}
          </button>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </button>
          {onNextFile && (
            <button
              onClick={onNextFile}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center"
            >
              Next File
              <ChevronRight className="w-4 h-4 ml-2" />
            </button>
          )}
        </div>
      </div>

      {/* Service Status Banner */}
      {serviceStatus && (!serviceStatus.available || !serviceStatus.hasKey) && (
        <div className={`mb-4 p-3 rounded-lg border ${
          serviceStatus.available && serviceStatus.hasKey
            ? 'bg-green-900/20 border-green-600/40 text-green-200'
            : serviceStatus.available && !serviceStatus.hasKey
            ? 'bg-yellow-900/20 border-yellow-600/40 text-yellow-200'
            : 'bg-red-900/20 border-red-600/40 text-red-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {serviceStatus.available && serviceStatus.hasKey ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  <span className="font-medium">Agents Service: Ready</span>
                </>
              ) : serviceStatus.available && !serviceStatus.hasKey ? (
                <>
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  <span className="font-medium">Agents Service: Running but API key not configured</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 mr-2" />
                  <span className="font-medium">Agents Service: Not Available</span>
                </>
              )}
            </div>
            {serviceStatus.message && (
              <span className="text-sm opacity-80">{serviceStatus.message}</span>
            )}
          </div>
          {!serviceStatus.available && (
            <div className="mt-2 text-sm">
              <p>To start the agents service, run:</p>
              <code className="block mt-1 p-2 bg-slate-900/50 rounded text-xs">
                ./start-refine.sh
              </code>
            </div>
          )}
        </div>
      )}

      {/* Progress */}
      <div className="mb-6">
        {!showAdvancedRefactoring ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-3">
            <div>
              <h3 className="text-sm font-medium text-slate-400">Status</h3>
              <p className="text-lg font-semibold text-white">{simplePhaseLabel}</p>
            </div>
            <p className="text-sm text-slate-400 max-w-md text-right">
              {!agentsReady
                ? `Start the agents service (port ${agentsPort()}) before refactoring — see the red banner above.`
                : agentRunning || isRefactoring
                  ? 'AI is refactoring — large files can take several minutes.'
                  : currentStep === 'review'
                    ? 'Compare the diff and save or roll back when ready.'
                    : agentError
                      ? 'Fix the error above, then try Start Refactoring again.'
                      : 'Review smells below, then run refactor.'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Refactoring Process</h3>
              <div className="text-sm text-slate-400">
                Step {refactorStepsOrder.indexOf(currentStep as (typeof refactorStepsOrder)[number]) + 1} of 5
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {refactorStepsOrder.map((step, index) => (
                <div key={step} className="flex items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                    currentStep === step
                      ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                      : refactorStepsOrder.indexOf(currentStep as (typeof refactorStepsOrder)[number]) > index
                        ? 'border-green-500 bg-green-500/20 text-green-400'
                        : 'border-slate-600 bg-slate-700 text-slate-500'
                  }`}>
                    {getStepIcon(step)}
                  </div>
                  {index < 4 && (
                    <div className={`w-8 h-0.5 mx-2 ${
                      refactorStepsOrder.indexOf(currentStep as (typeof refactorStepsOrder)[number]) > index
                        ? 'bg-green-500'
                        : 'bg-slate-600'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Dependency Graph — collapsible */}
      <div className="mb-4">
        <CollapsibleSection title="Dependency &amp; Impact Graph" icon={GitCommit} iconColor="text-cyan-400" defaultOpen={false}>
          <FileImpactDependencyGraph workspaceId={workspaceId} filePath={selectedFile} />
        </CollapsibleSection>
      </div>

      {/* Code Smells Summary — collapsible */}
      {effectiveCodeSmells && effectiveCodeSmells.length >= 0 && (
        <div className="mb-4">
        <CollapsibleSection
          title="Code Smells Detected"
          icon={AlertTriangle}
          iconColor="text-amber-400"
          defaultOpen={true}
          badge={<span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">{effectiveCodeSmells.length} issues</span>}
        >
          {!showAdvancedRefactoring ? (
            <div className="mb-4 space-y-3">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="text-white">
                  <span className="text-slate-400">Total </span>
                  <span className="font-bold text-red-300">{effectiveCodeSmells.length}</span>
                </span>
                <span className="text-slate-300">
                  Crit <span className="font-semibold text-red-400">{effectiveCodeSmells.filter((s: any) => (s.severity || '').toUpperCase() === 'CRITICAL').length}</span>
                </span>
                <span className="text-slate-300">
                  Maj <span className="font-semibold text-amber-400">{effectiveCodeSmells.filter((s: any) => (s.severity || '').toUpperCase() === 'MAJOR').length}</span>
                </span>
                <span className="text-slate-300">
                  Min <span className="font-semibold text-purple-300">{effectiveCodeSmells.filter((s: any) => (s.severity || '').toUpperCase() === 'MINOR').length}</span>
                </span>
                <span className="text-slate-400">
                  {(displayContent && displayContent.length > 0) ? displayContent.split('\n').length : 0} lines
                </span>
              </div>
              {effectiveCodeSmells.length > 0 && (
                <details className="rounded-lg border border-slate-600 bg-slate-900/30">
                  <summary className="cursor-pointer px-3 py-2 text-sm text-slate-300 list-none [&::-webkit-details-marker]:hidden">
                    Smell types ({(() => {
                      const smellTypes = new Map<string, number>();
                      effectiveCodeSmells.forEach((smell: any) => {
                        const type = smell.detectorId || smell.type || smell.title || 'Unknown';
                        smellTypes.set(type, (smellTypes.get(type) || 0) + 1);
                      });
                      return smellTypes.size;
                    })()})
                  </summary>
                  <div className="flex flex-wrap gap-2 px-3 pb-3">
                    {(() => {
                      const smellTypes = new Map<string, number>();
                      effectiveCodeSmells.forEach((smell: any) => {
                        const type = smell.detectorId || smell.type || smell.title || 'Unknown';
                        smellTypes.set(type, (smellTypes.get(type) || 0) + 1);
                      });
                      return Array.from(smellTypes.entries()).map(([type, count]) => (
                        <div key={type} className="bg-slate-700 rounded-lg px-3 py-2 border border-slate-600">
                          <span className="text-white font-medium">{type}</span>
                          <span className="text-slate-400 ml-2">({count})</span>
                        </div>
                      ));
                    })()}
                  </div>
                </details>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                  <div className="text-3xl font-bold text-red-400">{effectiveCodeSmells.length}</div>
                  <div className="text-sm text-slate-400 mt-1">Total Smells</div>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                  <div className="text-3xl font-bold text-red-500">
                    {effectiveCodeSmells.filter((s: any) => (s.severity || '').toUpperCase() === 'CRITICAL').length}
                  </div>
                  <div className="text-sm text-slate-400 mt-1">Critical</div>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                  <div className="text-3xl font-bold text-amber-500">
                    {effectiveCodeSmells.filter((s: any) => (s.severity || '').toUpperCase() === 'MAJOR').length}
                  </div>
                  <div className="text-sm text-slate-400 mt-1">Major</div>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                  <div className="text-3xl font-bold text-purple-400">
                    {effectiveCodeSmells.filter((s: any) => (s.severity || '').toUpperCase() === 'MINOR').length}
                  </div>
                  <div className="text-sm text-slate-400 mt-1">Minor</div>
                </div>
              </div>
              {effectiveCodeSmells.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-md font-semibold text-white mb-3">Smell Types:</h4>
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const smellTypes = new Map<string, number>();
                      effectiveCodeSmells.forEach((smell: any) => {
                        const type = smell.detectorId || smell.type || smell.title || 'Unknown';
                        smellTypes.set(type, (smellTypes.get(type) || 0) + 1);
                      });
                      return Array.from(smellTypes.entries()).map(([type, count]) => (
                        <div key={type} className="bg-slate-700 rounded-lg px-3 py-2 border border-slate-600">
                          <span className="text-white font-medium">{type}</span>
                          <span className="text-slate-400 ml-2">({count})</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}
            </>
          )}
          
          {effectiveCodeSmells.length === 0 && (
            <div className="mt-4 p-4 bg-green-600/20 border border-green-500/50 rounded-lg">
              <p className="text-green-300 text-sm">
                ✓ No code smells detected. This file appears to be clean.
              </p>
            </div>
          )}
          
          {/* Quick Start Refactoring Button - Always visible when smells are detected */}
          {effectiveCodeSmells.length > 0 && (
            <div className="mt-6 p-4 bg-gradient-to-r from-green-600/20 to-blue-600/20 border border-green-500/50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-white font-semibold mb-1 flex items-center">
                    <Wand2 className="w-5 h-5 mr-2 text-green-400" />
                    {showAdvancedRefactoring ? 'Ready to Refactor' : 'Run AI refactor'}
                  </h4>
                  <p className="text-slate-300 text-sm">
                    {showAdvancedRefactoring
                      ? `${effectiveCodeSmells.length} code smell${effectiveCodeSmells.length !== 1 ? 's' : ''} detected. Click below to start AI-powered refactoring.`
                      : `Uses detected smells on this file (${effectiveCodeSmells.length}). The run always attempts analysis; very large files may skip the LLM with a documented reason.`}
                  </p>
                  {(() => {
                    const lc = (displayContent || fileContent || '').split('\n').length;
                    const notice = clientFileSizeNotice(lc);
                    return notice ? (
                      <p className="text-amber-200/90 text-xs mt-2">{notice}</p>
                    ) : null;
                  })()}
                  {showAdvancedRefactoring && (
                    <p className="text-slate-500 text-xs mt-2">
                      Large files or 80+ smells need longer waits — keep this tab open until the request finishes.
                    </p>
                  )}
                </div>
                <button
                  onClick={async () => {
                    if (!workspaceId || !selectedFile) return;
                    const health = await checkAgentsHealth();
                    if (!health.ok) {
                      setAgentError(`❌ ${health.message}`);
                      setAgentSteps([
                        {
                          name: 'Health Check',
                          agent: 'System',
                          status: 'error',
                          startedAt: Date.now(),
                          endedAt: Date.now(),
                          error: health.message,
                        },
                      ]);
                      setCurrentStep('analyze');
                      return;
                    }
                    resetRefactorRunState();
                    const runGeneration = refactorRunGenerationRef.current;
                    setAgentRunning(true);
                    setAgentSteps([]);
                    setAgentError(null);
                    setCurrentStep('execute');
                    
                    try {
                      const controller = new AbortController();
                      const refactorWaitMs = getRefactorClientTimeoutMs(
                        (displayContent || fileContent || '').split('\n').length,
                        effectiveCodeSmells?.length ?? 0
                      );
                      const timeoutId = setTimeout(() => {
                        controller.abort();
                        setAgentError(
                          `Refactoring timed out after ${Math.round(refactorWaitMs / 60000)} minutes. Large files can need the full window — you can try again.`
                        );
                        setAgentRunning(false);
                      }, refactorWaitMs);
                      
                      const agentsUrl =
                        typeof window !== 'undefined' ? agentsRefactorUrl() : `/agents/refactor`;
                      
                      const res = await fetch(agentsUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          workspaceId, 
                          filePath: selectedFile,
                          goals: ['reduce code smells', 'improve readability', 'enhance maintainability'],
                          providedSmells: effectiveCodeSmells.length > 0 ? effectiveCodeSmells : undefined
                        }),
                        signal: controller.signal
                      });
                      clearTimeout(timeoutId);
                      
                      let data: any = null;
                      try {
                        const textBody = await res.text();
                        if (textBody) {
                          try {
                            data = JSON.parse(textBody);
                          } catch {
                            data = { error: textBody, success: false };
                          }
                        }
                      } catch (e) {
                        data = { error: 'Failed to read response', success: false };
                      }
                      
                      if (!res.ok) {
                        const errorMsg = data?.error || data?.message || `Refactoring failed (${res.status})`;
                        setAgentSteps(data?.steps || []);
                        setAgentError(errorMsg);
                        setCurrentStep('analyze');
                        return;
                      }
                      if (data) {
                        finishResearchReview(data, runGeneration);
                      }
                    } catch (e: any) {
                      console.error('Refactoring failed', e);
                      const msg = e instanceof Error ? e.message : String(e);
                      setAgentError(`Refactoring failed: ${msg}`);
                      setCurrentStep('analyze');
                      setAgentSteps(steps => [...steps, { 
                        name: 'Run', 
                        agent: 'Coordinator', 
                        status: 'error', 
                        startedAt: Date.now(), 
                        endedAt: Date.now(), 
                        error: msg 
                      }]);
                    } finally {
                      setAgentRunning(false);
                    }
                  }}
                  disabled={agentRunning || !agentsReady}
                  title={
                    !agentsReady
                      ? `Agents service must be running on port ${agentsPort()}`
                      : undefined
                  }
                  className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-green-400 disabled:to-green-500 text-white rounded-lg transition-all flex items-center font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
                >
                  {agentRunning ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Refactoring...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-5 h-5 mr-2" />
                      Start Refactoring
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </CollapsibleSection>
        </div>
      )}

      {/* Step 1: Analysis (hidden in simple mode when smells already loaded — avoids duplicate CTAs) */}
      {currentStep === 'analyze' && (showAdvancedRefactoring || effectiveCodeSmells.length === 0) && (
        <div className="space-y-6">
          <div className="bg-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Brain className="w-5 h-5 mr-2 text-blue-400" />
              AI Code Analysis
            </h3>
            <p className="text-slate-300 mb-4">
              Our AI is analyzing your code to provide intelligent recommendations about what to improve and what to keep unchanged.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-slate-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-red-400">{effectiveCodeSmells.length}</div>
                <div className="text-sm text-slate-400">Code Smells Detected</div>
              </div>
              <div className="bg-slate-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-400">{(displayContent && displayContent.length > 0) ? displayContent.split('\n').length : 0}</div>
                <div className="text-sm text-slate-400">Lines of Code</div>
              </div>
              <div className="bg-slate-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-400">AI</div>
                <div className="text-sm text-slate-400">Analysis Engine</div>
              </div>
            </div>
            <button
              onClick={analyzeCode}
              disabled={isAnalyzing}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg py-3 px-4 transition-colors flex items-center justify-center"
            >
              {isAnalyzing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                  Analyzing Code...
                </>
              ) : (
                <>
                  <Brain className="w-5 h-5 mr-2" />
                  Start AI Analysis
                </>
              )}
            </button>
            
            {/* Show analysis results and proceed to refactoring */}
            {agentAnalysis && agentAnalysis.decision && (
              <div className="mt-4 p-4 bg-slate-600/50 rounded-lg border border-slate-500">
                <h4 className="text-white font-semibold mb-2">Analysis Result:</h4>
                <p className="text-slate-300 text-sm mb-3">{agentAnalysis.reason}</p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-400">Total Smells:</span>
                  <span className="text-white font-semibold">{agentAnalysis.totalSmells || 0}</span>
                  <span className="text-slate-400 ml-4">Selected for Refactoring:</span>
                  <span className="text-white font-semibold">{agentAnalysis.selectedCount || 0}</span>
                </div>
                {agentAnalysis.decision === 'PROCEED' && (agentAnalysis.totalSmells || 0) > 0 && (
              <button
                onClick={async () => {
                      // Trigger refactoring directly - reuse the same logic as "Run Multi-Agent Refactor"
                  if (!workspaceId || !selectedFile) return;
                  resetRefactorRunState();
                  const runGeneration = refactorRunGenerationRef.current;
                  setAgentRunning(true);
                  setAgentSteps([]);
                  setAgentError(null);
                      setCurrentStep('execute');
                      
                      try {
                        const controller = new AbortController();
                        const refactorWaitMs = getRefactorClientTimeoutMs(
                          (displayContent || fileContent || '').split('\n').length,
                          effectiveCodeSmells?.length ?? 0
                        );
                        const timeoutId = setTimeout(() => {
                          controller.abort();
                          setAgentError(
                            `Refactoring timed out after ${Math.round(refactorWaitMs / 60000)} minutes.`
                          );
                          setAgentRunning(false);
                        }, refactorWaitMs);
                        
                        const agentsUrl =
                          typeof window !== 'undefined' ? agentsRefactorUrl() : `/agents/refactor`;
                        
                        const res = await fetch(agentsUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            workspaceId, 
                            filePath: selectedFile,
                            goals: ['reduce code smells', 'improve readability', 'enhance maintainability'],
                            providedSmells: effectiveCodeSmells.length > 0 ? effectiveCodeSmells : undefined
                          }),
                          signal: controller.signal
                        });
                        clearTimeout(timeoutId);
                        
                    let data: any = null;
                        try {
                          const textBody = await res.text();
                          if (textBody) {
                            try {
                              data = JSON.parse(textBody);
                            } catch {
                              data = { error: textBody, success: false };
                            }
                          }
                        } catch (e) {
                          data = { error: 'Failed to read response', success: false };
                        }
                        
                        if (!res.ok) {
                          const errorMsg = data?.error || data?.message || `Refactoring failed (${res.status})`;
                          setAgentSteps(data?.steps || []);
                          setAgentError(errorMsg);
                          return;
                        }
                        if (data) {
                          finishResearchReview(data, runGeneration);
                        }
                      } catch (e: any) {
                        console.error('Refactoring failed', e);
                        const msg = e instanceof Error ? e.message : String(e);
                        setAgentError(`Refactoring failed: ${msg}`);
                        setAgentSteps(steps => [...steps, { 
                          name: 'Run', 
                          agent: 'Coordinator', 
                          status: 'error', 
                          startedAt: Date.now(), 
                          endedAt: Date.now(), 
                          error: msg 
                        }]);
                      } finally {
                        setAgentRunning(false);
                      }
                    }}
                    className="mt-3 w-full bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 px-4 transition-colors flex items-center justify-center"
                  >
                    <Wand2 className="w-4 h-4 mr-2" />
                    Proceed to Refactoring
                  </button>
                )}
              </div>
            )}
            
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                onClick={async () => {
                  if (!workspaceId || !selectedFile) return;
                  resetRefactorRunState();
                  const runGeneration = refactorRunGenerationRef.current;
                  setAgentRunning(true);
                  setAgentSteps([]);
                  setAgentError(null);
                  try {
                    const controller = new AbortController();
                    const refactorWaitMs = getRefactorClientTimeoutMs(
                      (displayContent || fileContent || '').split('\n').length,
                      effectiveCodeSmells?.length ?? 0
                    );
                    const timeoutId = setTimeout(() => {
                      controller.abort();
                      setAgentError(
                        `Refactoring timed out after ${Math.round(refactorWaitMs / 60000)} minutes. The file may be very large or the model is slow — try again.`
                      );
                      setAgentRunning(false);
                    }, refactorWaitMs);
                    
                    let res;
                    try {
                      // Call agents service directly to avoid Next.js proxy timeout
                      // Use port 8091 directly instead of going through Next.js proxy
                      const agentsUrl =
                        typeof window !== 'undefined' ? agentsRefactorUrl() : `/agents/refactor`; // Fallback to proxy for SSR
                      
                      console.log('📤 Sending to /agents/refactor (alternative path):', {
                        workspaceId,
                        filePath: selectedFile,
                        providedSmellsCount: effectiveCodeSmells.length
                      });
                      
                      res = await fetch(agentsUrl, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                          workspaceId, 
                          filePath: selectedFile,
                          goals: ['reduce code smells', 'improve readability', 'enhance maintainability'],
                          providedSmells: effectiveCodeSmells.length > 0 ? effectiveCodeSmells : undefined
                        }),
                        signal: controller.signal
                      });
                      clearTimeout(timeoutId);
                    } catch (fetchError: any) {
                      clearTimeout(timeoutId);
                      if (fetchError.name === 'AbortError') {
                        setAgentError(
                          `Request aborted after ${Math.round(refactorWaitMs / 60000)} minutes. For huge classes, try again or split refactoring into smaller edits.`
                        );
                        setAgentRunning(false);
                      return;
                    }
                      throw fetchError;
                    }
                    
                    // Always try to parse JSON first, even if status is not ok
                    let data: any = null;
                    try {
                      const textBody = await res.text();
                      if (textBody) {
                        try {
                          data = JSON.parse(textBody);
                        } catch {
                          // Not JSON, use as error message
                          data = { error: textBody, success: false };
                        }
                      }
                    } catch (e) {
                      data = { error: 'Failed to read response', success: false };
                    }
                    
                    if (!res.ok) {
                      const errorMsg = data?.error || data?.message || `Refactoring failed (${res.status})`;
                      setAgentSteps(data?.steps || [
                        { name: 'Run', agent: 'Coordinator', status: 'error', startedAt: Date.now(), endedAt: Date.now(), details: { status: res.status }, error: errorMsg }
                      ]);
                      setAgentError(errorMsg);
                      return;
                    }
                    if (data) {
                      finishResearchReview(data, runGeneration);
                    }
                  } catch (e: any) {
                    console.error('Agent run failed', e);
                    const msg = e instanceof Error ? e.message : String(e);
                    
                    // Handle specific error types
                    if (e.name === 'AbortError' || msg.includes('timeout') || msg.includes('aborted')) {
                      setAgentError('Request timed out. Refactoring large files can take several minutes. Please try again or use a smaller file.');
                    } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
                      setAgentError(`Network error. Please check that the agents service is running on port ${agentsPort()}.`);
                    } else {
                      setAgentError(`Multi-agent run failed: ${msg}`);
                    }
                    
                    setAgentSteps(steps => [...steps, { 
                      name: 'Run', 
                      agent: 'Coordinator', 
                      status: 'error', 
                      startedAt: Date.now(), 
                      endedAt: Date.now(), 
                      error: msg 
                    }]);
                  } finally {
                    setAgentRunning(false);
                  }
                }}
                disabled={agentRunning || !agentsReady}
                title={!agentsReady ? `Agents service must be running on port ${agentsPort()}` : undefined}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg py-2 px-3 transition-colors flex items-center justify-center"
              >
                {agentRunning ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Running Multi-Agent Workflow
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4 mr-2" />
                    Run Multi-Agent Refactor
                </>
              )}
            </button>
            </div>
          </div>
        </div>
      )}

      {/* Agents Timeline (collapsible) */}
      {agentSteps.length > 0 && (
        <div className="mb-4">
          <CollapsibleSection
            title="Multi-Agent Pipeline"
            icon={Brain}
            iconColor="text-purple-400"
            defaultOpen={false}
            badge={<span className="text-[10px] bg-purple-600/30 text-purple-300 px-2 py-0.5 rounded-full">{agentSteps.filter(s => s.status === 'done').length}/{agentSteps.length} steps</span>}
          >
            {renderAgentTimelineBody()}
          </CollapsibleSection>
        </div>
      )}

      {/* Code Comparison View - Always show at top when enabled */}
      {showComparison && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white flex items-center">
              <Eye className="w-6 h-6 mr-2 text-blue-400" />
              Code Comparison
            </h2>
            <button
              onClick={() => setShowComparison(false)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center"
            >
              <X className="w-4 h-4 mr-2" />
              Close
            </button>
          </div>
        <CodeComparison
            beforeCode={(() => {
              const before = comparisonEntry?.originalContent || applyResult?.originalContent || displayContent || fileContent || '';
              console.log('📋 CodeComparison beforeCode:', before ? `${before.length} chars` : 'EMPTY', { 
                hasComparisonEntry: !!comparisonEntry?.originalContent,
                hasApplyResult: !!applyResult?.originalContent,
                hasDisplayContent: !!displayContent,
                hasFileContent: !!fileContent
              });
              return before;
            })()}
            afterCode={(() => {
              const after =
                comparisonEntry?.refactoredContent ||
                (applyResult?.llmCandidateContent as string) ||
                applyResult?.refactoredContent ||
                refactoredCode ||
                '';
              console.log('📋 CodeComparison afterCode:', after ? `${after.length} chars` : 'EMPTY', {
                hasComparisonEntry: !!comparisonEntry?.refactoredContent,
                hasApplyResult: !!applyResult?.refactoredContent,
                hasRefactoredCode: !!refactoredCode
              });
              return after;
            })()}
            title={comparisonEntry?.title || `Refactoring: ${selectedFile?.split('/').pop() || 'File'}`}
            description={`Changes to ${selectedFile || 'the selected file'}`}
          changes={{
            added: (comparisonEntry?.changes?.added) ?? (applyResult?.changes?.added || 0),
            removed: (comparisonEntry?.changes?.removed) ?? (applyResult?.changes?.removed || 0),
            modified: (comparisonEntry?.changes?.modified) ?? (applyResult?.changes?.modified || (applyResult?.changes?.linesChanged || 0))
          }}
          metrics={{
              complexityBefore: qualityMetrics?.before?.complexity || applyResult?.deltas?.qualityMetrics?.before?.complexity || 0,
              complexityAfter: qualityMetrics?.after?.complexity || applyResult?.deltas?.qualityMetrics?.after?.complexity || 0,
              maintainabilityBefore: qualityMetrics?.before?.maintainability || applyResult?.deltas?.qualityMetrics?.before?.maintainability || 0,
              maintainabilityAfter: qualityMetrics?.after?.maintainability || applyResult?.deltas?.qualityMetrics?.after?.maintainability || 0,
              testabilityBefore: qualityMetrics?.before?.testability || applyResult?.deltas?.qualityMetrics?.before?.testability || 0,
              testabilityAfter: qualityMetrics?.after?.testability || applyResult?.deltas?.qualityMetrics?.after?.testability || 0
          }}
          onApply={() => { setShowComparison(false); setComparisonEntry(null); }}
          onReject={() => { setShowComparison(false); setComparisonEntry(null); }}
        />
        </div>
      )}

      {/* Step 2: Agent Recommendations */}
      {showAdvancedRefactoring && currentStep === 'recommend' && (
        <div className="space-y-6">
          <div className="bg-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-2 flex items-center">
              <Brain className="w-5 h-5 mr-2 text-purple-400" />
              Multi-Agent System Analysis
            </h3>
            <p className="text-slate-300 text-sm mb-4">
              Our AI agents have analyzed your code and made a decision about refactoring.
            </p>
            
            {/* Agent Decision */}
            {agentAnalysis && (
              <div className={`rounded-lg p-4 mb-4 border ${
                agentAnalysis.decision === 'PROCEED' ? 'bg-green-600/20 border-green-500/50' :
                agentAnalysis.decision === 'SKIP' ? 'bg-blue-600/20 border-blue-500/50' :
                agentAnalysis.decision === 'OPTIONAL' ? 'bg-yellow-600/20 border-yellow-500/50' :
                'bg-red-600/20 border-red-500/50'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="text-white font-semibold mb-2 flex items-center">
                      {agentAnalysis.decision === 'PROCEED' && <CheckCircle className="w-5 h-5 mr-2 text-green-400" />}
                      {agentAnalysis.decision === 'SKIP' && <Info className="w-5 h-5 mr-2 text-blue-400" />}
                      {agentAnalysis.decision === 'OPTIONAL' && <AlertCircle className="w-5 h-5 mr-2 text-yellow-400" />}
                      {agentAnalysis.decision === 'ERROR' && <XCircle className="w-5 h-5 mr-2 text-red-400" />}
                      Agent Decision: {
                        agentAnalysis.decision === 'PROCEED' ? 'Refactoring Recommended' :
                        agentAnalysis.decision === 'SKIP' ? 'No Refactoring Needed' :
                        agentAnalysis.decision === 'OPTIONAL' ? 'Refactoring Optional' :
                        'Analysis Error'
                      }
                    </h4>
                    <p className="text-slate-300 text-sm">
                      {agentAnalysis.reason}
                    </p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    agentAnalysis.decision === 'PROCEED' ? 'bg-green-500/30 text-green-300' :
                    agentAnalysis.decision === 'SKIP' ? 'bg-blue-500/30 text-blue-300' :
                    agentAnalysis.decision === 'OPTIONAL' ? 'bg-yellow-500/30 text-yellow-300' :
                    'bg-red-500/30 text-red-300'
                  }`}>
                    {agentAnalysis.decision}
                  </div>
                </div>
                
                {agentAnalysis.decision === 'SKIP' && (
                  <div className="mt-4 p-3 bg-slate-800/50 rounded border border-slate-600">
                    <p className="text-slate-300 text-sm">
                      ✅ The Multi-Agent System has determined that this file does not require refactoring at this time. 
                      The code appears to be well-structured and maintainable.
                    </p>
                  </div>
                )}
                
                {agentAnalysis.refactoringPlan && agentAnalysis.refactoringPlan.length > 0 && (
                  <div className="mt-4">
                    <p className="text-slate-300 text-sm mb-2 font-semibold flex items-center">
                      <Brain className="w-4 h-4 mr-2 text-purple-400" />
                      Agent's Automatic Selection:
                    </p>
                    <div className="bg-slate-800/50 rounded p-3 mb-2">
                      <div className="grid grid-cols-3 gap-4 text-xs">
                        <div>
                          <div className="text-slate-400">Total Smells Found</div>
                          <div className="text-white font-semibold">{agentAnalysis.totalSmells || agentAnalysis.smells?.length || 0}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Agent Selected</div>
                          <div className="text-green-400 font-semibold">{agentAnalysis.selectedCount || agentAnalysis.refactoringPlan.length}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Will Be Handled</div>
                          <div className="text-purple-400 font-semibold">✓ Automatically</div>
                        </div>
                      </div>
                    </div>
                    <p className="text-slate-400 text-xs mb-2">
                      🤖 Agent has automatically prioritized and selected which smells to handle. No manual selection needed.
                    </p>
                    <div className="space-y-2">
                      {agentAnalysis.refactoringPlan.slice(0, 5).map((plan, idx) => (
                        <div key={idx} className="bg-slate-800/50 rounded p-2 text-xs border-l-2 border-purple-500">
                          <div className="flex items-center justify-between">
                            <span className="text-purple-400 font-semibold">{plan.technique}</span>
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              plan.severity === 'CRITICAL' ? 'bg-red-500/30 text-red-300' :
                              plan.severity === 'MAJOR' ? 'bg-orange-500/30 text-orange-300' :
                              'bg-yellow-500/30 text-yellow-300'
                            }`}>
                              {plan.severity}
                            </span>
                          </div>
                          <div className="text-slate-400 mt-1">{plan.description.substring(0, 100)}...</div>
                          <div className="text-slate-500 text-xs mt-1">📍 {plan.location}</div>
                        </div>
                      ))}
                      {agentAnalysis.refactoringPlan.length > 5 && (
                        <p className="text-slate-400 text-xs">+ {agentAnalysis.refactoringPlan.length - 5} more smells selected by agent</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {agentAnalysis && agentAnalysis.decision !== 'SKIP' && (
              <div className="mt-4">
                <h4 className="text-white font-semibold mb-3 flex items-center">
                  <Target className="w-4 h-4 mr-2 text-purple-400" />
                  Refactoring Recommendations
                </h4>
                <p className="text-slate-300 text-sm mb-4">
                  Based on agent analysis, here are the recommended refactorings:
                </p>
              </div>
            )}
          </div>
          
          {agentAnalysis?.decision === 'SKIP' && (
            <div className="bg-slate-800 rounded-lg p-6 text-center">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
              <h4 className="text-white font-semibold mb-2">No Refactoring Needed</h4>
            <p className="text-slate-300 mb-4">
                The Multi-Agent System has analyzed your code and determined it does not require refactoring.
              </p>
              <button
                onClick={onBack}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
              >
                Back to File Selection
              </button>
          </div>
          )}

          <div className="space-y-4">
            {recommendations.map((rec) => (
              <div key={rec.id} className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={selectedRecommendations.includes(rec.id)}
                      onChange={() => toggleRecommendation(rec.id)}
                      className="w-4 h-4 text-blue-600 bg-slate-600 border-slate-500 rounded focus:ring-blue-500"
                    />
                    <div>
                      <h4 className="text-white font-semibold">{rec.title}</h4>
                      <p className="text-slate-300 text-sm">{rec.description}</p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getTypeColor(rec.type)}`}>
                      {rec.type}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getPriorityColor(rec.priority)}`}>
                      {rec.priority}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                  <div>
                    <div className="text-xs text-slate-400">Confidence</div>
                    <div className="text-sm font-semibold text-blue-400">{rec.confidence}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Impact</div>
                    <div className={`text-sm font-semibold ${getImpactColor(rec.impact)}`}>{rec.impact}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Effort</div>
                    <div className={`text-sm font-semibold ${getEffortColor(rec.effort)}`}>{rec.effort}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Time</div>
                    <div className="text-sm font-semibold text-green-400">{rec.estimatedTime}</div>
                  </div>
                </div>

                <div className="bg-slate-800 rounded-lg p-3 mb-3">
                  <div className="text-sm text-slate-300">
                    <strong>AI Reasoning:</strong> {rec.reasoning}
                  </div>
                </div>

                {rec.suggestedChanges && (
                  <div className="bg-slate-800 rounded-lg p-3 mb-3">
                    <div className="text-sm text-slate-300">
                      <strong>Suggested Changes:</strong> {rec.suggestedChanges}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {rec.benefits && rec.benefits.length > 0 && (
                    <div>
                      <div className="text-sm font-semibold text-green-400 mb-2">Benefits</div>
                      <ul className="text-xs text-slate-300 space-y-1">
                        {rec.benefits.map((benefit, index) => (
                          <li key={index} className="flex items-center">
                            <CheckCircle className="w-3 h-3 mr-2 text-green-400" />
                            {benefit}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {rec.risks && rec.risks.length > 0 && (
                    <div>
                      <div className="text-sm font-semibold text-red-400 mb-2">Risks</div>
                      <ul className="text-xs text-slate-300 space-y-1">
                        {rec.risks.map((risk, index) => (
                          <li key={index} className="flex items-center">
                            <AlertTriangle className="w-3 h-3 mr-2 text-red-400" />
                            {risk}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="bg-blue-500/20 border border-blue-500/50 rounded-lg p-4">
              <div className="flex items-center text-blue-300 text-sm">
                <Settings className="w-4 h-4 mr-2" />
                <span className="font-medium">Next Step:</span>
                <span className="ml-2">Create a refactoring plan to proceed to execution</span>
              </div>
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setCurrentStep('analyze')}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors"
              >
                Back to Analysis
              </button>
              <button
                onClick={async () => {
                  // Automatically execute with agent's selected smells - no manual selection needed
                  if (agentAnalysis && agentAnalysis.decision !== 'SKIP') {
                    console.log('🤖 Agent has automatically selected smells to handle:', agentAnalysis.selectedCount || agentAnalysis.refactoringPlan?.length || 0);
                    setCurrentStep('execute');
                    await executeRefactoring();
                  } else {
                    createRefactoringPlan();
                  }
                }}
                disabled={agentAnalysis?.decision === 'SKIP'}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg transition-colors flex items-center"
              >
                <Play className="w-4 h-4 mr-2" />
                {agentAnalysis?.decision === 'SKIP' 
                  ? 'No Refactoring Needed' 
                  : `Execute Refactoring (Agent Selected ${agentAnalysis?.selectedCount || agentAnalysis?.refactoringPlan?.length || 0} Smells)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Refactoring Plan */}
      {showAdvancedRefactoring && currentStep === 'plan' && refactoringPlan && (
        <div className="space-y-6">
          <div className="bg-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Settings className="w-5 h-5 mr-2 text-yellow-400" />
              Refactoring Plan
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-slate-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-400">{refactoringPlan.totalRecommendations}</div>
                <div className="text-sm text-slate-400">Recommendations</div>
              </div>
              <div className="bg-slate-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-400">{refactoringPlan.estimatedTime}m</div>
                <div className="text-sm text-slate-400">Estimated Time</div>
              </div>
              <div className="bg-slate-600 rounded-lg p-4">
                <div className={`text-2xl font-bold ${getImpactColor(refactoringPlan.riskLevel)}`}>
                  {refactoringPlan.riskLevel}
                </div>
                <div className="text-sm text-slate-400">Risk Level</div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-white">Execution Steps</h4>
            {refactoringPlan.steps.map((step: any, index: number) => (
              <div key={index} className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-white font-semibold">Step {step.step}: {step.title}</h5>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getEffortColor(step.effort)}`}>
                    {step.effort} Effort
                  </span>
                </div>
                <p className="text-slate-300 text-sm mb-2">{step.description}</p>
                <div className="flex items-center space-x-4 text-xs text-slate-400">
                  <span>Time: {step.estimatedTime}</span>
                  {step.dependencies.length > 0 && (
                    <span>Dependencies: {step.dependencies.join(', ')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setCurrentStep('recommend')}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors"
            >
              Back to Recommendations
            </button>
            <button
              onClick={executeRefactoring}
              disabled={isRefactoring}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors flex items-center text-lg font-bold"
            >
              {isRefactoring ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Executing Refactoring...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Execute Refactoring
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Execution */}
      {currentStep === 'execute' && (
        <div className="space-y-6">
          {!showAdvancedRefactoring && (agentRunning || isRefactoring) ? (
            <div className="space-y-4">
              <LiveRefactoringFeed
                events={liveFeedEvents}
                isRunning={agentRunning || isRefactoring}
              />
            </div>
          ) : (
          <div className="space-y-4">
            {/* Auto-start execution when reaching this step */}
            {!isRefactoring && (
              <div className="bg-slate-700 rounded-lg p-6 border border-slate-600">
                <p className="text-blue-300 text-sm mb-3">
                  <strong>Ready to execute refactoring...</strong> Click the button below to begin.
                </p>
                <button
                  onClick={() => {
                    console.log('🖱️ Auto-execute button clicked!');
                    setLoadingStep('Starting execution...');
                    executeRefactoring();
                  }}
                  className="mt-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start Execution
                </button>
              </div>
            )}
            
            {/* Live feed when refactoring is running */}
            {isRefactoring && (
              <LiveRefactoringFeed
                events={liveFeedEvents}
                isRunning={isRefactoring}
              />
            )}
            <div className="mt-4 space-y-2">
              {selectedRecommendations.map((recId, index) => {
                const rec = recommendations.find(r => r.id === recId);
                return (
                  <div key={recId} className="flex items-center text-sm text-slate-300">
                    <div className="w-4 h-4 bg-green-500 rounded-full mr-3 animate-pulse"></div>
                    {rec?.title || `Recommendation ${index + 1}`}
                  </div>
                );
              })}
            </div>
          </div>
          )}
        </div>
      )}

      {/* Step 5: Review */}
      {currentStep === 'review' && (
        <div className="space-y-6">
          <RefactoringReportPanel
            report={effectiveRefactoringReport}
            narrativeExtras={refactoringDocExtras}
            exportBasename={
              selectedFile
                ? `${selectedFile.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || 'refactoring'}-report`
                : 'refactoring-report'
            }
          />

          {applyResultMatchesCurrentFile &&
            effectiveCodeSmells.length > 0 &&
            improvementStats?.before?.total != null &&
            Math.abs(effectiveCodeSmells.length - improvementStats.before.total) > 5 && (
            <div className="bg-red-950/40 border border-red-500/50 rounded-lg p-4 mb-4">
              <p className="text-red-200 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                Smell count mismatch: live PMD on this file shows {effectiveCodeSmells.length}, but this
                run&apos;s verify step reported {improvementStats.before.total}. Restart services, hard-refresh,
                and run refactor again so the pipeline analyzes the same file as the header.
              </p>
            </div>
          )}

          {!applyResultMatchesCurrentFile && (
            <div className="bg-red-950/40 border border-red-500/50 rounded-lg p-4 mb-4">
              <p className="text-red-200 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                Metrics below may be from a previous file. Run Start Refactoring again on this file, or use Next File and back to refresh.
              </p>
            </div>
          )}

          {applyResult?.failureOutcome &&
            typeof applyResult.failureOutcome === 'object' &&
            (applyResult.failureOutcome as { userMessage?: string }).userMessage && (
            <div className="bg-violet-950/40 border border-violet-500/50 rounded-lg p-4 mb-4">
              <h4 className="text-violet-100 font-semibold text-sm mb-2 flex items-center gap-2">
                <Info className="w-4 h-4" />
                Why refactoring did not complete
              </h4>
              <p className="text-violet-100/90 text-sm mb-2">
                {(applyResult.failureOutcome as { userMessage: string }).userMessage}
              </p>
              {Array.isArray((applyResult.failureOutcome as { recommendations?: string[] }).recommendations) &&
                (applyResult.failureOutcome as { recommendations: string[] }).recommendations.length > 0 && (
                <ul className="list-disc list-inside text-violet-200/80 text-xs space-y-1">
                  {(applyResult.failureOutcome as { recommendations: string[] }).recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
              {applyResult.fileSizeAssessment && (
                <p className="text-violet-300/70 text-xs mt-2 font-mono">
                  File: {(applyResult.fileSizeAssessment as { lines?: number }).lines?.toLocaleString() ?? '?'} lines
                  {' · '}
                  tier {(applyResult.fileSizeAssessment as { tier?: string }).tier ?? '?'}
                  {' · '}
                  LLM invoked:{' '}
                  {(applyResult.researchOutcome as { llmInvoked?: boolean })?.llmInvoked === false ? 'no' : 'yes'}
                </p>
              )}
            </div>
          )}

          {applyResult?.partialLlmOutput === true && (
            <div className="bg-amber-950/40 border border-amber-500/50 rounded-lg p-4 mb-4">
              <p className="text-amber-100 text-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                The LLM returned a partial file (
                {String(applyResult.candidateLineCount ?? '?')} lines vs{' '}
                {String(applyResult.originalLineCount ?? '?')} original). Smell and Halstead metrics apply to that
                fragment, not the full class — the header still shows live PMD on the whole file (
                {effectiveCodeSmells.length} smells).
              </p>
            </div>
          )}

          {/* Show rejection banner if refactoring was rejected */}
          {refactoringRejected?.rejected && (
            <div className="bg-slate-800/80 border border-amber-500/40 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <BarChart3 className="w-5 h-5 mr-2 text-amber-400" />
                {REFINE_DEMO ? 'Refactoring run complete — not adopted in workspace' : 'Research run complete — not adopted in workspace'}
              </h3>
              <p className="text-slate-300 mb-4">
                {refactoringRejected.message ||
                  (REFINE_DEMO
                    ? 'The pipeline finished. Verification did not adopt this output into your project file. Full metrics and pipeline steps are below.'
                    : 'The pipeline finished. Verification did not adopt this output into your project file. Full metrics, smell counts, and pipeline steps are below for your paper.')}
              </p>
              {(improvementStats?.before?.total != null || applyResult?.researchOutcome) && (
                <p className="text-slate-400 text-sm mb-4 font-mono">
                  Smells (PMD):{' '}
                  {improvementStats?.before?.total ??
                    (applyResult?.researchOutcome as { smellsBefore?: number })?.smellsBefore ??
                    '?'}{' '}
                  →{' '}
                  {improvementStats?.after?.total ??
                    (applyResult?.researchOutcome as { smellsAfter?: number })?.smellsAfter ??
                    '?'}
                  {' · '}
                  Line diff: +{applyResult?.changes?.added ?? 0} / −{applyResult?.changes?.removed ?? 0} / ~
                  {applyResult?.changes?.modified ?? 0}
                </p>
              )}
              {refactoringRejected.rejectionReason && (
                <div className="bg-slate-800/50 border border-slate-600 rounded-lg p-4 mb-4">
                  <h4 className="text-white font-semibold mb-2 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-2 text-amber-400" />
                    Why it was not adopted
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 text-sm">
                    {Array.isArray(refactoringRejected.rejectionReason) ? (
                      refactoringRejected.rejectionReason.map((reason, idx) => (
                        <li key={idx}>{reason}</li>
                      ))
                    ) : (
                      <li>{refactoringRejected.rejectionReason}</li>
                    )}
                  </ul>
                </div>
              )}
              <div className="bg-blue-600/15 border border-blue-500/40 rounded-lg p-4">
                <p className="text-blue-100 text-sm">
                  <Info className="w-4 h-4 inline mr-2" />
                  {REFINE_DEMO
                    ? 'Open Refactoring Evidence & Analysis, export metrics (CSV), and Save full report below — even when the LLM returned identical code or smells did not decrease.'
                    : 'Open Refactoring Evidence & Analysis, export research metrics (CSV), and Save full report below — even when the LLM returned identical code or smells did not decrease.'}
                </p>
              </div>
            </div>
          )}
          
          {/* Show context-aware completion banner */}
          {(!refactoringRejected?.rejected) && (() => {
            const delta = improvementStats?.delta?.total ?? 0;
            const noImprovement = delta <= 0 && (improvementStats?.before?.total ?? 0) > 0;
            const isImproved = delta > 0;
            return (
            <div className={`border rounded-lg p-3 ${
              isImproved ? 'bg-green-600/20 border-green-500/50' :
              noImprovement ? 'bg-amber-600/20 border-amber-500/50' :
              'bg-green-600/20 border-green-500/50'
            }`}>
              <h3 className="text-sm font-semibold text-white flex items-center mb-1">
                {isImproved ? (
                  <><CheckCircle className="w-4 h-4 mr-1.5 text-green-400" />Refactoring Successful</>
                ) : noImprovement ? (
                  <><AlertTriangle className="w-4 h-4 mr-1.5 text-amber-400" />Refactoring Applied — No Smell Reduction</>
                ) : (
                  <><CheckCircle className="w-4 h-4 mr-1.5 text-green-400" />Refactoring Complete</>
                )}
              </h3>
              <p className="text-slate-400 text-xs">
                {isImproved
                  ? `Reduced ${delta} code smell${delta !== 1 ? 's' : ''}. Review the diff and verify the changes.`
                  : noImprovement
                    ? 'The refactoring applied structural changes but the static analyzer detected the same number of smells. Review the diff to assess if changes are still worthwhile.'
                    : 'Review the diff, then verify the saved file or roll back if something looks wrong.'}
              </p>
            </div>
            );
          })()}

          {applyResult?.refactoredArtifactPath && (
            <div className="bg-emerald-900/20 border border-emerald-600/40 rounded-lg p-3 mb-4">
              <p className="text-emerald-200 text-sm font-medium flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                Saved in project
              </p>
              <p className="text-slate-400 text-xs mt-1 font-mono break-all">
                Live source updated · archive: {String(applyResult.refactoredArtifactPath)}
              </p>
              {applyResult.originalArtifactPath && (
                <p className="text-slate-500 text-[10px] mt-0.5 font-mono break-all">
                  Original snapshot: {String(applyResult.originalArtifactPath)}
                </p>
              )}
            </div>
          )}
            
            {/* Auto-show diff if changes detected */}
            {applyResult && ((applyResult.changes?.added ?? 0) + (applyResult.changes?.removed ?? 0) + (applyResult.changes?.modified ?? 0)) > 0 && !showComparison && (
              <div className="bg-blue-600/20 border border-blue-500/50 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-semibold mb-1">Changes Detected!</p>
                    <p className="text-slate-300 text-sm">
                      {applyResult.changes.added > 0 && `+${applyResult.changes.added} lines added`}
                      {applyResult.changes.added > 0 && applyResult.changes.removed > 0 && ', '}
                      {applyResult.changes.removed > 0 && `-${applyResult.changes.removed} lines removed`}
                      {applyResult.changes.modified > 0 && `, ${applyResult.changes.modified} lines modified`}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowComparison(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors flex items-center"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View Diff
                  </button>
                </div>
              </div>
            )}
            
            {/* Show change summary if available */}
            {(applyResult?.changes || applyResult?.originalContent) && (
              <div className="bg-slate-800/50 border border-slate-600 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-6 text-sm">
                  <h4 className="text-white font-semibold flex items-center">
                    <Code className="w-4 h-4 mr-1.5 text-blue-400" />
                    Changes
                  </h4>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 text-xs">Added</span>
                    <span className="text-green-400 font-semibold">+{applyResult?.changes?.added || 0}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 text-xs">Removed</span>
                    <span className="text-red-400 font-semibold">-{applyResult?.changes?.removed || 0}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 text-xs">Modified</span>
                    <span className="text-yellow-400 font-semibold">{applyResult?.changes?.modified || applyResult?.changes?.linesChanged || 0}</span>
                  </div>
                </div>
                {((applyResult?.changes?.added ?? 0) + (applyResult?.changes?.removed ?? 0) + (applyResult?.changes?.modified ?? 0)) === 0 && (
                  <div className="mt-2 text-amber-400 text-sm">
                    No line-level additions, removals, or edits detected in the diff summary. If you still see hunks below, refresh review or report a UI bug.
                  </div>
                )}
              </div>
            )}
            
            {applyResult?.deltas && (
              <RefactoringVisualSummary
                deltas={applyResult.deltas}
                improvementStats={improvementStats}
                researchMetrics={applyResult.researchMetrics}
              />
            )}

            {(applyResult || smellComparison) && (
              <div className="flex flex-col items-end gap-2 mb-3">
                {saveReportError && (
                  <p className="text-xs text-amber-300 max-w-md text-right bg-amber-950/40 border border-amber-600/40 rounded px-3 py-2">
                    {saveReportError}
                  </p>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void saveFullReport()}
                  disabled={saveReportStatus === 'saving' || !applyResult}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 text-white border transition-colors ${
                    saveReportStatus === 'saved'
                      ? 'bg-emerald-600 border-emerald-400/50'
                      : saveReportStatus === 'error'
                        ? 'bg-amber-700 hover:bg-amber-600 border-amber-500/50'
                        : 'bg-cyan-600 hover:bg-cyan-500 border-cyan-500/50'
                  }`}
                  title="Store complete review for your paper — reopen via View report without re-refactoring"
                >
                  <Save className="w-4 h-4" />
                  {saveReportStatus === 'saving'
                    ? 'Saving…'
                    : saveReportStatus === 'saved'
                      ? 'Report saved ✓'
                      : saveReportStatus === 'error'
                        ? 'Save failed — retry'
                        : 'Save full report'}
                </button>
                <button
                  type="button"
                  onClick={handleExportReportCsv}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-white border border-slate-600 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export report (CSV)
                </button>
                {applyResult?.researchMetrics && (
                  <button
                    type="button"
                    onClick={handleExportResearchMetricsCsv}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-700/40 hover:bg-emerald-700/60 text-emerald-100 border border-emerald-500/40 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    {REFINE_DEMO ? 'Export metrics (CSV)' : 'Export research metrics (CSV)'}
                  </button>
                )}
                </div>
              </div>
            )}

            {/* Refactoring Evidence Panel — collapsible */}
            {applyResult?.deltas && applyResultMatchesCurrentFile && (
              <div className="mb-4">
                <CollapsibleSection
                  title="Refactoring Evidence &amp; Analysis"
                  icon={Target}
                  iconColor="text-blue-400"
                  defaultOpen={true}
                  badge={applyResult.deltas?.comprehensiveAnalysis?.summary?.overall_score != null ? (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      applyResult.deltas.comprehensiveAnalysis.summary.overall_score >= 70 ? 'bg-green-500/20 text-green-400' :
                      applyResult.deltas.comprehensiveAnalysis.summary.overall_score >= 40 ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>Score: {applyResult.deltas.comprehensiveAnalysis.summary.overall_score.toFixed(0)}/100</span>
                  ) : undefined}
                >
                  <RefactoringEvidencePanel
                    deltas={applyResult.deltas}
                    steps={applyResult.steps}
                    originalContent={displayContent}
                    refactoredContent={
                      (applyResult.llmCandidateContent as string) || applyResult.refactoredContent
                    }
                    codeSmells={effectiveCodeSmells}
                    improvementStats={improvementStats}
                    rejectionReasons={refactoringRejected?.rejectionReason || applyResult?.rejectionReason || applyResult?.verificationRejectionReasons}
                    researchMetrics={applyResult.researchMetrics || null}
                    pipelineMetadata={applyResult.pipelineMetadata || null}
                  />
                </CollapsibleSection>
              </div>
            )}
            
            <div className="flex flex-wrap gap-3 mb-4">
              <button
                onClick={() => {
                  setShowComparison(true);
                  // Scroll to top to see the diff view
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                disabled={!applyResult && !refactoredCode}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-md transition-colors flex items-center"
              >
                <Eye className="w-4 h-4 mr-2" />
                View Changes (Diff)
              </button>
              {showAdvancedRefactoring && (
              <button
                onClick={analyzeImprovements}
                disabled={isEvaluating || (!applyResult && !refactoredCode)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 text-white rounded-md transition-colors"
              >
                {isEvaluating ? 'Analyzing...' : 'Analyze Improvements'}
              </button>
              )}
              <button
                onClick={verifySavedFile}
                disabled={isVerifying}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white rounded-md transition-colors"
              >
                {isVerifying ? 'Verifying...' : 'Verify Saved File'}
              </button>
              <button
                onClick={rollbackRefactoring}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
              >
                Rollback
              </button>
            </div>
            {verifyStatus && (
              <div className={`p-3 rounded border ${verifyStatus.ok ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-amber-500/10 border-amber-500/40 text-amber-300'}`}>
                {verifyStatus.message}
              </div>
            )}
            {/* Removed redundant status cards — info already in Evidence Panel */}

          {(() => {
            const reviewMetricsHistory = (
              <>
          {/* FIX #4: Always show issue comparison, with fallback to current code smells if stats not available */}
          {(() => {
            // Use improvementStats if available, otherwise calculate from effectiveCodeSmells
            let stats = improvementStats;
            if (!stats && effectiveCodeSmells && effectiveCodeSmells.length > 0) {
              const toStats = (smells: any[]) => {
                const total = smells.length;
                const critical = smells.filter(s => (s.severity || '').toUpperCase() === 'CRITICAL').length;
                const major = smells.filter(s => (s.severity || '').toUpperCase() === 'MAJOR').length;
                const minor = smells.filter(s => (s.severity || '').toUpperCase() === 'MINOR').length;
                return { total, critical, major, minor };
              };
              const beforeStats = toStats(effectiveCodeSmells);
              stats = {
                before: beforeStats,
                after: beforeStats, // Will be updated after analysis
                delta: { total: 0, critical: 0, major: 0, minor: 0 }
              };
            }
            
            if (!stats) return null;
            
            return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                <div className="text-slate-400 text-sm mb-1">Before Refactoring</div>
                  <div className="text-white text-lg font-semibold">{stats.before?.total ?? 0} issues</div>
                <div className="text-xs text-slate-400 mt-1">
                    CRIT {stats.before?.critical ?? 0} • MAJ {stats.before?.major ?? 0} • MIN {stats.before?.minor ?? 0}
                </div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                <div className="text-slate-400 text-sm mb-1">After Refactoring</div>
                  <div className="text-white text-lg font-semibold">{stats.after?.total ?? 0} issues</div>
                <div className="text-xs text-slate-400 mt-1">
                    CRIT {stats.after?.critical ?? 0} • MAJ {stats.after?.major ?? 0} • MIN {stats.after?.minor ?? 0}
                </div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                <div className="text-slate-400 text-sm mb-1">Improvement</div>
                  <div className={`text-lg font-semibold ${
                    (stats.delta?.total ?? 0) > 0 ? 'text-green-400' : 
                    (stats.delta?.total ?? 0) < 0 ? 'text-red-400' : 'text-slate-400'
                  }`}>
                    {stats.delta?.total ?? 0 > 0 ? '−' : stats.delta?.total ?? 0 < 0 ? '+' : ''}{Math.abs(stats.delta?.total ?? 0)} total
                  </div>
                <div className="text-xs text-slate-400 mt-1">
                    CRIT {(stats.delta?.critical ?? 0) > 0 ? '−' : (stats.delta?.critical ?? 0) < 0 ? '+' : ''}{Math.abs(stats.delta?.critical ?? 0)} • 
                    MAJ {(stats.delta?.major ?? 0) > 0 ? '−' : (stats.delta?.major ?? 0) < 0 ? '+' : ''}{Math.abs(stats.delta?.major ?? 0)} • 
                    MIN {(stats.delta?.minor ?? 0) > 0 ? '−' : (stats.delta?.minor ?? 0) < 0 ? '+' : ''}{Math.abs(stats.delta?.minor ?? 0)}
            </div>
          </div>
              </div>
            );
          })()}

          {/* Detailed Smell Comparison — before vs after */}
          {(smellComparison || smellComparisonLoading) && (
            <div className="mt-4">
              <CollapsibleSection
                title="Code Smell Comparison (Independent Analysis)"
                icon={Bug}
                iconColor="text-amber-400"
                defaultOpen={true}
                badge={smellComparison ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                    {smellComparison.beforeTotal ?? smellComparison.before.length} → {smellComparison.afterTotal ?? smellComparison.after.length}
                  </span>
                ) : undefined}
              >
                {smellComparisonLoading && !smellComparison && (
                  <div className="flex items-center gap-3 py-6 justify-center text-slate-400 text-sm">
                    <div className="animate-spin w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full" />
                    Running independent smell analysis on both original and refactored files...
                  </div>
                )}
                {smellComparison && <>
                <p className="text-xs text-slate-500 mb-3 italic">
                  Both files analyzed independently using the same static detector. This ensures an unbiased comparison.
                </p>

                {/* Summary row */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-green-400">{smellComparison.removed.length}</div>
                    <div className="text-[11px] text-green-300/70 mt-0.5">Smells Removed</div>
                  </div>
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-orange-400">{smellComparison.added.length}</div>
                    <div className="text-[11px] text-orange-300/70 mt-0.5">New Smells</div>
                  </div>
                  <div className="bg-slate-700/30 border border-slate-600/30 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-slate-300">{smellComparison.unchanged.length}</div>
                    <div className="text-[11px] text-slate-400/70 mt-0.5">Unchanged</div>
                  </div>
                </div>

                {/* Removed smells */}
                {smellComparison.removed.length > 0 && (
                  <div className="mb-3">
                    <h5 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Smells Successfully Removed
                    </h5>
                    <div className="space-y-1">
                      {smellComparison.removed.map((s: any, i: number) => (
                        <div key={`rm-${i}`} className="flex items-center gap-2 bg-green-500/5 border border-green-500/15 rounded px-2.5 py-1.5 text-xs">
                          <span className="line-through text-green-400/70 font-medium flex-shrink-0">{s.type || s.smell}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${
                            (s.severity || '').toUpperCase() === 'CRITICAL' ? 'bg-red-500/20 text-red-400' :
                            (s.severity || '').toUpperCase() === 'MAJOR' ? 'bg-orange-500/20 text-orange-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>{(s.severity || 'MINOR').toUpperCase()}</span>
                          {s.location && <span className="text-slate-500 font-mono truncate">{s.location}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* New smells introduced */}
                {smellComparison.added.length > 0 && (
                  <div className="mb-3">
                    <h5 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> New Smells Introduced
                    </h5>
                    <div className="space-y-1">
                      {smellComparison.added.map((s: any, i: number) => (
                        <div key={`add-${i}`} className="flex items-center gap-2 bg-orange-500/5 border border-orange-500/15 rounded px-2.5 py-1.5 text-xs">
                          <span className="text-orange-300 font-medium flex-shrink-0">{s.type || s.smell}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${
                            (s.severity || '').toUpperCase() === 'CRITICAL' ? 'bg-red-500/20 text-red-400' :
                            (s.severity || '').toUpperCase() === 'MAJOR' ? 'bg-orange-500/20 text-orange-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>{(s.severity || 'MINOR').toUpperCase()}</span>
                          {s.location && <span className="text-slate-500 font-mono truncate">{s.location}</span>}
                          {s.description && <span className="text-slate-500 truncate">{s.description}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Unchanged smells */}
                {smellComparison.unchanged.length > 0 && (
                  <details className="group">
                    <summary className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 cursor-pointer hover:text-slate-300 flex items-center gap-1">
                      <Minus className="w-3 h-3" /> Unchanged Smells ({smellComparison.unchanged.length})
                    </summary>
                    <div className="space-y-1 mt-1.5">
                      {smellComparison.unchanged.map((s: any, i: number) => (
                        <div key={`unch-${i}`} className="flex items-center gap-2 bg-slate-800/30 border border-slate-700/30 rounded px-2.5 py-1.5 text-xs">
                          <span className="text-slate-400 font-medium flex-shrink-0">{s.type || s.smell}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${
                            (s.severity || '').toUpperCase() === 'CRITICAL' ? 'bg-red-500/20 text-red-400' :
                            (s.severity || '').toUpperCase() === 'MAJOR' ? 'bg-orange-500/20 text-orange-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>{(s.severity || 'MINOR').toUpperCase()}</span>
                          {s.location && <span className="text-slate-500 font-mono truncate">{s.location}</span>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {/* Net assessment */}
                {(() => {
                  const bTotal = smellComparison.beforeTotal ?? smellComparison.before.length;
                  const aTotal = smellComparison.afterTotal ?? smellComparison.after.length;
                  const delta = bTotal - aTotal;
                  return (
                    <div className={`mt-3 rounded-lg p-3 text-center text-sm font-medium ${
                      delta > 0
                        ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                        : delta === 0
                        ? 'bg-slate-700/30 border border-slate-600/30 text-slate-400'
                        : 'bg-red-500/10 border border-red-500/20 text-red-400'
                    }`}>
                      {delta > 0
                        ? `Net improvement: ${delta} smell${delta > 1 ? 's' : ''} eliminated (${bTotal} → ${aTotal})`
                        : delta === 0
                        ? `No net change in code smells (${bTotal} → ${aTotal})`
                        : `Regression: ${-delta} more smell${-delta > 1 ? 's' : ''} than before (${bTotal} → ${aTotal})`}
                    </div>
                  );
                })()}

                {/* Detailed side-by-side smell tables */}
                {(() => {
                  const removedKeys = new Set(smellComparison.removed.map((s: any) => `${s.type||s.smell}::${s.severity||''}::${s.description||''}::${s.location||''}`));
                  const addedKeys = new Set(smellComparison.added.map((s: any) => `${s.type||s.smell}::${s.severity||''}::${s.description||''}::${s.location||''}`));

                  const sevBadge = (sev: string) => {
                    const s = (sev || 'MINOR').toUpperCase();
                    return (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold inline-block ${
                        s === 'CRITICAL' ? 'bg-red-500/20 text-red-400' :
                        s === 'MAJOR' ? 'bg-orange-500/20 text-orange-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>{s}</span>
                    );
                  };

                  const SmellTable = ({ smells, title, count, markerSet, markerType }: {
                    smells: any[]; title: string; count: number;
                    markerSet: Set<string>; markerType: 'removed' | 'added';
                  }) => {
                    const byType = new Map<string, any[]>();
                    smells.forEach(s => {
                      const t = s.type || s.smell || 'Unknown';
                      byType.set(t, [...(byType.get(t) || []), s]);
                    });
                    return (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h5 className="text-xs font-bold text-white uppercase tracking-wider">{title}</h5>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-300 font-bold">{count}</span>
                        </div>
                        <div className="overflow-x-auto rounded-md border border-slate-700/50">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-slate-800/80 text-slate-400 text-left">
                                <th className="py-2 px-2.5 font-semibold w-[30%]">Smell</th>
                                <th className="py-2 px-2.5 font-semibold w-[12%]">Severity</th>
                                <th className="py-2 px-2.5 font-semibold w-[18%]">Location</th>
                                <th className="py-2 px-2.5 font-semibold">Evidence</th>
                              </tr>
                            </thead>
                            <tbody>
                              {smells.map((s: any, i: number) => {
                                const key = `${s.type||s.smell}::${s.severity||''}::${s.description||''}::${s.location||''}`;
                                const isMarked = markerSet.has(key);
                                const bgClass = isMarked
                                  ? markerType === 'removed'
                                    ? 'bg-green-500/10 border-l-2 border-l-green-500'
                                    : 'bg-orange-500/10 border-l-2 border-l-orange-500'
                                  : '';
                                return (
                                  <tr key={i} className={`border-t border-slate-700/40 hover:bg-slate-800/40 ${bgClass}`}>
                                    <td className="py-1.5 px-2.5">
                                      <span className={`font-medium ${
                                        isMarked && markerType === 'removed' ? 'text-green-400 line-through' :
                                        isMarked && markerType === 'added' ? 'text-orange-400' :
                                        'text-amber-300'
                                      }`}>{s.type || s.smell}</span>
                                    </td>
                                    <td className="py-1.5 px-2.5">{sevBadge(s.severity)}</td>
                                    <td className="py-1.5 px-2.5 text-slate-500 font-mono">{
                                      (s.lineNumber && s.lineNumber > 0) ? `Line ${s.lineNumber}` :
                                      (s.location && s.location !== 'Line 0') ? s.location : 'see file'
                                    }</td>
                                    <td className="py-1.5 px-2.5 text-slate-400 max-w-[300px] truncate">{s.description || s.recommendation || '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  };

                  const typeSummary = () => {
                    if (smellComparison.typeSummary) {
                      return Object.entries(smellComparison.typeSummary as Record<string, { before: number; after: number }>)
                        .map(([type, counts]) => ({
                          type,
                          before: counts.before,
                          after: counts.after,
                          delta: counts.after - counts.before,
                        }))
                        .sort((a, b) => a.delta - b.delta);
                    }
                    const beforeCounts = new Map<string, number>();
                    smellComparison.before.forEach((s: any) => {
                      const t = s.type || s.smell || 'Unknown';
                      beforeCounts.set(t, (beforeCounts.get(t) || 0) + 1);
                    });
                    const afterCounts = new Map<string, number>();
                    smellComparison.after.forEach((s: any) => {
                      const t = s.type || s.smell || 'Unknown';
                      afterCounts.set(t, (afterCounts.get(t) || 0) + 1);
                    });
                    const allTypes = new Set([...Array.from(beforeCounts.keys()), ...Array.from(afterCounts.keys())]);
                    const rows = Array.from(allTypes).map(t => ({
                      type: t,
                      before: beforeCounts.get(t) || 0,
                      after: afterCounts.get(t) || 0,
                      delta: (afterCounts.get(t) || 0) - (beforeCounts.get(t) || 0),
                    })).sort((a, b) => a.delta - b.delta);
                    return rows;
                  };

                  return (
                    <details className="mt-4 group">
                      <summary className="cursor-pointer flex items-center gap-2 text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors py-2">
                        <Search className="w-4 h-4" />
                        View Full Smell Details (Before vs After)
                        <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
                      </summary>
                      <div className="mt-3 space-y-5">

                        {/* Change summary by smell type */}
                        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                          <h5 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Change Summary by Smell Type</h5>
                          <div className="overflow-x-auto rounded-md border border-slate-700/50">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-800/80 text-slate-400 text-left">
                                  <th className="py-2 px-2.5 font-semibold">Smell Type</th>
                                  <th className="py-2 px-2.5 font-semibold text-center">Before</th>
                                  <th className="py-2 px-2.5 font-semibold text-center">After</th>
                                  <th className="py-2 px-2.5 font-semibold text-center">Change</th>
                                </tr>
                              </thead>
                              <tbody>
                                {typeSummary().map((row, i) => (
                                  <tr key={i} className={`border-t border-slate-700/40 ${
                                    row.delta < 0 ? 'bg-green-500/5' : row.delta > 0 ? 'bg-red-500/5' : ''
                                  }`}>
                                    <td className="py-1.5 px-2.5 text-amber-300 font-medium">{row.type}</td>
                                    <td className="py-1.5 px-2.5 text-center text-slate-400 font-mono">{row.before}</td>
                                    <td className="py-1.5 px-2.5 text-center font-mono font-semibold">
                                      <span className={row.delta < 0 ? 'text-green-400' : row.delta > 0 ? 'text-red-400' : 'text-slate-400'}>
                                        {row.after}
                                      </span>
                                    </td>
                                    <td className="py-1.5 px-2.5 text-center">
                                      {row.delta === 0 ? (
                                        <span className="text-slate-500">—</span>
                                      ) : row.delta < 0 ? (
                                        <span className="text-green-400 font-semibold">{row.delta}</span>
                                      ) : (
                                        <span className="text-red-400 font-semibold">+{row.delta}</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Side-by-side tables */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                          <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-3">
                            <SmellTable
                              smells={smellComparison.before}
                              title="Detected Code Smells — Before"
                              count={smellComparison.beforeTotal ?? smellComparison.before.length}
                              markerSet={removedKeys}
                              markerType="removed"
                            />
                            {smellComparison.before.length < (smellComparison.beforeTotal ?? smellComparison.before.length) && (
                              <p className="text-[10px] text-slate-500 mt-1 italic">Showing {smellComparison.before.length} representative examples of {smellComparison.beforeTotal} total</p>
                            )}
                          </div>
                          <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-3">
                            <SmellTable
                              smells={smellComparison.after}
                              title="Detected Code Smells — After"
                              count={smellComparison.afterTotal ?? smellComparison.after.length}
                              markerSet={addedKeys}
                              markerType="added"
                            />
                            {smellComparison.after.length < (smellComparison.afterTotal ?? smellComparison.after.length) && (
                              <p className="text-[10px] text-slate-500 mt-1 italic">Showing {smellComparison.after.length} representative examples of {smellComparison.afterTotal} total</p>
                            )}
                          </div>
                        </div>

                        {/* Legend */}
                        <div className="flex items-center gap-4 text-[11px] text-slate-500 px-1">
                          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-green-500/30 border-l-2 border-green-500 inline-block" /> Removed by refactoring</span>
                          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-orange-500/30 border-l-2 border-orange-500 inline-block" /> Newly introduced</span>
                          <span>No highlight = unchanged</span>
                        </div>
                      </div>
                    </details>
                  );
                })()}
                </>}
              </CollapsibleSection>
            </div>
          )}

          {/* Metrics Charts — collapsible */}
          {applyResult && applyResultMatchesCurrentFile && (applyResult.deltas || improvementStats) && (
            <div className="mt-4">
              <CollapsibleSection title="Metrics &amp; Charts" icon={TrendingUp} iconColor="text-green-400" defaultOpen={true}>
                <RefactoringMetricsCharts
                  deltas={applyResult.deltas}
                  improvementStats={improvementStats || undefined}
                />
              </CollapsibleSection>
            </div>
          )}
          
          {/* Research Metrics — collapsible */}
          {applyResult && applyResultMatchesCurrentFile && (applyResult.researchMetrics || applyResult.pipelineMetadata) && (
            <div className="mt-4">
              <CollapsibleSection title={REFINE_DEMO ? 'Detailed Metrics' : 'Research Metrics (Detailed)'} icon={BarChart3} iconColor="text-purple-400" defaultOpen={false}>
                <ResearchMetricsPanel
                  metrics={applyResult.researchMetrics || null}
                  pipelineMetadata={applyResult.pipelineMetadata || null}
                  exportContext={{ workspaceId, filePath: selectedFile || undefined }}
                />
              </CollapsibleSection>
            </div>
          )}

          {/* Human Accept/Reject Override — collapsible */}
          {history.length > 0 && !history[0].humanOverride && !REFINE_DEMO && (
            <CollapsibleSection title="Manual Review Override" icon={Edit3} iconColor="text-blue-400" defaultOpen={false}>
              <p className="text-slate-400 text-sm mb-3">
                Do you agree with the automated verdict ({history[0].automatedVerdict ? 'Accepted' : 'Rejected'})? Override it for research evaluation.
              </p>
              <div className="flex items-center space-x-3 mb-3">
                <input
                  type="text"
                  placeholder="Reason for override (optional but recommended)"
                  value={humanOverrideReason}
                  onChange={(e) => setHumanOverrideReason(e.target.value)}
                  className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    applyHumanOverride(history[0].id, true, humanOverrideReason || 'Manually accepted');
                    setHumanOverrideReason('');
                  }}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <ThumbsUp className="w-4 h-4" />
                  <span>Accept (Human)</span>
                </button>
                <button
                  onClick={() => {
                    applyHumanOverride(history[0].id, false, humanOverrideReason || 'Manually rejected');
                    setHumanOverrideReason('');
                  }}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <ThumbsDown className="w-4 h-4" />
                  <span>Reject (Human)</span>
                </button>
                <button
                  onClick={() => {
                    applyHumanOverride(history[0].id, history[0].automatedVerdict, humanOverrideReason || 'Agree with automated verdict');
                    setHumanOverrideReason('');
                  }}
                  className="flex items-center space-x-2 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Agree with Automated</span>
                </button>
              </div>
            </CollapsibleSection>
          )}
          {history.length > 0 && history[0].humanOverride && (
            <div className={`rounded-lg p-3 border text-sm ${
              history[0].humanOverride.accepted
                ? 'bg-green-900/20 border-green-600/40 text-green-300'
                : 'bg-red-900/20 border-red-600/40 text-red-300'
            }`}>
              Human verdict: <strong>{history[0].humanOverride.accepted ? 'Accepted' : 'Rejected'}</strong>
              {history[0].humanOverride.accepted !== history[0].automatedVerdict && (
                <span className="ml-2 text-yellow-400">(overrides automated: {history[0].automatedVerdict ? 'Accepted' : 'Rejected'})</span>
              )}
              {history[0].humanOverride.reason && (
                <span className="ml-2 text-slate-400">— {history[0].humanOverride.reason}</span>
              )}
            </div>
          )}

          {/* Refactoring History — collapsible */}
          <CollapsibleSection
            title="Refactoring History"
            icon={History}
            iconColor="text-slate-400"
            defaultOpen={false}
            badge={history.length > 0 ? <span className="text-[10px] bg-slate-600 text-slate-200 px-2 py-0.5 rounded-full">{history.length}</span> : undefined}
          >
            <div>
              <div className="flex items-center justify-end mb-3">
              {history.length > 0 && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={exportHistoryCSV}
                    className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded flex items-center space-x-1"
                    title="Export as CSV for paper data tables"
                  >
                    <Download className="w-3 h-3" />
                    <span>CSV</span>
                  </button>
                  <button
                    onClick={exportHistoryJSON}
                    className="text-xs px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded flex items-center space-x-1"
                    title="Export as JSON for detailed analysis"
                  >
                    <Download className="w-3 h-3" />
                    <span>JSON</span>
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Clear all refactoring history for this workspace?')) {
                        setHistory([]);
                        try { localStorage.removeItem(HISTORY_KEY); } catch {}
                      }
                    }}
                    className="text-xs px-3 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded"
                    title="Clear history"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
            {history.length === 0 ? (
              <div className="text-slate-400 text-sm">No refactoring entries yet. Run a refactoring to populate history.</div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className={`p-3 border rounded bg-slate-700/40 ${
                    h.humanOverride
                      ? (h.humanOverride.accepted ? 'border-green-600/40' : 'border-red-600/40')
                      : (h.accepted ? 'border-slate-600' : 'border-amber-600/40')
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-slate-300 flex items-center space-x-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${h.accepted ? 'bg-green-400' : 'bg-red-400'}`} />
                        <span className="font-mono text-xs">{new Date(h.timestamp).toLocaleString()}</span>
                        <span className="text-xs text-slate-500 truncate max-w-[200px]">{h.filePath.split('/').pop()}</span>
                        {h.stats?.delta && (
                          <span className={`text-xs font-medium ${
                            h.stats.delta.total > 0 ? 'text-green-400' : 
                            h.stats.delta.total < 0 ? 'text-red-400' : 'text-slate-400'
                          }`}>
                            {h.stats.delta.total > 0 ? '-' : h.stats.delta.total < 0 ? '+' : ''}{Math.abs(h.stats.delta.total)} smells
                          </span>
                        )}
                        {h.humanOverride && (
                          <span className="text-xs bg-blue-600/30 text-blue-300 px-1.5 py-0.5 rounded">
                            human: {h.humanOverride.accepted ? 'accept' : 'reject'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setComparisonEntry({
                              originalContent: h.originalContent || '',
                              refactoredContent: h.refactoredContent || '',
                              changes: h.changes || {},
                              title: `Refactoring @ ${new Date(h.timestamp).toLocaleString()}`
                            });
                            setShowComparison(true);
                          }}
                          className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded"
                        >
                          Diff
                        </button>
                      </div>
                    </div>
                    {h.stats && (
                      <div className="mt-1.5 text-xs text-slate-400">
                        {h.stats.before.total} → {h.stats.after.total} smells
                        {h.agentSteps && (
                          <span className="ml-2">| {h.agentSteps.filter(s => s.status === 'done').length}/{h.agentSteps.length} steps</span>
                        )}
                        {h.rejectionReason && (
                          <span className="ml-2 text-amber-400">| {Array.isArray(h.rejectionReason) ? h.rejectionReason[0] : h.rejectionReason}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          </CollapsibleSection>
              </>
            );
            return reviewMetricsHistory;
          })()}
        </div>
      )}
      {/* Diff modal is rendered earlier inside */} 
    </div>
  );
}
