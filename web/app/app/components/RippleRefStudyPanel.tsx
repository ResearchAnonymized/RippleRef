'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Database,
  FileSearch,
  GitBranch,
  Layers,
  Play,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Table2,
  TestTube2,
} from 'lucide-react';
import {
  buildRippleRefCandidateQueue,
  buildRippleRefContexts,
  computeMasterRepoProgress,
  computeMasterRepoProgressFromResults,
  computeQwenV2CohortProgress,
  createRippleRefStudy,
  DEFAULT_RIPPLE_REF_MODELS,
  fetchRippleRefFileGraph,
  fetchRippleRefResults,
  formatLivePhase,
  getRippleRefStudy,
  isStudyActivelyRunning,
  isStudyIncomplete,
  isStudyLiveExecution,
  listRippleRefStudies,
  plannedCandidateCount,
  refreshRippleRefStudyStatus,
  rippleRefCompleteness,
  rippleRefExportInfo,
  rippleRefPreflight,
  RIPPLE_REF_MASTER_STUDY_ID,
  RIPPLE_REF_SCALES,
  runRippleRefCandidate,
  subscribeRippleRefLiveStream,
  selectRippleRefFiles,
  type CandidateResultsResponse,
  type CompletenessReport,
  type RippleRefFileGraph,
  type RippleRefLiveStatus,
  type RippleRefScale,
  type StudyState,
} from '../lib/rippleRefStudy';
import RippleRefFileGraphView from './RippleRefFileGraphView';
import RippleRefResultsTable from './RippleRefResultsTable';
import RippleRefStudyStatusBar, { type ExperimentProgress } from './RippleRefStudyStatusBar';
import RippleRefL5PipelinePanel from './RippleRefL5PipelinePanel';

type ProjectRow = { id: string; name: string; sourceFiles?: number };

const STORAGE_KEY = 'ripple-ref-study-active';

type TabId =
  | 'scan'
  | 'selection'
  | 'context'
  | 'experiment'
  | 'l5'
  | 'collection'
  | 'results'
  | 'export';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'scan', label: 'Repository Scan', icon: Database },
  { id: 'selection', label: 'File Selection', icon: FileSearch },
  { id: 'context', label: 'Dependency Context', icon: GitBranch },
  { id: 'experiment', label: 'Run Experiment', icon: Play },
  { id: 'l5', label: 'L5 Behavioral', icon: TestTube2 },
  { id: 'collection', label: 'Data Collection', icon: Activity },
  { id: 'results', label: 'Results', icon: Table2 },
  { id: 'export', label: 'Export Dataset', icon: Download },
];

