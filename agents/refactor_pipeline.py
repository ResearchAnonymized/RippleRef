"""
LangGraph-backed refactor pipeline — phased execution shared across graph nodes.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional
import asyncio
import json
import re
import time
import traceback

import httpx
import requests

from file_size_policy import build_failure_outcome
from llm_errors import LLMRefactorOutcome


@dataclass
class StepLog:
    name: str
    agent: str
    status: str
    startedAt: float
    endedAt: Optional[float] = None
    details: Optional[Dict] = None
    error: Optional[str] = None

    def model_dump(self) -> Dict:
        return {
            "name": self.name,
            "agent": self.agent,
            "status": self.status,
            "startedAt": self.startedAt,
            "endedAt": self.endedAt,
            "details": self.details,
            "error": self.error,
        }


NODE_AGENT_MAP = {
    "load": ("Load", "File Loader"),
    "analyze": ("Analyze", "Code Smell Detector"),
    "plan": ("Smell Analysis", "Refactoring Planner"),
    "feasibility": ("Feasibility", "Size Advisor"),
    "refactor": ("Refactor", "LLM Refactorer"),
    "verify": ("Verify", "Quality Verifier"),
    "apply": ("Apply", "File Applier"),
    "compile": ("Compile", "Compilation Verifier"),
    "report": ("Analyze", "Analysis Reporter"),
}


@dataclass
class PipelineHooks:
    """Callbacks into agents/main.py (avoids circular imports)."""

    ensure_queue: Any
    publish_progress: Any
    backend_get: Any
    backend_post: Any
    load_memory: Any
    append_run: Any
    now: Any
    MODEL: str
    BACKEND_BASE: str
    DEFAULT_MULTI_LLM_CHAIN: list
    persist_independent_multi_llm_artifacts: Any
    run_multi_llm_chain: Any
    sanitize_multi_llm_runs_for_client: Any
    compact_research_snapshot: Any
    categorize_rejection: Any
    call_llm_refactor: Any
    sanitize_llm_output: Any
    calculate_quality_metrics: Any
    build_refactoring_plan_from_smells: Any
    normalize_provided_smell: Any
    normalize_smell_severity: Any
    prioritize_smells: Any
    build_public_api_signature: Any
    has_empty_or_comment_only_catch_blocks: Any
    map_smell_to_refactoring: Any
    is_multi_llm_agent_mode: Any
    call_llm_planning_agent: Any
    call_llm_verification_agent: Any


class PipelineExecution:
    def __init__(self, req, job_id: str, hooks: PipelineHooks):
        self.req = req
        self.job_id = job_id
        self.hooks = hooks
        self.steps_models: List[StepLog] = []
        self.client: Optional[httpx.AsyncClient] = None
        self.original = ""
        self.candidate = ""
        self.smells: List[Dict] = []
        self.refactoring_plan: List[Dict] = []
        self.file_feasibility: Optional[Dict] = None
        self.file_failure_outcome = None
        self.last_llm_out: Optional[LLMRefactorOutcome] = None
        self.refactor_llm_experiment: Optional[Dict] = None
        self.multi_llm_runs: List[Dict] = []
        self.llm_pipeline_failed = False
        self.research_independent = False
        self.independent_baseline_count = 0
        self.independent_best_after = 0
        self.after: Dict = {"codeSmells": []}
        self.before_reanalysis: Dict = {"codeSmells": []}
        self.before_reanalysis_smells: List[Dict] = []
        self.accept = False
        self.apply_result = None
        self.compile_result = None
        self.compile_success = False
        self.compile_error_msg = None
        self.analysis_result = None
        self.retry_count = 0
        self.before_count = 0
        self.after_count = 0
        self.verify_step_details = None
        self.research_artifacts_only = False
        self.response_data: Optional[Dict] = None
        self.current_node_id = ""
        self.provider_model: Optional[str] = None
        self.provider_id: Optional[str] = None
        self.llm_plan_outcome: Optional[Any] = None
        self.llm_verify_outcome: Optional[Any] = None
        self._client_started = False
        # ma_ref_master study mode (controlled experiment vs B0)
        self.ma_study_mode = False
        self.ma_study_id = ""
        self.ma_cohort_id: Optional[str] = None
        self.ma_graph_version = "2.0"
        self.dependency_context: Dict = {}
        self.dependency_context_text = ""
        self.ripple_report: Dict = {}
        # Multi-agent revise loop (verifier → editor), used by ma_ref graph
        self.revise_count = 0
        self.revise_feedback = ""

    async def ensure_client(self):
        if not self._client_started:
            self.client = httpx.AsyncClient(timeout=300)
            self._client_started = True
            if self.job_id:
                await asyncio.sleep(0.3)

    async def close_client(self):
        if self.client is not None:
            await self.client.aclose()
            self.client = None
            self._client_started = False

    def add_step(self, node_id: str = "", **kwargs):
        self.steps_models.append(StepLog(**kwargs))
        if self.job_id:
            step = self.steps_models[-1]
            self.hooks.publish_progress(self.job_id, {
                "type": "step",
                "stepName": step.name,
                "agent": step.agent,
                "status": step.status,
                "stepIndex": len(self.steps_models) - 1,
                "totalSteps": 9,
                "framework": "langgraph",
                "nodeId": node_id or self.current_node_id,
                "timestamp": time.time(),
            })

    async def publish_detail(self, message: str, category: str = "info"):
        if self.job_id:
            self.hooks.publish_progress(self.job_id, {
                "type": "detail",
                "message": message,
                "category": category,
                "timestamp": time.time(),
            })
            await asyncio.sleep(0)

    def steps_json(self) -> List[Dict]:
        out = []
        for s in self.steps_models:
            d = s.model_dump()
            d["framework"] = "langgraph"
            for nid, (nm, ag) in NODE_AGENT_MAP.items():
                if s.name == nm and (nm != "Analyze" or s.agent == ag):
                    d["node_id"] = nid
                    break
            out.append(d)
        return out

    async def run_fatal(self, error: Exception) -> Dict:
        self.add_step(
            node_id="fatal",
            name="Fatal",
            agent="Coordinator",
            status="error",
            startedAt=self.hooks.now(),
            endedAt=self.hooks.now(),
            error=str(error),
        )
        return {
            "success": False,
            "steps": self.steps_json(),
            "originalContent": self.original,
            "refactoredContent": self.candidate,
            "deltas": {},
            "applyResult": None,
            "error": str(error),
        }



async def run_load(pipeline: PipelineExecution) -> None:
    pipeline.current_node_id = "load"
    await pipeline.ensure_client()
    # Load file
    pipeline.add_step(node_id="load", name="Load", agent="File Loader", status="running", startedAt=pipeline.hooks.now())
    await pipeline.publish_detail(f"Loading file: {pipeline.req.filePath}", "info")
    workspace_original = ""
    try:
        content_resp = await pipeline.hooks.backend_get(
            pipeline.client,
            f"/workspaces/{pipeline.req.workspaceId}/files/content",
            params={"filePath": pipeline.req.filePath},
        )
        workspace_original = content_resp.get("content", "") or ""
    except Exception as e:
        pipeline.steps_models[-1].status = "error"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].error = str(e)
        await pipeline.publish_detail(f"Failed to load file: {str(e)[:100]}", "error")

    load_source = "workspace"
    if pipeline.req.content and pipeline.req.content.strip():
        client_lines = len(pipeline.req.content.splitlines())
        ws_lines = len(workspace_original.splitlines()) if workspace_original else 0
        # UI often sends the *previous* file's buffer; never run refactor on truncated stale text.
        if ws_lines > 0 and client_lines < max(50, int(ws_lines * 0.85)):
            pipeline.original = workspace_original
            load_source = "workspace"
            print(
                f"⚠️  Ignoring client content ({client_lines} lines) — using workspace file ({ws_lines} lines)"
            )
            await pipeline.publish_detail(
                f"Using workspace file ({ws_lines} lines); client buffer looked stale ({client_lines} lines)",
                "warning",
            )
        else:
            pipeline.original = pipeline.req.content
            load_source = "direct"
    else:
        pipeline.original = workspace_original

    if pipeline.original:
        pipeline.steps_models[-1].status = "done"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].details = {"bytes": len(pipeline.original), "source": load_source}
        await pipeline.publish_detail(
            f"Loaded {len(pipeline.original.splitlines())} lines from {load_source}",
            "success",
        )
    elif not pipeline.steps_models[-1].error:
        pipeline.steps_models[-1].status = "error"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].error = "Empty file content"

    pipeline.research_independent = bool(pipeline.req.researchBatchMode and pipeline.req.multiLlmChain)
    pipeline.independent_baseline_count = 0

    if pipeline.req.sampleId and pipeline.original:
        try:
            baseline_resp = await pipeline.hooks.backend_get(
                pipeline.client,
                f"/workspaces/{pipeline.req.workspaceId}/research/baseline-content",
                params={"sampleId": pipeline.req.sampleId, "filePath": pipeline.req.filePath},
            )
            baseline_content = baseline_resp.get("content")
            if baseline_content and str(baseline_content).strip():
                pipeline.original = str(baseline_content)
                load_source = "research_baseline_snapshot"
                if pipeline.steps_models and pipeline.steps_models[-1].name == "Load":
                    pipeline.steps_models[-1].details = {
                        **(pipeline.steps_models[-1].details or {}),
                        "source": load_source,
                        "sampleId": pipeline.req.sampleId,
                    }
                await pipeline.publish_detail(
                    f"Using frozen research baseline (sample {pipeline.req.sampleId})",
                    "info",
                )
        except Exception as exc:
            await pipeline.publish_detail(
                f"No baseline snapshot — using workspace file ({str(exc)[:80]})",
                "warning",
            )
    
    # If we couldn't load the file, return early
    if not pipeline.original:
        load_err = pipeline.steps_models[-1].error if pipeline.steps_models else None
        detail = load_err or "File not found in workspace (source tree may be missing — re-upload project)"
        pipeline.response_data = {
            "success": False,
            "steps": pipeline.steps_json(),
            "originalContent": "",
            "refactoredContent": "",
            "deltas": {},
            "applyResult": None,
            "error": f"Failed to load file content: {detail}",
        }
        return

    # Analyze before


async def run_analyze(pipeline: PipelineExecution) -> None:
    pipeline.current_node_id = "analyze"
    await pipeline.ensure_client()
    pipeline.add_step(node_id="analyze", name="Analyze", agent="Code Smell Detector", status="running", startedAt=pipeline.hooks.now())
    line_count = len(pipeline.original.splitlines())
    await pipeline.publish_detail("Scanning file for code smells using static analysis...", "info")
    try:
        # Large files: analyze on-disk path is faster than posting full source to analyze-live
        if line_count > 1500:
            before = await pipeline.hooks.backend_post(pipeline.client, "/workspace-enhanced-analysis/analyze-file", {
                "workspaceId": pipeline.req.workspaceId,
                "filePath": pipeline.req.filePath,
            })
        else:
            try:
                before = await pipeline.hooks.backend_post(pipeline.client, "/workspace-enhanced-analysis/analyze-live", {
                    "workspaceId": pipeline.req.workspaceId,
                    "filePath": pipeline.req.filePath,
                    "content": pipeline.original,
                })
            except Exception:
                before = await pipeline.hooks.backend_post(pipeline.client, "/workspace-enhanced-analysis/analyze-file", {
                    "workspaceId": pipeline.req.workspaceId,
                    "filePath": pipeline.req.filePath,
                })
    except Exception:
        before = {"codeSmells": []}
    backend_smells: List[Dict] = list(before.get("codeSmells", []) or [])
    smells = backend_smells
    smell_source = "backend_analysis"
    if pipeline.req.providedSmells and len(pipeline.req.providedSmells) > 0:
        frontend_smells = [pipeline.hooks.normalize_provided_smell(s) for s in pipeline.req.providedSmells]
        if len(backend_smells) > 0:
            # Always prefer backend-detected smells — they match what the verifier will check
            smells = backend_smells
            smell_source = "backend_analysis_authoritative"
            print(f"✅ Refactor: using {len(smells)} backend-detected smells (verifier-consistent), ignoring {len(frontend_smells)} frontend smells")
        else:
            smells = frontend_smells
            smell_source = "frontend_provided"
            print(f"✅ Refactor: using {len(smells)} frontend smells (backend returned 0)")
    # Publish smell summary
    sev_counts = {}
    for sm in smells:
        sv = str(sm.get("severity", "UNKNOWN")).upper()
        sev_counts[sv] = sev_counts.get(sv, 0) + 1
    await pipeline.publish_detail(f"Found {len(smells)} code smells: {', '.join(f'{v} {k}' for k, v in sev_counts.items())}", "analysis")
    # Dependencies
    assoc = []
    try:
        deps = await pipeline.hooks.backend_get(pipeline.client, f"/workspaces/{pipeline.req.workspaceId}/dependencies/file", params={"filePath": pipeline.req.filePath})
        assoc = list(set((deps.get("dependencies") or []) + (deps.get("reverseDependencies") or [])))
    except Exception:
        assoc = []
    sev_summary: Dict[str, int] = {}
    for sm in smells:
        sev = (sm.get("severity") or "UNKNOWN")
        if isinstance(sev, str):
            sev = sev.upper()
        else:
            sev = "UNKNOWN"
        sev_summary[sev] = sev_summary.get(sev, 0) + 1
    pipeline.steps_models[-1].status = "done"; pipeline.steps_models[-1].endedAt = pipeline.hooks.now(); pipeline.steps_models[-1].details = {
        "smells": len(smells),
        "severity": sev_summary,
        "associatedFiles": assoc,
        "smellSource": smell_source,
    }

    pipeline.smells = smells

    # Smell Analysis - Scientific prioritization


async def run_plan(pipeline: PipelineExecution) -> None:
    """Rule-based Refactoring Planner agent (delegates to refactor_nodes.rule_plan)."""
    from refactor_nodes.rule_plan import run_rule_plan

    await run_rule_plan(pipeline)
async def run_feasibility(pipeline: PipelineExecution) -> None:
    pipeline.current_node_id = "feasibility"
    await pipeline.ensure_client()
    pipeline.add_step(node_id="feasibility", name="Feasibility", agent="Size Advisor", status="running", startedAt=pipeline.hooks.now())
    for w in pipeline.file_feasibility.get("warnings") or []:
        await pipeline.publish_detail(w, "warning")
    if pipeline.file_feasibility.get("invokeLlm"):
        await pipeline.publish_detail(
            f"Size check: {pipeline.file_feasibility['lines']:,} lines (~{pipeline.file_feasibility['estimatedInputTokens']:,} est. input tokens) — proceeding with LLM refactor",
            "info",
        )
    else:
        fo = build_failure_outcome(feasibility=pipeline.file_feasibility)
        pipeline.file_failure_outcome = fo
        await pipeline.publish_detail(fo["userMessage"], "warning")
    pipeline.steps_models[-1].status = "done"
    pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
    pipeline.steps_models[-1].details = pipeline.file_feasibility

    # Refactor


async def run_refactor(pipeline: PipelineExecution) -> None:
    pipeline.current_node_id = "refactor"
    await pipeline.ensure_client()
    pipeline.add_step(node_id="refactor", name="Refactor", agent="LLM Refactoring Agent", status="running", startedAt=pipeline.hooks.now())
    pipeline.candidate = pipeline.original
    max_retries = 2
    pipeline.retry_count = 0
    pipeline.llm_pipeline_failed = False

    if not pipeline.file_feasibility.get("invokeLlm"):
        pipeline.steps_models[-1].status = "done"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].details = {
            "skipped": True,
            "skippedReason": "file_size_preflight",
            "blockCodes": pipeline.file_feasibility.get("blockCodes"),
            "feasibility": pipeline.file_feasibility,
            "failureOutcome": pipeline.file_failure_outcome,
        }
        pipeline.llm_pipeline_failed = True
        pipeline.candidate = pipeline.original
    else:
        await pipeline.publish_detail(
            f"Sending {pipeline.file_feasibility['lines']:,} lines to LLM ({pipeline.hooks.MODEL}) for refactoring...",
            "info",
        )
        fl = int(pipeline.file_feasibility.get("lines") or len(pipeline.original.splitlines()))
        est_min = max(5, min(45, fl // 120))
        await pipeline.publish_detail(
            f"Generating refactored code — longest step (~{est_min}–{est_min + 15} min for {fl:,} lines). Keep this tab open.",
            "info",
        )

    try:
        if pipeline.file_feasibility.get("invokeLlm"):
            prior = pipeline.hooks.load_memory(pipeline.req.workspaceId, pipeline.req.filePath).get("lastSummary", "")
            if pipeline.req.multiLlmChain:
                if pipeline.research_independent:
                    from multi_llm_independent import run_multi_llm_independent_parallel

                    await pipeline.publish_detail(
                        "Independent parallel multi-LLM: each provider runs full pipeline "
                        "on the same frozen baseline (not chained)",
                        "info",
                    )
                    (
                        pipeline.candidate,
                        pipeline.multi_llm_runs,
                        pipeline.last_llm_out,
                        chain_failed,
                        pipeline.independent_baseline_count,
                        pipeline.independent_best_after,
                    ) = await run_multi_llm_independent_parallel(
                        pipeline.client,
                        pipeline.hooks.backend_post,
                        pipeline.original,
                        pipeline.req.filePath,
                        pipeline.req.workspaceId,
                        pipeline.smells,
                        pipeline.req.goals,
                        prior,
                        pipeline.publish_detail,
                        pipeline.job_id,
                        bool(pipeline.req.researchBatchMode),
                        pipeline.hooks.DEFAULT_MULTI_LLM_CHAIN,
                        build_refactoring_plan_from_smells=pipeline.hooks.build_refactoring_plan_from_smells,
                        call_llm_refactor=pipeline.hooks.call_llm_refactor,
                        sanitize_llm_output=pipeline.hooks.sanitize_llm_output,
                        calculate_quality_metrics=pipeline.hooks.calculate_quality_metrics,
                        publish_progress=(
                            (lambda evt: pipeline.hooks.publish_progress(pipeline.job_id, evt)) if pipeline.job_id else None
                        ),
                        now=pipeline.hooks.now,
                        pipeline_hooks=pipeline.hooks,
                    )
                    if pipeline.req.sampleId:
                        await pipeline.hooks.persist_independent_multi_llm_artifacts(
                            pipeline.client, pipeline.req.workspaceId, pipeline.req.sampleId, pipeline.req.filePath, pipeline.multi_llm_runs
                        )
                    pipeline.refactor_llm_experiment = {
                        "multiLlmChain": True,
                        "multiLlmMode": "independent_parallel",
                        "runs": pipeline.multi_llm_runs,
                        "last": pipeline.last_llm_out.to_experiment_dict() if pipeline.last_llm_out else None,
                    }
                else:
                    await pipeline.publish_detail(
                        "Multi-LLM chain: each provider runs full agent pipeline "
                        "(Analyze → Plan → Feasibility → LLM → Verify)",
                        "info",
                    )
                    (
                        pipeline.candidate,
                        pipeline.multi_llm_runs,
                        pipeline.last_llm_out,
                        chain_failed,
                    ) = await pipeline.hooks.run_multi_llm_chain(
                        pipeline.client,
                        pipeline.original,
                        pipeline.req.filePath,
                        pipeline.req.workspaceId,
                        pipeline.smells,
                        pipeline.req.goals,
                        pipeline.refactoring_plan,
                        prior,
                        pipeline.publish_detail,
                        pipeline.job_id,
                        bool(pipeline.req.researchBatchMode),
                    )
                    pipeline.refactor_llm_experiment = {
                        "multiLlmChain": True,
                        "multiLlmMode": "sequential_chain",
                        "runs": pipeline.multi_llm_runs,
                        "last": pipeline.last_llm_out.to_experiment_dict() if pipeline.last_llm_out else None,
                    }
                step_details = {
                    "multiLlmChain": True,
                    "runs": pipeline.multi_llm_runs,
                    "changed": pipeline.candidate.strip() != pipeline.original.strip(),
                }
                pipeline.steps_models[-1].details = step_details
                if pipeline.research_independent:
                    any_ok = any(r.get("ok") for r in pipeline.multi_llm_runs)
                    if not any_ok:
                        pipeline.llm_pipeline_failed = True
                        pipeline.steps_models[-1].status = "error"
                        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
                        pipeline.steps_models[-1].error = (
                            pipeline.last_llm_out.message if pipeline.last_llm_out and not pipeline.last_llm_out.ok
                            else "All independent LLM passes failed"
                        )
                    elif chain_failed:
                        await pipeline.publish_detail(
                            "Some providers failed — continuing with successful passes",
                            "warning",
                        )
                elif chain_failed and pipeline.candidate.strip() == pipeline.original.strip():
                    pipeline.llm_pipeline_failed = True
                    pipeline.steps_models[-1].status = "error"
                    pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
                    pipeline.steps_models[-1].error = (
                        pipeline.last_llm_out.message if pipeline.last_llm_out and not pipeline.last_llm_out.ok else "LLM chain failed"
                    )
                elif chain_failed:
                    await pipeline.publish_detail(
                        "Some LLM passes failed — continuing with best successful output",
                        "warning",
                    )
                elif pipeline.candidate.strip() == pipeline.original.strip() and not pipeline.req.researchBatchMode:
                    pipeline.llm_pipeline_failed = True
                    await pipeline.publish_detail(
                        "Multi-LLM chain finished but code unchanged — rejecting",
                        "error",
                    )
                elif pipeline.candidate.strip() == pipeline.original.strip() and pipeline.req.researchBatchMode and not pipeline.research_independent:
                    await pipeline.publish_detail(
                        "Multi-LLM chain finished with no net change — verify will record identical output",
                        "warning",
                    )
            else:
                # Verifier → editor revise feedback (LangGraph prepare_revise node)
                if getattr(pipeline, "revise_feedback", None):
                    prior = ((prior or "") + "\n" + str(pipeline.revise_feedback)).strip()
                    await pipeline.publish_detail(
                        f"Editor revise pass {getattr(pipeline, 'revise_count', 0)} with verifier feedback",
                        "info",
                    )
                while pipeline.retry_count <= max_retries:
                    if pipeline.retry_count > 0:
                        await pipeline.publish_detail(
                            f"Retry {pipeline.retry_count}/{max_retries}: LLM returned identical code, requesting more changes...",
                            "warning",
                        )
                    llm_out = await pipeline.hooks.call_llm_refactor(
                        pipeline.original,
                        pipeline.req.filePath,
                        pipeline.smells,
                        pipeline.req.goals,
                        prior,
                        pipeline.refactoring_plan,
                        model=pipeline.provider_model,
                        provider_id=pipeline.provider_id,
                    )
                    pipeline.last_llm_out = llm_out
                    pipeline.refactor_llm_experiment = llm_out.to_experiment_dict()

                    if not llm_out.ok:
                        pipeline.llm_pipeline_failed = True
                        pipeline.steps_models[-1].status = "error"
                        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
                        pipeline.steps_models[-1].error = llm_out.message
                        pipeline.steps_models[-1].details = {"llm": llm_out.to_experiment_dict()}
                        pipeline.candidate = pipeline.original
                        await pipeline.publish_detail(f"LLM error: {llm_out.message[:100]}", "error")
                        break

                    raw_llm = llm_out.content
                    pipeline.candidate = pipeline.hooks.sanitize_llm_output(pipeline.original, raw_llm)
                    step_details: Dict = {
                        "llm": llm_out.to_experiment_dict(),
                        "changed": pipeline.candidate.strip() != pipeline.original.strip(),
                    }
                    if llm_out.truncated_output:
                        step_details["warning"] = "output_truncated_max_tokens"
                    pipeline.steps_models[-1].details = step_details

                    if pipeline.candidate.strip() == pipeline.original.strip():
                        pipeline.retry_count += 1
                        if pipeline.retry_count <= max_retries:
                            print(
                                f"⚠️  LLM returned identical code (attempt {pipeline.retry_count}/{max_retries}), retrying..."
                            )
                            prior = (prior or "") + (
                                f"\n[RETRY {pipeline.retry_count}: Previous attempt returned identical code. "
                                "You MUST make structural changes!]"
                            )
                            continue
                        print(f"❌ LLM returned identical code after {max_retries} retries — rejecting")
                        await pipeline.publish_detail(
                            "LLM failed to produce changes after 3 attempts — refactoring rejected",
                            "error",
                        )
                        pipeline.candidate = pipeline.original
                        break
                    break

        if not pipeline.llm_pipeline_failed:
            pipeline.steps_models[-1].status = "done"
            pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
            if pipeline.steps_models[-1].details is None:
                pipeline.steps_models[-1].details = {}
            pipeline.steps_models[-1].details.setdefault(
                "changed", pipeline.candidate.strip() != pipeline.original.strip()
            )
            # Publish code generation summary
            cand_lines = len(pipeline.candidate.splitlines())
            orig_lines = len(pipeline.original.splitlines())
            delta = cand_lines - orig_lines
            await pipeline.publish_detail(f"Code generated: {cand_lines} lines ({'+' if delta >= 0 else ''}{delta} from original)", "success")
            orig_methods = set(re.findall(r'\b(?:public|private|protected)\s+\w+\s+(\w+)\s*\(', pipeline.original))
            cand_methods = set(re.findall(r'\b(?:public|private|protected)\s+\w+\s+(\w+)\s*\(', pipeline.candidate))
            new_m = cand_methods - orig_methods
            if new_m:
                await pipeline.publish_detail(f"New methods extracted: {', '.join(list(new_m)[:5])}", "refactoring")
    except Exception as outer_error:
        import traceback
        print(f"Refactor step error: {traceback.format_exc()}")
        pipeline.candidate = pipeline.original  # Keep original — don't apply fake changes
        pipeline.steps_models[-1].status = "error"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].error = f"Refactor step failed: {str(outer_error)[:500]}"
        pipeline.steps_models[-1].details = {
            "changed": pipeline.candidate.strip() != pipeline.original.strip(),
            "errorType": type(outer_error).__name__,
        }

    # Verify


async def run_verify(pipeline: PipelineExecution) -> None:
    pipeline.current_node_id = "verify"
    await pipeline.ensure_client()
    pipeline.add_step(node_id="verify", name="Verify", agent="Quality Verifier", status="running", startedAt=pipeline.hooks.now())
    await pipeline.publish_detail("Running verification gates: API preservation, smell count, empty catches...", "info")
    pipeline.after = {"codeSmells": []}
    pipeline.before_reanalysis = {"codeSmells": []}
    pipeline.accept = False
    try:
        try:
            pipeline.after = await pipeline.hooks.backend_post(pipeline.client, "/workspace-enhanced-analysis/analyze-live", {
                "workspaceId": pipeline.req.workspaceId,
                "filePath": pipeline.req.filePath,
                "content": pipeline.candidate,
            })
            # Re-analyze pipeline.original with the SAME detector to ensure fair comparison
            try:
                pipeline.before_reanalysis = await pipeline.hooks.backend_post(pipeline.client, "/workspace-enhanced-analysis/analyze-live", {
                    "workspaceId": pipeline.req.workspaceId,
                    "filePath": pipeline.req.filePath,
                    "content": pipeline.original,
                })
            except Exception:
                pass
        except Exception:
            pipeline.after = await pipeline.hooks.backend_post(pipeline.client, "/workspace-enhanced-analysis/analyze-file", {
                "workspaceId": pipeline.req.workspaceId,
                "filePath": pipeline.req.filePath,
            })
        # ── Consistent smell counting ──
        # Use re-analyzed counts from the SAME detector for fair comparison
        pipeline.before_reanalysis_smells = pipeline.before_reanalysis.get("codeSmells", [])
        after_smells_list = pipeline.after.get("codeSmells", [])
        if not pipeline.before_reanalysis_smells and not pipeline.smells:
            try:
                disk_before = await pipeline.hooks.backend_post(pipeline.client, "/workspace-enhanced-analysis/analyze-file", {
                    "workspaceId": pipeline.req.workspaceId,
                    "filePath": pipeline.req.filePath,
                })
                disk_smells = list(disk_before.get("codeSmells", []) or [])
                if disk_smells:
                    pipeline.before_reanalysis_smells = disk_smells
                    print(f"📊 Smell counts (disk analyze-file fallback): {len(disk_smells)} before")
            except Exception:
                pass
        if len(pipeline.before_reanalysis_smells) > 0:
            pipeline.before_count = len(pipeline.before_reanalysis_smells)
            pipeline.after_count = len(after_smells_list)
            print(f"📊 Smell counts (same detector): {pipeline.before_count} → {pipeline.after_count}")
        else:
            # Fall back to frontend-provided before count
            pipeline.before_count = len(pipeline.smells)
            pipeline.after_count = len(after_smells_list)
            print(f"📊 Smell counts (frontend before, detector after): {pipeline.before_count} → {pipeline.after_count}")

        import difflib
        import re as re_mod

        original_normalized = re_mod.sub(r'\s+', ' ', pipeline.original.strip())
        candidate_normalized = re_mod.sub(r'\s+', ' ', pipeline.candidate.strip())
        pipeline.verify_step_details = None
        research_batch = bool(pipeline.req.researchBatchMode)

        if pipeline.research_independent and pipeline.multi_llm_runs:
            pipeline.before_count = (
                pipeline.independent_baseline_count
                or int(pipeline.multi_llm_runs[0].get("smellsBefore") or len(pipeline.smells))
            )
            ok_runs = [r for r in pipeline.multi_llm_runs if r.get("ok")]
            if ok_runs:
                best_run = max(ok_runs, key=lambda r: int(r.get("smellDelta") or 0))
                pipeline.after_count = int(best_run.get("smellsAfter") or pipeline.before_count)
                best_cand = best_run.get("candidateContent")
                if best_cand and str(best_cand).strip():
                    pipeline.candidate = str(best_cand)
            else:
                pipeline.after_count = pipeline.before_count
            pipeline.accept = any(r.get("ok") and r.get("researchMetrics") for r in pipeline.multi_llm_runs)
            pipeline.before_reanalysis_smells = list(pipeline.smells)
            after_smells_list = []
            pipeline.verify_step_details = {
                "before": pipeline.before_count,
                "after": pipeline.after_count,
                "improvement": max(0, pipeline.before_count - pipeline.after_count),
                "accepted": pipeline.accept,
                "researchIndependent": True,
                "passesCompleted": len(ok_runs),
                "verification": {"researchArtifactsOnly": True},
            }
            await pipeline.publish_detail(
                f"Research independent verify: {len(ok_runs)}/3 passes with metrics "
                f"(baseline smells {pipeline.before_count}, best after {pipeline.after_count})",
                "success" if pipeline.accept else "warning",
            )
        # ── Gate 0: Reject identical code ──
        elif pipeline.original.strip() == pipeline.candidate.strip():
            print("❌ GATE 0 FAIL: Code is IDENTICAL to original")
            pipeline.accept = False
            pipeline.verify_step_details = {
                "before": pipeline.before_count, "after": pipeline.after_count,
                "improvement": 0, "accepted": False,
                "rejectionReason": "IDENTICAL_CODE",
                "verification": {"isDifferent": False, "identical": True}
            }
        else:
            from verification_gates import evaluate_verification_gates

            _method_thresh = (
                pipeline.req.methodPreservationThreshold
                if pipeline.req.methodPreservationThreshold is not None
                else 0.85
            )
            truncated = bool(
                pipeline.last_llm_out and getattr(pipeline.last_llm_out, "truncated_output", False)
            )
            gates = evaluate_verification_gates(
                original=pipeline.original,
                candidate=pipeline.candidate,
                before_count=pipeline.before_count,
                after_count=pipeline.after_count,
                build_public_api_signature=pipeline.hooks.build_public_api_signature,
                has_empty_catch=pipeline.hooks.has_empty_or_comment_only_catch_blocks,
                research_batch=research_batch,
                truncated_output=truncated,
                method_preservation_threshold=_method_thresh,
            )
            pipeline.accept = gates.accept
            rejection_reasons = list(gates.rejection_reasons)
            is_different = gates.is_different
            similarity = gates.similarity
            smell_improved = gates.smell_improved
            api_preserved = gates.api_preserved
            missing_api = gates.missing_api
            dangerous_empty_catch = gates.dangerous_empty_catch
            reasonable_size = gates.reasonable_size
            line_ratio = gates.line_ratio
            orig_lines = gates.orig_lines
            candidate_lines = gates.candidate_lines
            original_methods = gates.original_methods
            candidate_methods = gates.candidate_methods
            methods_preserved = gates.methods_preserved
            new_methods = gates.new_methods

            if gates.research_batch_accept:
                await pipeline.publish_detail(
                    f"Research batch: accepted refactor (smells {pipeline.before_count} → {pipeline.after_count}, "
                    "no smell increase)",
                    "success",
                )

            if pipeline.accept:
                print(
                    f"✅ ACCEPTED: Smells {pipeline.before_count}→{pipeline.after_count}, "
                    f"similarity {similarity*100:.1f}%, API preserved"
                )
                await pipeline.publish_detail(
                    f"Verification PASSED: smells {pipeline.before_count} → {pipeline.after_count}, "
                    "public API preserved",
                    "success",
                )
            else:
                print(f"❌ REJECTED: {', '.join(rejection_reasons)}")
                await pipeline.publish_detail(
                    f"Verification FAILED: {', '.join(rejection_reasons)}",
                    "error",
                )

            pipeline.verify_step_details = {
                "before": pipeline.before_count,
                "after": pipeline.after_count,
                "improvement": max(0, pipeline.before_count - pipeline.after_count),
                "accepted": pipeline.accept,
                "smellsTargeted": len(pipeline.hooks.prioritize_smells(pipeline.smells, pipeline.original, max_total=8)) if pipeline.smells else 0,
                "verification": {
                    "isDifferent": is_different,
                    "similarity": round(similarity, 4),
                    "methodsPreserved": methods_preserved,
                    "originalMethods": original_methods,
                    "candidateMethods": candidate_methods,
                    "newMethods": new_methods,
                    "apiPreserved": api_preserved,
                    "missingApi": list(missing_api)[:5] if not api_preserved else [],
                    "smellReduction": f"{pipeline.before_count} → {pipeline.after_count}",
                    "reasonableLineChange": reasonable_size,
                    "lineMetrics": {
                        "originalLines": orig_lines,
                        "candidateLines": candidate_lines,
                        "ratio": round(line_ratio, 3),
                    },
                    "rejectionReason": None if pipeline.accept else ", ".join(rejection_reasons),
                    "researchBatchAccepted": gates.research_batch_accept,
                }
            }

        pipeline.steps_models[-1].status = "done"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].details = pipeline.verify_step_details
    except Exception as e:
        pipeline.after = {"codeSmells": []}
        pipeline.accept = False
        pipeline.steps_models[-1].status = "error"; pipeline.steps_models[-1].endedAt = pipeline.hooks.now(); pipeline.steps_models[-1].error = str(e)

    # Apply


async def run_apply(pipeline: PipelineExecution) -> None:
    pipeline.current_node_id = "apply"
    await pipeline.ensure_client()
    pipeline.add_step(node_id="apply", name="Apply", agent="File Applier", status="running", startedAt=pipeline.hooks.now())
    await pipeline.publish_detail("Applying refactored code to workspace..." if pipeline.accept else "Refactoring rejected — keeping original file", "info" if pipeline.accept else "warning")
    pipeline.apply_result = None
    pipeline.research_artifacts_only = bool(pipeline.research_independent)
    try:
        if pipeline.accept and pipeline.candidate.strip() != pipeline.original.strip() and not pipeline.research_artifacts_only:
            pipeline.apply_result = await pipeline.hooks.backend_post(pipeline.client, "/refactoring/apply", {
                "workspaceId": pipeline.req.workspaceId,
                "filePath": pipeline.req.filePath,
                "refactoredCode": pipeline.candidate,
            })
            pipeline.steps_models[-1].status = "done"; pipeline.steps_models[-1].endedAt = pipeline.hooks.now(); pipeline.steps_models[-1].details = {"applied": True}
        else:
            details = {"applied": False}
            if pipeline.research_artifacts_only:
                details["researchArtifactsOnly"] = True
            pipeline.steps_models[-1].status = "done"; pipeline.steps_models[-1].endedAt = pipeline.hooks.now(); pipeline.steps_models[-1].details = details
    except Exception as e:
        pipeline.steps_models[-1].status = "error"; pipeline.steps_models[-1].endedAt = pipeline.hooks.now(); pipeline.steps_models[-1].error = str(e)

    # Compile verification (stub) - non-blocking, informative only
    # Since this is just a stub that checks workspace existence, we make it lenient
    # It won't block refactoring even if it fails


async def run_compile(pipeline: PipelineExecution) -> None:
    pipeline.current_node_id = "compile"
    await pipeline.ensure_client()
    pipeline.add_step(node_id="compile", name="Compile", agent="Compilation Verifier", status="running", startedAt=pipeline.hooks.now())
    pipeline.compile_result = None
    pipeline.compile_success = False
    pipeline.compile_error_msg = None
    try:
        # Call backend directly to handle error responses gracefully
        url = f"{pipeline.hooks.BACKEND_BASE}/workspaces/{pipeline.req.workspaceId}/verify/compile"
        r = await pipeline.client.post(url, json={}, timeout=10)  # Shorter timeout since it's optional
        
        # Parse response even if status is not 2xx (backend may return error details in JSON)
        try:
            pipeline.compile_result = r.json()
        except:
            pipeline.compile_result = {}
        
        # Check if request was successful
        if r.status_code == 200:
            pipeline.compile_success = bool(pipeline.compile_result.get('success', True))
            pipeline.steps_models[-1].status = "done"
            pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
            pipeline.steps_models[-1].details = {
                "success": pipeline.compile_success,
                "javaFiles": pipeline.compile_result.get("javaFiles", 0),
                "message": pipeline.compile_result.get("message", "Compile verification completed")
            }
        else:
            # Backend returned error - but since this is just a stub, we mark as done with warning
            # This prevents the red ERROR status that confuses users
            error_detail = f"HTTP {r.status_code}"
            
            # Extract error message from response
            if pipeline.compile_result:
                error_detail = pipeline.compile_result.get("error", pipeline.compile_result.get("message", error_detail))
            else:
                try:
                    error_text = r.text[:200] if hasattr(r, 'text') else str(r.status_code)
                    error_detail = error_text if error_text else error_detail
                except:
                    error_detail = f"HTTP {r.status_code}"
            
            # Mark as done (not error) since this is just informational
            # Include warning in details instead of error status
            pipeline.steps_models[-1].status = "done"  # Changed from "error" to "done"
            pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
            pipeline.steps_models[-1].details = {
                "success": False,
                "warning": error_detail,
                "statusCode": r.status_code,
                "note": "Compile verification is informational only (stub). Workspace may need to be recreated after backend restart.",
                "message": "Workspace verification skipped (informational)"
            }
            pipeline.compile_error_msg = error_detail
    except httpx.TimeoutException as e:
        # Timeout - mark as done with warning (not error)
        pipeline.steps_models[-1].status = "done"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].details = {
            "success": False,
            "warning": "Compile verification timeout (backend may be slow)",
            "timeout": True,
            "note": "This is informational only and does not affect refactoring"
        }
        pipeline.compile_error_msg = "Timeout"
    except httpx.RequestError as e:
        # Network/connection error - mark as done with warning
        pipeline.steps_models[-1].status = "done"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].details = {
            "success": False,
            "warning": f"Connection error: {str(e)[:200]}",
            "connectionError": True,
            "note": "This is informational only and does not affect refactoring"
        }
        pipeline.compile_error_msg = "Cannot connect to backend service"
    except Exception as e:
        # Other errors - mark as done with warning
        error_msg = str(e)[:500]
        pipeline.steps_models[-1].status = "done"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].details = {
            "success": False,
            "warning": error_msg,
            "note": "This is informational only and does not affect refactoring"
        }
        pipeline.compile_error_msg = error_msg

    # Comprehensive Analysis


async def run_report_finalize(pipeline: PipelineExecution) -> None:
    pipeline.current_node_id = "report"
    await pipeline.ensure_client()
    pipeline.add_step(node_id="report", name="Analyze", agent="Analysis Reporter", status="running", startedAt=pipeline.hooks.now())
    pipeline.analysis_result = None
    try:
        from refactoring_analysis import RefactoringAnalyzer
        analyzer = RefactoringAnalyzer()
        # Always compare against the actual LLM pipeline.candidate so reports are not falsely "identical"
        # when verification failed for tooSimilar / smell / line limits.
        # Use consistent smells: if we re-analyzed original with the same
        # detector, use those for apples-to-apples comparison
        consistent_before_smells = pipeline.before_reanalysis_smells if len(pipeline.before_reanalysis_smells) > 0 else pipeline.smells
        llm_usage = pipeline.last_llm_out.usage if pipeline.last_llm_out else None
        pipeline.analysis_result = analyzer.analyze_refactoring(
            original=pipeline.original,
            refactored=pipeline.candidate,
            original_smells=consistent_before_smells,
            refactored_smells=pipeline.after.get("codeSmells", []),
            file_path=pipeline.req.filePath,
            token_usage=llm_usage,
            retry_count=pipeline.retry_count,
        )
        pipeline.steps_models[-1].status = "done"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].details = {
            "summary": pipeline.analysis_result.get("summary", {}),
            "improvements": pipeline.analysis_result.get("improvements", {}),
            "behavioral_correctness": pipeline.analysis_result.get("behavioral_correctness", {}),
            "refactoring_practices": pipeline.analysis_result.get("refactoring_practices", {}),
            "metrics": pipeline.analysis_result.get("metrics", {})
        }
        print(f"📊 Analysis complete: Score {pipeline.analysis_result.get('summary', {}).get('overall_score', 0):.1f}/100")
    except Exception as e:
        print(f"⚠️  Analysis failed: {e}")
        pipeline.steps_models[-1].status = "error"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].error = str(e)[:200]
        pipeline.analysis_result = None
    
    # Calculate quality metrics for before and after
    metrics_before = pipeline.hooks.calculate_quality_metrics(pipeline.original)
    metrics_after = pipeline.hooks.calculate_quality_metrics(pipeline.candidate)

    # Per-severity smell breakdowns for consistent frontend display
    def _count_by_severity(smell_list: List[Dict]) -> Dict[str, int]:
        counts = {"critical": 0, "major": 0, "minor": 0}
        for s in smell_list:
            sev = pipeline.hooks.normalize_smell_severity(s)
            if sev == "CRITICAL": counts["critical"] += 1
            elif sev == "MAJOR": counts["major"] += 1
            else: counts["minor"] += 1
        return counts

    before_sev = _count_by_severity(pipeline.before_reanalysis.get("codeSmells", []) if pipeline.before_reanalysis.get("codeSmells") else pipeline.smells)
    after_sev = _count_by_severity(pipeline.after.get("codeSmells", []))

    deltas = {
        "before": pipeline.before_count,
        "after": pipeline.after_count,
        "improvement": max(0, pipeline.before_count - pipeline.after_count),
        "smellsBefore": before_sev,
        "smellsAfter": after_sev,
        "qualityMetrics": {
            "before": {
                "complexity": metrics_before["complexity"],
                "maintainability": metrics_before["maintainability"],
                "testability": metrics_before["testability"]
            },
            "after": {
                "complexity": metrics_after["complexity"],
                "maintainability": metrics_after["maintainability"],
                "testability": metrics_after["testability"]
            },
            "change": {
                "complexity": metrics_after["complexity"] - metrics_before["complexity"],
                "maintainability": round(metrics_after["maintainability"] - metrics_before["maintainability"], 1),
                "testability": round(metrics_after["testability"] - metrics_before["testability"], 1)
            }
        },
        "comprehensiveAnalysis": pipeline.analysis_result,  # Add comprehensive analysis to deltas
        "verifyAccepted": pipeline.accept,
    }
    if pipeline.analysis_result and isinstance(pipeline.analysis_result, dict):
        summary = pipeline.analysis_result.setdefault("summary", {})
        if pipeline.accept:
            summary["refactoring_successful"] = True
            summary["verify_gate_passed"] = True

    # Persist memory
    summary = f"Smells {deltas['before']} -> {deltas['after']}; improvement {deltas['improvement']}."
    pipeline.hooks.append_run(
        pipeline.req.workspaceId, pipeline.req.filePath,
        {
            "timestamp": time.time(),
            "summary": summary,
            "goals": pipeline.req.goals or [],
            "applied": bool(pipeline.apply_result),
            "deltas": deltas,
            "steps": pipeline.steps_json(),
            "refactorLlm": pipeline.refactor_llm_experiment,
        }
    )

    # Prepare response - ensure all fields are serializable
    # CRITICAL: Only return refactored content if it was accepted and is different
    if pipeline.research_independent and pipeline.multi_llm_runs:
        any_research_ok = any(
            r.get("ok") and r.get("researchMetrics") for r in pipeline.multi_llm_runs
        )
        if any_research_ok:
            success = True
            refactored_content = (
                pipeline.candidate if pipeline.candidate.strip() != pipeline.original.strip() else pipeline.original
            )
        else:
            refactored_content = pipeline.original
            success = False
    elif pipeline.accept and pipeline.candidate.strip() != pipeline.original.strip():
        refactored_content = pipeline.candidate
        success = True
    else:
        # If rejected or identical, return pipeline.original with rejection message
        refactored_content = pipeline.original
        success = False
        if pipeline.candidate.strip() == pipeline.original.strip():
            print(f"⚠️  WARNING: Returning original code - refactored code was identical")
    
    # Rejection reasons: split what BLOCKED save (Verify step) vs advisory analysis (behavioral heuristics)
    verification_rejection_reasons: List[str] = []
    analysis_concerns: List[str] = list(
        (deltas.get("comprehensiveAnalysis") or {}).get("summary", {}).get("concerns") or []
    )
    if not pipeline.accept:
        for step in pipeline.steps_models:
            if step.name == "Verify" and step.details:
                d = step.details
                vr = d.get("rejectionReason") or (d.get("verification") or {}).get("rejectionReason")
                if vr and vr not in verification_rejection_reasons:
                    verification_rejection_reasons.append(vr)
        if pipeline.candidate.strip() == pipeline.original.strip() and "IDENTICAL_CODE" not in verification_rejection_reasons:
            verification_rejection_reasons.insert(0, "IDENTICAL_CODE")
    # Backward-compatible flat list: gate reasons first, then labeled advisories (do not block by themselves)
    rejection_reasons: List[str] = list(verification_rejection_reasons)
    if not pipeline.accept and analysis_concerns:
        rejection_reasons.extend([f"(advisory) {c}" for c in analysis_concerns])

    # Always expose LLM output for research review when not adopted (including identical output).
    proposed_for_review = None if pipeline.accept else pipeline.candidate

    failure_outcome = pipeline.file_failure_outcome
    orig_line_count = len(pipeline.original.splitlines())
    if failure_outcome is None and pipeline.last_llm_out is not None:
        if not pipeline.last_llm_out.ok:
            failure_outcome = build_failure_outcome(
                llm_error_code=pipeline.last_llm_out.error_code,
                llm_message=pipeline.last_llm_out.message,
                original_lines=orig_line_count,
            )
        elif pipeline.last_llm_out.truncated_output:
            failure_outcome = build_failure_outcome(
                truncated=True,
                original_lines=orig_line_count,
            )

    user_error = None
    if not success:
        if failure_outcome and failure_outcome.get("userMessage"):
            user_error = failure_outcome["userMessage"]
        elif pipeline.llm_pipeline_failed and pipeline.last_llm_out is not None:
            user_error = pipeline.last_llm_out.message
        elif pipeline.candidate.strip() == pipeline.original.strip():
            user_error = "The refactoring output matched the pipeline.original file, so nothing was applied."
        elif not pipeline.accept:
            primary = verification_rejection_reasons[0] if verification_rejection_reasons else None
            verify_explain = {
                "excessiveLineChange": (
                    "Automatic verification rejected the proposal: the file grew or shrank more than the allowed "
                    "limit (guards against truncated or runaway rewrites). Try a smaller refactor scope or compare "
                    "line counts in the diff."
                ),
                "tooSimilar": (
                    "Automatic verification rejected the proposal: the output was too text-similar to the pipeline.original "
                    "(expected clearer structural changes)."
                ),
                "smellCountIncreased": (
                    "Automatic verification rejected the proposal: reported code smells increased after refactor."
                ),
                "noMeaningfulChanges": (
                    "Automatic verification rejected the proposal: not enough substantive edits detected."
                ),
                "noMethodsPreserved": (
                    "Automatic verification rejected the proposal: too many methods appeared removed vs. original."
                ),
                "identical": (
                    "Automatic verification rejected the proposal: after normalizing whitespace, the text matched the original."
                ),
                "identicalCode": (
                    "Automatic verification rejected the proposal: refactored text was identical to the original."
                ),
                "IDENTICAL_CODE": (
                    "No changes to apply: refactored output matched the original file."
                ),
            }
            user_error = verify_explain.get(
                primary,
                (
                    "A proposed refactor was generated but did not pass automatic verification, so it was not saved. "
                    "See verificationRejectionReasons for the gate that blocked save; analysisConcerns are heuristic warnings only."
                ),
            )
            if analysis_concerns and primary:
                user_error += (
                    " Additional notes (advisory; not the primary gate): "
                    + "; ".join(analysis_concerns[:5])
                    + ("…" if len(analysis_concerns) > 5 else "")
                )

    verify_details_for_report: Optional[Dict] = None
    for _step in pipeline.steps_models:
        if _step.name == "Verify" and _step.details:
            verify_details_for_report = _step.details if isinstance(_step.details, dict) else None
            break

    try:
        from refactoring_report import build_refactoring_report

        report_smells = (
            pipeline.before_reanalysis.get("codeSmells", [])
            if pipeline.before_reanalysis.get("codeSmells")
            else pipeline.smells
        )
        refactoring_report = build_refactoring_report(
            file_path=pipeline.req.filePath,
            original=pipeline.original,
            candidate=pipeline.candidate,
            smells=report_smells,
            refactoring_plan=pipeline.refactoring_plan,
            accept=pipeline.accept,
            analysis=pipeline.analysis_result,
            verify_details=verify_details_for_report,
        )
    except Exception as _report_err:
        print(f"⚠️  refactoring_report build failed: {_report_err}")
        refactoring_report = {
            "file": (pipeline.req.filePath or "unknown").replace("\\", "/"),
            "summary": "Structured refactoring report could not be generated.",
            "detected_smells": [],
            "applied_refactorings": [],
            "smell_refactoring_mapping": [],
            "change_metrics": {
                "lines_added": 0,
                "lines_removed": 0,
                "lines_modified": 0,
                "refactoring_operations": 0,
            },
            "additional_cleanup_changes": [],
            "behavior_preservation": str(_report_err)[:200],
            "quality_improvement": [],
        }

    if pipeline.apply_result is not None and isinstance(pipeline.apply_result, dict):
        pipeline.apply_result = {**pipeline.apply_result, "refactoringReport": refactoring_report}

    research_metrics = None
    if pipeline.research_independent and pipeline.multi_llm_runs:
        for r in sorted(
            pipeline.multi_llm_runs,
            key=lambda x: int(x.get("smellDelta") or 0),
            reverse=True,
        ):
            if r.get("researchMetrics"):
                research_metrics = r["researchMetrics"]
                break
    if research_metrics is None and pipeline.analysis_result:
        try:
            from research_payload import build_research_metrics

            research_metrics = build_research_metrics(
                file_path=pipeline.req.filePath,
                original=pipeline.original,
                refactored=pipeline.candidate,
                analysis_result=pipeline.analysis_result,
                deltas=deltas,
                verify_accepted=pipeline.accept,
                before_smell_count=pipeline.before_count,
                after_smell_count=pipeline.after_count,
                quality_before=metrics_before,
                quality_after=metrics_after,
            )
            try:
                from multi_llm_agent_config import multi_llm_agent_mode
                from multi_llm_agents import inject_llm_agent_meta

                if isinstance(research_metrics.get("meta"), dict):
                    research_metrics["meta"] = inject_llm_agent_meta(
                        research_metrics["meta"],
                        mode=multi_llm_agent_mode(),
                        planner=pipeline.llm_plan_outcome,
                        verifier=pipeline.llm_verify_outcome,
                    )
            except Exception:
                pass
        except Exception as _rm_err:
            print(f"⚠️  research_metrics build failed: {_rm_err}")
            metrics = pipeline.analysis_result.get("metrics", {})
            research_metrics = {
                "halstead": metrics.get("halstead"),
                "method_lengths": metrics.get("method_lengths"),
                "nesting_depth": metrics.get("nesting_depth"),
                "coupling": metrics.get("coupling"),
                "cohesion": metrics.get("cohesion"),
                "diff_churn": metrics.get("diff_churn"),
                "semantic_preservation": metrics.get("semantic_preservation"),
                "token_efficiency": metrics.get("token_efficiency"),
                "smell_resolution": pipeline.analysis_result.get("smell_resolution"),
            }

    research_outcome = {
        "adopted": bool(pipeline.accept),
        "verifyAccepted": bool(pipeline.accept),
        "identicalToOriginal": pipeline.candidate.strip() == pipeline.original.strip(),
        "smellsBefore": pipeline.before_count,
        "smellsAfter": pipeline.after_count,
        "smellDelta": pipeline.before_count - pipeline.after_count,
        "fileWrittenToWorkspace": bool(pipeline.apply_result) if pipeline.accept and not pipeline.research_independent else False,
        "failurePrimaryReason": (
            (failure_outcome or {}).get("primaryReason")
            if failure_outcome
            else None
        ),
        "fileLines": pipeline.file_feasibility.get("lines") if pipeline.file_feasibility else orig_line_count,
        "llmInvoked": (
            pipeline.file_feasibility.get("invokeLlm", True) if pipeline.file_feasibility else bool(pipeline.last_llm_out)
        ),
    }

    response_data = {
        "success": success,
        "filePath": pipeline.req.filePath,
        "failureOutcome": failure_outcome,
        "fileSizeAssessment": pipeline.file_feasibility,
        "steps": pipeline.steps_json(),
        "originalContent": pipeline.original,
        "refactoredContent": refactored_content,
        "llmCandidateContent": pipeline.candidate,
        "proposedContent": proposed_for_review,
        "researchOutcome": research_outcome,
        "deltas": deltas,
        "applyResult": pipeline.apply_result,
        "refactoringReport": refactoring_report,
        "rejected": not pipeline.accept,
        "rejectionReason": rejection_reasons if rejection_reasons else None,
        "verificationRejectionReasons": verification_rejection_reasons if verification_rejection_reasons else None,
        "analysisConcerns": analysis_concerns if analysis_concerns else None,
        "message": (
            "Research run complete: LLM output matched the pipeline.original file — full metrics and pipeline trace are in the response; nothing was written to the workspace."
            if (not pipeline.accept and pipeline.candidate.strip() == pipeline.original.strip())
            else None
        ),
        "error": user_error,
        "errorCode": (pipeline.last_llm_out.error_code if (not success and pipeline.last_llm_out and not pipeline.last_llm_out.ok) else None),
        "experiment": {
            "refactorLlm": pipeline.refactor_llm_experiment,
            **(
                {
                    "orchestration": "multi_agent",
                    "graphVersion": getattr(pipeline, "ma_graph_version", "2.0"),
                    "rippleReport": getattr(pipeline, "ripple_report", None) or {},
                    "llmVerify": (
                        pipeline.llm_verify_outcome.to_experiment_dict()
                        if pipeline.llm_verify_outcome and hasattr(pipeline.llm_verify_outcome, "to_experiment_dict")
                        else None
                    ),
                }
                if getattr(pipeline, "ma_study_mode", False)
                else {}
            ),
        },
        "multiLlmRuns": pipeline.hooks.sanitize_multi_llm_runs_for_client(pipeline.multi_llm_runs),
        "researchMetrics": research_metrics,
        "pipelineMetadata": {
            "retryCount": pipeline.retry_count,
            "model": pipeline.hooks.MODEL,
            "multiLlmChain": bool(pipeline.req.multiLlmChain),
            "multiLlmMode": (
                "independent_parallel" if pipeline.research_independent
                else ("sequential_chain" if pipeline.req.multiLlmChain else None)
            ),
            "llmChain": pipeline.hooks.DEFAULT_MULTI_LLM_CHAIN if pipeline.req.multiLlmChain else None,
            "sampleId": pipeline.req.sampleId,
            "researchArtifactsOnly": bool(pipeline.research_independent),
            "liveFileModified": bool(pipeline.apply_result),
            "rejectionCategory": pipeline.hooks.categorize_rejection(verification_rejection_reasons) if verification_rejection_reasons else None,
            "fileSizeAssessment": pipeline.file_feasibility,
        },
    }
    
    # Signal completion to SSE listeners
    await pipeline.publish_detail(
        f"Refactoring {'completed successfully' if success else 'finished with issues'}" +
        (f" — smells reduced from {deltas.get('smellsBefore', '?')} to {deltas.get('smellsAfter', '?')}" if success and deltas else ""),
        "success" if success else "warning"
    )
    if pipeline.job_id:
        pipeline.hooks.publish_progress(pipeline.job_id, {"type": "done", "success": success})

    # Validate response can be serialized
    try:
        import json
        json.dumps(response_data)  # Test serialization
    except Exception as serial_error:
        print(f"WARNING: Response serialization issue: {serial_error}")
        size_limit = 5 * 1024 * 1024
        if len(pipeline.candidate) > size_limit:
            response_data["refactoredContent"] = pipeline.candidate[:size_limit] + "\n\n... [truncated due to size]"
        if len(pipeline.original) > size_limit:
            response_data["originalContent"] = pipeline.original[:size_limit] + "\n\n... [truncated due to size]"

    # Persist artifacts + file-status (rejected runs must store pipeline.candidate under .refactai/rejected/)
    try:
        _status = "refactored" if pipeline.accept else "rejected"
        _rej = ",".join(rejection_reasons) if rejection_reasons else None
        _sb = pipeline.before_count
        _sa = pipeline.after_count
        _snap = pipeline.hooks.compact_research_snapshot(research_metrics)
        _artifact_paths: Dict[str, Any] = {}
        if not pipeline.accept:
            _persist_candidate = (
                pipeline.candidate
                if pipeline.candidate is not None and str(pipeline.candidate).strip()
                else pipeline.original
            )
            try:
                _attempt_body: Dict[str, Any] = {
                    "filePath": pipeline.req.filePath,
                    "originalContent": pipeline.original,
                    "candidateContent": _persist_candidate,
                    "accepted": False,
                    "smellsBefore": _sb,
                    "smellsAfter": _sa,
                    "rejectionReason": _rej,
                    "userId": pipeline.req.userId,
                    "userName": pipeline.req.userName,
                }
                if _snap:
                    _attempt_body["researchSnapshot"] = _snap
                _attempt = await pipeline.hooks.backend_post(
                    pipeline.client,
                    f"/workspaces/{pipeline.req.workspaceId}/refactor-attempt",
                    _attempt_body,
                )
                if isinstance(_attempt, dict):
                    for _k in ("refactoredArtifactPath", "originalArtifactPath", "savedAt"):
                        if _attempt.get(_k) is not None:
                            _artifact_paths[_k if _k != "savedAt" else "savedToProjectAt"] = _attempt.get(_k)
            except Exception as _persist_err:
                print(f"WARNING: rejected refactor-attempt persist failed: {_persist_err}")
        _payload = {
            "filePath": pipeline.req.filePath,
            "status": _status,
            "smellsBefore": _sb,
            "smellsAfter": _sa,
            "rejectionReason": _rej,
            "userId": pipeline.req.userId,
            "userName": pipeline.req.userName,
            "verifyAccepted": pipeline.accept,
        }
        if _snap:
            _payload["researchSnapshot"] = _snap
        if pipeline.apply_result and isinstance(pipeline.apply_result, dict):
            for _k in ("refactoredArtifactPath", "originalArtifactPath", "savedToProjectAt"):
                if pipeline.apply_result.get(_k) is not None:
                    _payload[_k] = pipeline.apply_result.get(_k)
        for _k, _v in _artifact_paths.items():
            _payload[_k] = _v
        requests.post(
            f"{pipeline.hooks.BACKEND_BASE}/workspaces/{pipeline.req.workspaceId}/file-status",
            json=_payload,
            timeout=5,
        )
    except Exception:
        pass  # best-effort, don't fail the refactoring response

    pipeline.response_data = response_data



def enrich_response_for_langgraph(
    response: Dict[str, Any],
    *,
    graph_version: str,
    node_trace: List[str],
) -> Dict[str, Any]:
    steps = response.get("steps") or []
    for step in steps:
        if isinstance(step, dict):
            step.setdefault("framework", "langgraph")
    meta = response.setdefault("pipelineMetadata", {})
    if not isinstance(meta, dict):
        meta = {}
        response["pipelineMetadata"] = meta
    meta["orchestration"] = "langgraph"
    meta["graphVersion"] = graph_version
    meta["nodeTrace"] = node_trace
    return response
