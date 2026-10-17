"""FastAPI routes for baseline comparison (research utility)."""
from __future__ import annotations

import asyncio
from typing import Any, Callable, Dict, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from baseline_comparison.batch_pipeline import (
    BaselineBatchConfig,
    default_models_by_provider,
    load_batch_run_latest,
    run_baseline_batch_pipeline,
    schedule_baseline_batch_job,
)
from baseline_comparison.compare_baseline_vs_refine import compare_baseline_vs_refine
from baseline_comparison.batch_progress import aggregate_batch_live_progress, merge_live_progress_into_job_progress
from baseline_comparison.failed_passes import analyze_failed_passes, write_failed_passes_outputs
from baseline_comparison.paper_analysis import run_paper_analysis
from baseline_comparison.swap_failed_cohort_files import (
    load_swap_added_file_keys,
    swap_failed_cohort_files,
)
from baseline_comparison.job_runner import get_job, status_snapshot
from baseline_comparison.paths import (
    COHORT_PASSES_DEFAULT,
    COHORT_SIZE_DEFAULT,
    SELECTED_150_CSV,
    ensure_dirs,
    resolve_download,
)
from baseline_comparison.recover_selected_files import recover_selected_files
from baseline_comparison.run_direct_prompt_baseline import (
    SMOKE_MAX_FILES,
    BaselineRunConfig,
    run_baseline_batch,
    schedule_baseline_job,
)
from baseline_comparison.stratified_sample_150 import select_150_stratified
from baseline_comparison.verify_refine_coverage import verify_refine_coverage_for_cohort

PublishFn = Callable[[str, Dict[str, Any]], None]


class BaselineBatchRunRequest(BaseModel):
    """150-file stratified cohort × 3 providers; REFINE outputs are read-only."""
    providers: Optional[list[str]] = None
    models: Dict[str, str] = Field(default_factory=dict)
    systemFilter: str = ""
    sampleIdFilter: str = ""
    limit: Optional[int] = None
    resume: bool = True
    retryFailedOnly: bool = False
    runSwappedOnly: bool = False
    confirmExecute: bool = False
    confirmSubset: bool = False  # alias for confirmExecute
    confirmFull: bool = False  # ignored — 450 baseline disabled


class BaselineRunRequest(BaseModel):
    providerId: str = Field(default="openai", description="openai | google | anthropic")
    model: str = ""
    systemFilter: str = ""
    sampleIdFilter: str = ""
    limit: Optional[int] = None
    confirmSubset: bool = False
    confirmFull: bool = False
    jobId: Optional[str] = None