export default function RippleRefStudyPanel({ projects }: { projects: ProjectRow[] }) {
  const [activeTab, setActiveTab] = useState<TabId>('scan');
  const [scale, setScale] = useState<RippleRefScale>('pilot');
  const [selectedRepoIds, setSelectedRepoIds] = useState<string[]>([]);
  const [study, setStudy] = useState<StudyState | null>(null);
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
  const [knownStudyIds, setKnownStudyIds] = useState<string[]>([]);
  const [loadStudyIdInput, setLoadStudyIdInput] = useState(RIPPLE_REF_MASTER_STUDY_ID);
  const [completeness, setCompleteness] = useState<CompletenessReport | null>(null);
  const [liveStatus, setLiveStatus] = useState<RippleRefLiveStatus | null>(null);
  const [statusRefreshing, setStatusRefreshing] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);
  const [lastStreamAt, setLastStreamAt] = useState<number | null>(null);
  const lastAccountedRef = React.useRef<number>(-1);
  const [experimentProgress, setExperimentProgress] = useState<ExperimentProgress>({
    running: false,
    phase: 'idle',
    planned: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    ranThisSession: 0,
  });
  const experimentAbortRef = React.useRef(false);

  const appendLog = useCallback((msg: string) => {
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 80));
  }, []);

  useEffect(() => {
    listRippleRefStudies()
      .then(setKnownStudyIds)
      .catch(() => setKnownStudyIds([]));
  }, [study?.config.studyId]);

  const loadResults = useCallback(async () => {
    const studyId = study?.config.studyId;
    if (!studyId) return;
    setResultsLoading(true);
    try {
      const data = await fetchRippleRefResults(studyId);
      setResults(data);
      appendLog(`Loaded ${data.rows.length} candidate results`);
    } catch (e) {
      appendLog(`Results error: ${e instanceof Error ? e.message : String(e)}`);
      setResults(null);
    } finally {
      setResultsLoading(false);
    }
  }, [study?.config.studyId, appendLog]);

  useEffect(() => {
    if (activeTab === 'results' && study?.config.studyId) {
      void loadResults();
    }
  }, [activeTab, study?.config.studyId, loadResults]);

  const resolveWorkspaceIds = useCallback((): string[] => {
    if (selectedRepoIds.length > 0) return selectedRepoIds;
    if (study?.config?.workspaceIds?.length) return study.config.workspaceIds;
    if (study?.repositoryScans) return Object.keys(study.repositoryScans);
    return [];
  }, [selectedRepoIds, study]);

  const projectNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projects) map[p.id] = p.name;
    return map;
  }, [projects]);

  const repoProgress = useMemo(() => {
    if (!study) return [];
    if (results?.rows?.length) {
      return computeMasterRepoProgressFromResults(study, results.rows, projectNameById);
    }
    return computeMasterRepoProgress(study, projectNameById);
  }, [study, results, projectNameById]);

  const qwenCohortProgress = useMemo(
    () => (results?.rows?.length ? computeQwenV2CohortProgress(results.rows) : null),
    [results?.rows]
  );

  const liveMonitoring = useMemo(
    () =>
      isStudyLiveExecution(liveStatus?.liveCandidate, experimentProgress.running) ||
      isStudyIncomplete(completeness),
    [liveStatus?.liveCandidate, experimentProgress.running, completeness]
  );

  const batchStalled = useMemo(
    () => isStudyIncomplete(completeness) && !liveMonitoring && !experimentProgress.running,
    [completeness, liveMonitoring, experimentProgress.running]
  );

  const loadStudyById = useCallback(
    async (studyId: string, quiet = false) => {
      const loaded = await getRippleRefStudy(studyId);
      setStudy(loaded);
      if (loaded.config?.workspaceIds?.length) {
        const scanned = Object.keys(loaded.repositoryScans ?? {});
        setSelectedRepoIds(scanned.length > 0 ? scanned : loaded.config.workspaceIds);
      }
      if (!quiet) appendLog(`Loaded study ${studyId}`);
      return loaded;
    },
    [appendLog]
  );

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        const saved = raw ? (JSON.parse(raw) as { studyId?: string; selectedRepoIds?: string[] }) : null;
        if (saved?.selectedRepoIds?.length) {
          setSelectedRepoIds(saved.selectedRepoIds);
        }
        const idToLoad = RIPPLE_REF_MASTER_STUDY_ID;
        if (!cancelled) {
          await loadStudyById(idToLoad, true).catch(async () => {
            if (saved?.studyId) await loadStudyById(saved.studyId, true);
          });
        }
      } catch {
        /* ignore */
      }
    };
    if (!study) void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadStudyById, study]);

  useEffect(() => {
    if (!study?.config?.studyId) return;
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ studyId: study.config.studyId, selectedRepoIds: resolveWorkspaceIds() })
    );
  }, [study?.config?.studyId, selectedRepoIds, resolveWorkspaceIds]);

  const loadFileGraph = useCallback(
    async (workspaceId: string, filePath: string) => {
      if (!study?.config?.studyId) {
        setGraphError('Create or load a study first (Repository Scan tab).');
        return;
      }
      setGraphFile({ workspaceId, filePath });
      setGraphLoading(true);
      setGraphError(null);
      try {
        const graph = await fetchRippleRefFileGraph(study.config.studyId, workspaceId, filePath);
        setFileGraph(graph);
      } catch (e) {
        setFileGraph(null);
        setGraphError(e instanceof Error ? e.message : String(e));
      } finally {
        setGraphLoading(false);
      }
    },
    [study?.config?.studyId]
  );

  const scaleMeta = RIPPLE_REF_SCALES[scale];
  const planned = useMemo(
    () =>
      plannedCandidateCount(
        selectedRepoIds.length || scaleMeta.repos,
        scaleMeta.filesPerRepo,
        DEFAULT_RIPPLE_REF_MODELS.length
      ),
    [selectedRepoIds.length, scaleMeta]
  );

  const toggleRepo = (id: string) => {
    setSelectedRepoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const ensureStudy = async () => {
    if (study?.config?.studyId) return study;
    const workspaceIds = resolveWorkspaceIds();
    if (workspaceIds.length === 0) {
      throw new Error('Select at least one repository on the Repository Scan tab');
    }
    const created = await createRippleRefStudy({
      scale,
      workspaceIds,
      filesPerRepository: scaleMeta.filesPerRepo,
      randomSeed: 42,
      minSmellCount: 1,
      models: DEFAULT_RIPPLE_REF_MODELS,
    });
    setStudy(created);
    setSelectedRepoIds(workspaceIds);
    appendLog(`Created study ${created.config.studyId}`);
    return created;
  };

  const runScanAll = async () => {
    setBusy(true);
    try {
      const s = await ensureStudy();
      const studyId = s.config.studyId!;
      const workspaceIds = resolveWorkspaceIds();
      for (const ws of workspaceIds) {
        appendLog(`Scanning ${ws}…`);
        const updated = await scanRippleRefRepository(studyId, ws);
        setStudy(updated);
        if (updated.config?.workspaceIds?.length) {
          setSelectedRepoIds(updated.config.workspaceIds);
        }
      }
      appendLog('Repository scan complete');
    } catch (e) {
      appendLog(`Scan error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const runSelection = async () => {
    setBusy(true);
    try {
      let s = study ?? (await ensureStudy());
      const studyId = s.config.studyId!;
      if (!s.repositoryScans || Object.keys(s.repositoryScans).length === 0) {
        appendLog('No scans found — running repository scan first…');
        const workspaceIds = resolveWorkspaceIds();
        for (const ws of workspaceIds) {
          s = await scanRippleRefRepository(studyId, ws);
          setStudy(s);
        }
      }
      const updated = await selectRippleRefFiles(studyId);
      setStudy(updated);
      appendLog('Stratified file selection complete');
      const firstRepo = Object.keys(updated.selectedByRepo ?? {})[0];
      const firstFile = firstRepo ? updated.selectedByRepo[firstRepo]?.[0] : null;
      if (firstRepo && firstFile) {
        void loadFileGraph(firstRepo, firstFile.filePath);
      }
    } catch (e) {
      appendLog(`Selection error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const runContexts = async () => {
    setBusy(true);
    try {
      let s = study;
      if (!s?.config?.studyId) {
        s = await ensureStudy();
        setStudy(s);
      }
      if (!s.selectedByRepo || Object.keys(s.selectedByRepo).length === 0) {
        appendLog('No selected files — running selection first…');
        const updated = await selectRippleRefFiles(s.config.studyId!);
        setStudy(updated);
        s = updated;
      }
      const built = await buildRippleRefContexts(s.config.studyId!);
      setStudy(built);
      appendLog('Dependency context packages built');
    } catch (e) {
      appendLog(`Context error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const runSetupPipeline = async () => {
    setBusy(true);
    try {
      const s = await ensureStudy();
      const studyId = s.config.studyId!;
      const workspaceIds = resolveWorkspaceIds();
      let current = s;
      for (const ws of workspaceIds) {
        appendLog(`Scanning ${ws}…`);
        current = await scanRippleRefRepository(studyId, ws);
        setStudy(current);
      }
      appendLog('Repository scan complete');
      current = await selectRippleRefFiles(studyId);
      setStudy(current);
      appendLog('File selection complete');
      current = await buildRippleRefContexts(studyId);
      setStudy(current);
      appendLog('Setup pipeline complete (scan → select → contexts)');
      const firstRepo = Object.keys(current.selectedByRepo ?? {})[0];
      const firstFile = firstRepo ? current.selectedByRepo[firstRepo]?.[0] : null;
      if (firstRepo && firstFile) {
        void loadFileGraph(firstRepo, firstFile.filePath);
      }
    } catch (e) {
      appendLog(`Pipeline error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const applyLiveSnapshot = useCallback(
    (snapshot: RippleRefLiveStatus, fromStream = false) => {
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
          ? `${formatLivePhase(live.phase)} — ${live.variant} · ${live.modelDisplayName ?? live.modelId} · ${live.fileName}`
          : snapshot.completeness.plannedRuns > 0
            ? `Study ${snapshot.completeness.completedRuns + snapshot.completeness.failedGenerations}/${snapshot.completeness.plannedRuns} · ${snapshot.completeness.missingArtifacts} remaining`
            : prev.lastMessage,
      }));
      const done = snapshot.completeness.completedRuns;
      const accounted = done + (snapshot.completeness.failedGenerations ?? 0);
      const accountedChanged = accounted !== lastAccountedRef.current;
      if (accountedChanged) {
        lastAccountedRef.current = accounted;
      }
      // Live stream: refresh per-system bars when a candidate finishes or phases change.
      if (accountedChanged || fromStream) {
        void fetchRippleRefResults(snapshot.studyId).then(setResults).catch(() => {});
        if (accountedChanged) {
          void getRippleRefStudy(snapshot.studyId).then(setStudy).catch(() => {});
        }
      }
    },
    []
  );

  const refreshStudyStatus = useCallback(async () => {
    const studyId = study?.config.studyId;
    if (!studyId) return;
    setStatusRefreshing(true);
    try {
      const snapshot = await refreshRippleRefStudyStatus(studyId);
      setStudy(snapshot.study);
      setCompleteness(snapshot.completeness);
      setResults(snapshot.results);
      applyLiveSnapshot(snapshot.liveStatus);
      const info = await rippleRefExportInfo(studyId);
      setExportInfo({ studyDir: info.studyDir, completeness: info.completeness });
    } catch (e) {
      appendLog(`Status refresh error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setStatusRefreshing(false);
    }
  }, [study?.config.studyId, appendLog, applyLiveSnapshot]);

  useEffect(() => {
    if (!study?.config.studyId) return;
    void refreshStudyStatus();
  }, [study?.config.studyId, refreshStudyStatus]);

  useEffect(() => {
    const studyId = study?.config.studyId;
    if (!studyId) return;
    setStreamConnected(false);
    const unsubscribe = subscribeRippleRefLiveStream(
      studyId,
      (status) => applyLiveSnapshot(status, true),
      (connected) => setStreamConnected(connected)
    );
    return unsubscribe;
  }, [study?.config.studyId, applyLiveSnapshot]);

  useEffect(() => {
    const studyId = study?.config.studyId;
    const qwenRemaining =
      results?.rows?.length ? computeQwenV2CohortProgress(results.rows).remaining : 0;
    if (!studyId || (!isStudyIncomplete(completeness) && qwenRemaining <= 0)) return;
    const pollMs = 5000;
    const timer = window.setInterval(() => {
      void refreshStudyStatus();
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [study?.config.studyId, completeness, results?.rows, streamConnected, refreshStudyStatus]);

  useEffect(() => {
    if (!liveMonitoring || experimentProgress.running || !completeness) return;
    setExperimentProgress((p) => ({
      ...p,
      phase: p.phase === 'done' || p.phase === 'error' ? p.phase : 'idle',
      planned: completeness.plannedRuns,
      completed: completeness.completedRuns,
      failed: completeness.failedGenerations,
      lastMessage: `CLI/batch monitoring — ${completeness.completedRuns}/${completeness.plannedRuns} complete`,
    }));
  }, [liveMonitoring, experimentProgress.running, completeness]);

  const runPreflight = async () => {
    if (!study?.config.studyId) return null;
    setExperimentProgress((p) => ({ ...p, phase: 'preflight' }));
    const pf = await rippleRefPreflight(study.config.studyId);
    setPreflight(pf);
    appendLog(pf.ready ? 'Preflight OK' : `Preflight issues: ${pf.issues.join('; ')}`);
    return pf;
  };

  const stopExperiment = () => {
    experimentAbortRef.current = true;
    appendLog('Stop requested — finishing current candidate…');
  };

  const runExperiment = async (maxCandidates?: number) => {
    if (!study?.config.studyId) return;
    experimentAbortRef.current = false;
    setBusy(true);
    setExperimentProgress({
      running: true,
      phase: 'preflight',
      planned: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      ranThisSession: 0,
    });
    const studyId = study.config.studyId;
    try {
      const pf = await runPreflight();
      if (!pf?.ready) {
        setExperimentProgress((p) => ({ ...p, running: false, phase: 'error' }));
        return;
      }

      let currentStudy = await getRippleRefStudy(studyId);
      const queue = buildRippleRefCandidateQueue(currentStudy);
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
      appendLog(
        `Starting GUI runner: ${toRun.length} candidate(s) (${pending.length} pending, ${completedKeys.size} already done)`
      );

      let ran = 0;
      let failed = currentStudy.failedCandidates?.length ?? 0;
      for (const item of toRun) {
        if (experimentAbortRef.current) break;
        const label = `${item.variant} · ${item.modelId.split('/').pop()} · ${item.filePath.split('/').pop()}`;
        setExperimentProgress((p) => ({
          ...p,
          phase: 'candidate',
          currentLabel: label,
          lastMessage: `Running ${label}`,
        }));
        appendLog(`→ ${label}`);
        try {
          const result = await runRippleRefCandidate({
            studyId,
            workspaceId: item.workspaceId,
            filePath: item.filePath,
            modelId: item.modelId,
            variant: item.variant,
          });
          ran += 1;
          if (result.status === 'failed' || result.status === 'failed_parsing') {
            failed += 1;
          }
          const risk = result.rippleReport?.riskLevel ?? '—';
          const beh = result.rippleReport?.behavioral?.behavioralCorrect;
          appendLog(
            `✓ ${label} — ${result.status} · ripple=${risk}${beh != null ? ` · behavioral=${beh}` : ''}`
          );
        } catch (e) {
          failed += 1;
          appendLog(`✗ ${label} — ${e instanceof Error ? e.message : String(e)}`);
        }
        currentStudy = await getRippleRefStudy(studyId);
        setStudy(currentStudy);
        const doneCount = (currentStudy.completedCandidates ?? []).length;
        setExperimentProgress((p) => ({
          ...p,
          completed: doneCount,
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
        lastMessage: experimentAbortRef.current
          ? `Stopped after ${ran} candidate(s) this session`
          : `Finished ${ran} candidate(s) this session`,
      }));
      appendLog(
        experimentAbortRef.current
          ? `Experiment stopped (${ran} ran this session)`
          : `Experiment complete (${ran} ran this session)`
      );
      if (activeTab === 'results') {
        await loadResults();
      }
    } catch (e) {
      appendLog(`Experiment error: ${e instanceof Error ? e.message : String(e)}`);
      setExperimentProgress((p) => ({
        ...p,
        running: false,
        phase: 'error',
        lastMessage: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      setBusy(false);
    }
  };

  const refreshCompleteness = async () => {
    await refreshStudyStatus();
    if (completeness) {
      appendLog(`Completeness: ${completeness.completionPercentage.toFixed(1)}%`);
    }
  };

  const totalSelected = useMemo(() => {
    if (!study?.selectedByRepo) return 0;
    return Object.values(study.selectedByRepo).reduce((n, arr) => n + (arr?.length ?? 0), 0);
  }, [study]);

  return (
    <section
      id="ripple-ref-study"
      className="rounded-xl border border-violet-500/30 bg-slate-900/60 p-5 space-y-4 scroll-mt-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-violet-200">RIPPLE-REF Study</h2>
          <p className="text-sm text-slate-400 max-w-2xl">
            Dependency-aware multi-agent refactoring for repository-level ripple-risk control.
            Paired V1 (file-only) vs V2 (dependency-aware) per file and model.
          </p>
        </div>
        {study?.config?.studyId && (
          <span className="text-xs font-mono text-violet-300/80 bg-violet-950/50 px-2 py-1 rounded">
            {study.config.studyId}
          </span>
        )}
      </div>

      {study?.config?.studyId && (
        <RippleRefStudyStatusBar
          studyId={study.config.studyId}
          studyStatus={study.status}
          progress={experimentProgress}
          completeness={completeness}
          summary={results?.summary ?? null}
          liveCandidate={liveStatus?.liveCandidate ?? null}
          lastCompleted={liveStatus?.lastCompleted ?? null}
          fileProgress={liveStatus?.fileProgress ?? []}
          repoProgress={repoProgress}
          qwenCohortProgress={qwenCohortProgress}
          projectNames={projectNameById}
          liveMonitoring={liveMonitoring}
          batchStalled={batchStalled}
          streamConnected={streamConnected}
          lastStreamAt={lastStreamAt}
          onRefresh={() => void refreshStudyStatus()}
          refreshing={statusRefreshing}
        />
      )}

      {(study?.config?.studyId === RIPPLE_REF_MASTER_STUDY_ID || !study?.config?.studyId) && (
        <RippleRefL5PipelinePanel
          studyId={RIPPLE_REF_MASTER_STUDY_ID}
          onLog={appendLog}
          bannerOnly
          onViewDetails={() => setActiveTab('l5')}
        />
      )}

      {!study?.config?.studyId && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-400">Load master study to monitor CLI progress:</span>
          <button
            type="button"
            onClick={() => void loadStudyById(RIPPLE_REF_MASTER_STUDY_ID)}
            className="font-mono text-violet-300 hover:underline"
          >
            {RIPPLE_REF_MASTER_STUDY_ID}
          </button>
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
                ? id === 'l5'
                  ? 'bg-cyan-700 text-white ring-1 ring-cyan-400/50'
                  : 'bg-violet-600 text-white'
                : id === 'l5'
                  ? 'bg-slate-800 text-cyan-300/90 hover:bg-slate-700 border border-cyan-800/40'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-slate-400">Study scale</span>
          <select
            value={scale}
            onChange={(e) => setScale(e.target.value as RippleRefScale)}
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5"
          >
            {Object.entries(RIPPLE_REF_SCALES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-slate-400 text-xs">Planned candidates</div>
          <div className="text-xl font-semibold text-white">{planned}</div>
          <div className="text-xs text-slate-500">
            {selectedRepoIds.length || scaleMeta.repos} repos × {scaleMeta.filesPerRepo} files × 5 models × 2
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-slate-400 text-xs">Study status</div>
          <div className="text-lg font-medium text-violet-200">{study?.status ?? 'not started'}</div>
          {totalSelected > 0 && (
            <div className="text-xs text-slate-500">{totalSelected} files selected</div>
          )}
        </div>
      </div>

      {activeTab === 'scan' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Select hosted Java repositories. Scan records production files, exclusions, LOC, and dependency graph.
          </p>
          <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-700 rounded-lg p-2">
            {projects.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedRepoIds.includes(p.id)}
                  onChange={() => toggleRepo(p.id)}
                />
                <span className="text-sm">{p.name}</span>
                <span className="text-xs text-slate-500 ml-auto">{p.sourceFiles ?? 0} source files</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={busy || resolveWorkspaceIds().length === 0}
            onClick={runScanAll}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm"
          >
            <Layers className="w-4 h-4" />
            Scan repositories & dependencies
          </button>
          <button
            type="button"
            disabled={busy || resolveWorkspaceIds().length === 0}
            onClick={runSetupPipeline}
            className="px-4 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 rounded-lg text-sm"
          >
            Run setup pipeline (scan → select → contexts)
          </button>
          {study?.repositoryScans && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-700">
                    <th className="text-left py-1">Repo</th>
                    <th className="text-right py-1">Production</th>
                    <th className="text-right py-1">Excluded</th>
                    <th className="text-right py-1">LOC</th>
                    <th className="text-left py-1">Commit</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(study.repositoryScans).map((r) => (
                    <tr key={r.projectId} className="border-b border-slate-800">
                      <td className="py-1">{r.repositoryName}</td>
                      <td className="text-right">{r.productionFileCount}</td>
                      <td className="text-right">{r.excludedFileCount}</td>
                      <td className="text-right">{r.productionLoc}</td>
                      <td className="font-mono truncate max-w-[120px]">{r.commitHash?.slice(0, 8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'selection' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Stratified sampling: high/medium/low fan-in, high public API, high smell + dependency, random.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={runSelection}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm"
          >
            Run eligibility & stratified selection
          </button>
          {study?.selectedByRepo &&
            Object.entries(study.selectedByRepo).map(([repo, files]) => (
              <div key={repo}>
                <h4 className="text-sm font-medium text-violet-200 mb-1">{repo}</h4>
                <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                  {(files ?? []).map((f) => (
                    <li key={f.filePath}>
                      <button
                        type="button"
                        onClick={() => loadFileGraph(repo, f.filePath)}
                        className={`flex gap-2 w-full text-left px-2 py-1 rounded hover:bg-slate-800 ${
                          graphFile?.filePath === f.filePath ? 'bg-violet-900/40' : ''
                        }`}
                      >
                        <span className="truncate flex-1 text-slate-300">{f.filePath}</span>
                        <span className="text-slate-500">{f.samplingGroup}</span>
                        <span>fi={f.fanIn}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          {(graphFile || fileGraph) && (
            <div className="mt-3 border-t border-slate-700 pt-3">
              <h4 className="text-sm font-medium text-violet-200 mb-2">
                Dependency graph — {graphFile?.filePath.split('/').pop()}
              </h4>
              <RippleRefFileGraphView graph={fileGraph} loading={graphLoading} error={graphError} />
            </div>
          )}
        </div>
      )}

      {activeTab === 'context' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Generate JSON + text dependency context packages for V2 prompts. Click a selected file to
            visualize its dependency graph.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={runContexts}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm"
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
                    onClick={() => loadFileGraph(repo, f.filePath)}
                    className={`text-xs px-2 py-1 rounded border ${
                      graphFile?.filePath === f.filePath
                        ? 'border-violet-400 bg-violet-900/40 text-violet-100'
                        : 'border-slate-600 text-slate-300 hover:bg-slate-800'
                    }`}
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

      {activeTab === 'experiment' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Runs paired V1 and V2 for each selected file × model. Artifacts saved immediately; supports resume.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={runPreflight}
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
            >
              Preflight check
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => runExperiment(1)}
              className="px-3 py-2 bg-amber-700 hover:bg-amber-600 rounded-lg text-sm"
            >
              Pilot: 1 candidate
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => runExperiment()}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm"
            >
              <Play className="w-4 h-4" />
              Run full batch
            </button>
            {batchStalled && (
              <button
                type="button"
                disabled={busy}
                onClick={() => runExperiment()}
                className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 rounded-lg text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Resume batch ({completeness?.missingArtifacts ?? 0} pending)
              </button>
            )}
            {experimentProgress.running && (
              <button
                type="button"
                onClick={stopExperiment}
                className="px-3 py-2 bg-red-900/80 hover:bg-red-800 rounded-lg text-sm text-red-100"
              >
                Stop after current
              </button>
            )}
          </div>
          {experimentProgress.running && experimentProgress.currentLabel && (
            <div className="text-sm text-amber-200 bg-amber-950/30 border border-amber-500/30 rounded-lg px-3 py-2">
              Now running: <span className="font-mono">{experimentProgress.currentLabel}</span>
            </div>
          )}
          {preflight && (
            <div
              className={`text-sm p-3 rounded-lg border ${
                preflight.ready
                  ? 'border-green-500/40 bg-green-950/30'
                  : 'border-amber-500/40 bg-amber-950/30'
              }`}
            >
              {preflight.ready ? (
                <span className="flex items-center gap-2 text-green-300">
                  <CheckCircle2 className="w-4 h-4" /> Ready — {preflight.plannedRuns} planned runs
                </span>
              ) : (
                <span className="flex items-center gap-2 text-amber-300">
                  <AlertTriangle className="w-4 h-4" /> {preflight.issues.join('; ')}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'l5' && (
        <RippleRefL5PipelinePanel
          studyId={RIPPLE_REF_MASTER_STUDY_ID}
          onLog={appendLog}
        />
      )}

      {activeTab === 'collection' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Monitor completeness, failed candidates, and artifact coverage. Each candidate includes{' '}
            <strong className="text-slate-300">L1–L2 ripple</strong>,{' '}
            <strong className="text-slate-300">L4 behavioral heuristics</strong>, and optional{' '}
            <strong className="text-slate-300">L5 targeted tests</strong> (<code className="text-violet-300">RIPPLE_REF_TEST_PROBE=1</code>).
          </p>
          <button
            type="button"
            onClick={refreshCompleteness}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh completeness report
          </button>
          {exportInfo && (
            <div className="text-sm text-slate-300 space-y-1">
              <div>
                Completed: {exportInfo.completeness.completedRuns} /{' '}
                {exportInfo.completeness.plannedRuns} (
                {exportInfo.completeness.completionPercentage.toFixed(1)}%)
              </div>
              <div className="text-xs text-slate-500">
                Failed: {study?.failedCandidates?.length ?? 0}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'results' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadResults()}
              disabled={!study?.config.studyId || resultsLoading}
              className="flex items-center gap-2 px-3 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded-lg text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${resultsLoading ? 'animate-spin' : ''}`} />
              Refresh results
            </button>
            <div className="flex items-center gap-2 text-sm">
              <input
                type="text"
                placeholder="Load study ID…"
                value={loadStudyIdInput}
                onChange={(e) => setLoadStudyIdInput(e.target.value)}
                className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-slate-200 font-mono text-xs w-52"
              />
              <button
                type="button"
                disabled={!loadStudyIdInput.trim()}
                onClick={() => {
                  const id = loadStudyIdInput.trim();
                  void loadStudyById(id).catch((e) => appendLog(`Load study failed: ${e}`));
                }}
                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs"
              >
                Load
              </button>
              <button
                type="button"
                onClick={() => void loadStudyById(RIPPLE_REF_MASTER_STUDY_ID)}
                className="px-2 py-1 bg-violet-800 hover:bg-violet-700 rounded text-xs text-violet-100"
              >
                Master
              </button>
            </div>
          </div>
          {knownStudyIds.length > 0 && (
            <div className="text-xs text-slate-500">
              Recent studies:{' '}
              {knownStudyIds.slice(0, 5).map((id) => (
                <button
                  key={id}
                  type="button"
                  className="text-violet-400 hover:underline mr-2 font-mono"
                  onClick={() =>
                    void loadStudyById(id).catch((e) => appendLog(String(e)))
                  }
                >
                  {id}
                </button>
              ))}
            </div>
          )}
          {!study?.config.studyId ? (
            <p className="text-sm text-slate-500">Create or load a study to view results.</p>
          ) : resultsLoading && !results ? (
            <p className="text-sm text-slate-400">Loading results…</p>
          ) : results ? (
            <RippleRefResultsTable rows={results.rows} summary={results.summary} />
          ) : (
            <p className="text-sm text-slate-500">No results file yet for this study.</p>
          )}
        </div>
      )}

      {activeTab === 'export' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Study folder contains config, CSVs, contexts, prompts, responses, candidates, isolated sandboxes,
            ripple reports (L1+L2), and <code className="text-violet-300">results_candidates.csv</code>.
          </p>
          <button
            type="button"
            onClick={refreshCompleteness}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm"
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
          <div className="max-h-28 overflow-y-auto text-xs font-mono text-slate-400 space-y-0.5">
            {log.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
