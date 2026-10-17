'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  CheckCircle2,
  Download,
  Eye,
  FileSearch,
  GitBranch,
  Layers,
  Lock,
  Play,
  RefreshCw,
  Shield,
  Sparkles,
  Table2,
  AlertTriangle,
  Workflow,
} from 'lucide-react';
import RippleRefFileGraphView from './RippleRefFileGraphView';
import RippleRefResultsTable from './RippleRefResultsTable';
import RippleRefStudyStatusBar, { type ExperimentProgress } from './RippleRefStudyStatusBar';
import MaRefAgentPipelineView from './MaRefAgentPipelineView';
import MaRefPipelinePanel from './MaRefPipelinePanel';
import VerificationMetricsPanel from './VerificationMetricsPanel';
import {
  MA_PLANNED_CANDIDATES,
  MA_REF_MASTER_STUDY_ID,
  MA_VARIANT,
  COHORT_SOURCE_STUDY_ID,
  buildMaRefCandidateQueue,
  computeMaRepoProgress,
  fetchAgentsHealth,
  fetchMaRefAgentTrace,
  fetchMaVerificationSummaries,
  formatMaLivePhase,
  getMaRefStudy,
  isStudyIncomplete,
  isStudyLiveExecution,
  maRefIntegrityPreflight,
  refreshMaRefStudyStatus,
  rippleRefExportInfo,
  rippleRefPreflight,
  runMaRefCandidate,
  setupMaRefStudy,
  subscribeMaRefLiveStream,
  buildRippleRefContexts,
  fetchRippleRefFileGraph,
  type AgentTracePayload,
  type CandidateResultsResponse,
  type CompletenessReport,
  type IntegrityPreflight,
  type RippleRefFileGraph,
  type RippleRefLiveStatus,
  type StudyState,
  type VerificationSummary,
} from '../lib/maRefStudy';

type ProjectRow = { id: string; name: string };

const STORAGE_KEY = 'ma-ref-study-active';

type TabId =
  | 'cohort'
  | 'selection'
  | 'context'
  | 'observability'
  | 'pipeline'
  | 'experiment'
  | 'collection'
  | 'results'
  | 'export';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'cohort', label: 'Cohort Lock', icon: Lock },
  { id: 'selection', label: 'Locked Files', icon: FileSearch },
  { id: 'context', label: 'Dependency Context', icon: GitBranch },
  { id: 'observability', label: 'Agent Observability', icon: Eye },
  { id: 'pipeline', label: 'Autonomous Pipeline', icon: Workflow },
  { id: 'experiment', label: 'Run Experiment', icon: Play },
  { id: 'collection', label: 'Data Collection', icon: Activity },
  { id: 'results', label: 'Results', icon: Table2 },
  { id: 'export', label: 'Export Dataset', icon: Download },
];

