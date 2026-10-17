"""
Independent parallel multi-LLM research runs.

Each provider receives the same frozen baseline source (not chained outputs).
Separate PMD after analysis per candidate; full 15-section researchMetrics per pass.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

from llm_errors import LLMRefactorOutcome, LLMErrorCode

BackendPost = Callable[..., Awaitable[Dict]]
PublishDetail = Callable[[str, str], Awaitable[None]]
NowFn = Callable[[], float]

STEP_NODE_MAP = {
    ("Analyze", "Code Smell Detector"): "analyze",
    ("Smell Analysis", "Refactoring Planner"): "plan",
    ("Smell Analysis", "LLM Planning Agent"): "llm_plan",
    ("Feasibility", "Size Advisor"): "feasibility",
    ("Refactor", "LLM Refactorer"): "refactor",
    ("Refactor", "LLM Refactoring Agent"): "refactor",
    ("Verify", "Quality Verifier"): "verify",
    ("Verify", "LLM Verification Agent"): "llm_verify",
}
GRAPH_VERSION = "1.1"


def _attach_multi_llm_agent_meta(
    pass_metrics: Optional[Dict],
    *,
    pipeline: Any = None,
) -> None:
    if not pass_metrics:
        return
    try:
        from multi_llm_agent_config import multi_llm_agent_mode
        from multi_llm_agents import inject_llm_agent_meta

        planner = getattr(pipeline, "llm_plan_outcome", None) if pipeline else None
        verifier = getattr(pipeline, "llm_verify_outcome", None) if pipeline else None
        pass_metrics["meta"] = inject_llm_agent_meta(
            pass_metrics.get("meta") or {},
            mode=multi_llm_agent_mode(),
            planner=planner,
            verifier=verifier,
        )
    except Exception:
        pass


async def _analyze_smells(
    client: Any,
    backend_post: BackendPost,
    workspace_id: str,
    file_path: str,
    content: str,
) -> Tuple[List[Dict], Dict]:
    line_count = len(content.splitlines())
    if line_count > 1500:
        resp = await backend_post(client, "/workspace-enhanced-analysis/analyze-file", {
            "workspaceId": workspace_id,
            "filePath": file_path,
        })
    else:
        try:
            resp = await backend_post(client, "/workspace-enhanced-analysis/analyze-live", {
                "workspaceId": workspace_id,
                "filePath": file_path,
                "content": content,
            })
        except Exception:
            resp = await backend_post(client, "/workspace-enhanced-analysis/analyze-file", {
                "workspaceId": workspace_id,
                "filePath": file_path,
            })
    smells = list(resp.get("codeSmells", []) or [])
    return smells, resp


async def _run_single_provider_pass(
    *,
    client: Any,
    backend_post: BackendPost,
    baseline: str,
    file_path: str,
    workspace_id: str,
    baseline_smells: List[Dict],
    baseline_smell_count: int,
    provider: str,
    model: str,
    provider_id: Optional[str],
    pass_index: int,
    pass_total: int,
    goals: Optional[List[str]],
    prior_notes: str,
    research_batch_mode: bool,
    job_id: str,
    publish_detail: PublishDetail,
    publish_progress: Optional[Callable[[Dict], None]],
    build_refactoring_plan_from_smells,
    call_llm_refactor,
    sanitize_llm_output,
    calculate_quality_metrics,
    now: NowFn,
    pipeline_hooks=None,
) -> Tuple[Dict, Optional[LLMRefactorOutcome]]:
    """Full 5-agent pipeline on baseline only; PMD after on this provider's candidate."""
    agent_steps: List[Dict] = []

    def record_step(name: str, agent: str, status: str, details=None, error=None):
        node_id = STEP_NODE_MAP.get((name, agent), "")
        entry = {
            "name": name,
            "agent": agent,
            "status": status,
            "startedAt": now(),
            "endedAt": now(),
            "details": details or {},
            "error": error,
            "framework": "langgraph",
            "node_id": node_id,
        }
        agent_steps.append(entry)
        if publish_progress and job_id:
            publish_progress({
                "type": "step",
                "stepName": name,
                "agent": agent,
                "status": status,
                "passIndex": pass_index,
                "passTotal": pass_total,
                "provider": provider,
                "model": model,
                "framework": "langgraph",
                "nodeId": node_id,
                "timestamp": time.time(),
            })

    lines_in = len(baseline.splitlines())
    pass_smells = list(baseline_smells)
    smells_before_pass = baseline_smell_count

    await publish_detail(f"[{provider}] Code Smell Detector: baseline PMD ({smells_before_pass} smells)...", "info")
    record_step("Analyze", "Code Smell Detector", "running")
    if not pass_smells:
        try:
            pass_smells, _ = await _analyze_smells(client, backend_post, workspace_id, file_path, baseline)
            smells_before_pass = len(pass_smells)
        except Exception as exc:
            record_step("Analyze", "Code Smell Detector", "error", error=str(exc)[:200])
        else:
            record_step("Analyze", "Code Smell Detector", "done", details={"smells": smells_before_pass})
    else:
        record_step("Analyze", "Code Smell Detector", "done", details={"smells": smells_before_pass, "source": "baseline_cache"})

    record_step("Smell Analysis", "Refactoring Planner", "running")
    refactoring_plan = build_refactoring_plan_from_smells(pass_smells)
    record_step(
        "Smell Analysis", "Refactoring Planner", "done",
        details={"smellsAnalyzed": len(refactoring_plan), "planSource": "rule_planner"},
    )

    from file_size_policy import assess_refactor_feasibility
    record_step("Feasibility", "Size Advisor", "running")
    file_feasibility = assess_refactor_feasibility(baseline, smell_count=smells_before_pass)
    record_step("Feasibility", "Size Advisor", "done", details=file_feasibility)

    if not file_feasibility.get("invokeLlm"):
        return {
            "passIndex": pass_index,
            "provider": provider,
            "model": model,
            "ok": False,
            "changed": False,
            "linesBefore": lines_in,
            "linesAfter": lines_in,
            "smellsBefore": smells_before_pass,
            "smellsAfter": smells_before_pass,
            "smellDelta": 0,
            "candidateContent": baseline,
            "agentSteps": agent_steps,
            "orchestration": "langgraph",
            "graphVersion": GRAPH_VERSION,
            "passScope": "independent_baseline_parallel",
            "experiment": {"skipped": True, "reason": "file_size_preflight"},
        }, None

    use_graph = False
    if pipeline_hooks is not None:
        try:
            from refactor_graph import use_langgraph_orchestrator, LANGGRAPH_AVAILABLE
            use_graph = LANGGRAPH_AVAILABLE and use_langgraph_orchestrator()
        except ImportError:
            use_graph = False

    if use_graph:
        from refactor_graph import orchestrate_independent_provider

        await publish_detail(f"[{provider}] LangGraph refactor→verify ({model})...", "info")
        pipeline = await orchestrate_independent_provider(
            pipeline_hooks,
            workspace_id=workspace_id,
            file_path=file_path,
            goals=goals,
            research_batch_mode=research_batch_mode,
            baseline=baseline,
            smells=pass_smells,
            refactoring_plan=refactoring_plan,
            file_feasibility=file_feasibility,
            provider_model=model,
            provider_id=provider_id,
            client=client,
            job_id=job_id,
        )
        for step in pipeline.steps_json():
            if step.get("node_id") in ("llm_plan", "refactor", "verify", "llm_verify"):
                agent_steps.append(step)
        llm_out = pipeline.last_llm_out
        cand = pipeline.candidate or baseline
        retry_count = pipeline.retry_count
        changed = cand.strip() != baseline.strip()
        smells_after_pass = pipeline.after_count or smells_before_pass
        pass_metrics = None
        if llm_out is None or not llm_out.ok:
            return {
                "passIndex": pass_index,
                "provider": provider,
                "model": model,
                "ok": False,
                "changed": False,
                "linesBefore": lines_in,
                "linesAfter": lines_in,
                "smellsBefore": smells_before_pass,
                "smellsAfter": smells_after_pass,
                "smellDelta": smells_before_pass - smells_after_pass,
                "candidateContent": baseline,
                "agentSteps": agent_steps,
                "orchestration": "langgraph",
                "graphVersion": GRAPH_VERSION,
                "passScope": "independent_baseline_parallel",
                "researchMetrics": pass_metrics,
                "experiment": llm_out.to_experiment_dict() if llm_out else {},
            }, llm_out
        try:
            after_smells_list = list(pipeline.after.get("codeSmells", []) or [])
            from refactoring_analysis import RefactoringAnalyzer
            from research_payload import build_pass_research_metrics

            analyzer = RefactoringAnalyzer()
            pass_analysis = analyzer.analyze_refactoring(
                original=baseline,
                refactored=cand,
                original_smells=pass_smells,
                refactored_smells=after_smells_list,
                file_path=file_path,
                token_usage=llm_out.usage if llm_out else None,
                retry_count=retry_count,
            )
            q_before = calculate_quality_metrics(baseline)
            q_after = calculate_quality_metrics(cand)
            pass_metrics = build_pass_research_metrics(
                file_path=file_path,
                pass_input=baseline,
                pass_output=cand,
                analysis_result=pass_analysis,
                original_smells=pass_smells,
                refactored_smells=after_smells_list,
                before_smell_count=smells_before_pass,
                after_smell_count=smells_after_pass,
                quality_before=q_before,
                quality_after=q_after,
                provider=provider,
                model=model,
                pass_index=pass_index,
                verify_accepted=bool(changed),
            )
            if pass_metrics.get("meta") is None:
                pass_metrics["meta"] = {}
            pass_metrics["meta"]["passScope"] = "independent_baseline_parallel"
            pass_metrics["meta"]["orchestration"] = "langgraph"
            pass_metrics["meta"]["graphVersion"] = GRAPH_VERSION
            pass_metrics["meta"]["pmdAfterSource"] = "analyze-live"
            _attach_multi_llm_agent_meta(
                pass_metrics,
                pipeline=pipeline,
            )
        except Exception:
            pass_metrics = None
        await publish_detail(
            f"[{provider}] done — smells {smells_before_pass} → {smells_after_pass}, "
            f"lines {lines_in} → {len(cand.splitlines())}",
            "success" if changed else "warning",
        )
        return {
            "passIndex": pass_index,
            "provider": provider,
            "model": model,
            "ok": True,
            "changed": changed,
            "linesBefore": lines_in,
            "linesAfter": len(cand.splitlines()),
            "smellsBefore": smells_before_pass,
            "smellsAfter": smells_after_pass,
            "smellDelta": smells_before_pass - smells_after_pass,
            "candidateContent": cand,
            "agentSteps": agent_steps,
            "orchestration": "langgraph",
            "graphVersion": GRAPH_VERSION,
            "passScope": "independent_baseline_parallel",
            "researchMetrics": pass_metrics,
            "experiment": llm_out.to_experiment_dict(),
        }, llm_out

    record_step("Refactor", "LLM Refactorer", "running", details={"model": model})
    llm_out: Optional[LLMRefactorOutcome] = None
    cand = baseline
    max_retries = 2
    retry_count = 0
    pass_prior = prior_notes or ""
    while retry_count <= max_retries:
        if retry_count > 0:
            await publish_detail(f"[{provider}] Retry {retry_count}/{max_retries}...", "warning")
        try:
            llm_out = await call_llm_refactor(
                baseline, file_path, pass_smells, goals, pass_prior, refactoring_plan,
                model=model, provider_id=provider_id,
            )
        except Exception as llm_exc:
            llm_out = LLMRefactorOutcome(
                ok=False, content="", error_code=LLMErrorCode.PROVIDER_ERROR,
                message=str(llm_exc)[:500], model=model,
            )
        if not llm_out.ok:
            record_step("Refactor", "LLM Refactorer", "error",
                        details={"llm": llm_out.to_experiment_dict()}, error=llm_out.message[:200])
            break
        cand = (
            sanitize_llm_output(
                baseline, llm_out.content,
                min_line_ratio=0.15 if research_batch_mode and llm_out.truncated_output else 0.3,
            )
            if llm_out.ok else baseline
        )
        if cand.strip() != baseline.strip():
            record_step("Refactor", "LLM Refactorer", "done",
                        details={"llm": llm_out.to_experiment_dict(), "changed": True})
            break
        retry_count += 1
        if retry_count <= max_retries:
            pass_prior = (pass_prior or "") + f"\n[RETRY {retry_count} {provider}: make structural changes]"

    changed = cand.strip() != baseline.strip()
    smells_after_pass = smells_before_pass
    pass_metrics: Optional[Dict] = None

    if llm_out is None or not llm_out.ok:
        record_step("Verify", "Quality Verifier", "done", details={"skippedLlm": True})
        return {
            "passIndex": pass_index,
            "provider": provider,
            "model": model,
            "ok": False,
            "changed": False,
            "linesBefore": lines_in,
            "linesAfter": lines_in,
            "smellsBefore": smells_before_pass,
            "smellsAfter": smells_after_pass,
            "smellDelta": smells_before_pass - smells_after_pass,
            "candidateContent": baseline,
            "agentSteps": agent_steps,
            "orchestration": "langgraph",
            "graphVersion": GRAPH_VERSION,
            "passScope": "independent_baseline_parallel",
            "researchMetrics": pass_metrics,
            "experiment": llm_out.to_experiment_dict() if llm_out else {},
        }, llm_out

    record_step("Verify", "Quality Verifier", "running")
    try:
        after_smells_list, after_live = await _analyze_smells(
            client, backend_post, workspace_id, file_path, cand
        )
        smells_after_pass = len(after_smells_list)
        llm_verify_outcome = None
        if pipeline_hooks and pipeline_hooks.is_multi_llm_agent_mode() and cand.strip() != baseline.strip():
            try:
                llm_verify_outcome = await pipeline_hooks.call_llm_verification_agent(
                    baseline,
                    cand,
                    file_path,
                    smells_before=smells_before_pass,
                    smells_after=smells_after_pass,
                    static_gates_passed=changed,
                    rejection_reasons=[] if changed else ["unchanged"],
                    model=model,
                )
            except Exception:
                llm_verify_outcome = None
        from refactoring_analysis import RefactoringAnalyzer
        from research_payload import build_pass_research_metrics

        analyzer = RefactoringAnalyzer()
        pass_analysis = analyzer.analyze_refactoring(
            original=baseline,
            refactored=cand,
            original_smells=pass_smells,
            refactored_smells=after_smells_list,
            file_path=file_path,
            token_usage=llm_out.usage if llm_out else None,
            retry_count=retry_count,
        )
        q_before = calculate_quality_metrics(baseline)
        q_after = calculate_quality_metrics(cand)
        pass_metrics = build_pass_research_metrics(
            file_path=file_path,
            pass_input=baseline,
            pass_output=cand,
            analysis_result=pass_analysis,
            original_smells=pass_smells,
            refactored_smells=after_smells_list,
            before_smell_count=smells_before_pass,
            after_smell_count=smells_after_pass,
            quality_before=q_before,
            quality_after=q_after,
            provider=provider,
            model=model,
            pass_index=pass_index,
            verify_accepted=bool(changed),
        )
        if pass_metrics.get("meta") is None:
            pass_metrics["meta"] = {}
        pass_metrics["meta"]["passScope"] = "independent_baseline_parallel"
        pass_metrics["meta"]["orchestration"] = "langgraph"
        pass_metrics["meta"]["graphVersion"] = GRAPH_VERSION
        pass_metrics["meta"]["pmdAfterSource"] = "analyze-live"
        _attach_multi_llm_agent_meta(
            pass_metrics,
            pipeline=type("_P", (), {"llm_verify_outcome": llm_verify_outcome})(),
        )
    except Exception as ver_exc:
        record_step("Verify", "Quality Verifier", "error", error=str(ver_exc)[:200])
    else:
        record_step("Verify", "Quality Verifier", "done", details={
            "smellsBefore": smells_before_pass,
            "smellsAfter": smells_after_pass,
            "smellDelta": smells_before_pass - smells_after_pass,
        })

    await publish_detail(
        f"[{provider}] done — smells {smells_before_pass} → {smells_after_pass}, "
        f"lines {lines_in} → {len(cand.splitlines())}",
        "success" if changed else "warning",
    )

    return {
        "passIndex": pass_index,
        "provider": provider,
        "model": model,
        "ok": True,
        "changed": changed,
        "linesBefore": lines_in,
        "linesAfter": len(cand.splitlines()),
        "smellsBefore": smells_before_pass,
        "smellsAfter": smells_after_pass,
        "smellDelta": smells_before_pass - smells_after_pass,
        "candidateContent": cand,
        "agentSteps": agent_steps,
        "orchestration": "langgraph",
        "graphVersion": GRAPH_VERSION,
        "passScope": "independent_baseline_parallel",
        "researchMetrics": pass_metrics,
        "experiment": llm_out.to_experiment_dict(),
    }, llm_out