def create_baseline_router(
    *,
    backend_base: str,
    publish_progress: PublishFn,
) -> APIRouter:
    router = APIRouter(tags=["baseline"])

    @router.get("/agents/baseline/status")
    async def baseline_status():
        ensure_dirs()
        snap = status_snapshot()
        snap["backendBase"] = backend_base
        snap["cohortDefault"] = COHORT_SIZE_DEFAULT
        snap["expectedPasses"] = COHORT_PASSES_DEFAULT
        return snap

    @router.post("/agents/baseline/recover-selected-files")
    async def recover_files():
        result = await asyncio.to_thread(recover_selected_files)
        return {"success": True, **_result_to_dict(result)}

    @router.post("/agents/baseline/select-150-stratified")
    async def select_150(seed: int = 42):
        result = await asyncio.to_thread(select_150_stratified, seed=seed)
        coverage = await asyncio.to_thread(verify_refine_coverage_for_cohort, result.files)
        return {
            "success": True,
            "seed": result.seed,
            "selectedCount": result.selected_count,
            "systemCount": result.system_count,
            "perSystem": result.per_system,
            "poolSize450": result.pool_size_450,
            "warnings": result.warnings,
            "refinePassesMatched": coverage.passes_matched,
            "refinePassesExpected": coverage.passes_expected,
            "refineAllMatched": coverage.all_matched,
            "outputFiles": {
                SELECTED_150_CSV: SELECTED_150_CSV,
                **result.output_files,
            },
        }

    @router.post("/agents/baseline/verify-refine-coverage")
    async def verify_refine():
        coverage = await asyncio.to_thread(verify_refine_coverage_for_cohort)
        return {
            "success": True,
            "filesChecked": coverage.files_checked,
            "passesExpected": coverage.passes_expected,
            "passesMatched": coverage.passes_matched,
            "passesMissing": coverage.passes_missing,
            "allMatched": coverage.all_matched,
            "warnings": coverage.warnings,
            "missingSample": coverage.missing[:20],
        }

    @router.post("/agents/baseline/dry-run")
    async def dry_run(req: BaselineRunRequest):
        cfg = BaselineRunConfig(
            provider_id=req.providerId,
            model=req.model,
            system_filter=req.systemFilter,
            sample_id_filter=req.sampleIdFilter,
            dry_run=True,
            limit=req.limit,
        )
        summary = await run_baseline_batch(cfg, backend_base=backend_base)
        return {"success": True, "summary": _summary_dict(summary), "dryRun": True}

    @router.post("/agents/baseline/smoke-test")
    async def smoke_test(req: BaselineRunRequest):
        limit = min(SMOKE_MAX_FILES, req.limit or SMOKE_MAX_FILES)
        cfg = BaselineRunConfig(
            provider_id=req.providerId,
            model=req.model,
            system_filter=req.systemFilter,
            sample_id_filter=req.sampleIdFilter,
            dry_run=False,
            limit=limit,
        )
        job_id = schedule_baseline_job(
            cfg,
            backend_base=backend_base,
            kind="smoke_test",
            publish=publish_progress,
        )
        return {"success": True, "jobId": job_id, "limit": limit}

    @router.post("/agents/baseline/run-subset")
    async def run_subset(req: BaselineRunRequest):
        if not req.confirmSubset:
            raise HTTPException(
                status_code=400,
                detail="Subset baseline requires confirmSubset=true",
            )
        if not req.limit or req.limit < 1:
            raise HTTPException(status_code=400, detail="Subset run requires limit >= 1")
        cfg = BaselineRunConfig(
            provider_id=req.providerId,
            model=req.model,
            system_filter=req.systemFilter,
            sample_id_filter=req.sampleIdFilter,
            dry_run=False,
            limit=req.limit,
        )
        job_id = schedule_baseline_job(
            cfg,
            backend_base=backend_base,
            kind="subset",
            publish=publish_progress,
        )
        return {"success": True, "jobId": job_id, "limit": req.limit}

    @router.post("/agents/baseline/run-full")
    async def run_full(req: BaselineRunRequest):
        raise HTTPException(
            status_code=400,
            detail="Full 450-file baseline is disabled. Use select-150-stratified + batch-run (150×3).",
        )

    @router.post("/agents/baseline/compare-refine")
    async def compare_refine(req: BaselineRunRequest):
        summary = await asyncio.to_thread(compare_baseline_vs_refine, req.providerId)
        return {
            "success": True,
            "matchedPairs": summary.matched_pairs,
            "unmatchedBaseline": summary.unmatched_baseline,
            "unmatchedRefine": summary.unmatched_refine,
            "beforeValidationPass": summary.before_validation_pass,
            "beforeValidationFail": summary.before_validation_fail,
            "baselineImprovementTotalPmd": summary.baseline_improvement_total_pmd,
            "refineImprovementTotalPmd": summary.refine_improvement_total_pmd,
            "warnings": summary.warnings,
            "outputFiles": {
                "baseline_vs_refine_comparison.csv": "baseline_vs_refine_comparison.csv",
                "baseline_vs_refine_summary.csv": "baseline_vs_refine_summary.csv",
                "baseline_vs_refine_summary.md": "baseline_vs_refine_summary.md",
                "baseline_vs_refine_stats.md": "baseline_vs_refine_stats.md",
                "baseline_prompt_and_config.md": "baseline_prompt_and_config.md",
            },
        }

    def _batch_cfg(req: BaselineBatchRunRequest, *, dry_run: bool) -> BaselineBatchConfig:
        confirm = req.confirmExecute or req.confirmSubset
        cfg = BaselineBatchConfig(
            providers=req.providers or list(default_models_by_provider().keys()),
            models={**default_models_by_provider(), **(req.models or {})},
            system_filter=req.systemFilter,
            sample_id_filter=req.sampleIdFilter,
            limit=req.limit,
            dry_run=dry_run,
            resume=req.resume,
            retry_failed_only=req.retryFailedOnly,
            confirm_execute=confirm,
        )
        if req.runSwappedOnly:
            cfg.swapped_file_keys_only = load_swap_added_file_keys()
            if not cfg.swapped_file_keys_only:
                raise HTTPException(
                    status_code=400,
                    detail="No swap manifest found. Run swap-failed-files first.",
                )
        return cfg

    @router.get("/agents/baseline/batch-run/latest")
    async def batch_run_latest():
        latest = load_batch_run_latest()
        return {"success": True, "latest": latest}

    @router.post("/agents/baseline/batch-dry-run")
    async def batch_dry_run(req: BaselineBatchRunRequest):
        cfg = _batch_cfg(req, dry_run=True)
        summary = await run_baseline_batch_pipeline(cfg, backend_base=backend_base)
        write_prompt_and_config_doc()
        return {"success": True, "summary": _batch_summary_dict(summary), "dryRun": True}

    @router.post("/agents/baseline/batch-smoke-test")
    async def batch_smoke_test(req: BaselineBatchRunRequest):
        cfg = _batch_cfg(req, dry_run=False)
        cfg.limit = min(SMOKE_MAX_FILES, req.limit or SMOKE_MAX_FILES)
        cfg.confirm_execute = True
        job_id = schedule_baseline_batch_job(
            cfg, backend_base=backend_base, publish=publish_progress
        )
        return {
            "success": True,
            "jobId": job_id,
            "limitFiles": cfg.limit,
            "expectedPasses": cfg.limit * len(cfg.providers),
            "providers": cfg.providers,
            "models": cfg.models,
        }

    @router.post("/agents/baseline/batch-run")
    async def batch_run(req: BaselineBatchRunRequest):
        if not (req.confirmExecute or req.confirmSubset):
            raise HTTPException(
                status_code=400,
                detail="150×3 baseline execute requires confirmExecute=true (REFINE is not rerun)",
            )
        if req.confirmFull or req.limit == 450:
            raise HTTPException(
                status_code=400,
                detail="Full 450 baseline is disabled. Use the stratified 150-file cohort.",
            )
        cfg = _batch_cfg(req, dry_run=False)
        job_id = schedule_baseline_batch_job(
            cfg, backend_base=backend_base, publish=publish_progress
        )
        files = COHORT_SIZE_DEFAULT if not req.limit else req.limit
        return {
            "success": True,
            "jobId": job_id,
            "files": files,
            "expectedPasses": files * len(cfg.providers),
            "providers": cfg.providers,
            "models": cfg.models,
            "resume": cfg.resume,
        }

    @router.post("/agents/baseline/swap-failed-files")
    async def swap_failed_files(seed: int = 42, dryRun: bool = False):
        result = await asyncio.to_thread(swap_failed_cohort_files, seed=seed, dry_run=dryRun)
        return {
            "success": len(result.warnings) == 0 or result.added_count > 0,
            "dryRun": dryRun,
            "removedCount": result.removed_count,
            "addedCount": result.added_count,
            "newCohortSize": result.new_cohort_size,
            "newSampleIds": result.new_sample_ids,
            "swaps": result.swaps,
            "warnings": result.warnings,
            "outputFiles": result.output_files,
        }

    @router.post("/agents/baseline/batch-run-swapped")
    async def batch_run_swapped(req: BaselineBatchRunRequest):
        """Execute baseline only for files added by the last cohort swap (typically 17×3 passes)."""
        if not (req.confirmExecute or req.confirmSubset):
            raise HTTPException(status_code=400, detail="Requires confirmExecute=true")
        req.runSwappedOnly = True
        cfg = _batch_cfg(req, dry_run=False)
        file_keys = cfg.swapped_file_keys_only or []
        if not file_keys:
            raise HTTPException(status_code=400, detail="Run swap-failed-files first.")
        job_id = schedule_baseline_batch_job(
            cfg, backend_base=backend_base, publish=publish_progress
        )
        return {
            "success": True,
            "jobId": job_id,
            "files": len(file_keys),
            "expectedPasses": len(file_keys) * len(cfg.providers),
            "swappedFiles": [{"system": s, "relativeFilePath": p} for s, p in file_keys],
            "runSwappedOnly": True,
        }

    @router.get("/agents/baseline/failed-passes")
    async def list_failed_passes():
        report = await asyncio.to_thread(analyze_failed_passes)
        outputs = await asyncio.to_thread(write_failed_passes_outputs)
        return {
            "success": True,
            "expectedPasses": report.expected_passes,
            "okPasses": report.ok_passes,
            "failedPasses": report.failed_passes,
            "missingPasses": report.missing_passes,
            "stillNeeded": report.failed_passes + report.missing_passes,
            "filesComplete3of3": report.files_complete_3_of_3,
            "passes": report.rows,
            "outputFiles": outputs,
            "warnings": report.warnings,
        }

    @router.post("/agents/baseline/retry-failed")
    async def retry_failed_passes(req: BaselineBatchRunRequest):
        """Re-run only baseline passes that are not ok for the 150-file cohort."""
        if not (req.confirmExecute or req.confirmSubset):
            raise HTTPException(
                status_code=400,
                detail="Retry failed passes requires confirmExecute=true",
            )
        cfg = _batch_cfg(req, dry_run=False)
        cfg.retry_failed_only = True
        cfg.resume = True
        report = await asyncio.to_thread(analyze_failed_passes)
        if report.failed_passes + report.missing_passes == 0:
            return {
                "success": True,
                "message": "No failed passes to retry",
                "stillNeeded": 0,
            }
        job_id = schedule_baseline_batch_job(
            cfg, backend_base=backend_base, publish=publish_progress
        )
        return {
            "success": True,
            "jobId": job_id,
            "stillNeeded": report.failed_passes + report.missing_passes,
            "failedPasses": report.failed_passes,
            "resume": True,
            "retryFailedOnly": True,
        }

    @router.post("/agents/baseline/paper-analysis")
    async def paper_analysis():
        result = await asyncio.to_thread(run_paper_analysis)
        return {
            "success": True,
            "pairedRows": len(result.paired_rows),
            "summaryRows": len(result.summary_rows),
            "statsRows": len(result.stats_rows),
            "warnings": result.warnings,
            "outputFiles": result.output_files,
        }

    @router.get("/agents/baseline/batch-live-progress")
    async def batch_live_progress():
        ensure_dirs()
        return {"success": True, "progress": aggregate_batch_live_progress()}

    @router.get("/agents/baseline/job/{job_id}")
    async def baseline_job(job_id: str):
        job = get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        progress = job.progress
        if job.kind == "baseline_batch":
            progress = merge_live_progress_into_job_progress(
                job.progress,
                pass_total=COHORT_PASSES_DEFAULT,
                files_total=COHORT_SIZE_DEFAULT,
            )
        return {
            "jobId": job.job_id,
            "kind": job.kind,
            "status": job.status,
            "progress": progress,
            "result": job.result,
            "error": job.error,
            "logLines": job.log_lines[-100:],
        }

    @router.get("/agents/baseline/download/{filename}")
    async def download_file(filename: str):
        path = resolve_download(filename)
        if not path:
            raise HTTPException(status_code=404, detail="File not found or not allowed")
        return FileResponse(path, filename=filename)

    return router