export default function MaRefStudyPanel({ projects }: { projects: ProjectRow[] }) {
  const [activeTab, setActiveTab] = useState<TabId>('cohort');
  const [study, setStudy] = useState<StudyState | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityPreflight | null>(null);
  const [agentsHealth, setAgentsHealth] = useState<{ multiLlmAgentMode?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [preflight, setPreflight] = useState<{
    ready: boolean;
    plannedRuns: number;
    issues: string[];
    warnings: string[];
  } | null>(null);
  const [exportInfo, setExportInfo] = useState<{
    studyDir: string;
    completeness: { completionPercentage: number; completedRuns: number; plannedRuns: number };
  } | null>(null);
  const [graphFile, setGraphFile] = useState<{ workspaceId: string; filePath: string } | null>(null);
  const [fileGraph, setFileGraph] = useState<RippleRefFileGraph | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [results, setResults] = useState<CandidateResultsResponse | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [completeness, setCompleteness] = useState<CompletenessReport | null>(null);
  const [verificationMa, setVerificationMa] = useState<VerificationSummary | null>(null);
  const [verificationB0, setVerificationB0] = useState<VerificationSummary | null>(null);
  const [liveStatus, setLiveStatus] = useState<RippleRefLiveStatus | null>(null);
  const [statusRefreshing, setStatusRefreshing] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);
  const [lastStreamAt, setLastStreamAt] = useState<number | null>(null);
  const lastCompletedRef = React.useRef<number>(-1);
  const [experimentProgress, setExperimentProgress] = useState<ExperimentProgress>({
    running: false,
    phase: 'idle',
    planned: MA_PLANNED_CANDIDATES,
    completed: 0,
    failed: 0,
    skipped: 0,
    ranThisSession: 0,
  });
  const experimentAbortRef = React.useRef(false);
  const [traceTarget, setTraceTarget] = useState<{
    workspaceId: string;
    filePath: string;
    modelId: string;
  } | null>(null);
  const [agentTrace, setAgentTrace] = useState<AgentTracePayload | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);

  const appendLog = useCallback((msg: string) => {
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 100));
  }, []);

  const projectNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projects) map[p.id] = p.name;
    return map;
  }, [projects]);

  const repoProgress = useMemo(() => {
    if (!study) return [];
    return computeMaRepoProgress(study, projectNameById);
  }, [study, projectNameById]);

  const liveMonitoring = useMemo(
    () =>
      isStudyLiveExecution(liveStatus?.liveCandidate, experimentProgress.running) ||
      (isStudyIncomplete(completeness) &&
        (study?.status === 'running' || !!liveStatus?.liveCandidate)),
    [liveStatus?.liveCandidate, experimentProgress.running, completeness, study?.status]
  );

  const batchStalled = useMemo(
    () => isStudyIncomplete(completeness) && !liveMonitoring && !experimentProgress.running,
    [completeness, liveMonitoring, experimentProgress.running]
  );

  const totalSelected = useMemo(() => {
    if (!study?.selectedByRepo) return 0;
    return Object.values(study.selectedByRepo).reduce((n, arr) => n + (arr?.length ?? 0), 0);
  }, [study]);

  const loadStudy = useCallback(
    async (quiet = false) => {
      const loaded = await getMaRefStudy();
      setStudy(loaded);
      setIntegrity(await maRefIntegrityPreflight());
      setAgentsHealth(await fetchAgentsHealth());
      if (!quiet) appendLog(`Loaded study ${MA_REF_MASTER_STUDY_ID}`);
      return loaded;
    },
    [appendLog]
  );

  const applyLiveSnapshot = useCallback((snapshot: RippleRefLiveStatus, fromStream = false) => {
    setLiveStatus(snapshot);
    setCompleteness(snapshot.completeness);
    if (fromStream) {
      setStreamConnected(true);
      setLastStreamAt(Date.now());
    }
    const live = snapshot.liveCandidate;
    setExperimentProgress((prev) => ({
      ...prev,
      planned: snapshot.completeness.plannedRuns,
      completed: snapshot.completeness.completedRuns,
      failed: snapshot.completeness.failedGenerations,
      currentLabel: live
        ? `${live.variant} · ${live.modelDisplayName ?? live.modelId} · ${live.fileName ?? live.filePath.split('/').pop()}`
        : prev.currentLabel,
      phase: live ? 'candidate' : prev.running ? prev.phase : prev.phase,
      lastMessage: live
        ? `${formatMaLivePhase(live.phase)} — ${live.modelDisplayName ?? live.modelId}`
        : snapshot.completeness.plannedRuns > 0
          ? `${snapshot.completeness.completedRuns + snapshot.completeness.failedGenerations}/${snapshot.completeness.plannedRuns} · ${snapshot.completeness.missingArtifacts} remaining`
          : prev.lastMessage,
    }));
    const done = snapshot.completeness.completedRuns;
    if (done !== lastCompletedRef.current) {
      lastCompletedRef.current = done;
      void refreshMaRefStudyStatus().then((s) => {
        setStudy(s.study);
        setResults(s.results);
      });
    }
  }, []);

  const refreshStudyStatus = useCallback(async () => {
    setStatusRefreshing(true);
    try {
      const snapshot = await refreshMaRefStudyStatus();
      setStudy(snapshot.study);
      setCompleteness(snapshot.completeness);
      setResults(snapshot.results);
      applyLiveSnapshot(snapshot.liveStatus);
      const ver = await fetchMaVerificationSummaries();
      setVerificationMa(ver.ma);
      setVerificationB0(ver.b0);
      setIntegrity(await maRefIntegrityPreflight());
      setAgentsHealth(await fetchAgentsHealth());
      const info = await rippleRefExportInfo(MA_REF_MASTER_STUDY_ID);
      setExportInfo({ studyDir: info.studyDir, completeness: info.completeness });
    } catch (e) {
      appendLog(`Status refresh error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setStatusRefreshing(false);
    }
  }, [appendLog, applyLiveSnapshot]);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        await setupMaRefStudy();
        if (!cancelled) await refreshStudyStatus();
      } catch (e) {
        if (!cancelled) {
          appendLog(`Bootstrap error: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [appendLog, refreshStudyStatus]);

  useEffect(() => {
    if (study?.config?.studyId) {
      sessionStorage.setItem(STORAGE_KEY, '1');
    }
  }, [study?.config?.studyId]);

  useEffect(() => {
    const unsub = subscribeMaRefLiveStream(MA_REF_MASTER_STUDY_ID, (status) =>
      applyLiveSnapshot(status, true)
    );
    return unsub;
  }, [applyLiveSnapshot]);

  useEffect(() => {
    if (streamConnected) return;
    const timer = window.setInterval(() => void refreshStudyStatus(), 8000);
    return () => window.clearInterval(timer);
  }, [streamConnected, refreshStudyStatus]);

  useEffect(() => {
    if (activeTab === 'results' && study) void refreshStudyStatus();
  }, [activeTab, study, refreshStudyStatus]);

  const loadFileGraph = useCallback(async (workspaceId: string, filePath: string) => {
    setGraphFile({ workspaceId, filePath });
    setGraphLoading(true);
    setGraphError(null);
    try {
      const graph = await fetchRippleRefFileGraph(MA_REF_MASTER_STUDY_ID, workspaceId, filePath);
      setFileGraph(graph);
    } catch (e) {
      setFileGraph(null);
      setGraphError(e instanceof Error ? e.message : String(e));
    } finally {
      setGraphLoading(false);
    }
  }, []);

  const loadAgentTrace = useCallback(
    async (workspaceId: string, filePath: string, modelId: string) => {
      setTraceTarget({ workspaceId, filePath, modelId });
      setTraceLoading(true);
      try {
        const trace = await fetchMaRefAgentTrace(
          MA_REF_MASTER_STUDY_ID,
          workspaceId,
          filePath,
          modelId
        );
        setAgentTrace(trace);
        if (!trace) appendLog(`No agent trace for ${filePath.split('/').pop()} · ${modelId.split('/').pop()}`);
      } finally {
        setTraceLoading(false);
      }
    },
    [appendLog]
  );

  useEffect(() => {
    const live = liveStatus?.liveCandidate;
    if (!live || (activeTab !== 'observability' && !experimentProgress.running)) return;
    const timer = window.setInterval(() => {
      void loadAgentTrace(live.workspaceId, live.filePath, live.modelId);
    }, 4000);
    void loadAgentTrace(live.workspaceId, live.filePath, live.modelId);
    return () => window.clearInterval(timer);
  }, [
    activeTab,
    experimentProgress.running,
    liveStatus?.liveCandidate?.workspaceId,
    liveStatus?.liveCandidate?.filePath,
    liveStatus?.liveCandidate?.modelId,
    loadAgentTrace,
  ]);

  const openObservabilityForRow = useCallback(
    (row: { projectId: string; filePath: string; modelId: string }) => {
      setActiveTab('observability');
      void loadAgentTrace(row.projectId, row.filePath, row.modelId);
    },
    [loadAgentTrace]
  );

  const runSetup = async () => {
    setBusy(true);
    try {
      const s = await setupMaRefStudy();
      setStudy(s);
      setIntegrity(await maRefIntegrityPreflight());
      sessionStorage.setItem(STORAGE_KEY, '1');
      appendLog('Cohort locked from ripple_ref_master (150 files)');
      await refreshStudyStatus();
    } catch (e) {
      appendLog(`Setup error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const runContexts = async () => {
    setBusy(true);
    try {
      const built = await buildRippleRefContexts(MA_REF_MASTER_STUDY_ID);
      setStudy(built);
      appendLog('Dependency context packages built');
    } catch (e) {
      appendLog(`Context error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const runPreflight = async () => {
    const pf = await rippleRefPreflight(MA_REF_MASTER_STUDY_ID);
    setPreflight(pf);
    const integ = await maRefIntegrityPreflight();
    setIntegrity(integ);
    const ready = pf.ready && integ.integrityOk;
    appendLog(ready ? 'Preflight + integrity OK' : `Issues: ${[...pf.issues, ...integ.integrityIssues].join('; ')}`);
    return { ...pf, ready };
  };

  const stopExperiment = () => {
    experimentAbortRef.current = true;
    appendLog('Stop requested — finishing current candidate…');
  };

  const runExperiment = async (maxCandidates?: number) => {
    if (!study) return;
    experimentAbortRef.current = false;
    setActiveTab('observability');
    setBusy(true);
    setExperimentProgress({
      running: true,
      phase: 'preflight',
      planned: MA_PLANNED_CANDIDATES,
      completed: 0,
      failed: 0,
      skipped: 0,
      ranThisSession: 0,
    });
    try {
      const pf = await runPreflight();
      if (!pf?.ready) {
        setExperimentProgress((p) => ({ ...p, running: false, phase: 'error' }));
        return;
      }
      if (agentsHealth?.multiLlmAgentMode !== 'full') {
        appendLog('WARN: MULTI_LLM_AGENT_MODE should be full in agents/.env');
      }

      let currentStudy = await getMaRefStudy();
      const queue = buildMaRefCandidateQueue(currentStudy);
      const completedKeys = new Set(currentStudy.completedCandidates ?? []);
      const pending = queue.filter((item) => !completedKeys.has(item.pairKey));
      const toRun = maxCandidates ? pending.slice(0, maxCandidates) : pending;

      setExperimentProgress((p) => ({
        ...p,
        phase: 'candidate',
        planned: queue.length,
        completed: completedKeys.size,
        skipped: queue.length - pending.length,
      }));
      appendLog(`Starting MA runner: ${toRun.length} candidate(s)`);

      let ran = 0;
      let failed = currentStudy.failedCandidates?.length ?? 0;
      for (const item of toRun) {
        if (experimentAbortRef.current) break;
        const label = `MA · ${item.modelId.split('/').pop()} · ${item.filePath.split('/').pop()}`;
        setExperimentProgress((p) => ({
          ...p,
          phase: 'candidate',
          currentLabel: label,
          lastMessage: `Running ${label}`,
        }));
        appendLog(`→ ${label}`);
        try {
          const result = await runMaRefCandidate(item);
          ran += 1;
          if (result.status !== 'completed') failed += 1;
          const risk = result.rippleReport?.riskLevel ?? '—';
          appendLog(
            `✓ ${label} — ${result.status} · steps=${result.agentStepCount ?? '?'} · ripple=${risk}`
          );
        } catch (e) {
          failed += 1;
          appendLog(`✗ ${label} — ${e instanceof Error ? e.message : String(e)}`);
        }
        currentStudy = await getMaRefStudy();
        setStudy(currentStudy);
        setExperimentProgress((p) => ({
          ...p,
          completed: (currentStudy.completedCandidates ?? []).length,
          failed,
          ranThisSession: ran,
        }));
        await refreshStudyStatus();
      }

      setExperimentProgress((p) => ({
        ...p,
        running: false,
        phase: experimentAbortRef.current ? 'idle' : 'done',
        currentLabel: undefined,
      }));
      appendLog(`Experiment session finished (${ran} ran)`);
    } catch (e) {
      appendLog(`Experiment error: ${e instanceof Error ? e.message : String(e)}`);
      setExperimentProgress((p) => ({ ...p, running: false, phase: 'error' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      id="ma-ref-study"
      className="rounded-xl border border-fuchsia-500/30 bg-slate-900/60 p-5 space-y-4 scroll-mt-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Sparkles className="w-7 h-7 text-fuchsia-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-fuchsia-200">Multi-Agent Study (P-MA)</h2>
            <p className="text-sm text-slate-400 max-w-2xl">
              LangGraph v2.0 · 6 headline agents · locked cohort from B0 · variant{' '}
              <code className="text-fuchsia-300">{MA_VARIANT}</code> only · 750 candidates
            </p>
          </div>
        </div>
        <span className="text-xs font-mono text-fuchsia-300/80 bg-fuchsia-950/50 px-2 py-1 rounded">
          {MA_REF_MASTER_STUDY_ID}
        </span>
      </div>

      {study && (
        <RippleRefStudyStatusBar
          studyId={MA_REF_MASTER_STUDY_ID}
          studyStatus={study.status}
          progress={experimentProgress}
          completeness={completeness}
          summary={results?.summary ?? null}
          liveCandidate={liveStatus?.liveCandidate ?? null}
          lastCompleted={liveStatus?.lastCompleted ?? null}
          fileProgress={liveStatus?.fileProgress ?? []}
          repoProgress={repoProgress}
          projectNames={projectNameById}
          liveMonitoring={liveMonitoring}
          batchStalled={batchStalled}
          streamConnected={streamConnected}
          lastStreamAt={lastStreamAt}
          onRefresh={() => void refreshStudyStatus()}
          refreshing={statusRefreshing}
          formatPhase={formatMaLivePhase}
          candidatesPerFileLabel="5 models × MA (1 variant)"
        />
      )}

      {!study && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm text-slate-400">
          Click <strong className="text-fuchsia-300">Setup &amp; lock cohort</strong> on the Cohort
          Lock tab to load <code className="text-fuchsia-300">{MA_REF_MASTER_STUDY_ID}</code>.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${
              activeTab === id
                ? 'bg-fuchsia-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-3 text-sm">
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-slate-400 text-xs">Planned candidates</div>
          <div className="text-xl font-semibold text-white">{MA_PLANNED_CANDIDATES}</div>
          <div className="text-xs text-slate-500">150 files × 5 models × 1 variant (MA)</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-slate-400 text-xs">Cohort source</div>
          <div className="text-lg font-medium text-fuchsia-200">{COHORT_SOURCE_STUDY_ID}</div>
          <div className="text-xs text-slate-500">{totalSelected || '—'} locked files</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-slate-400 text-xs">Agents mode</div>
          <div className="text-lg font-medium text-violet-200">
            {agentsHealth?.multiLlmAgentMode ?? 'unknown'}
          </div>
          <div className="text-xs text-slate-500">requires: full</div>
        </div>
      </div>

      {activeTab === 'cohort' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Imports the exact 150-file cohort from B0 — no re-sampling. Integrity preflight must pass
            before experiments.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runSetup()}
            className="flex items-center gap-2 px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 rounded-lg text-sm"
          >
            <Shield className="w-4 h-4" />
            Setup &amp; lock cohort
          </button>
          {integrity && (
            <div
              className={`text-sm p-3 rounded-lg border ${
                integrity.integrityOk
                  ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-100'
                  : 'border-amber-500/40 bg-amber-950/30 text-amber-100'
              }`}
            >
              {integrity.integrityOk ? (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Integrity OK — {integrity.cohortFileCount}{' '}
                  files locked
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> {integrity.integrityIssues.join(', ')}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'selection' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Read-only view of locked stratified files (same as B0). Click a file for dependency graph.
          </p>
          {study?.selectedByRepo &&
            Object.entries(study.selectedByRepo).map(([repo, files]) => (
              <div key={repo}>
                <h4 className="text-sm font-medium text-fuchsia-200 mb-1">
                  {projectNameById[repo] ?? repo}
                </h4>
                <ul className="text-xs space-y-1 max-h-48 overflow-y-auto">
                  {(files ?? []).map((f) => (
                    <li key={f.filePath}>
                      <button
                        type="button"
                        onClick={() => void loadFileGraph(repo, f.filePath)}
                        className={`flex gap-2 w-full text-left px-2 py-1 rounded hover:bg-slate-800 ${
                          graphFile?.filePath === f.filePath ? 'bg-fuchsia-900/40' : ''
                        }`}
                      >
                        <span className="truncate flex-1 text-slate-300">{f.filePath}</span>
                        <span className="text-slate-500">{f.samplingGroup}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          <RippleRefFileGraphView graph={fileGraph} loading={graphLoading} error={graphError} />
        </div>
      )}

      {activeTab === 'context' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Same dependency context packages as B0-V2 — consumed by A2 Dependency Context Agent.
          </p>
          <button
            type="button"
            disabled={busy || !study}
            onClick={() => void runContexts()}
            className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg text-sm"
          >
            Build dependency contexts
          </button>
          {study?.selectedByRepo && (
            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
              {Object.entries(study.selectedByRepo).flatMap(([repo, files]) =>
                (files ?? []).map((f) => (
                  <button
                    key={`${repo}:${f.filePath}`}
                    type="button"
                    onClick={() => void loadFileGraph(repo, f.filePath)}
                    className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-800"
                  >
                    {f.filePath.split('/').pop()}
                  </button>
                ))
              )}
            </div>
          )}
          <RippleRefFileGraphView graph={fileGraph} loading={graphLoading} error={graphError} />
        </div>
      )}

      {activeTab === 'observability' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Live LangGraph pipeline status and per-candidate agent traces (paper evidence).
          </p>
          <MaRefAgentPipelineView
            trace={agentTrace}
            loading={traceLoading}
            livePhase={liveStatus?.liveCandidate?.phase}
            formatPhase={formatMaLivePhase}
          />
          {results?.rows && results.rows.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-fuchsia-200 mb-2 flex items-center gap-2">
                <Bot className="w-4 h-4" /> Load trace from completed candidate
              </h4>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {results.rows
                  .filter((r) => r.status === 'completed')
                  .slice(0, 30)
                  .map((r) => (
                    <button
                      key={r.pairKey}
                      type="button"
                      onClick={() => void loadAgentTrace(r.projectId, r.filePath, r.modelId)}
                      className={`block w-full text-left text-xs px-2 py-1 rounded hover:bg-slate-800 ${
                        traceTarget?.filePath === r.filePath && traceTarget?.modelId === r.modelId
                          ? 'bg-fuchsia-900/40'
                          : ''
                      }`}
                    >
                      {r.filePath.split('/').pop()} · {r.modelId.split('/').pop()} · steps=
                      {r.agentStepCount ?? '—'}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'pipeline' && (
        <MaRefPipelinePanel studyId={MA_REF_MASTER_STUDY_ID} onLog={(m) => appendLog(m)} />
      )}

      {activeTab === 'experiment' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Runs LangGraph multi-agent pipeline per file × model. Artifacts + agent traces saved
            immediately.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void runPreflight()}
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
            >
              Preflight + integrity
            </button>
            <button
              type="button"
              disabled={busy || !integrity?.integrityOk}
              onClick={() => void runExperiment(1)}
              className="px-3 py-2 bg-amber-700 hover:bg-amber-600 rounded-lg text-sm"
            >
              Pilot: 1 candidate
            </button>
            <button
              type="button"
              disabled={busy || !integrity?.integrityOk}
              onClick={() => void runExperiment()}
              className="flex items-center gap-2 px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg text-sm"
            >
              <Play className="w-4 h-4" />
              Run full batch
            </button>
            {batchStalled && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runExperiment()}
                className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 rounded-lg text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Resume ({completeness?.missingArtifacts ?? 0} pending)
              </button>
            )}
            {experimentProgress.running && (
              <button
                type="button"
                onClick={stopExperiment}
                className="px-3 py-2 bg-red-900/80 hover:bg-red-800 rounded-lg text-sm"
              >
                Stop after current
              </button>
            )}
          </div>
          {preflight && (
            <div
              className={`text-sm p-3 rounded-lg border ${
                preflight.ready
                  ? 'border-green-500/40 bg-green-950/30'
                  : 'border-amber-500/40 bg-amber-950/30'
              }`}
            >
              {preflight.ready ? (
                <span className="text-green-300">
                  Ready — {preflight.plannedRuns} planned runs
                </span>
              ) : (
                <span className="text-amber-300">{preflight.issues.join('; ')}</span>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'collection' && (
        <div className="space-y-3">
          <VerificationMetricsPanel ma={verificationMa} b0={verificationB0} />
          <p className="text-sm text-slate-400">
            Monitor completeness, agent traces, and ripple reports. L4 heuristics run at generation;
            L5 targeted tests run automatically after MA 750/750 (backfill on saved refactors).
          </p>
          <button
            type="button"
            onClick={() => void refreshStudyStatus()}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh completeness
          </button>
          {exportInfo && (
            <div className="text-sm text-slate-300">
              {exportInfo.completeness.completedRuns} / {exportInfo.completeness.plannedRuns} (
              {exportInfo.completeness.completionPercentage.toFixed(1)}%)
            </div>
          )}
          {repoProgress.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-700">
                    <th className="text-left py-1">System</th>
                    <th className="text-right py-1">Planned</th>
                    <th className="text-right py-1">Done</th>
                    <th className="text-right py-1">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {repoProgress.map((r) => (
                    <tr key={r.workspaceId} className="border-b border-slate-800">
                      <td className="py-1">{r.label}</td>
                      <td className="text-right">{r.planned}</td>
                      <td className="text-right text-emerald-400">{r.completed}</td>
                      <td className="text-right text-red-400">{r.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'results' && (
        <div className="space-y-3">
          <VerificationMetricsPanel ma={verificationMa} b0={verificationB0} compact />
          <button
            type="button"
            onClick={() => void refreshStudyStatus()}
            disabled={resultsLoading}
            className="flex items-center gap-2 px-3 py-2 bg-fuchsia-700 hover:bg-fuchsia-600 rounded-lg text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${resultsLoading ? 'animate-spin' : ''}`} />
            Refresh results
          </button>
          {results?.rows?.length ? (
            <RippleRefResultsTable
              rows={results.rows}
              summary={results.summary}
              studyMode="ma"
              onRowSelect={(row) => openObservabilityForRow(row)}
            />
          ) : (
            <p className="text-sm text-slate-500">No results yet.</p>
          )}
        </div>
      )}

      {activeTab === 'export' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Study folder: <code className="text-fuchsia-300">results_candidates.csv</code>,{' '}
            <code className="text-fuchsia-300">agent_traces/</code>, ripple reports, cohort manifest.
          </p>
          <button
            type="button"
            onClick={() => void refreshStudyStatus()}
            className="flex items-center gap-2 px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg text-sm"
          >
            <Download className="w-4 h-4" />
            Load export path
          </button>
          {exportInfo?.studyDir && (
            <div className="font-mono text-xs bg-slate-950 p-3 rounded border border-slate-700 break-all">
              {exportInfo.studyDir}
            </div>
          )}
        </div>
      )}

      {log.length > 0 && (
        <div className="border-t border-slate-700 pt-3">
          <div className="text-xs text-slate-500 mb-1">Activity log</div>
          <div className="max-h-32 overflow-y-auto text-xs font-mono text-slate-400 space-y-0.5">
            {log.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
