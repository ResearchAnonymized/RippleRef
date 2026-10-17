'use client';

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  BarChart3,
  Beaker,
  CheckCircle,
  AlertTriangle,
  Clock,
  FileText,
  Zap,
  Download,
  XCircle,
  RefreshCw,
  Filter,
  CheckSquare,
  Square as SquareIcon,
  Save,
  Search,
  FolderOpen,
  Shuffle,
  Play,
  Square,
  Loader2,
  Layers,
  Trash2,
} from 'lucide-react';
import {
  buildEligibleResearchPool,
  DEFAULT_MARGIN_OF_ERROR,
  DEFAULT_MAX_PER_PROJECT,
  DEFAULT_RESEARCH_SEED,
  downloadResearchSampleManifest,
  formatResearchSampleSummary,
  pickResearchSample,
  type LocStratum,
  type ResearchSampleResult,
  type SmellStratum,
} from '../lib/researchSampling';
import { finitePopulationSampleSize } from '../lib/researchSampleSize';
import {
  formatSavedResearchSampleWhen,
  loadResearchSample,
  persistResearchSample,
  buildResearchSampleId,
  type StoredResearchSampleRecord,
} from '../lib/researchSampleStorage';
import type { FileInfo } from '../api/client';
import { apiClient } from '../api/client';
import type { FileProgressMap } from '../lib/fileActivity';
import { normalizeFilePath } from '../lib/fileActivity';
import {
  effectivePmdCount,
  filterJavaFilesForBatch,
  sortFileInfos,
  type FileListSortKey,
} from '../lib/fileListSort';
import { runBatchRefactorForFile } from '../lib/batchRefactorPipeline';
import { autoExportAfterResearchBatch } from '../lib/autoBatchExcelExport';
import type { BatchFileMetrics } from '../lib/batchResultMetrics';
import { minimalBatchFileMetrics, normalizeBatchFileMetrics } from '../lib/batchResultMetrics';
import BatchResultMetricsExpand, {
  BatchResultsMetricCells,
  BatchResultsMetricHeaderRow,
} from './BatchResultMetricsPanel';
import BatchLlmPipelineView from './BatchLlmPipelineView';
import BatchRqChartsPanel from './BatchRqChartsPanel';
import { isRefineDemo } from '../lib/refineDemoMode';
import {
  clearBatchRun,
  loadBatchRun,
  persistBatchRun,
  type MultiLlmRunRecord,
  type PersistedBatchFileResult,
} from '../lib/batchRunStorage';
import { normalizeMultiLlmRuns } from '../lib/normalizeMultiLlmRuns';
import {
  type ActiveLlmMap,
  type LlmProviderProgress,
  activeLlmCount,
  formatParallelProgressMessage,
  mergeActiveLlm,
} from '../lib/multiLlmProgress';

interface BatchRefactoringProps {
  workspaceId: string;
  projectLabel: string;
  files: FileInfo[];
  fileProgress: FileProgressMap;
  onBatchComplete?: () => void;
  onAutoExcelSaved?: () => void;
}

type FileResult = {
  filePath: string;
  fileName: string;
  status: 'pending' | 'running' | 'accepted' | 'proposed' | 'rejected' | 'error';
  smellsBefore?: number;
  smellsAfter?: number;
  smellDelta?: number;
  reportSaved: boolean;
  rejectionReason?: string;
  error?: string;
  durationMs?: number;
  agentSteps?: Array<{ name: string; status: string }>;
  progressMessage?: string;
  metrics?: BatchFileMetrics | null;
  multiLlmRuns?: MultiLlmRunRecord[];
  /** Legacy single-slot progress (sequential chain). */
  currentLlm?: LlmProviderProgress;
  /** Independent parallel: one entry per provider column while running. */
  activeLlms?: ActiveLlmMap;
};

type BatchView = 'setup' | 'results' | 'llm-pipeline' | 'rq-charts';