def _pick_best_independent_candidate(baseline: str, runs: List[Dict]) -> str:
    best = baseline
    best_delta = -1
    for r in runs:
        if not r.get("ok"):
            continue
        cand = r.get("candidateContent") or ""
        if not cand or cand.strip() == baseline.strip():
            continue
        delta = int(r.get("smellDelta") or 0)
        if delta > best_delta:
            best_delta = delta
            best = cand
    if best_delta < 0:
        for r in runs:
            cand = r.get("candidateContent") or ""
            if r.get("changed") and cand.strip() != baseline.strip():
                return cand
    return best


async def run_multi_llm_independent_parallel(
    client: Any,
    backend_post: BackendPost,
    baseline: str,
    file_path: str,
    workspace_id: str,
    smells_initial: List[Dict],
    goals: Optional[List[str]],
    prior_notes: str,
    publish_detail: PublishDetail,
    job_id: str,
    research_batch_mode: bool,
    chain: List[Dict],
    *,
    build_refactoring_plan_from_smells,
    call_llm_refactor,
    sanitize_llm_output,
    calculate_quality_metrics,
    publish_progress: Optional[Callable[[Dict], None]] = None,
    now: NowFn,
    pipeline_hooks=None,
) -> Tuple[str, List[Dict], Optional[LLMRefactorOutcome], bool, int, int]:
    """
    Returns: candidate, runs, last_llm_out, failed, baseline_smell_count, best_after_smell_count
    """
    baseline_smells = list(smells_initial)
    baseline_smell_count = len(baseline_smells)
    if baseline_smell_count == 0:
        try:
            baseline_smells, _ = await _analyze_smells(
                client, backend_post, workspace_id, file_path, baseline
            )
            baseline_smell_count = len(baseline_smells)
        except Exception:
            pass

    await publish_detail(
        f"Independent parallel multi-LLM: baseline PMD={baseline_smell_count}, "
        f"running {len(chain)} providers in parallel...",
        "info",
    )

    async def run_one(idx: int, entry: Dict) -> Tuple[Dict, Optional[LLMRefactorOutcome]]:
        provider = entry["provider"]
        model = entry["model"]
        provider_id = entry.get("providerId")
        if job_id and publish_progress:
            publish_progress({
                "type": "llm",
                "provider": provider,
                "model": model,
                "passIndex": idx,
                "passTotal": len(chain),
                "message": f"Parallel pass: {provider} ({model})",
                "timestamp": time.time(),
            })
        return await _run_single_provider_pass(
            client=client,
            backend_post=backend_post,
            baseline=baseline,
            file_path=file_path,
            workspace_id=workspace_id,
            baseline_smells=baseline_smells,
            baseline_smell_count=baseline_smell_count,
            provider=provider,
            model=model,
            provider_id=provider_id,
            pass_index=idx,
            pass_total=len(chain),
            goals=goals,
            prior_notes=prior_notes,
            research_batch_mode=research_batch_mode,
            job_id=job_id,
            publish_detail=publish_detail,
            publish_progress=publish_progress,
            build_refactoring_plan_from_smells=build_refactoring_plan_from_smells,
            call_llm_refactor=call_llm_refactor,
            sanitize_llm_output=sanitize_llm_output,
            calculate_quality_metrics=calculate_quality_metrics,
            now=now,
            pipeline_hooks=pipeline_hooks,
        )

    results = await asyncio.gather(*[run_one(i, e) for i, e in enumerate(chain)])
    runs: List[Dict] = []
    last_out: Optional[LLMRefactorOutcome] = None
    failed = False
    for run_dict, llm_out in results:
        runs.append(run_dict)
        if llm_out:
            last_out = llm_out
        if not run_dict.get("ok"):
            failed = True

    runs.sort(key=lambda r: r.get("passIndex", 0))
    candidate = _pick_best_independent_candidate(baseline, runs)
    best_after = baseline_smell_count
    for r in runs:
        if r.get("ok"):
            sa = int(r.get("smellsAfter") or baseline_smell_count)
            if sa < best_after:
                best_after = sa

    return candidate, runs, last_out, failed, baseline_smell_count, best_after
