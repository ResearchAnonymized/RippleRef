'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  FlaskConical,
  GitCompare,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import {
  BASELINE_DOWNLOADS,
  type BaselineConfig,
  type BaselineProvider,
  type BaselineRunSummary,
  type CompareSummary,
  type RecoverySummary,
  baselineDownloadUrl,
  runBaselineBatchDry,
  runBaselineBatchSmoke,
  runBaselineBatchExecute,
  fetchBaselineBatchLatest,
  type BaselineBatchSummary,
  fetchBaselineJob,
  fetchBaselineStatus,
  recoverSelectedFiles,
  select150Stratified,
  verifyRefineCoverage,
  type Select150Summary,
  type RefineCoverageSummary,
  runDryBaseline,
  runFullBaseline,
  runSmokeBaseline,
  runSubsetBaseline,
  compareBaselineRefine,
  fetchBatchLiveProgress,
  watchBaselineJob,
} from '../lib/baselineComparisonClient';

const PROVIDERS: { id: BaselineProvider; label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'google', label: 'Google' },
  { id: 'anthropic', label: 'Anthropic' },
];

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-600 bg-slate-800/60 p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-lg font-semibold text-white mt-1">{value}</div>
    </div>
  );
}

function DownloadLinks({ names }: { names: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {names.map((name) => (
        <a
          key={name}
          href={baselineDownloadUrl(name)}
          download={name}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs"
        >
          <Download className="w-3.5 h-3.5" />
          {name}
        </a>
      ))}
    </div>
  );
}