export default function BatchRefactoring({
  workspaceId,
  projectLabel,
  files,
  fileProgress,
  onBatchComplete,
  onAutoExcelSaved,
}: BatchRefactoringProps) {
  const refineDemo = isRefineDemo();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<FileListSortKey>('smells-desc');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [onlySmelly, setOnlySmelly] = useState(true);
  const [maxBatchSize, setMaxBatchSize] = useState(12);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.965);
  const [methodPreservation, setMethodPreservation] = useState(0.85);
  const [continueOnError, setContinueOnError] = useState(true);
  const [skipSmellComparison, setSkipSmellComparison] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const stopRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const pendingResearchRestore = useRef<StoredResearchSampleRecord | null>(null);
  const fileListRef = useRef<HTMLDivElement | null>(null);
  const [stratifiedSummary, setStratifiedSummary] = useState<string | null>(null);
  const [stratifiedPaths, setStratifiedPaths] = useState<Set<string>>(new Set());
  const [researchResult, setResearchResult] = useState<ResearchSampleResult | null>(null);
  const [researchSeed, setResearchSeed] = useState(DEFAULT_RESEARCH_SEED);
  const [marginOfError, setMarginOfError] = useState(DEFAULT_MARGIN_OF_ERROR);
  const [savedResearchRecord, setSavedResearchRecord] = useState<StoredResearchSampleRecord | null>(
    null
  );
  const [researchPersistStatus, setResearchPersistStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [researchPersistSource, setResearchPersistSource] = useState<
    'apply' | 'pick_new' | null
  >(null);
  const [autoExcelStatus, setAutoExcelStatus] = useState<
    'idle' | 'running' | 'saved' | 'skipped' | 'error'
  >('idle');
  const [autoExcelMessage, setAutoExcelMessage] = useState<string | null>(null);
  const [batchView, setBatchView] = useState<BatchView>('setup');
  const [savedBatchAt, setSavedBatchAt] = useState<number | null>(null);
  const [batchLoadStatus, setBatchLoadStatus] = useState<'idle' | 'loading' | 'loaded'>('idle');

  const saveBatchSnapshot = useCallback(
    (nextResults: FileResult[], completedAt?: number) => {
      if (nextResults.length === 0) return;
      const record = {
        workspaceId,
        projectLabel,
        savedAt: Date.now(),
        researchSampleId: savedResearchRecord?.sampleId,
        results: nextResults as PersistedBatchFileResult[],
        completedAt,
      };
      setSavedBatchAt(record.savedAt);
      void persistBatchRun(record);
    },
    [workspaceId, projectLabel, savedResearchRecord?.sampleId]
  );

  const eligibleResearchCount = useMemo(
    () => buildEligibleResearchPool(files, fileProgress, 1).length,
    [files, fileProgress]
  );

  const previewTargetN = useMemo(() => {
    if (eligibleResearchCount === 0) return 0;
    return finitePopulationSampleSize(eligibleResearchCount, marginOfError, {
      maxSample: DEFAULT_MAX_PER_PROJECT,
    });
  }, [eligibleResearchCount, marginOfError]);

  const projectJavaCount = useMemo(
    () => files.filter((f) => f.name.endsWith('.java')).length,
    [files]
  );

  const displayList = useMemo(() => {
    const filtered = filterJavaFilesForBatch(files, {
      searchTerm,
      onlySmelly,
      fileProgress,
      excludeTestPaths: true,
    });
    return sortFileInfos(filtered, sortBy, fileProgress);
  }, [files, searchTerm, onlySmelly, sortBy, fileProgress]);

  const smellyInProject = useMemo(
    () =>
      files.filter(
        (f) =>
          f.name.endsWith('.java') &&
          (effectivePmdCount(f, fileProgress) ?? 0) > 0 &&
          !f.relativePath.replace(/\\/g, '/').toLowerCase().match(/\/tests?\//)
      ).length,
    [files, fileProgress]
  );

  const togglePath = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedPaths(new Set(displayList.map((f) => f.relativePath)));
  };

  const clearSelection = () => {
    setSelectedPaths(new Set());
    setStratifiedSummary(null);
    setStratifiedPaths(new Set());
    setResearchResult(null);
  };

  useEffect(() => {
    let cancelled = false;
    setBatchLoadStatus('loading');
    loadBatchRun(workspaceId).then((record) => {
      if (cancelled) return;
      if (record?.results?.length) {
        setResults(
          record.results.map((r) => ({
            ...(r as FileResult),
            metrics: r.metrics ? normalizeBatchFileMetrics(r.metrics as BatchFileMetrics) ?? undefined : undefined,
            multiLlmRuns: r.multiLlmRuns?.length
              ? normalizeMultiLlmRuns(r.multiLlmRuns)
              : undefined,
          }))
        );
        setSavedBatchAt(record.savedAt ?? null);
        // Stay on Setup so research sample / file selection stays visible (Results tab shows prior run).
      }
      setBatchLoadStatus('loaded');
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const resolveManifestPaths = useCallback(
    (rawPaths: string[]): string[] =>
      rawPaths.map((p) => {
        const normalized = normalizeFilePath(p);
        const match = files.find((f) => normalizeFilePath(f.relativePath) === normalized);
        return match?.relativePath ?? p;
      }),
    [files]
  );

  const scrollToFileList = useCallback(() => {
    requestAnimationFrame(() => {
      fileListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, []);

  const restoreSavedResearchSample = useCallback(
    (record: StoredResearchSampleRecord) => {
      const resolved = resolveManifestPaths(record.result.paths);
      const paths = new Set(resolved);
      setSelectedPaths(paths);
      setStratifiedPaths(paths);
      setResearchResult({
        ...record.result,
        paths: resolved,
        picked: record.result.picked.map((item) => {
          const match = files.find(
            (f) => normalizeFilePath(f.relativePath) === normalizeFilePath(item.path)
          );
          return match ? { ...item, path: match.relativePath } : item;
        }),
      });
      setStratifiedSummary(formatResearchSampleSummary(record.result));
      setMaxBatchSize(Math.max(1, record.result.pickedCount || 12));
      setSearchTerm('');
      setOnlySmelly(false);
      setBatchView('setup');
      if (record.result.config?.seed != null) {
        setResearchSeed(record.result.config.seed);
      }
      if (record.result.config?.marginOfError != null) {
        setMarginOfError(record.result.config.marginOfError);
      }
    },
    [files, resolveManifestPaths]
  );

  useEffect(() => {
    if (refineDemo) return;
    let cancelled = false;
    loadResearchSample(workspaceId).then((record) => {
      if (cancelled || !record) return;
      setSavedResearchRecord(record);
      if (files.length > 0) {
        restoreSavedResearchSample(record);
      } else {
        pendingResearchRestore.current = record;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, restoreSavedResearchSample, files.length, refineDemo]);

  useEffect(() => {
    if (refineDemo && batchView === 'rq-charts') {
      setBatchView('setup');
    }
  }, [refineDemo, batchView]);

  useEffect(() => {
    if (files.length > 0 && pendingResearchRestore.current) {
      restoreSavedResearchSample(pendingResearchRestore.current);
      pendingResearchRestore.current = null;
    }
  }, [files.length, restoreSavedResearchSample]);

  const applyResearchSample = useCallback(async () => {
    const sample = pickResearchSample(files, fileProgress, {
      seed: researchSeed,
      marginOfError,
    });
    const paths = new Set(sample.paths);
    setSelectedPaths(paths);
    setStratifiedPaths(paths);
    setResearchResult(sample);
    setStratifiedSummary(formatResearchSampleSummary(sample));
    setMaxBatchSize(Math.max(1, sample.pickedCount || previewTargetN || 12));
    setSearchTerm('');
    setOnlySmelly(false);
    setBatchView('setup');
    setResearchPersistStatus('saving');
    setResearchPersistSource('apply');
    try {
      const record = await persistResearchSample(workspaceId, projectLabel, sample);
      setSavedResearchRecord(record);
      setResearchPersistStatus('saved');
      scrollToFileList();
    } catch {
      setResearchPersistStatus('error');
    }
  }, [files, fileProgress, researchSeed, marginOfError, workspaceId, projectLabel, previewTargetN, scrollToFileList]);

  /** Option A: new random seed, exclude archived paths, archive previous manifest. */
  const applyNewResearchSample = useCallback(async () => {
    let excluded: string[] = [];
    try {
      const ex = await apiClient.getResearchExcludedPaths(workspaceId);
      excluded = ex.excludedPaths;
    } catch {
      /* no archive yet */
    }
    const excludeSet = new Set(excluded.map(normalizeFilePath));
    for (const p of savedResearchRecord?.result?.paths ?? []) {
      excludeSet.add(normalizeFilePath(p));
    }
    for (const p of researchResult?.paths ?? []) {
      excludeSet.add(normalizeFilePath(p));
    }
    const newSeed = Math.floor(1000 + Math.random() * 999000);
    setResearchSeed(newSeed);
    const sample = pickResearchSample(files, fileProgress, {
      seed: newSeed,
      marginOfError,
      excludePaths: Array.from(excludeSet),
    });
    if (sample.pickedCount === 0) {
      window.alert(
        sample.warnings.join('\n') ||
          `Could not pick a new sample (${excludeSet.size} paths excluded). Run PMD analysis or use a project with more eligible files.`
      );
      return;
    }
    const paths = new Set(sample.paths);
    setSelectedPaths(paths);
    setStratifiedPaths(paths);
    setResearchResult(sample);
    setStratifiedSummary(formatResearchSampleSummary(sample));
    setMaxBatchSize(Math.max(1, sample.pickedCount || previewTargetN || 12));
    setSearchTerm('');
    setOnlySmelly(false);
    setBatchView('setup');
    setResearchPersistStatus('saving');
    setResearchPersistSource('pick_new');
    try {
      const record = await persistResearchSample(workspaceId, projectLabel, sample, {
        archivePrevious: true,
        snapshotBaseline: false,
      });
      setSavedResearchRecord(record);
      setResearchPersistStatus('saved');
      restoreSavedResearchSample(record);
      scrollToFileList();
    } catch {
      setResearchPersistStatus('error');
    }
  }, [
    files,
    fileProgress,
    marginOfError,
    workspaceId,
    projectLabel,
    previewTargetN,
    restoreSavedResearchSample,
    savedResearchRecord,
    researchResult,
    scrollToFileList,
  ]);

  const researchSampleActive = Boolean(
    researchResult?.pickedCount || savedResearchRecord?.result?.pickedCount
  );
  const activeSampleSeed =
    researchResult?.config.seed ??
    savedResearchRecord?.result.config.seed ??
    researchSeed;
  const activeSampleFileCount =
    researchResult?.pickedCount ??
    savedResearchRecord?.result.pickedCount ??
    selectedPaths.size;
  const activeSampleId =
    savedResearchRecord?.sampleId ??
    (researchResult
      ? buildResearchSampleId(
          workspaceId,
          researchResult.config.seed,
          savedResearchRecord?.savedAt ?? Date.now()
        )
      : undefined);

  const expectedSamplePaths = useMemo(
    () =>
      savedResearchRecord?.result?.paths ??
      researchResult?.paths ??
      [],
    [savedResearchRecord, researchResult]
  );

  const pathInSet = useCallback((set: Set<string>, path: string) => {
    const n = normalizeFilePath(path);
    for (const p of set) {
      if (normalizeFilePath(p) === n) return true;
    }
    return false;
  }, []);

  /** True when all manifest paths are checked in the file list (persistent, not flash-only). */
  const sampleLockedInUi = useMemo(() => {
    if (expectedSamplePaths.length === 0) return false;
    return (
      expectedSamplePaths.every((p) => pathInSet(selectedPaths, p)) &&
      selectedPaths.size === expectedSamplePaths.length
    );
  }, [expectedSamplePaths, selectedPaths, pathInSet]);

  const isNewStudySample =
    activeSampleSeed !== DEFAULT_RESEARCH_SEED && sampleLockedInUi;

  const pickNewBusy =
    researchPersistStatus === 'saving' && researchPersistSource === 'pick_new';

  const lockedSampleDisplayFiles = useMemo(() => {
    if (expectedSamplePaths.length === 0) return [];
    return expectedSamplePaths.map((p) => {
      const file = files.find(
        (f) => normalizeFilePath(f.relativePath) === normalizeFilePath(p)
      );
      return {
        path: file?.relativePath ?? p,
        name: file?.name ?? p.split('/').pop() ?? p,
        onDisk: Boolean(file),
      };
    });
  }, [expectedSamplePaths, files]);

  const locBadge = (loc: LocStratum) => {
    const styles =
      loc === 'small'
        ? 'text-sky-300 bg-sky-500/15 border-sky-500/30'
        : loc === 'medium'
          ? 'text-indigo-300 bg-indigo-500/15 border-indigo-500/30'
          : 'text-rose-300 bg-rose-500/15 border-rose-500/30';
    const label = loc === 'small' ? '<500 LOC' : loc === 'medium' ? '500–2k' : '>2k LOC';
    return (
      <span
        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${styles}`}
      >
        {label}
      </span>
    );
  };

  const stratumBadge = (stratum: SmellStratum) => {
    const styles =
      stratum === 'low'
        ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30'
        : stratum === 'mid'
          ? 'text-amber-300 bg-amber-500/15 border-amber-500/30'
          : 'text-orange-300 bg-orange-500/15 border-orange-500/30';
    const label = stratum === 'low' ? '≤9' : stratum === 'mid' ? '10–49' : '≥50';
    return (
      <span
        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${styles}`}
      >
        {label}
      </span>
    );
  };

  const queueFiles = useMemo(() => {
    const cap = Math.max(1, Math.min(100, maxBatchSize));
    let ordered: FileInfo[];
    if (selectedPaths.size > 0) {
      const selected = displayList.filter((f) => selectedPaths.has(f.relativePath));
      const missing = Array.from(selectedPaths).filter(
        (p) => !selected.some((f) => f.relativePath === p)
      );
      const extra = missing
        .map((p) => files.find((f) => f.relativePath === p))
        .filter((f): f is FileInfo => !!f);
      ordered = [...selected, ...extra];
      if (stratifiedPaths.size > 0) {
        const order = new Map(Array.from(stratifiedPaths).map((p, i) => [p, i]));
        ordered.sort(
          (a, b) => (order.get(a.relativePath) ?? 999) - (order.get(b.relativePath) ?? 999)
        );
      }
    } else {
      ordered = displayList;
    }
    return ordered.slice(0, cap);
  }, [displayList, selectedPaths, maxBatchSize, files, stratifiedPaths]);

  const queueHint = useMemo(() => {
    const cap = Math.max(1, Math.min(100, maxBatchSize));
    if (selectedPaths.size > 0) {
      const n = displayList.filter((f) => selectedPaths.has(f.relativePath)).length;
      if (n > cap) return `${n} selected — running first ${cap} (increase “Max per batch”)`;
      return `${n} selected`;
    }
    if (displayList.length > cap) {
      return `Top ${cap} by sort (check files to pick specific ones)`;
    }
    return `${displayList.length} in list`;
  }, [selectedPaths, displayList, maxBatchSize]);

  const completed = results.filter(
    (r) =>
      r.status === 'accepted' ||
      r.status === 'proposed' ||
      r.status === 'rejected' ||
      r.status === 'error'
  );
  const accepted = results.filter((r) => r.status === 'accepted');
  const proposed = results.filter((r) => r.status === 'proposed');
  const rejected = results.filter((r) => r.status === 'rejected');
  const errors = results.filter((r) => r.status === 'error');
  const reportsSaved = results.filter((r) => r.reportSaved);
  const totalSmellDelta = results.reduce((s, r) => s + (r.smellDelta ?? 0), 0);

  const startBatch = useCallback(async (filesToRun?: FileInfo[]) => {
    const batchQueue = filesToRun ?? queueFiles;
    if (batchQueue.length === 0) return;
    stopRef.current = false;
    abortRef.current = new AbortController();
    setIsRunning(true);
    setBatchView('llm-pipeline');
    setAutoExcelStatus('idle');
    setAutoExcelMessage(null);

    const manifestSmellFor = (relativePath: string): number | undefined => {
      const picked =
        savedResearchRecord?.result?.picked ??
        researchResult?.picked ??
        [];
      const hit = picked.find((p) => p.path === relativePath);
      return hit?.smellCount;
    };
    const activeSampleId = savedResearchRecord?.sampleId;

    const initial: FileResult[] = batchQueue.map((f) => ({
      filePath: f.relativePath,
      fileName: f.name,
      status: 'pending',
      reportSaved: false,
      smellsBefore: manifestSmellFor(f.relativePath) ?? effectivePmdCount(f, fileProgress) ?? 0,
    }));
    let runningResults = initial;
    setResults(runningResults);
    saveBatchSnapshot(runningResults);

    for (let i = 0; i < batchQueue.length; i++) {
      if (stopRef.current) break;
      setCurrentIndex(i);
      const f = batchQueue[i];

      runningResults = runningResults.map((r, idx) =>
        idx === i ? { ...r, status: 'running' as const, progressMessage: 'Starting…' } : r
      );
      setResults(runningResults);
      saveBatchSnapshot(runningResults);

      const result = await runBatchRefactorForFile({
        workspaceId,
        filePath: f.relativePath,
        fileName: f.name,
        similarityThreshold,
        methodPreservationThreshold: methodPreservation,
        skipSmellComparison,
        multiLlmChain: true,
        manifestSmellCount: manifestSmellFor(f.relativePath),
        sampleId: activeSampleId,
        researchParallelMode: true,
        signal: abortRef.current?.signal,
        onProgress: (message) => {
          setResults((prev) =>
            prev.map((r, idx) => (idx === i ? { ...r, progressMessage: message } : r))
          );
        },
        onLlmProgress: (info) => {
          setResults((prev) =>
            prev.map((r, idx) => {
              if (idx !== i) return r;
              const activeLlms = mergeActiveLlm(r.activeLlms, info);
              return {
                ...r,
                activeLlms,
                progressMessage: formatParallelProgressMessage(activeLlms),
              };
            })
          );
        },
      });

      runningResults = runningResults.map((r, idx) =>
        idx === i
          ? {
              ...r,
              ...result,
              status: result.status,
              progressMessage: undefined,
              currentLlm: undefined,
              activeLlms: undefined,
            }
          : r
      );
      setResults(runningResults);
      saveBatchSnapshot(runningResults);

      if (result.status === 'error' && !continueOnError) {
        break;
      }
    }

    setCurrentIndex(-1);
    setIsRunning(false);
    abortRef.current = null;
    saveBatchSnapshot(runningResults, Date.now());

    const isResearchRun =
      researchResult != null || savedResearchRecord != null || stratifiedPaths.size > 0;
    if (isResearchRun) {
      setAutoExcelStatus('running');
      try {
        const auto = await autoExportAfterResearchBatch({
          workspaceId,
          projectLabel,
          batchResults: runningResults,
          researchResult,
          savedResearchRecord,
          stratifiedPaths,
        });
        if (auto.saved) {
          setAutoExcelStatus('saved');
          setAutoExcelMessage(
            `Excel saved in project (${auto.exported} files, ${auto.skipped} skipped).`
          );
          onAutoExcelSaved?.();
        } else if (auto.reason === 'no_saved_reports') {
          setAutoExcelStatus('skipped');
          setAutoExcelMessage('Batch done — no full saved reports yet for auto Excel.');
        } else {
          setAutoExcelStatus('error');
          setAutoExcelMessage('Batch done — could not auto-save Excel to project.');
        }
      } catch {
        setAutoExcelStatus('error');
        setAutoExcelMessage('Batch done — auto Excel export failed.');
      }
    }

    onBatchComplete?.();
  }, [
    queueFiles,
    workspaceId,
    similarityThreshold,
    methodPreservation,
    continueOnError,
    skipSmellComparison,
    fileProgress,
    onBatchComplete,
    onAutoExcelSaved,
    researchResult,
    savedResearchRecord,
    stratifiedPaths,
    projectLabel,
    saveBatchSnapshot,
  ]);

  const resolveResearchSampleFiles = useCallback(
    (paths: string[]): FileInfo[] => {
      const order = new Map(paths.map((p, i) => [p, i]));
      return paths
        .map((p) => files.find((f) => f.relativePath === p))
        .filter((f): f is FileInfo => !!f)
        .sort(
          (a, b) =>
            (order.get(a.relativePath) ?? 999) - (order.get(b.relativePath) ?? 999)
        );
    },
    [files]
  );

  const rerunResearchSampleMultiLlm = useCallback(async () => {
    if (isRunning) return;

    let record = savedResearchRecord;
    if (!record) {
      record = await loadResearchSample(workspaceId);
      if (!record) {
        window.alert(
          'No saved research sample for this project.\n\nRun Analysis first, then use "Apply research sample" once to lock the manifest (seed 42, 15 files).'
        );
        return;
      }
      setSavedResearchRecord(record);
    }

    restoreSavedResearchSample(record);

    const paths = record.result.paths;
    const batchFiles = resolveResearchSampleFiles(paths);
    const missing = paths.filter((p) => !files.some((f) => f.relativePath === p));

    if (batchFiles.length === 0) {
      window.alert(
        'Research sample files are not on disk. Re-upload the project and run Analysis, then restore the sample.'
      );
      return;
    }

    const confirmMsg =
      `Re-run research sample with independent parallel multi-LLM?\n\n` +
      `• ${batchFiles.length} file(s) from saved manifest (seed ${record.result.config?.seed ?? '?'})\n` +
      `• OpenAI, Google Gemini, Claude — same frozen baseline per file (parallel, not chained)\n` +
      `• Candidates saved to .refactai/multi-llm/ only — live workspace not modified\n` +
      `• Full per-pass research metrics saved to saved-reports\n` +
      (missing.length
        ? `• Warning: ${missing.length} manifest path(s) missing from workspace — only ${batchFiles.length} will run\n`
        : '') +
      `\nThis overwrites saved reports for files in the sample. Continue?`;

    if (!window.confirm(confirmMsg)) return;

    setMaxBatchSize(Math.max(15, record.result.pickedCount || batchFiles.length));
    await startBatch(batchFiles);
  }, [
    isRunning,
    savedResearchRecord,
    workspaceId,
    restoreSavedResearchSample,
    resolveResearchSampleFiles,
    files,
    startBatch,
  ]);

  const handleClearBatchHistory = async () => {
    if (
      !window.confirm(
        'Clear saved batch results and LLM pipeline history for this project? This cannot be undone.'
      )
    ) {
      return;
    }
    await clearBatchRun(workspaceId);
    setResults([]);
    setSavedBatchAt(null);
    setBatchView('setup');
  };

  const stopBatch = () => {
    stopRef.current = true;
    abortRef.current?.abort();
    setIsRunning(false);
  };

  const exportCSV = () => {
    const headers = [
      'File',
      'Status',
      'Report saved',
      'PMD smells before',
      'PMD smells after',
      'PMD delta',
      'LOC before',
      'LOC after',
      'Complexity before',
      'Complexity after',
      'Maintainability before',
      'Maintainability after',
      'Testability before',
      'Testability after',
      'Overall score',
      'Semantic preservation %',
      'Smell resolution %',
      'Rejection Reason',
      'Duration (s)',
    ];
    const rows = results.map((r) => {
      const m = r.metrics;
      return [
        r.filePath,
        r.status,
        r.reportSaved ? 'yes' : 'no',
        m?.pmdSmells.before ?? r.smellsBefore ?? '',
        m?.pmdSmells.after ?? r.smellsAfter ?? '',
        m?.pmdSmells.change ?? r.smellDelta ?? '',
        m?.linesOfCode.before ?? '',
        m?.linesOfCode.after ?? '',
        m?.complexity.before ?? '',
        m?.complexity.after ?? '',
        m?.maintainability.before ?? '',
        m?.maintainability.after ?? '',
        m?.testability.before ?? '',
        m?.testability.after ?? '',
        m?.overallScore ?? '',
        m?.semanticPreservationPct ?? '',
        m?.smellResolutionPct ?? '',
        r.rejectionReason || r.error || '',
        r.durationMs ? (r.durationMs / 1000).toFixed(1) : '',
      ];
    });
    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-results-${workspaceId}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-results-${workspaceId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusIcon = (s: string) => {
    switch (s) {
      case 'accepted':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'proposed':
        return <CheckCircle className="w-4 h-4 text-cyan-400" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 text-amber-400" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case 'running':
        return <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-slate-500" />;
    }
  };

  const progress =
    results.length > 0
      ? Math.round((completed.length / results.length) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center space-x-2">
            <Zap className="w-6 h-6 text-yellow-400" />
            <span>Batch Refactoring</span>
          </h2>
          <p className="text-slate-400 mt-1 max-w-2xl">
            Select files from this repository, then run them through a multi-agent pipeline per LLM
            (OpenAI → Google Gemini → Claude). Each provider runs smell detection, planning,
            refactoring, and verification agents before the next provider starts.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-1.5">
              <FolderOpen className="w-4 h-4 text-blue-400" />
              <span className="text-white font-medium">{projectLabel}</span>
              {projectLabel !== workspaceId ? (
                <span className="text-slate-500 font-mono text-xs">({workspaceId})</span>
              ) : null}
            </span>
            <span className="text-slate-500">
              {projectJavaCount} Java · {smellyInProject} with smells · {displayList.length} in list
            </span>
            {savedBatchAt ? (
              <span className="text-xs text-emerald-300/90">
                Batch saved {new Date(savedBatchAt).toLocaleString()}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {results.length > 0 && !isRunning ? (
            <button
              type="button"
              onClick={() => void handleClearBatchHistory()}
              className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-red-900/40 text-slate-300 hover:text-red-300 rounded-lg flex items-center gap-1 border border-slate-600"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear batch history
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-700 pb-1">
        {(
          [
            ['setup', 'Setup'],
            ['results', `Results${results.length ? ` (${results.length})` : ''}`],
            ['llm-pipeline', 'LLM pipeline'],
            ...(refineDemo ? [] : ([['rq-charts', 'RQ charts']] as const)),
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setBatchView(id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-1.5 ${
              batchView === id
                ? 'bg-slate-800 text-white border border-b-0 border-slate-600'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {id === 'llm-pipeline' ? <Layers className="w-3.5 h-3.5" /> : null}
            {id === 'rq-charts' ? <Beaker className="w-3.5 h-3.5" /> : null}
            {label}
          </button>
        ))}
      </div>

      {isRunning && results.some((r) => r.status === 'running' && (activeLlmCount(r.activeLlms) > 0 || r.currentLlm)) ? (
        <div className="bg-violet-950/40 border border-violet-500/40 rounded-lg px-4 py-3 flex items-start gap-3">
          <RefreshCw className="w-5 h-5 text-violet-400 animate-spin shrink-0 mt-0.5" />
          <div className="text-sm min-w-0">
            {(() => {
              const running = results.find((r) => r.status === 'running');
              const parallel = activeLlmCount(running?.activeLlms) > 0;
              if (parallel && running?.activeLlms) {
                return (
                  <>
                    <span className="text-violet-200 font-medium">
                      Independent parallel multi-LLM — same frozen baseline ·{' '}
                    </span>
                    <span className="text-white">{running.fileName}</span>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {Object.entries(running.activeLlms).map(([key, p]) => (
                        <span
                          key={key}
                          className={`text-[10px] font-semibold px-2 py-1 rounded border inline-flex items-center gap-1 ${
                            key === 'openai'
                              ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                              : key === 'google'
                                ? 'text-sky-300 bg-sky-500/10 border-sky-500/30'
                                : 'text-orange-300 bg-orange-500/10 border-orange-500/30'
                          }`}
                        >
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          {p.provider}
                          {p.stepName ? ` · ${p.stepName}` : ''}
                        </span>
                      ))}
                    </div>
                  </>
                );
              }
              return (
                <>
                  <span className="text-blue-200 font-medium">Multi-LLM refactor in progress — </span>
                  <span className="text-white">
                    {running?.currentLlm?.provider ?? 'LLM'}{' '}
                    ({running?.currentLlm?.model?.split('/').pop()})
                  </span>
                  <span className="text-slate-400 ml-2">
                    pass {(running?.currentLlm?.passIndex ?? 0) + 1}/
                    {running?.currentLlm?.passTotal ?? 3}
                  </span>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {batchView === 'setup' ? (
      <>
      <div className="bg-slate-800/50 rounded-lg px-4 py-3 border border-slate-600 text-sm text-slate-300">
        <span className="text-white font-medium">
          {refineDemo ? 'Multi-LLM batch: ' : 'Research multi-LLM (automatic): '}
        </span>
        OpenAI, Google Gemini, and Claude run <strong className="text-violet-200">in parallel</strong>{' '}
        on the same frozen baseline per file (not chained). Each provider runs Analyze → Plan →
        Feasibility → LLM Refactor → Verify. See <strong className="text-violet-200">LLM pipeline</strong>{' '}
        tab for live per-provider status.
      </div>

      {!refineDemo ? (
      <div className="bg-violet-950/30 rounded-lg p-4 border border-violet-500/40">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Beaker className="w-5 h-5 text-violet-300" />
              Research sample (research study)
            </h3>
            <p className="text-sm text-violet-200/80 mt-1 max-w-3xl">
              Picks a reproducible random subset for evaluation: Cochran sample size from eligible
              files, stratified by smell count and LOC, fixed seed, max 15 files, max 2 with LOC
              &gt; 2000. Run <strong className="text-violet-100">Analysis</strong> first so PMD
              counts exist. Applying a sample saves the manifest to this project (
              <code className="text-violet-100/90">.refactai/research-sample-manifest.json</code>) so
              you can reopen it later without re-downloading.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 text-sm">
          <div className="bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700">
            <div className="text-slate-400 text-xs">Eligible files (N)</div>
            <div className="text-white font-semibold text-lg">{eligibleResearchCount}</div>
            <div className="text-slate-500 text-xs">main Java, ≥1 smell</div>
          </div>
          <div className="bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700">
            <div className="text-slate-400 text-xs">Target sample (n)</div>
            <div className="text-white font-semibold text-lg">{previewTargetN}</div>
            <div className="text-slate-500 text-xs">95% CI, capped at 15</div>
          </div>
          <div className="bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700">
            <label className="text-slate-400 text-xs block mb-1">Margin of error</label>
            <select
              value={marginOfError}
              onChange={(e) => setMarginOfError(parseFloat(e.target.value))}
              disabled={isRunning}
              className="w-full bg-slate-800 text-white text-sm rounded border border-slate-600 px-2 py-1"
            >
              <option value={0.05}>5% (larger n)</option>
              <option value={0.08}>8% (recommended)</option>
              <option value={0.1}>10% (smaller n)</option>
            </select>
          </div>
          <div className="bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700">
            <label className="text-slate-400 text-xs block mb-1">Random seed</label>
            <input
              type="number"
              value={researchSeed}
              onChange={(e) => setResearchSeed(parseInt(e.target.value, 10) || DEFAULT_RESEARCH_SEED)}
              disabled={isRunning}
              className="w-full bg-slate-800 text-white text-sm rounded border border-slate-600 px-2 py-1"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void applyResearchSample()}
            disabled={isRunning || eligibleResearchCount === 0 || researchPersistStatus === 'saving'}
            className="text-sm px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-600 text-white rounded-lg flex items-center gap-2 font-medium"
          >
            <Shuffle className="w-4 h-4" />
            {researchPersistStatus === 'saving' && researchPersistSource === 'apply'
              ? 'Applying & saving…'
              : `Apply research sample (${previewTargetN} files)`}
          </button>
          <button
            type="button"
            onClick={() => void applyNewResearchSample()}
            disabled={isRunning || eligibleResearchCount === 0 || pickNewBusy}
            className={`text-sm px-4 py-2 disabled:bg-slate-600 text-white rounded-lg flex items-center gap-2 font-medium border ${
              isNewStudySample
                ? 'bg-emerald-700 border-emerald-400/60 hover:bg-emerald-600'
                : 'bg-indigo-700 hover:bg-indigo-600 border-indigo-500/40'
            }`}
            title="New random seed; archives previous manifest; excludes old sample paths"
          >
            {pickNewBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Beaker className="w-4 h-4" />
            )}
            {pickNewBusy
              ? 'Picking & saving NEW sample…'
              : isNewStudySample
                ? `NEW sample locked (${activeSampleFileCount} files)`
                : 'Pick NEW research sample'}
          </button>
          {researchResult ? (
            <button
              type="button"
              onClick={() =>
                downloadResearchSampleManifest(workspaceId, projectLabel, researchResult)
              }
              disabled={isRunning}
              className="text-sm px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg flex items-center gap-2"
              title="Optional copy for your paper appendix or offline archive"
            >
              <Download className="w-4 h-4" />
              Download copy (JSON)
            </button>
          ) : null}
          {savedResearchRecord && !researchResult ? (
            <button
              type="button"
              onClick={() => restoreSavedResearchSample(savedResearchRecord)}
              disabled={isRunning}
              className="text-sm px-3 py-2 bg-slate-700 hover:bg-slate-600 text-emerald-200 rounded-lg flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Restore saved sample ({savedResearchRecord.result.pickedCount} files)
            </button>
          ) : null}
          {(savedResearchRecord || researchResult || stratifiedPaths.size > 0) ? (
            <button
              type="button"
              onClick={() => void rerunResearchSampleMultiLlm()}
              disabled={isRunning || eligibleResearchCount === 0}
              className="text-sm px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-600 text-white rounded-lg flex items-center gap-2 font-medium border border-emerald-500/40"
              title="Restore manifest + batch all sample files with OpenAI → Google → Claude (full per-pass metrics)"
            >
              <Layers className="w-4 h-4" />
              Re-run research sample (multi-LLM)
            </button>
          ) : null}
        </div>

        {sampleLockedInUi && savedResearchRecord ? (
          <div
            className={`mt-3 rounded-lg border px-4 py-3 text-sm ${
              isNewStudySample
                ? 'border-emerald-500/40 bg-emerald-950/40'
                : 'border-violet-500/40 bg-violet-950/30'
            }`}
          >
            <p
              className={`font-semibold flex items-center gap-2 ${
                isNewStudySample ? 'text-emerald-200' : 'text-violet-200'
              }`}
            >
              <CheckCircle className="w-4 h-4 shrink-0" />
              {isNewStudySample
                ? 'New research sample locked in UI'
                : 'Research sample locked in UI'}
            </p>
            <ul
              className={`mt-2 space-y-1 text-xs list-disc list-inside ${
                isNewStudySample ? 'text-emerald-100/90' : 'text-violet-100/90'
              }`}
            >
              <li>
                <strong>{activeSampleFileCount} files</strong> checked below (violet rows)
              </li>
              <li>
                Seed: <strong>{activeSampleSeed}</strong>
                {isNewStudySample ? ' (new study — not seed 42)' : null}
              </li>
              {activeSampleId ? (
                <li>
                  Sample id: <code className="opacity-90">{activeSampleId}</code>
                </li>
              ) : null}
              <li>
                Run queue: <strong>{queueFiles.length}</strong> file(s) ready for batch
              </li>
            </ul>
            <p
              className={`mt-2 text-xs ${
                isNewStudySample ? 'text-emerald-200/80' : 'text-violet-200/80'
              }`}
            >
              Next: click <strong>Re-run research sample (multi-LLM)</strong>.
            </p>
          </div>
        ) : savedResearchRecord && !sampleLockedInUi ? (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-950/30 px-4 py-2 text-xs text-amber-200">
            Manifest saved on disk but file list is not synced — click{' '}
            <button
              type="button"
              className="underline font-semibold"
              onClick={() => restoreSavedResearchSample(savedResearchRecord)}
            >
              Restore saved sample ({savedResearchRecord.result.pickedCount} files)
            </button>
          </div>
        ) : null}

        {savedResearchRecord ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-violet-200/90">
            <Save className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              Saved in project · {formatSavedResearchSampleWhen(savedResearchRecord.savedAt)} · seed{' '}
              {savedResearchRecord.result.config.seed} · {savedResearchRecord.result.pickedCount}{' '}
              files
            </span>
            {researchPersistStatus === 'saved' ? (
              <span className="text-emerald-400">(just saved)</span>
            ) : null}
            {researchPersistStatus === 'error' ? (
              <span className="text-amber-400">(browser only — workspace save failed)</span>
            ) : null}
          </div>
        ) : null}

        {savedResearchRecord ? (
          <p className="text-xs text-emerald-200/80 mt-2">
            Use <strong className="text-emerald-100">Re-run research sample (multi-LLM)</strong> to
            batch all manifest files with OpenAI → Google → Claude and save full per-pass metrics
            (after restarting agents with the latest code).
          </p>
        ) : null}

        {stratifiedSummary ? (
          <pre className="text-xs text-violet-100/90 bg-slate-900/60 border border-violet-500/30 rounded-lg px-3 py-2 mt-3 whitespace-pre-wrap font-sans">
            {stratifiedSummary}
          </pre>
        ) : null}

        {lockedSampleDisplayFiles.length > 0 ? (
          <div
            className={`mt-3 rounded-lg border px-3 py-2 ${
              isNewStudySample
                ? 'border-emerald-500/30 bg-emerald-950/20'
                : 'border-violet-500/30 bg-slate-900/40'
            }`}
          >
            <p
              className={`text-xs font-semibold mb-2 ${
                isNewStudySample ? 'text-emerald-200' : 'text-violet-200'
              }`}
            >
              Locked sample files ({lockedSampleDisplayFiles.length})
            </p>
            <ul className="max-h-36 overflow-y-auto text-xs font-mono space-y-0.5 text-slate-200">
              {lockedSampleDisplayFiles.map((f) => (
                <li
                  key={f.path}
                  className={f.onDisk ? '' : 'text-amber-400 line-through'}
                  title={f.path}
                >
                  {f.name}
                  {!f.onDisk ? ' (missing on disk)' : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      ) : null}

      <div
        ref={fileListRef}
        className="bg-slate-800 rounded-lg p-4 border border-slate-700"
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search files…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={isRunning}
              className="w-full bg-slate-700 text-white pl-10 pr-4 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none text-sm"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as FileListSortKey)}
            disabled={isRunning}
            className="bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600 text-sm"
          >
            <option value="smells-desc">Code smells (high → low)</option>
            <option value="smells-asc">Code smells (low → high)</option>
            <option value="size">Sort by size</option>
            <option value="name">Sort by name</option>
            <option value="type">Sort by type</option>
          </select>
          <div className="flex items-center space-x-2">
            <label className="text-sm text-slate-400 whitespace-nowrap">Max per batch:</label>
            <input
              type="number"
              value={maxBatchSize}
              onChange={(e) =>
                setMaxBatchSize(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 12)))
              }
              className="w-14 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm"
              min={1}
              max={100}
              disabled={isRunning}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <label className="flex items-center space-x-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={onlySmelly}
              onChange={(e) => setOnlySmelly(e.target.checked)}
              className="w-4 h-4 rounded border-slate-500 bg-slate-700"
              disabled={isRunning}
            />
            <Filter className="w-3.5 h-3.5" />
            <span>Only files with code smells</span>
          </label>
          <button
            type="button"
            onClick={selectAllVisible}
            disabled={isRunning}
            className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded flex items-center gap-1"
          >
            <CheckSquare className="w-3 h-3" />
            Select all shown ({displayList.length})
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={isRunning}
            className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded flex items-center gap-1"
          >
            <SquareIcon className="w-3 h-3" />
            Clear selection
          </button>
          <span className="text-sm text-slate-500">
            Run queue: <span className="text-white font-semibold">{queueFiles.length}</span>
            <span className="text-slate-500 ml-1">({queueHint})</span>
            {selectedPaths.size > 0 ? (
              <span className="ml-2 text-violet-300 font-medium">
                · {selectedPaths.size} selected for research
              </span>
            ) : null}
          </span>
        </div>


        <div className="max-h-64 overflow-y-auto border border-slate-700 rounded-lg mb-4 divide-y divide-slate-700/80">
          {displayList.length === 0 ? (
            <p className="text-slate-500 text-sm p-4">
              {projectJavaCount === 0
                ? 'No project sources on disk — re-upload the repository from Project Hub, then Run Analysis.'
                : 'No Java files match. Run analysis on the Files tab, or adjust filters.'}
            </p>
          ) : (
            displayList.map((f) => {
              const pmd = effectivePmdCount(f, fileProgress);
              const inQueue =
                queueFiles.some((q) => q.relativePath === f.relativePath) && !isRunning;
              const isStratifiedPick = pathInSet(stratifiedPaths, f.relativePath);
              const pickedMeta = researchResult?.picked.find(
                (p) => normalizeFilePath(p.path) === normalizeFilePath(f.relativePath)
              );
              const stratum = pickedMeta?.smellStratum ?? null;
              const locStr = pickedMeta?.locStratum ?? null;
              return (
                <label
                  key={f.relativePath}
                  className={`flex items-center gap-3 px-3 py-2 hover:bg-slate-700/40 cursor-pointer text-sm ${
                    inQueue ? 'bg-green-900/10' : ''
                  } ${isStratifiedPick ? 'bg-violet-900/15 ring-1 ring-inset ring-violet-500/40' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={pathInSet(selectedPaths, f.relativePath)}
                    onChange={() => togglePath(f.relativePath)}
                    disabled={isRunning}
                    className="w-4 h-4 rounded border-slate-500 bg-slate-700 shrink-0"
                  />
                  <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span
                    className="text-white font-mono truncate flex-1 min-w-0"
                    title={f.relativePath}
                  >
                    {f.name}
                  </span>
                  {stratum && isStratifiedPick && stratumBadge(stratum)}
                  {locStr && isStratifiedPick && locBadge(locStr)}
                  {pmd !== null && pmd > 0 ? (
                    <span className="text-xs font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded shrink-0">
                      {pmd} smells
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 shrink-0">0 smells</span>
                  )}
                </label>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm text-slate-400">Similarity:</label>
            <input
              type="number"
              value={similarityThreshold}
              onChange={(e) =>
                setSimilarityThreshold(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.965)))
              }
              className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm"
              step={0.01}
              min={0}
              max={1}
              disabled={isRunning}
            />
          </div>
          <div className="flex items-center space-x-2">
            <label className="text-sm text-slate-400">Method%:</label>
            <input
              type="number"
              value={methodPreservation}
              onChange={(e) =>
                setMethodPreservation(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.85)))
              }
              className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm"
              step={0.05}
              min={0}
              max={1}
              disabled={isRunning}
            />
          </div>
          <label className="flex items-center space-x-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={continueOnError}
              onChange={(e) => setContinueOnError(e.target.checked)}
              disabled={isRunning}
              className="w-4 h-4 rounded"
            />
            <span>Continue on error</span>
          </label>
          <label className="flex items-center space-x-2 text-sm text-slate-300 cursor-pointer" title="Faster batch; Excel still has agent metrics">
            <input
              type="checkbox"
              checked={skipSmellComparison}
              onChange={(e) => setSkipSmellComparison(e.target.checked)}
              disabled={isRunning}
              className="w-4 h-4 rounded"
            />
            <span>Skip live smell diff (faster)</span>
          </label>

          <div className="flex-1" />

          {!isRunning ? (
            <button
              type="button"
              onClick={() => void startBatch()}
              disabled={queueFiles.length === 0}
              className="px-5 py-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-600 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
            >
              <Play className="w-4 h-4" />
              <span>Start batch ({queueFiles.length})</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopBatch}
              className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
            >
              <Square className="w-4 h-4" />
              <span>Stop</span>
            </button>
          )}
        </div>
      </div>

      {results.length === 0 && !isRunning && batchLoadStatus === 'loaded' ? (
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 text-center">
          <Zap className="w-12 h-12 text-slate-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-white mb-2">Ready for batch refactoring</h3>
          <p className="text-slate-400 text-sm max-w-lg mx-auto">
            Use sort (e.g. high → low smells), check files or leave unchecked to run the top N by
            sort. Default max is 12 per batch. Keep this tab open until the queue finishes.
          </p>
        </div>
      ) : null}
      </>
      ) : null}

      {batchView === 'results' && results.length > 0 ? (
        <>
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">
                {isRunning
                  ? `Processing file ${currentIndex + 1}/${results.length}…`
                  : 'Complete'}{' '}
                — {completed.length}/{results.length}
              </span>
              <span className="text-sm text-white font-medium">{progress}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ${isRunning ? 'bg-blue-500' : 'bg-green-500'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 text-center">
              <div className="text-2xl font-bold text-white">{results.length}</div>
              <div className="text-xs text-slate-400">Total</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 border border-green-600/30 text-center">
              <div className="text-2xl font-bold text-green-400">{accepted.length}</div>
              <div className="text-xs text-slate-400">Accepted</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 border border-cyan-600/30 text-center">
              <div className="text-2xl font-bold text-cyan-400">{proposed.length}</div>
              <div className="text-xs text-slate-400">Proposed (not applied)</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 border border-amber-600/30 text-center">
              <div className="text-2xl font-bold text-amber-400">{rejected.length}</div>
              <div className="text-xs text-slate-400">Rejected (unchanged)</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 border border-red-600/30 text-center">
              <div className="text-2xl font-bold text-red-400">{errors.length}</div>
              <div className="text-xs text-slate-400">Errors</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 border border-cyan-600/30 text-center">
              <div className="text-2xl font-bold text-cyan-400">{reportsSaved.length}</div>
              <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
                <Save className="w-3 h-3" /> Reports saved
              </div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 border border-blue-600/30 text-center">
              <div
                className={`text-2xl font-bold ${totalSmellDelta > 0 ? 'text-green-400' : totalSmellDelta < 0 ? 'text-red-400' : 'text-slate-400'}`}
              >
                {totalSmellDelta > 0 ? '-' : ''}
                {Math.abs(totalSmellDelta)}
              </div>
              <div className="text-xs text-slate-400">PMD smell Δ (sum)</div>
            </div>
          </div>

          {autoExcelStatus !== 'idle' ? (
            <div
              className={`mt-3 text-sm rounded-lg px-3 py-2 border flex items-center gap-2 ${
                autoExcelStatus === 'running'
                  ? 'bg-blue-900/20 border-blue-500/30 text-blue-200'
                  : autoExcelStatus === 'saved'
                    ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-200'
                    : autoExcelStatus === 'skipped'
                      ? 'bg-slate-900/40 border-slate-600 text-slate-300'
                      : 'bg-amber-900/20 border-amber-500/30 text-amber-200'
              }`}
            >
              {autoExcelStatus === 'running' ? (
                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <FileText className="w-4 h-4 shrink-0" />
              )}
              <span>
                {autoExcelStatus === 'running'
                  ? 'Saving Excel workbook to project…'
                  : autoExcelMessage ?? 'Excel export updated.'}
              </span>
            </div>
          ) : null}
        </>
      ) : batchView === 'results' && results.length === 0 && !isRunning ? (
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 text-center text-slate-400 text-sm">
          No batch results yet. Run a batch from the Setup tab or restore a saved research sample.
        </div>
      ) : null}

      {batchView === 'results' && results.length > 0 ? (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <h3 className="text-white font-semibold flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-blue-400" />
              <span>Results</span>
            </h3>
            {!isRunning && completed.length > 0 && (
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={exportCSV}
                  className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded flex items-center space-x-1"
                >
                  <Download className="w-3 h-3" />
                  <span>CSV</span>
                </button>
                <button
                  type="button"
                  onClick={exportJSON}
                  className="text-xs px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded flex items-center space-x-1"
                >
                  <Download className="w-3 h-3" />
                  <span>JSON</span>
                </button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <p className="px-4 py-2 text-[11px] text-slate-500 border-b border-slate-700/50">
              Metrics are from the agent research pipeline (same as single-file refactor). PMD smells =
              verification smell count on the source analyzed at run time; research re-runs restore the
              oldest <code className="text-slate-400">.backup.</code> baseline when the file was already
              refactored. Expand a row for Halstead, coupling, tokens, and more.
            </p>
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <BatchResultsMetricHeaderRow />
              </thead>
              <tbody>
                {results.map((r) => {
                  const rowMetrics =
                    normalizeBatchFileMetrics(r.metrics) ??
                    minimalBatchFileMetrics(r.smellsBefore, r.smellsAfter);
                  return (
                    <React.Fragment key={r.filePath}>
                      <tr
                        className={`${r.status === 'running' ? 'bg-blue-900/10' : ''}`}
                      >
                        <td className="px-4 py-2.5 border-b border-slate-700/30">
                          <div className="flex items-center space-x-1.5">
                            {statusIcon(r.status)}
                            <span
                              className={`text-xs font-medium ${
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
                          </div>
                        </td>
                        <td className="px-4 py-2.5 border-b border-slate-700/30">
                          <span
                            className="text-white text-xs font-mono truncate block max-w-[180px]"
                            title={r.filePath}
                          >
                            {r.fileName}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-center border-b border-slate-700/30">
                          {r.reportSaved ? (
                            <span title="Full report saved">
                              <CheckCircle className="w-4 h-4 text-cyan-400 mx-auto" />
                            </span>
                          ) : r.status === 'running' ? (
                            <span className="text-slate-600">…</span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <BatchResultsMetricCells metrics={rowMetrics} />
                        <td className="px-4 py-2.5 border-b border-slate-700/30">
                          <span
                            className="text-xs text-slate-400 truncate block max-w-[200px]"
                            title={r.progressMessage || r.rejectionReason || r.error || ''}
                          >
                            {r.progressMessage || r.rejectionReason || r.error || ''}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-400 text-xs border-b border-slate-700/30">
                          {r.durationMs ? `${(r.durationMs / 1000).toFixed(0)}s` : '-'}
                        </td>
                      </tr>
                      {(r.status === 'accepted' || r.status === 'proposed' || r.status === 'rejected') &&
                      r.metrics ? (
                        <BatchResultMetricsExpand
                          metrics={r.metrics}
                          workspaceId={workspaceId}
                          filePath={r.filePath}
                        />
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {batchView === 'llm-pipeline' ? (
        <BatchLlmPipelineView results={results} parallelMode />
      ) : null}

      {batchView === 'rq-charts' && !refineDemo ? <BatchRqChartsPanel results={results} /> : null}
    </div>
  );
}