def _result_to_dict(result) -> Dict[str, Any]:
    return {
        "totalRecovered": result.total_recovered,
        "uniqueJavaFiles": result.unique_java_files,
        "systemCount": result.system_count,
        "perSystem": result.per_system,
        "exactly450": result.exactly_450,
        "refinePassesMatched": result.refine_passes_matched,
        "refinePassesExpected": result.refine_passes_expected,
        "refinePassesMatchedExactly": result.refine_passes_matched_exactly,
        "warnings": result.warnings,
        "outputFiles": {
            "baseline_selected_450_files.csv": "baseline_selected_450_files.csv",
            "baseline_selected_450_files.json": "baseline_selected_450_files.json",
            "selected_files_summary.md": "selected_files_summary.md",
            "candidate_selection_sources.md": "candidate_selection_sources.md",
        },
    }


def _batch_summary_dict(summary) -> Dict[str, Any]:
    return {
        "filesTotal": summary.files_total,
        "passesTotal": summary.passes_total,
        "passesAttempted": summary.passes_attempted,
        "passesSucceeded": summary.passes_succeeded,
        "passesFailed": summary.passes_failed,
        "passesSkippedResume": summary.passes_skipped_resume,
        "providers": summary.providers,
        "models": summary.models,
        "warnings": summary.warnings,
    }


def _summary_dict(summary) -> Dict[str, Any]:
    return {
        "filesAttempted": summary.files_attempted,
        "successfulOutputs": summary.successful_outputs,
        "failedOutputs": summary.failed_outputs,
        "totalFindingReduction": summary.total_finding_reduction,
        "majorFindingReduction": summary.major_finding_reduction,
        "publicMethodRemovalCases": summary.public_method_removal_cases,
        "criticalAssertFailFailures": summary.critical_assert_fail_failures,
        "averageChurn": summary.average_churn,
        "warnings": summary.warnings,
    }