export default function BaselineComparisonPanel() {
  const [cfg, setCfg] = useState<BaselineConfig>({
    providerId: 'openai',
    model: '',
    systemFilter: '',
    sampleIdFilter: '',
    subsetLimit: 10,
  });
  const [confirmSubset, setConfirmSubset] = useState(false);
  const [confirmFull, setConfirmFull] = useState(false);

  const [recovery, setRecovery] = useState<RecoverySummary | null>(null);
  const [select150, setSelect150] = useState<Select150Summary | null>(null);
  const [refineCoverage, setRefineCoverage] = useState<RefineCoverageSummary | null>(null);
  const [runSummary, setRunSummary] = useState<BaselineRunSummary | null>(null);
  const [compareSummary, setCompareSummary] = useState<CompareSummary | null>(null);

  const [recovering, setRecovering] = useState(false);
  const [selecting150, setSelecting150] = useState(false);
  const [running, setRunning] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    attempted?: number;
    successful?: number;
    failed?: number;
    skipped?: number;
    pass_index?: number;
    pass_total?: number;
    file_index?: number;
    files_total?: number;
    current_provider?: string;
    current_file?: string;
    current_system?: string;
    elapsed_s?: number;
    message?: string;
    provider_ok_openai?: number;
    provider_ok_google?: number;
    provider_ok_anthropic?: number;
    provider_fail_openai?: number;
    provider_fail_google?: number;
    provider_fail_anthropic?: number;
    files_complete?: number;
    files_in_progress?: number;
  }>({});

  const [agentsReady, setAgentsReady] = useState<boolean | null>(null);

  useEffect(() => {
    fetchBaselineStatus()
      .then(() => setAgentsReady(true))
      .catch(() => setAgentsReady(false));
  }, []);

  const recoveryDownloads = useMemo(
    () => [
      'baseline_selected_450_files.csv',
      'baseline_selected_450_files.json',
      'selected_files_summary.md',
      'candidate_selection_sources.md',
    ],
    []
  );

  const resultDownloads = useMemo(
    () => ['direct_prompt_baseline_results.csv', 'baseline_direct_prompt_summary.md'],
    []
  );

  const compareDownloads = useMemo(
    () => [
      'baseline_vs_refine_comparison.csv',
      'baseline_vs_refine_summary.csv',
      'baseline_vs_refine_stats.md',
      'baseline_prompt_and_config.md',
    ],
    []
  );

  const handleSelect150 = useCallback(async () => {
    setSelecting150(true);
    setError(null);
    try {
      const res = await select150Stratified(42);
      setSelect150(res);
      const cov = await verifyRefineCoverage();
      setRefineCoverage(cov);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Select 150 failed');
    } finally {
      setSelecting150(false);
    }
  }, []);

  const handleRecover = useCallback(async () => {
    setRecovering(true);
    setError(null);
    try {
      const res = await recoverSelectedFiles();
      setRecovery({
        totalRecovered: res.totalRecovered,
        uniqueJavaFiles: res.uniqueJavaFiles,
        systemCount: res.systemCount,
        perSystem: res.perSystem,
        exactly450: res.exactly450,
        refinePassesMatched: res.refinePassesMatched,
        refinePassesExpected: res.refinePassesExpected,
        refinePassesMatchedExactly: res.refinePassesMatchedExactly,
        warnings: res.warnings || [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recovery failed');
    } finally {
      setRecovering(false);
    }
  }, []);

  const finishJob = useCallback(async (id: string) => {
    try {
      const job = await fetchBaselineJob(id);
      if (job.result?.summary) {
        const s = job.result.summary as Record<string, unknown>;
        if ('passesTotal' in s) {
          setBatchSummary(s as BaselineBatchSummary);
        } else {
          setRunSummary(job.result.summary);
        }
      }
      if (job.error) setError(job.error);
    } catch {
      /* ignore */
    } finally {
      setRunning(false);
      setBatchRunning(false);
    }
  }, []);

  const [batchSummary, setBatchSummary] = useState<BaselineBatchSummary | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);

  const batchOpts = useMemo(
    () => ({
      systemFilter: cfg.systemFilter,
      sampleIdFilter: cfg.sampleIdFilter,
      resume: true,
    }),
    [cfg.systemFilter, cfg.sampleIdFilter]
  );

  const startJob = useCallback(
    (id: string) => {
      setJobId(id);
      setRunning(true);
      setProgress({});
      const unsub = watchBaselineJob(id, (evt) => {
        if (evt.type === 'baseline_progress' || evt.message) {
          const e = evt as Record<string, unknown>;
          setProgress((prev) => ({
            ...prev,
            attempted: (e.attempted as number | undefined) ?? prev.attempted,
            successful: (e.successful as number | undefined) ?? prev.successful,
            failed: (e.failed as number | undefined) ?? prev.failed,
            skipped: (e.skipped as number | undefined) ?? prev.skipped,
            pass_index: (e.pass_index as number | undefined) ?? prev.pass_index,
            pass_total: (e.pass_total as number | undefined) ?? prev.pass_total,
            file_index: (e.file_index as number | undefined) ?? prev.file_index,
            files_total: (e.files_total as number | undefined) ?? prev.files_total,
            files_complete: (e.files_complete as number | undefined) ?? prev.files_complete,
            files_in_progress:
              (e.files_in_progress as number | undefined) ?? prev.files_in_progress,
            current_provider: (e.current_provider as string | undefined) ?? prev.current_provider,
            current_file: (e.current_file as string | undefined) ?? prev.current_file,
            current_system: (e.current_system as string | undefined) ?? prev.current_system,
            elapsed_s: (e.elapsed_s as number | undefined) ?? prev.elapsed_s,
            message: (e.message as string) || evt.message || prev.message,
            provider_ok_openai:
              (e.provider_ok_openai as number | undefined) ?? prev.provider_ok_openai,
            provider_ok_google:
              (e.provider_ok_google as number | undefined) ?? prev.provider_ok_google,
            provider_ok_anthropic:
              (e.provider_ok_anthropic as number | undefined) ?? prev.provider_ok_anthropic,
            provider_fail_openai:
              (e.provider_fail_openai as number | undefined) ?? prev.provider_fail_openai,
            provider_fail_google:
              (e.provider_fail_google as number | undefined) ?? prev.provider_fail_google,
            provider_fail_anthropic:
              (e.provider_fail_anthropic as number | undefined) ?? prev.provider_fail_anthropic,
          }));
        }
        if (evt.type === 'done') {
          if (evt.result?.summary) {
            const s = evt.result.summary as Record<string, unknown>;
            if ('passesTotal' in s) {
              setBatchSummary(s as BaselineBatchSummary);
            } else {
              setRunSummary(evt.result.summary);
            }
          }
          if (evt.error) setError(evt.error);
          setRunning(false);
          setBatchRunning(false);
          void finishJob(id);
          unsub();
        }
      });
    },
    [finishJob]
  );

  const startBatchJob = useCallback(
    (jobId: string) => {
      setBatchRunning(true);
      startJob(jobId);
    },
    [startJob]
  );

  useEffect(() => {
    if (!batchRunning && !jobId) return;
    let cancelled = false;

    const applyLive = (live: Awaited<ReturnType<typeof fetchBatchLiveProgress>>['progress']) => {
      setProgress((prev) => ({
        ...prev,
        successful: live.passesOk,
        failed: live.passesFailed,
        attempted: live.passesDone,
        skipped: live.passesSkipped ?? prev.skipped,
        pass_index: live.passesDone,
        pass_total: live.passTotal,
        files_complete: live.filesComplete,
        files_in_progress: live.filesInProgress,
        file_index: live.filesComplete + (live.filesInProgress > 0 ? 1 : 0),
        files_total: live.filesTotal,
        provider_ok_openai: live.providerOkOpenai,
        provider_ok_google: live.providerOkGoogle,
        provider_ok_anthropic: live.providerOkAnthropic,
        provider_fail_openai: live.providerFailOpenai,
        provider_fail_google: live.providerFailGoogle,
        provider_fail_anthropic: live.providerFailAnthropic,
      }));
    };

    const poll = async () => {
      try {
        const { progress: live } = await fetchBatchLiveProgress();
        if (cancelled) return;
        applyLive(live);
        if (jobId) {
          const job = await fetchBaselineJob(jobId);
          if (cancelled || !job.progress) return;
          const p = job.progress as Record<string, unknown>;
          setProgress((prev) => ({
            ...prev,
            ...p,
            successful: (p.successful as number | undefined) ?? prev.successful,
            failed: (p.failed as number | undefined) ?? prev.failed,
            provider_ok_openai:
              (p.provider_ok_openai as number | undefined) ?? prev.provider_ok_openai,
            provider_ok_google:
              (p.provider_ok_google as number | undefined) ?? prev.provider_ok_google,
            provider_ok_anthropic:
              (p.provider_ok_anthropic as number | undefined) ?? prev.provider_ok_anthropic,
          }));
        }
      } catch {
        /* agents may be restarting */
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [batchRunning, jobId]);

  const handleDryRun = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await runDryBaseline(cfg, cfg.subsetLimit || 5);
      setRunSummary(res.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dry run failed');
    } finally {
      setRunning(false);
    }
  };

  const handleSmoke = async () => {
    setError(null);
    try {
      const res = await runSmokeBaseline(cfg);
      startJob(res.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Smoke test failed');
    }
  };

  const handleSubset = async () => {
    if (!confirmSubset) return;
    setError(null);
    try {
      const res = await runSubsetBaseline(cfg);
      startJob(res.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Subset run failed');
    }
  };

  const handleFull = async () => {
    if (!confirmFull) return;
    setError(null);
    try {
      const res = await runFullBaseline(cfg);
      startJob(res.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Full baseline failed');
    }
  };

  const handleCompare = async () => {
    setComparing(true);
    setError(null);
    try {
      const res = await compareBaselineRefine(cfg);
      setCompareSummary(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Comparison failed');
    } finally {
      setComparing(false);
    }
  };

  const handleBatchDry = async () => {
    setError(null);
    try {
      const res = await runBaselineBatchDry(batchOpts);
      setBatchSummary(res.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch dry-run failed');
    }
  };

  const handleBatchSmoke = async () => {
    setError(null);
    try {
      const res = await runBaselineBatchSmoke({ ...batchOpts, limit: 3 });
      startBatchJob(res.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch smoke failed');
    }
  };

  const handleBatchSubset = async () => {
    if (!confirmSubset) return;
    setError(null);
    try {
      const res = await runBaselineBatchExecute({
        ...batchOpts,
        confirmSubset: true,
        limit: cfg.subsetLimit,
      });
      startBatchJob(res.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch subset failed');
    }
  };

  const handleBatchFull = async () => {
    if (!confirmFull) return;
    setError(null);
    try {
      const res = await runBaselineBatchExecute({
        ...batchOpts,
        confirmExecute: true,
        limit: undefined,
      });
      startBatchJob(res.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch 150×3 execute failed');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex items-start gap-3">
        <GitCompare className="w-8 h-8 text-amber-400 shrink-0 mt-1" />
        <div>
          <h2 className="text-2xl font-bold text-white">Baseline Comparison</h2>
          <p className="text-slate-400 text-sm mt-1">
            Safe baseline study: stratified 150 files, existing REFINE outputs reused (no REFINE
            rerun). Default is dry-run only.
          </p>
          {agentsReady === false && (
            <p className="text-amber-300 text-sm mt-2 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              Agents service unreachable. Start the Python agents service (port from ports.env).
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* 1. Recover */}
      <section className="rounded-xl border border-slate-600 bg-slate-800/40 p-5">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-blue-400" />
          1. Recover selected files
        </h3>
        <p className="text-slate-400 text-sm mt-2">
          Scan saved REFINE reports and recover the 450-file RQ3 strict complete-case cohort.
        </p>
        <button
          type="button"
          onClick={() => void handleRecover()}
          disabled={recovering}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm"
        >
          {recovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Recover selected 450 files
        </button>
        {recovery && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Total recovered" value={recovery.totalRecovered} />
              <StatCard label="Unique Java files" value={recovery.uniqueJavaFiles} />
              <StatCard label="Systems" value={recovery.systemCount} />
              <StatCard label="Exactly 450?" value={recovery.exactly450 ? 'Yes' : 'No'} />
            </div>
            <p className="text-sm text-slate-300">
              REFINE provider-pass outputs: {recovery.refinePassesMatched} /{' '}
              {recovery.refinePassesExpected}
              {recovery.refinePassesMatchedExactly ? ' (matched)' : ' (mismatch)'}
            </p>
            {Object.keys(recovery.perSystem).length > 0 && (
              <details className="text-sm text-slate-400">
                <summary className="cursor-pointer text-slate-300">Per-system counts</summary>
                <ul className="mt-2 space-y-1">
                  {Object.entries(recovery.perSystem).map(([name, count]) => (
                    <li key={name}>
                      {name}: {count}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {recovery.warnings.length > 0 && (
              <ul className="text-amber-200 text-sm list-disc pl-5">
                {recovery.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <DownloadLinks names={recoveryDownloads} />
          </div>
        )}
      </section>

      {/* 1b. Select 150 stratified */}
      <section className="rounded-xl border border-cyan-600/40 bg-cyan-950/20 p-5">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-cyan-400" />
          1b. Select 150 stratified baseline cohort
        </h3>
        <p className="text-slate-400 text-sm mt-2">
          10 files per system × 15 systems from the 450-file REFINE cohort. Stratified by baseline
          PMD count and LOC (seed 42). Verifies existing REFINE outputs — does not rerun REFINE.
        </p>
        <button
          type="button"
          onClick={() => void handleSelect150()}
          disabled={selecting150}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm"
        >
          {selecting150 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Select 150 + verify REFINE
        </button>
        {select150 && (
          <div className="mt-4 space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Selected" value={select150.selectedCount} />
              <StatCard label="Systems" value={select150.systemCount} />
              <StatCard
                label="REFINE passes"
                value={`${select150.refinePassesMatched}/${select150.refinePassesExpected}`}
              />
              <StatCard
                label="All REFINE matched?"
                value={select150.refineAllMatched ? 'Yes' : 'No'}
              />
            </div>
            <DownloadLinks names={['selected_150_baseline_files.csv', 'refine_coverage_150.json']} />
          </div>
        )}
        {refineCoverage && !refineCoverage.allMatched && (
          <p className="text-amber-200 text-sm mt-2">
            Warning: not all 150×3 REFINE passes matched on disk.
          </p>
        )}
      </section>

      {/* 2. Config */}
      <section className="rounded-xl border border-slate-600 bg-slate-800/40 p-5">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-purple-400" />
          2. Baseline configuration
        </h3>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-slate-400">Provider</span>
            <select
              value={cfg.providerId}
              onChange={(e) => setCfg((c) => ({ ...c, providerId: e.target.value as BaselineProvider }))}
              className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 text-white px-3 py-2"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-400">Model name (optional)</span>
            <input
              value={cfg.model}
              onChange={(e) => setCfg((c) => ({ ...c, model: e.target.value }))}
              placeholder="Default from agents/.env"
              className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 text-white px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-400">Subset limit N</span>
            <input
              type="number"
              min={1}
              max={450}
              value={cfg.subsetLimit}
              onChange={(e) => setCfg((c) => ({ ...c, subsetLimit: Number(e.target.value) || 10 }))}
              className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 text-white px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-400">Optional system filter</span>
            <input
              value={cfg.systemFilter}
              onChange={(e) => setCfg((c) => ({ ...c, systemFilter: e.target.value }))}
              placeholder="e.g. jabref"
              className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 text-white px-3 py-2"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="text-slate-400">Optional sample ID filter</span>
            <input
              value={cfg.sampleIdFilter}
              onChange={(e) => setCfg((c) => ({ ...c, sampleIdFilter: e.target.value }))}
              className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 text-white px-3 py-2"
            />
          </label>
        </div>
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-amber-100 text-sm">
          Direct-prompt baseline is for research comparison only and does not use REFINE&apos;s
          multi-agent workflow.
        </div>
      </section>

      {/* 3. Safety */}
      <section className="rounded-xl border border-slate-600 bg-slate-800/40 p-5">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-orange-400" />
          3. Safety confirmation
        </h3>
        <ul className="mt-3 text-sm text-slate-400 space-y-2 list-disc pl-5">
          <li>Dry run: no confirmation required (lists / validates only).</li>
          <li>Smoke test: at most 3 files, no extra checkbox.</li>
          <li>Subset (N×3) and full 150×3 execute require explicit confirmation below.</li>
        </ul>
        <label className="mt-4 flex items-start gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={confirmSubset}
            onChange={(e) => setConfirmSubset(e.target.checked)}
            className="mt-1"
          />
          I confirm I want to run a subset batch (N×3, uses Subset limit N in section 2).
        </label>
        <label className="mt-2 flex items-start gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={confirmFull}
            onChange={(e) => setConfirmFull(e.target.checked)}
            className="mt-1"
          />
          I confirm I want to execute the full 150-file × 3-provider baseline (450 LLM passes).
        </label>
        {confirmFull && (
          <div className="mt-3 rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-3 text-red-100 text-sm">
            <strong>Warning:</strong> 150×3 execute may incur significant API cost and run for many
            hours. Ensure steps 1–1b completed (150 selected, REFINE 450/450 matched).
          </div>
        )}
        {(running || batchRunning) && (
          <p className="mt-3 text-amber-200 text-sm">
            A job is still running — Section 4b buttons unlock when it finishes. Avoid starting
            Section 4 (single-provider) while using the 150×3 batch pipeline.
          </p>
        )}
      </section>

      {/* 4. Run */}
      <section className="rounded-xl border border-slate-600 bg-slate-800/40 p-5">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Play className="w-5 h-5 text-green-400" />
          4. Run baseline
        </h3>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleDryRun()}
            disabled={running}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm disabled:opacity-50"
          >
            Run dry run
          </button>
          <button
            type="button"
            onClick={() => void handleSmoke()}
            disabled={running}
            className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm disabled:opacity-50"
          >
            Run smoke test (≤3 files)
          </button>
          <button
            type="button"
            onClick={() => void handleSubset()}
            disabled={running || !confirmSubset}
            className="px-4 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white text-sm disabled:opacity-50"
          >
            Run subset baseline
          </button>
          <button
            type="button"
            onClick={() => void handleFull()}
            disabled={running || !confirmFull}
            className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm disabled:opacity-50"
          >
            Run full baseline
          </button>
        </div>
        {(running || jobId) && !batchRunning && (
          <div className="mt-4 text-sm text-slate-300 space-y-1">
            {jobId && <div>Job: {jobId}</div>}
            <div>Attempted: {progress.attempted ?? 0}</div>
            <div>Successful: {progress.successful ?? 0}</div>
            <div>Failed: {progress.failed ?? 0}</div>
            {progress.current_system && (
              <div>
                Current: {progress.current_system} — {progress.current_file}
              </div>
            )}
            {progress.elapsed_s != null && <div>Elapsed: {progress.elapsed_s}s</div>}
            {progress.message && <div className="text-slate-400">{progress.message}</div>}
            {running && <Loader2 className="w-5 h-5 animate-spin text-blue-400 mt-2" />}
          </div>
        )}
      </section>

      {/* 4b. Batch pipeline — same as REFINE (3 providers per file) */}
      <section className="rounded-xl border border-violet-600/40 bg-violet-950/20 p-5">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Play className="w-5 h-5 text-violet-400" />
          4b. Batch pipeline (OpenAI + Google + Anthropic)
        </h3>
        <p className="text-slate-400 text-sm mt-2">
          Direct-prompt baseline on the 150-file cohort × 3 providers. REFINE outputs are read-only.
          Results go to <code className="text-violet-200">direct_prompt_baseline_results.csv</code>.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleBatchDry()}
            disabled={running || batchRunning}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm disabled:opacity-50"
          >
            Batch dry-run (150×3)
          </button>
          <button
            type="button"
            onClick={() => void handleBatchSmoke()}
            disabled={running || batchRunning}
            className="px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-sm disabled:opacity-50"
          >
            Batch smoke (3×3 passes)
          </button>
          <button
            type="button"
            onClick={() => void handleBatchSubset()}
            disabled={running || batchRunning || !confirmSubset}
            className="px-4 py-2 rounded-lg bg-indigo-800 hover:bg-indigo-700 text-white text-sm disabled:opacity-50"
          >
            Batch subset (N×3)
          </button>
          <button
            type="button"
            onClick={() => void handleBatchFull()}
            disabled={running || batchRunning || !confirmFull}
            className="px-4 py-2 rounded-lg bg-red-800 hover:bg-red-700 text-white text-sm disabled:opacity-50"
          >
            Execute 150×3 (confirmed)
          </button>
        </div>
        {(batchRunning || (jobId && batchSummary)) && jobId && (
          <div className="mt-4 rounded-lg border border-violet-500/30 bg-slate-900/60 p-4 text-sm text-slate-200 space-y-2">
            <div className="font-medium text-violet-200">Batch job progress</div>
            <div>Job: {jobId}</div>
            {progress.files_complete != null && progress.files_total != null && (
              <div>
                Files complete: <strong>{progress.files_complete}</strong> / {progress.files_total}
                {(progress.files_in_progress ?? 0) > 0 && (
                  <span className="text-slate-400"> · 1 in progress</span>
                )}
              </div>
            )}
            {progress.pass_index != null && progress.pass_total != null && (
              <div>
                Pass: <strong>{progress.pass_index}</strong> / {progress.pass_total} (150 files × 3
                providers)
              </div>
            )}
            <div>
              OK: {progress.successful ?? 0} · Failed: {progress.failed ?? 0} · Skipped:{' '}
              {progress.skipped ?? 0}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded bg-slate-800 p-2">
                OpenAI: {progress.provider_ok_openai ?? 0} ok
                {(progress.provider_fail_openai ?? 0) > 0
                  ? ` / ${progress.provider_fail_openai} fail`
                  : ''}
              </div>
              <div className="rounded bg-slate-800 p-2">
                Google: {progress.provider_ok_google ?? 0} ok
                {(progress.provider_fail_google ?? 0) > 0
                  ? ` / ${progress.provider_fail_google} fail`
                  : ''}
              </div>
              <div className="rounded bg-slate-800 p-2">
                Anthropic: {progress.provider_ok_anthropic ?? 0} ok
                {(progress.provider_fail_anthropic ?? 0) > 0
                  ? ` / ${progress.provider_fail_anthropic} fail`
                  : ''}
              </div>
            </div>
            {progress.current_provider && (
              <div>
                Current provider: <strong>{progress.current_provider}</strong>
                {progress.current_system ? ` · ${progress.current_system}` : ''}
              </div>
            )}
            {progress.current_file && (
              <div className="text-slate-400 text-xs truncate">{progress.current_file}</div>
            )}
            {progress.elapsed_s != null && (
              <div>Elapsed: {Math.round(progress.elapsed_s / 60)} min ({progress.elapsed_s}s)</div>
            )}
            {progress.message && <div className="text-slate-400">{progress.message}</div>}
            {batchRunning && <Loader2 className="w-5 h-5 animate-spin text-violet-400" />}
          </div>
        )}
        {batchSummary && !batchRunning && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Files" value={batchSummary.filesTotal} />
            <StatCard label="Passes total" value={batchSummary.passesTotal} />
            <StatCard label="Passes OK" value={batchSummary.passesSucceeded} />
            <StatCard label="Passes failed" value={batchSummary.passesFailed} />
          </div>
        )}
      </section>

      {/* 5. Results */}
      <section className="rounded-xl border border-slate-600 bg-slate-800/40 p-5">
        <h3 className="text-lg font-semibold text-white">5. Baseline results</h3>
        {runSummary ? (
          <>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Files attempted" value={runSummary.filesAttempted} />
              <StatCard label="Successful" value={runSummary.successfulOutputs} />
              <StatCard label="Failed" value={runSummary.failedOutputs} />
              <StatCard label="Avg churn %" value={runSummary.averageChurn} />
              <StatCard label="Finding reduction" value={runSummary.totalFindingReduction} />
              <StatCard label="Major reduction" value={runSummary.majorFindingReduction} />
              <StatCard label="Public method removals" value={runSummary.publicMethodRemovalCases} />
              <StatCard
                label="Critical assert/fail failures"
                value={runSummary.criticalAssertFailFailures}
              />
            </div>
            <DownloadLinks names={resultDownloads} />
          </>
        ) : (
          <p className="text-slate-500 text-sm mt-2">Run a baseline to see summary cards here.</p>
        )}
      </section>

      {/* 6. Compare */}
      <section className="rounded-xl border border-slate-600 bg-slate-800/40 p-5">
        <h3 className="text-lg font-semibold text-white">6. Compare against REFINE</h3>
        <button
          type="button"
          onClick={() => void handleCompare()}
          disabled={comparing}
          className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-600 text-white text-sm disabled:opacity-50"
        >
          {comparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCompare className="w-4 h-4" />}
          Compare baseline against REFINE
        </button>
        {compareSummary && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard label="Matched pairs" value={compareSummary.matchedPairs} />
              <StatCard label="Unmatched baseline" value={compareSummary.unmatchedBaseline} />
              <StatCard label="Unmatched REFINE" value={compareSummary.unmatchedRefine} />
              <StatCard
                label="Before validation pass"
                value={compareSummary.beforeValidationPass ?? 0}
              />
              <StatCard
                label="Before validation fail"
                value={compareSummary.beforeValidationFail ?? 0}
              />
              <StatCard
                label="Baseline PMD improvement (sum)"
                value={compareSummary.baselineImprovementTotalPmd ?? 0}
              />
              <StatCard
                label="REFINE PMD improvement (sum)"
                value={compareSummary.refineImprovementTotalPmd ?? 0}
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Paired on sample_id + system + relative_file_path + provider. Compares improvement
              (before − after), not after-only values.
            </p>
            <DownloadLinks names={compareDownloads} />
          </div>
        )}
      </section>

      {/* 7. Interpretation */}
      <section className="rounded-xl border border-slate-600 bg-slate-800/40 p-5">
        <h3 className="text-lg font-semibold text-white">7. Interpretation</h3>
        <p className="text-slate-400 text-sm mt-2 leading-relaxed">
          This comparison supports controlled empirical evaluation. It should be interpreted as a
          direct-prompt baseline or subset baseline, not as proof of superiority unless the comparison
          is complete and statistically analysed.
        </p>
        <details className="mt-3 text-xs text-slate-500">
          <summary className="cursor-pointer">All downloadable artifacts</summary>
          <DownloadLinks names={BASELINE_DOWNLOADS} />
        </details>
      </section>
    </div>
  );
}
