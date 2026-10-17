"""
Monolithic refactor pipeline execution (invoked by LangGraph coordinator).
"""
from typing import Any, Dict, List, Optional
import asyncio
import hashlib
import re
import time
import traceback
import httpx
import requests

from llm_errors import LLMRefactorOutcome
from refactor_pipeline import StepLog


async def execute_refactor_pipeline(req, job_id: str, hooks):
    # Pre-create the SSE queue so events published before the SSE client
    # connects are buffered rather than lost.
    if job_id:
        hooks.ensure_queue(job_id)

    steps_models: List[StepLog] = []
    def add_step(**kwargs):
        steps_models.append(StepLog(**kwargs))
        if job_id:
            step = steps_models[-1]
            hooks.publish_progress(job_id, {
                "type": "step",
                "stepName": step.name,
                "agent": step.agent,
                "status": step.status,
                "stepIndex": len(steps_models) - 1,
                "totalSteps": 7,
                "timestamp": time.time(),
            })
    async def publish_detail(message: str, category: str = "info"):
        """Push a descriptive message to SSE and yield control so the event loop can flush it."""
        if job_id:
            hooks.publish_progress(job_id, {
                "type": "detail",
                "message": message,
                "category": category,
                "timestamp": time.time(),
            })
            await asyncio.sleep(0)  # yield to event loop so SSE generator can send
    def publish_detail_sync(message: str, category: str = "info"):
        """Non-async version for use in sync helpers."""
        if job_id:
            hooks.publish_progress(job_id, {
                "type": "detail",
                "message": message,
                "category": category,
                "timestamp": time.time(),
            })
    def steps_json() -> List[Dict]:
        return [s.model_dump() for s in steps_models]
    original = ""
    candidate = ""
    # Brief pause so the SSE EventSource connection from the frontend can establish
    if job_id:
        await asyncio.sleep(0.3)
    try:
        async with httpx.AsyncClient(timeout=300) as client:
            last_llm_out: Optional[LLMRefactorOutcome] = None
            refactor_llm_experiment: Optional[Dict] = None
            multi_llm_runs: List[Dict] = []

            # Load file
            add_step(name="Load", agent="File Loader", status="running", startedAt=hooks.now())
            await publish_detail(f"Loading file: {req.filePath}", "info")
            workspace_original = ""
            try:
                content_resp = await hooks.backend_get(
                    client,
                    f"/workspaces/{req.workspaceId}/files/content",
                    params={"filePath": req.filePath},
                )
                workspace_original = content_resp.get("content", "") or ""
            except Exception as e:
                steps_models[-1].status = "error"
                steps_models[-1].endedAt = hooks.now()
                steps_models[-1].error = str(e)
                await publish_detail(f"Failed to load file: {str(e)[:100]}", "error")

            load_source = "workspace"
            if req.content and req.content.strip():
                client_lines = len(req.content.splitlines())
                ws_lines = len(workspace_original.splitlines()) if workspace_original else 0
                # UI often sends the *previous* file's buffer; never run refactor on truncated stale text.
                if ws_lines > 0 and client_lines < max(50, int(ws_lines * 0.85)):
                    original = workspace_original
                    load_source = "workspace"
                    print(
                        f"⚠️  Ignoring client content ({client_lines} lines) — using workspace file ({ws_lines} lines)"
                    )
                    await publish_detail(
                        f"Using workspace file ({ws_lines} lines); client buffer looked stale ({client_lines} lines)",
                        "warning",
                    )
                else:
                    original = req.content
                    load_source = "direct"
            else:
                original = workspace_original

            if original:
                steps_models[-1].status = "done"
                steps_models[-1].endedAt = hooks.now()
                steps_models[-1].details = {"bytes": len(original), "source": load_source}
                await publish_detail(
                    f"Loaded {len(original.splitlines())} lines from {load_source}",
                    "success",
                )
            elif not steps_models[-1].error:
                steps_models[-1].status = "error"
                steps_models[-1].endedAt = hooks.now()
                steps_models[-1].error = "Empty file content"

            research_independent = bool(req.researchBatchMode and req.multiLlmChain)
            independent_baseline_count = 0

            if req.sampleId and original:
                try:
                    baseline_resp = await hooks.backend_get(
                        client,
                        f"/workspaces/{req.workspaceId}/research/baseline-content",
                        params={"sampleId": req.sampleId, "filePath": req.filePath},
                    )
                    baseline_content = baseline_resp.get("content")
                    if baseline_content and str(baseline_content).strip():
                        original = str(baseline_content)
                        load_source = "research_baseline_snapshot"
                        if steps_models and steps_models[-1].name == "Load":
                            steps_models[-1].details = {
                                **(steps_models[-1].details or {}),
                                "source": load_source,
                                "sampleId": req.sampleId,
                            }
                        await publish_detail(
                            f"Using frozen research baseline (sample {req.sampleId})",
                            "info",
                        )
                except Exception as exc:
                    await publish_detail(
                        f"No baseline snapshot — using workspace file ({str(exc)[:80]})",
                        "warning",
                    )
            
            # If we couldn't load the file, return early
            if not original:
                load_err = steps_models[-1].error if steps_models else None
                detail = load_err or "File not found in workspace (source tree may be missing — re-upload project)"
                return {
                    "success": False,
                    "steps": steps_json(),
                    "originalContent": "",
                    "refactoredContent": "",
                    "deltas": {},
                    "applyResult": None,
                    "error": f"Failed to load file content: {detail}",
                }

            # Analyze before
            add_step(name="Analyze", agent="Code Smell Detector", status="running", startedAt=hooks.now())
            line_count = len(original.splitlines())
            await publish_detail("Scanning file for code smells using static analysis...", "info")
            try:
                # Large files: analyze on-disk path is faster than posting full source to analyze-live
                if line_count > 1500:
                    before = await hooks.backend_post(client, "/workspace-enhanced-analysis/analyze-file", {
                        "workspaceId": req.workspaceId,
                        "filePath": req.filePath,
                    })
                else:
                    try:
                        before = await hooks.backend_post(client, "/workspace-enhanced-analysis/analyze-live", {
                            "workspaceId": req.workspaceId,
                            "filePath": req.filePath,
                            "content": original,
                        })
                    except Exception:
                        before = await hooks.backend_post(client, "/workspace-enhanced-analysis/analyze-file", {
                            "workspaceId": req.workspaceId,
                            "filePath": req.filePath,
                        })
            except Exception:
                before = {"codeSmells": []}
            backend_smells: List[Dict] = list(before.get("codeSmells", []) or [])
            smells = backend_smells
            smell_source = "backend_analysis"
            if req.providedSmells and len(req.providedSmells) > 0:
                frontend_smells = [hooks.normalize_provided_smell(s) for s in req.providedSmells]
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
            await publish_detail(f"Found {len(smells)} code smells: {', '.join(f'{v} {k}' for k, v in sev_counts.items())}", "analysis")
            # Dependencies
            assoc = []
            try:
                deps = await hooks.backend_get(client, f"/workspaces/{req.workspaceId}/dependencies/file", params={"filePath": req.filePath})
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
            steps_models[-1].status = "done"; steps_models[-1].endedAt = hooks.now(); steps_models[-1].details = {
                "smells": len(smells),
                "severity": sev_summary,
                "associatedFiles": assoc,
                "smellSource": smell_source,
            }

            # Smell Analysis - Scientific prioritization
            add_step(name="Smell Analysis", agent="Refactoring Planner", status="running", startedAt=hooks.now())
            await publish_detail("Prioritizing smells by impact and safety (Fowler's catalog)...", "info")
            refactoring_plan = []
            try:
                if smells:
                    # If selectedSmells provided (from analysis step), use only those
                    # Otherwise, apply automatic selection strategy
                    selected_smells_to_handle = []
                    
                    if hasattr(req, 'selectedSmells') and req.selectedSmells:
                        # Use pre-selected smells from analysis step
                        selected_smell_ids = set(req.selectedSmells)
                        selected_smells_to_handle = [s for s in smells if (s.get("detectorId") or s.get("type")) in selected_smell_ids]
                        steps_models[-1].details = {"mode": "using_pre_selected", "count": len(selected_smells_to_handle)}
                    else:
                        # Apply automatic selection strategy (same as in /agents/analyze)
                        critical_smells = [s for s in smells if hooks.normalize_smell_severity(s) == "CRITICAL"]
                        major_smells = [s for s in smells if hooks.normalize_smell_severity(s) == "MAJOR"]
                        minor_smells = [s for s in smells if hooks.normalize_smell_severity(s) == "MINOR"]
                        
                        selected_smells_to_handle = []
                        selected_smells_to_handle.extend(critical_smells)  # All critical
                        # Scale major smells based on total count
                        max_major = min(30 if len(smells) > 50 else (20 if len(smells) > 20 else 10), len(major_smells))
                        selected_smells_to_handle.extend(major_smells[:max_major])
                        
                        # Top impactful minor smells (keep keywords aligned with /agents/analyze)
                        _minor_kw = [
                            "duplicate", "long-method", "complex", "nested", "god-class", "large-class",
                            "feature-envy", "temporary-field", "message-chains", "data-class", "lazy-class",
                        ]
                        impactful_minor = [
                            s for s in minor_smells
                            if any(
                                keyword in (s.get("detectorId") or s.get("type") or "").lower()
                                for keyword in _minor_kw
                            )
                        ]
                        remaining_slots = 15 - len(selected_smells_to_handle)
                        if remaining_slots > 0:
                            selected_smells_to_handle.extend(impactful_minor[:remaining_slots])
                        # Fill remaining slots with other minors so small files still get a useful plan
                        remaining_slots = 15 - len(selected_smells_to_handle)
                        if remaining_slots > 0:
                            for s in minor_smells:
                                if s in selected_smells_to_handle:
                                    continue
                                selected_smells_to_handle.append(s)
                                remaining_slots -= 1
                                if remaining_slots <= 0:
                                    break

                        # Same fallback as /agents/analyze: severity strings from backend often left us with 0 picks
                        if not selected_smells_to_handle and smells:
                            prioritized = sorted(
                                smells,
                                key=lambda s: (
                                    0 if hooks.normalize_smell_severity(s) == "CRITICAL" else (
                                        1 if hooks.normalize_smell_severity(s) == "MAJOR" else 2
                                    ),
                                    s.get("startLine", 0) or 0,
                                ),
                            )
                            take = min(20, len(prioritized))
                            selected_smells_to_handle = prioritized[:take]
                            steps_models[-1].details = {
                                "mode": "auto_selected_fallback",
                                "count": len(selected_smells_to_handle),
                                "note": "No severity-matched picks; using top smells by severity/lines",
                            }
                        else:
                            steps_models[-1].details = {"mode": "auto_selected", "count": len(selected_smells_to_handle)}
                    
                    # Create refactoring plan from SELECTED smells only
                    for smell in selected_smells_to_handle:
                        detector_id = smell.get("detectorId") or smell.get("type", "unknown")
                        sev_norm = hooks.normalize_smell_severity(smell)
                        severity = smell.get("severity", sev_norm)
                        summary = smell.get("summary") or smell.get("description", "")
                        start_line = smell.get("startLine", 0)
                        end_line = smell.get("endLine", 0)
                        
                        # Map smell types to refactoring techniques
                        refactoring_technique = map_smell_to_refactoring(detector_id, summary)
                        
                        refactoring_plan.append({
                            "smellId": detector_id,
                            "severity": severity,
                            "location": f"lines {start_line}-{end_line}",
                            "description": summary,
                            "technique": refactoring_technique["technique"],
                            "action": refactoring_technique["action"],
                            "priority": "HIGH" if sev_norm in ["CRITICAL", "MAJOR"] else "MEDIUM"
                        })
                    
                    steps_models[-1].status = "done"; steps_models[-1].endedAt = hooks.now(); 
                    steps_models[-1].details.update({
                        "smellsAnalyzed": len(refactoring_plan),
                        "highPriority": len([p for p in refactoring_plan if p["priority"] == "HIGH"]),
                        "plan": refactoring_plan
                    })
                    # Publish targeted smell details for the live feed
                    high_p = [p for p in refactoring_plan if p["priority"] == "HIGH"]
                    await publish_detail(f"Selected {len(refactoring_plan)} smells to fix ({len(high_p)} high priority)", "analysis")
                    for p in refactoring_plan[:6]:
                        await publish_detail(f"  [{p['severity']}] {p['smellId']} → {p['technique']}", "smell")
                else:
                    # Even with no smells, create a general refactoring plan
                    refactoring_plan = [{
                        "smellId": "general-improvements",
                        "severity": "MINOR",
                        "location": "entire file",
                        "description": "Apply general code improvements: readability, structure, best practices",
                        "technique": "General Refactoring",
                        "action": "Improve code structure, readability, and maintainability",
                        "priority": "MEDIUM"
                    }]
                    steps_models[-1].status = "done"; steps_models[-1].endedAt = hooks.now(); steps_models[-1].details = {
                        "message": "No code smells detected - applying general improvements",
                        "plan": refactoring_plan
                    }
            except Exception as e:
                steps_models[-1].status = "error"; steps_models[-1].endedAt = hooks.now(); steps_models[-1].error = str(e)
                refactoring_plan = []

            from file_size_policy import assess_refactor_feasibility, build_failure_outcome

            file_feasibility = assess_refactor_feasibility(
                original, smell_count=len(smells) if smells else 0
            )
            file_failure_outcome = None

            add_step(name="Feasibility", agent="Size Advisor", status="running", startedAt=hooks.now())
            for w in file_feasibility.get("warnings") or []:
                await publish_detail(w, "warning")
            if file_feasibility.get("invokeLlm"):
                await publish_detail(
                    f"Size check: {file_feasibility['lines']:,} lines (~{file_feasibility['estimatedInputTokens']:,} est. input tokens) — proceeding with LLM refactor",
                    "info",
                )
            else:
                fo = build_failure_outcome(feasibility=file_feasibility)
                file_failure_outcome = fo
                await publish_detail(fo["userMessage"], "warning")
            steps_models[-1].status = "done"
            steps_models[-1].endedAt = hooks.now()
            steps_models[-1].details = file_feasibility

            # Refactor
            add_step(name="Refactor", agent="LLM Refactorer", status="running", startedAt=hooks.now())
            candidate = original
            max_retries = 2
            retry_count = 0
            llm_pipeline_failed = False

            if not file_feasibility.get("invokeLlm"):
                steps_models[-1].status = "done"
                steps_models[-1].endedAt = hooks.now()
                steps_models[-1].details = {
                    "skipped": True,
                    "skippedReason": "file_size_preflight",
                    "blockCodes": file_feasibility.get("blockCodes"),
                    "feasibility": file_feasibility,
                    "failureOutcome": file_failure_outcome,
                }
                llm_pipeline_failed = True
                candidate = original
            else:
                await publish_detail(
                    f"Sending {file_feasibility['lines']:,} lines to LLM ({hooks.MODEL}) for refactoring...",
                    "info",
                )
                fl = int(file_feasibility.get("lines") or len(original.splitlines()))
                est_min = max(5, min(45, fl // 120))
                await publish_detail(
                    f"Generating refactored code — longest step (~{est_min}–{est_min + 15} min for {fl:,} lines). Keep this tab open.",
                    "info",
                )

            try:
                if file_feasibility.get("invokeLlm"):
                    prior = hooks.load_memory(req.workspaceId, req.filePath).get("lastSummary", "")
                    if req.multiLlmChain:
                        if research_independent:
                            from multi_llm_independent import run_multi_llm_independent_parallel

                            await publish_detail(
                                "Independent parallel multi-LLM: each provider runs full pipeline "
                                "on the same frozen baseline (not chained)",
                                "info",
                            )
                            (
                                candidate,
                                multi_llm_runs,
                                last_llm_out,
                                chain_failed,
                                independent_baseline_count,
                                independent_best_after,
                            ) = await run_multi_llm_independent_parallel(
                                client,
                                backend_post,
                                original,
                                req.filePath,
                                req.workspaceId,
                                smells,
                                req.goals,
                                prior,
                                publish_detail,
                                job_id,
                                bool(req.researchBatchMode),
                                hooks.DEFAULT_MULTI_LLM_CHAIN,
                                build_refactoring_plan_from_smells=hooks.build_refactoring_plan_from_smells,
                                call_llm_refactor=hooks.call_llm_refactor,
                                sanitize_llm_output=hooks.sanitize_llm_output,
                                calculate_quality_metrics=hooks.calculate_quality_metrics,
                                publish_progress=(
                                    (lambda evt: hooks.publish_progress(job_id, evt)) if job_id else None
                                ),
                                now=now,
                            )
                            if req.sampleId:
                                await hooks.persist_independent_multi_llm_artifacts(
                                    client, req.workspaceId, req.sampleId, req.filePath, multi_llm_runs
                                )
                            refactor_llm_experiment = {
                                "multiLlmChain": True,
                                "multiLlmMode": "independent_parallel",
                                "runs": multi_llm_runs,
                                "last": last_llm_out.to_experiment_dict() if last_llm_out else None,
                            }
                        else:
                            await publish_detail(
                                "Multi-LLM chain: each provider runs full agent pipeline "
                                "(Analyze → Plan → Feasibility → LLM → Verify)",
                                "info",
                            )
                            (
                                candidate,
                                multi_llm_runs,
                                last_llm_out,
                                chain_failed,
                            ) = await hooks.run_multi_llm_chain(
                                client,
                                original,
                                req.filePath,
                                req.workspaceId,
                                smells,
                                req.goals,
                                refactoring_plan,
                                prior,
                                publish_detail,
                                job_id,
                                bool(req.researchBatchMode),
                            )
                            refactor_llm_experiment = {
                                "multiLlmChain": True,
                                "multiLlmMode": "sequential_chain",
                                "runs": multi_llm_runs,
                                "last": last_llm_out.to_experiment_dict() if last_llm_out else None,
                            }
                        step_details = {
                            "multiLlmChain": True,
                            "runs": multi_llm_runs,
                            "changed": candidate.strip() != original.strip(),
                        }
                        steps_models[-1].details = step_details
                        if research_independent:
                            any_ok = any(r.get("ok") for r in multi_llm_runs)
                            if not any_ok:
                                llm_pipeline_failed = True
                                steps_models[-1].status = "error"
                                steps_models[-1].endedAt = hooks.now()
                                steps_models[-1].error = (
                                    last_llm_out.message if last_llm_out and not last_llm_out.ok
                                    else "All independent LLM passes failed"
                                )
                            elif chain_failed:
                                await publish_detail(
                                    "Some providers failed — continuing with successful passes",
                                    "warning",
                                )
                        elif chain_failed and candidate.strip() == original.strip():
                            llm_pipeline_failed = True
                            steps_models[-1].status = "error"
                            steps_models[-1].endedAt = hooks.now()
                            steps_models[-1].error = (
                                last_llm_out.message if last_llm_out and not last_llm_out.ok else "LLM chain failed"
                            )
                        elif chain_failed:
                            await publish_detail(
                                "Some LLM passes failed — continuing with best successful output",
                                "warning",
                            )
                        elif candidate.strip() == original.strip() and not req.researchBatchMode:
                            llm_pipeline_failed = True
                            await publish_detail(
                                "Multi-LLM chain finished but code unchanged — rejecting",
                                "error",
                            )
                        elif candidate.strip() == original.strip() and req.researchBatchMode and not research_independent:
                            await publish_detail(
                                "Multi-LLM chain finished with no net change — verify will record identical output",
                                "warning",
                            )
                    else:
                        while retry_count <= max_retries:
                            if retry_count > 0:
                                await publish_detail(
                                    f"Retry {retry_count}/{max_retries}: LLM returned identical code, requesting more changes...",
                                    "warning",
                                )
                            llm_out = await hooks.call_llm_refactor(
                                original, req.filePath, smells, req.goals, prior, refactoring_plan
                            )
                            last_llm_out = llm_out
                            refactor_llm_experiment = llm_out.to_experiment_dict()

                            if not llm_out.ok:
                                llm_pipeline_failed = True
                                steps_models[-1].status = "error"
                                steps_models[-1].endedAt = hooks.now()
                                steps_models[-1].error = llm_out.message
                                steps_models[-1].details = {"llm": llm_out.to_experiment_dict()}
                                candidate = original
                                await publish_detail(f"LLM error: {llm_out.message[:100]}", "error")
                                break

                            raw_llm = llm_out.content
                            candidate = hooks.sanitize_llm_output(original, raw_llm)
                            step_details: Dict = {
                                "llm": llm_out.to_experiment_dict(),
                                "changed": candidate.strip() != original.strip(),
                            }
                            if llm_out.truncated_output:
                                step_details["warning"] = "output_truncated_max_tokens"
                            steps_models[-1].details = step_details

                            if candidate.strip() == original.strip():
                                retry_count += 1
                                if retry_count <= max_retries:
                                    print(
                                        f"⚠️  LLM returned identical code (attempt {retry_count}/{max_retries}), retrying..."
                                    )
                                    prior = (prior or "") + (
                                        f"\n[RETRY {retry_count}: Previous attempt returned identical code. "
                                        "You MUST make structural changes!]"
                                    )
                                    continue
                                print(f"❌ LLM returned identical code after {max_retries} retries — rejecting")
                                await publish_detail(
                                    "LLM failed to produce changes after 3 attempts — refactoring rejected",
                                    "error",
                                )
                                candidate = original
                                break
                            break

                if not llm_pipeline_failed:
                    steps_models[-1].status = "done"
                    steps_models[-1].endedAt = hooks.now()
                    if steps_models[-1].details is None:
                        steps_models[-1].details = {}
                    steps_models[-1].details.setdefault(
                        "changed", candidate.strip() != original.strip()
                    )
                    # Publish code generation summary
                    cand_lines = len(candidate.splitlines())
                    orig_lines = len(original.splitlines())
                    delta = cand_lines - orig_lines
                    await publish_detail(f"Code generated: {cand_lines} lines ({'+' if delta >= 0 else ''}{delta} from original)", "success")
                    orig_methods = set(re.findall(r'\b(?:public|private|protected)\s+\w+\s+(\w+)\s*\(', original))
                    cand_methods = set(re.findall(r'\b(?:public|private|protected)\s+\w+\s+(\w+)\s*\(', candidate))
                    new_m = cand_methods - orig_methods
                    if new_m:
                        await publish_detail(f"New methods extracted: {', '.join(list(new_m)[:5])}", "refactoring")
            except Exception as outer_error:
                import traceback
                print(f"Refactor step error: {traceback.format_exc()}")
                candidate = original  # Keep original — don't apply fake changes
                steps_models[-1].status = "error"
                steps_models[-1].endedAt = hooks.now()
                steps_models[-1].error = f"Refactor step failed: {str(outer_error)[:500]}"
                steps_models[-1].details = {
                    "changed": candidate.strip() != original.strip(),
                    "errorType": type(outer_error).__name__,
                }

            # Verify
            add_step(name="Verify", agent="Quality Verifier", status="running", startedAt=hooks.now())
            await publish_detail("Running verification gates: API preservation, smell count, empty catches...", "info")
            after = {"codeSmells": []}
            before_reanalysis = {"codeSmells": []}
            accept = False
            try:
                try:
                    after = await hooks.backend_post(client, "/workspace-enhanced-analysis/analyze-live", {
                        "workspaceId": req.workspaceId,
                        "filePath": req.filePath,
                        "content": candidate,
                    })
                    # Re-analyze original with the SAME detector to ensure fair comparison
                    try:
                        before_reanalysis = await hooks.backend_post(client, "/workspace-enhanced-analysis/analyze-live", {
                            "workspaceId": req.workspaceId,
                            "filePath": req.filePath,
                            "content": original,
                        })
                    except Exception:
                        pass
                except Exception:
                    after = await hooks.backend_post(client, "/workspace-enhanced-analysis/analyze-file", {
                        "workspaceId": req.workspaceId,
                        "filePath": req.filePath,
                    })
                # ── Consistent smell counting ──
                # Use re-analyzed counts from the SAME detector for fair comparison
                before_reanalysis_smells = before_reanalysis.get("codeSmells", [])
                after_smells_list = after.get("codeSmells", [])
                if not before_reanalysis_smells and not smells:
                    try:
                        disk_before = await hooks.backend_post(client, "/workspace-enhanced-analysis/analyze-file", {
                            "workspaceId": req.workspaceId,
                            "filePath": req.filePath,
                        })
                        disk_smells = list(disk_before.get("codeSmells", []) or [])
                        if disk_smells:
                            before_reanalysis_smells = disk_smells
                            print(f"📊 Smell counts (disk analyze-file fallback): {len(disk_smells)} before")
                    except Exception:
                        pass
                if len(before_reanalysis_smells) > 0:
                    before_count = len(before_reanalysis_smells)
                    after_count = len(after_smells_list)
                    print(f"📊 Smell counts (same detector): {before_count} → {after_count}")
                else:
                    # Fall back to frontend-provided before count
                    before_count = len(smells)
                    after_count = len(after_smells_list)
                    print(f"📊 Smell counts (frontend before, detector after): {before_count} → {after_count}")

                import difflib
                import re as re_mod

                original_normalized = re_mod.sub(r'\s+', ' ', original.strip())
                candidate_normalized = re_mod.sub(r'\s+', ' ', candidate.strip())
                verify_step_details = None
                research_batch = bool(req.researchBatchMode)

                if research_independent and multi_llm_runs:
                    before_count = (
                        independent_baseline_count
                        or int(multi_llm_runs[0].get("smellsBefore") or len(smells))
                    )
                    ok_runs = [r for r in multi_llm_runs if r.get("ok")]
                    if ok_runs:
                        best_run = max(ok_runs, key=lambda r: int(r.get("smellDelta") or 0))
                        after_count = int(best_run.get("smellsAfter") or before_count)
                        best_cand = best_run.get("candidateContent")
                        if best_cand and str(best_cand).strip():
                            candidate = str(best_cand)
                    else:
                        after_count = before_count
                    accept = any(r.get("ok") and r.get("researchMetrics") for r in multi_llm_runs)
                    before_reanalysis_smells = list(smells)
                    after_smells_list = []
                    verify_step_details = {
                        "before": before_count,
                        "after": after_count,
                        "improvement": max(0, before_count - after_count),
                        "accepted": accept,
                        "researchIndependent": True,
                        "passesCompleted": len(ok_runs),
                        "verification": {"researchArtifactsOnly": True},
                    }
                    await publish_detail(
                        f"Research independent verify: {len(ok_runs)}/3 passes with metrics "
                        f"(baseline smells {before_count}, best after {after_count})",
                        "success" if accept else "warning",
                    )
                # ── Gate 0: Reject identical code ──
                elif original.strip() == candidate.strip():
                    print("❌ GATE 0 FAIL: Code is IDENTICAL to original")
                    accept = False
                    verify_step_details = {
                        "before": before_count, "after": after_count,
                        "improvement": 0, "accepted": False,
                        "rejectionReason": "IDENTICAL_CODE",
                        "verification": {"isDifferent": False, "identical": True}
                    }
                else:
                    # ── Gate 1: Public API preserved ──
                    original_api = hooks.build_public_api_signature(original)
                    candidate_api = hooks.build_public_api_signature(candidate)
                    missing_api = set(original_api) - set(candidate_api)
                    api_preserved = len(missing_api) == 0
                    if not api_preserved:
                        print(f"⚠️  GATE 1 WARNING: {len(missing_api)} public methods removed: {list(missing_api)[:5]}")

                    # ── Gate 2: Structural difference (compute similarity first, needed by smell gate) ──
                    similarity = difflib.SequenceMatcher(None, original_normalized, candidate_normalized).ratio()
                    is_different = similarity < 0.995
                    if not is_different:
                        print(f"❌ GATE 2 FAIL: {similarity*100:.1f}% similar (whitespace-only change)")

                    # ── Gate 3: Smell count — must actually improve ──
                    smell_improved = after_count < before_count
                    smell_tolerance = min(10, max(2, before_count // 20)) if before_count > 0 else 2
                    if research_batch and before_count > 5:
                        # Research batch: allow same smell count when code structurally changed
                        smell_ok = after_count <= before_count and is_different
                    elif before_count > 5:
                        smell_ok = after_count < before_count  # MUST reduce at least 1
                        if not smell_ok and after_count == before_count and similarity < 0.90:
                            smell_ok = True
                            print(f"⚠️  GATE 3 SOFT PASS: Same smell count but code changed significantly (similarity {similarity*100:.1f}%)")
                    else:
                        smell_ok = after_count <= before_count + smell_tolerance
                    print(f"📊 Smells: {before_count} → {after_count} (improved={smell_improved}, ok={smell_ok}) {'✅' if smell_ok else '❌'}")

                    # ── Gate 4: No empty catch blocks introduced ──
                    dangerous_empty_catch = hooks.has_empty_or_comment_only_catch_blocks(candidate)
                    if dangerous_empty_catch:
                        print("❌ GATE 4 FAIL: Empty catch blocks detected")

                    # ── Gate 5: Reasonable size change ──
                    candidate_lines = len(candidate.splitlines())
                    orig_lines = len(original.splitlines())
                    line_ratio = candidate_lines / max(1, orig_lines)
                    reasonable_size = 0.4 <= line_ratio <= 2.5
                    if (
                        research_batch
                        and last_llm_out
                        and last_llm_out.truncated_output
                        and line_ratio >= 0.15
                    ):
                        reasonable_size = True
                        print(f"⚠️  GATE 5 RESEARCH: allowing partial output (ratio {line_ratio:.2f})")
                    if not reasonable_size:
                        print(f"❌ GATE 5 FAIL: Line ratio {line_ratio:.2f} ({orig_lines} → {candidate_lines})")

                    # ── Method metrics ──
                    original_methods = len(re_mod.findall(r'\b(public|private|protected)?\s+\w+\s+\w+\s*\([^)]*\)\s*\{', original))
                    candidate_methods = len(re_mod.findall(r'\b(public|private|protected)?\s+\w+\s+\w+\s*\([^)]*\)\s*\{', candidate))
                    _method_thresh = req.methodPreservationThreshold if req.methodPreservationThreshold is not None else 0.85
                    methods_preserved = candidate_methods >= original_methods * _method_thresh

                    original_method_names = set(re_mod.findall(r'\b(?:public|private|protected)\s+\w+\s+(\w+)\s*\(', original))
                    candidate_method_names = set(re_mod.findall(r'\b(?:public|private|protected)\s+\w+\s+(\w+)\s*\(', candidate))
                    new_methods = len(candidate_method_names - original_method_names)

                    # ── Final decision ──
                    rejection_reasons = []
                    # Reject near-duplicate text unless PMD actually found fewer smells (tiny edits can fix 1 rule).
                    if not is_different and not smell_improved:
                        rejection_reasons.append("too_similar")
                    elif not is_different and smell_improved:
                        print(
                            f"⚠️  High similarity {similarity * 100:.1f}% but smells "
                            f"{before_count}→{after_count}; not treating as too_similar"
                        )
                    if not smell_ok: rejection_reasons.append(f"no_smell_reduction({before_count}→{after_count})")
                    if dangerous_empty_catch: rejection_reasons.append("empty_catch")
                    if not reasonable_size: rejection_reasons.append(f"size_change({line_ratio:.2f})")
                    if not methods_preserved: rejection_reasons.append(f"methods_lost({candidate_methods}/{original_methods})")
                    if not api_preserved: rejection_reasons.append(f"api_broken({len(missing_api)} removed)")

                    accept = len(rejection_reasons) == 0

                    # Research batch: accept substantive refactors that do not increase smells
                    if research_batch and not accept and original.strip() != candidate.strip():
                        if (
                            is_different
                            and after_count <= before_count
                            and api_preserved
                            and not dangerous_empty_catch
                            and reasonable_size
                            and methods_preserved
                        ):
                            accept = True
                            rejection_reasons = []
                            print(
                                f"✅ RESEARCH BATCH ACCEPT: smells {before_count}→{after_count}, "
                                f"similarity {similarity*100:.1f}%"
                            )
                            await publish_detail(
                                f"Research batch: accepted refactor (smells {before_count} → {after_count}, "
                                "no smell increase)",
                                "success",
                            )

                    if accept:
                        print(f"✅ ACCEPTED: Smells {before_count}→{after_count}, similarity {similarity*100:.1f}%, API preserved")
                        await publish_detail(f"Verification PASSED: smells {before_count} → {after_count}, public API preserved", "success")
                    else:
                        print(f"❌ REJECTED: {', '.join(rejection_reasons)}")
                        await publish_detail(f"Verification FAILED: {', '.join(rejection_reasons)}", "error")

                    verify_step_details = {
                        "before": before_count,
                        "after": after_count,
                        "improvement": max(0, before_count - after_count),
                        "accepted": accept,
                        "smellsTargeted": len(hooks.prioritize_smells(smells, original, max_total=8)) if smells else 0,
                        "verification": {
                            "isDifferent": is_different,
                            "similarity": round(similarity, 4),
                            "methodsPreserved": methods_preserved,
                            "originalMethods": original_methods,
                            "candidateMethods": candidate_methods,
                            "newMethods": new_methods,
                            "apiPreserved": api_preserved,
                            "missingApi": list(missing_api)[:5] if not api_preserved else [],
                            "smellReduction": f"{before_count} → {after_count}",
                            "reasonableLineChange": reasonable_size,
                            "lineMetrics": {
                                "originalLines": orig_lines,
                                "candidateLines": candidate_lines,
                                "ratio": round(line_ratio, 3),
                            },
                            "rejectionReason": None if accept else ", ".join(rejection_reasons),
                            "researchBatchAccepted": bool(research_batch and accept and not smell_improved),
                        }
                    }

                steps_models[-1].status = "done"
                steps_models[-1].endedAt = hooks.now()
                steps_models[-1].details = verify_step_details
            except Exception as e:
                after = {"codeSmells": []}
                accept = False
                steps_models[-1].status = "error"; steps_models[-1].endedAt = hooks.now(); steps_models[-1].error = str(e)

            # Apply
            add_step(name="Apply", agent="File Applier", status="running", startedAt=hooks.now())
            await publish_detail("Applying refactored code to workspace..." if accept else "Refactoring rejected — keeping original file", "info" if accept else "warning")
            apply_result = None
            research_artifacts_only = bool(research_independent)
            try:
                if accept and candidate.strip() != original.strip() and not research_artifacts_only:
                    apply_result = await hooks.backend_post(client, "/refactoring/apply", {
                        "workspaceId": req.workspaceId,
                        "filePath": req.filePath,
                        "refactoredCode": candidate,
                    })
                    steps_models[-1].status = "done"; steps_models[-1].endedAt = hooks.now(); steps_models[-1].details = {"applied": True}
                else:
                    details = {"applied": False}
                    if research_artifacts_only:
                        details["researchArtifactsOnly"] = True
                    steps_models[-1].status = "done"; steps_models[-1].endedAt = hooks.now(); steps_models[-1].details = details
            except Exception as e:
                steps_models[-1].status = "error"; steps_models[-1].endedAt = hooks.now(); steps_models[-1].error = str(e)

            # Compile verification (stub) - non-blocking, informative only
            # Since this is just a stub that checks workspace existence, we make it lenient
            # It won't block refactoring even if it fails
            add_step(name="Compile", agent="Compilation Verifier", status="running", startedAt=hooks.now())
            compile_result = None
            compile_success = False
            compile_error_msg = None
            try:
                # Call backend directly to handle error responses gracefully
                url = f"{hooks.BACKEND_BASE}/workspaces/{req.workspaceId}/verify/compile"
                r = await client.post(url, json={}, timeout=10)  # Shorter timeout since it's optional
                
                # Parse response even if status is not 2xx (backend may return error details in JSON)
                try:
                    compile_result = r.json()
                except:
                    compile_result = {}
                
                # Check if request was successful
                if r.status_code == 200:
                    compile_success = bool(compile_result.get('success', True))
                    steps_models[-1].status = "done"
                    steps_models[-1].endedAt = hooks.now()
                    steps_models[-1].details = {
                        "success": compile_success,
                        "javaFiles": compile_result.get("javaFiles", 0),
                        "message": compile_result.get("message", "Compile verification completed")
                    }
                else:
                    # Backend returned error - but since this is just a stub, we mark as done with warning
                    # This prevents the red ERROR status that confuses users
                    error_detail = f"HTTP {r.status_code}"
                    
                    # Extract error message from response
                    if compile_result:
                        error_detail = compile_result.get("error", compile_result.get("message", error_detail))
                    else:
                        try:
                            error_text = r.text[:200] if hasattr(r, 'text') else str(r.status_code)
                            error_detail = error_text if error_text else error_detail
                        except:
                            error_detail = f"HTTP {r.status_code}"
                    
                    # Mark as done (not error) since this is just informational
                    # Include warning in details instead of error status
                    steps_models[-1].status = "done"  # Changed from "error" to "done"
                    steps_models[-1].endedAt = hooks.now()
                    steps_models[-1].details = {
                        "success": False,
                        "warning": error_detail,
                        "statusCode": r.status_code,
                        "note": "Compile verification is informational only (stub). Workspace may need to be recreated after backend restart.",
                        "message": "Workspace verification skipped (informational)"
                    }
                    compile_error_msg = error_detail
            except httpx.TimeoutException as e:
                # Timeout - mark as done with warning (not error)
                steps_models[-1].status = "done"
                steps_models[-1].endedAt = hooks.now()
                steps_models[-1].details = {
                    "success": False,
                    "warning": "Compile verification timeout (backend may be slow)",
                    "timeout": True,
                    "note": "This is informational only and does not affect refactoring"
                }
                compile_error_msg = "Timeout"
            except httpx.RequestError as e:
                # Network/connection error - mark as done with warning
                steps_models[-1].status = "done"
                steps_models[-1].endedAt = hooks.now()
                steps_models[-1].details = {
                    "success": False,
                    "warning": f"Connection error: {str(e)[:200]}",
                    "connectionError": True,
                    "note": "This is informational only and does not affect refactoring"
                }
                compile_error_msg = "Cannot connect to backend service"
            except Exception as e:
                # Other errors - mark as done with warning
                error_msg = str(e)[:500]
                steps_models[-1].status = "done"
                steps_models[-1].endedAt = hooks.now()
                steps_models[-1].details = {
                    "success": False,
                    "warning": error_msg,
                    "note": "This is informational only and does not affect refactoring"
                }
                compile_error_msg = error_msg

            # Comprehensive Analysis
            add_step(name="Analyze", agent="Analysis Reporter", status="running", startedAt=hooks.now())
            analysis_result = None
            try:
                from refactoring_analysis import RefactoringAnalyzer
                analyzer = RefactoringAnalyzer()
                # Always compare against the actual LLM candidate so reports are not falsely "identical"
                # when verification failed for tooSimilar / smell / line limits.
                # Use consistent smells: if we re-analyzed original with the same
                # detector, use those for apples-to-apples comparison
                consistent_before_smells = before_reanalysis_smells if len(before_reanalysis_smells) > 0 else smells
                llm_usage = last_llm_out.usage if last_llm_out else None
                analysis_result = analyzer.analyze_refactoring(
                    original=original,
                    refactored=candidate,
                    original_smells=consistent_before_smells,
                    refactored_smells=after.get("codeSmells", []),
                    file_path=req.filePath,
                    token_usage=llm_usage,
                    retry_count=retry_count,
                )
                steps_models[-1].status = "done"
                steps_models[-1].endedAt = hooks.now()
                steps_models[-1].details = {
                    "summary": analysis_result.get("summary", {}),
                    "improvements": analysis_result.get("improvements", {}),
                    "behavioral_correctness": analysis_result.get("behavioral_correctness", {}),
                    "refactoring_practices": analysis_result.get("refactoring_practices", {}),
                    "metrics": analysis_result.get("metrics", {})
                }
                print(f"📊 Analysis complete: Score {analysis_result.get('summary', {}).get('overall_score', 0):.1f}/100")
            except Exception as e:
                print(f"⚠️  Analysis failed: {e}")
                steps_models[-1].status = "error"
                steps_models[-1].endedAt = hooks.now()
                steps_models[-1].error = str(e)[:200]
                analysis_result = None
            
            # Calculate quality metrics for before and after
            metrics_before = hooks.calculate_quality_metrics(original)
            metrics_after = hooks.calculate_quality_metrics(candidate)

            # Per-severity smell breakdowns for consistent frontend display
            def _count_by_severity(smell_list: List[Dict]) -> Dict[str, int]:
                counts = {"critical": 0, "major": 0, "minor": 0}
                for s in smell_list:
                    sev = hooks.normalize_smell_severity(s)
                    if sev == "CRITICAL": counts["critical"] += 1
                    elif sev == "MAJOR": counts["major"] += 1
                    else: counts["minor"] += 1
                return counts

            before_sev = _count_by_severity(before_reanalysis.get("codeSmells", []) if before_reanalysis.get("codeSmells") else smells)
            after_sev = _count_by_severity(after.get("codeSmells", []))

            deltas = {
                "before": before_count,
                "after": after_count,
                "improvement": max(0, before_count - after_count),
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
                "comprehensiveAnalysis": analysis_result,  # Add comprehensive analysis to deltas
                "verifyAccepted": accept,
            }
            if analysis_result and isinstance(analysis_result, dict):
                summary = analysis_result.setdefault("summary", {})
                if accept:
                    summary["refactoring_successful"] = True
                    summary["verify_gate_passed"] = True

            # Persist memory
            summary = f"Smells {deltas['before']} -> {deltas['after']}; improvement {deltas['improvement']}."
            hooks.append_run(
                req.workspaceId, req.filePath,
                {
                    "timestamp": time.time(),
                    "summary": summary,
                    "goals": req.goals or [],
                    "applied": bool(apply_result),
                    "deltas": deltas,
                    "steps": steps_json(),
                    "refactorLlm": refactor_llm_experiment,
                }
            )

            # Prepare response - ensure all fields are serializable
            # CRITICAL: Only return refactored content if it was accepted and is different
            if research_independent and multi_llm_runs:
                any_research_ok = any(
                    r.get("ok") and r.get("researchMetrics") for r in multi_llm_runs
                )
                if any_research_ok:
                    success = True
                    refactored_content = (
                        candidate if candidate.strip() != original.strip() else original
                    )
                else:
                    refactored_content = original
                    success = False
            elif accept and candidate.strip() != original.strip():
                refactored_content = candidate
                success = True
            else:
                # If rejected or identical, return original with rejection message
                refactored_content = original
                success = False
                if candidate.strip() == original.strip():
                    print(f"⚠️  WARNING: Returning original code - refactored code was identical")
            
            # Rejection reasons: split what BLOCKED save (Verify step) vs advisory analysis (behavioral heuristics)
            verification_rejection_reasons: List[str] = []
            analysis_concerns: List[str] = list(
                (deltas.get("comprehensiveAnalysis") or {}).get("summary", {}).get("concerns") or []
            )
            if not accept:
                for step in steps_models:
                    if step.name == "Verify" and step.details:
                        d = step.details
                        vr = d.get("rejectionReason") or (d.get("verification") or {}).get("rejectionReason")
                        if vr and vr not in verification_rejection_reasons:
                            verification_rejection_reasons.append(vr)
                if candidate.strip() == original.strip() and "IDENTICAL_CODE" not in verification_rejection_reasons:
                    verification_rejection_reasons.insert(0, "IDENTICAL_CODE")
            # Backward-compatible flat list: gate reasons first, then labeled advisories (do not block by themselves)
            rejection_reasons: List[str] = list(verification_rejection_reasons)
            if not accept and analysis_concerns:
                rejection_reasons.extend([f"(advisory) {c}" for c in analysis_concerns])

            # Always expose LLM output for research review when not adopted (including identical output).
            proposed_for_review = None if accept else candidate

            failure_outcome = file_failure_outcome
            orig_line_count = len(original.splitlines())
            if failure_outcome is None and last_llm_out is not None:
                if not last_llm_out.ok:
                    failure_outcome = build_failure_outcome(
                        llm_error_code=last_llm_out.error_code,
                        llm_message=last_llm_out.message,
                        original_lines=orig_line_count,
                    )
                elif last_llm_out.truncated_output:
                    failure_outcome = build_failure_outcome(
                        truncated=True,
                        original_lines=orig_line_count,
                    )

            user_error = None
            if not success:
                if failure_outcome and failure_outcome.get("userMessage"):
                    user_error = failure_outcome["userMessage"]
                elif llm_pipeline_failed and last_llm_out is not None:
                    user_error = last_llm_out.message
                elif candidate.strip() == original.strip():
                    user_error = "The refactoring output matched the original file, so nothing was applied."
                elif not accept:
                    primary = verification_rejection_reasons[0] if verification_rejection_reasons else None
                    verify_explain = {
                        "excessiveLineChange": (
                            "Automatic verification rejected the proposal: the file grew or shrank more than the allowed "
                            "limit (guards against truncated or runaway rewrites). Try a smaller refactor scope or compare "
                            "line counts in the diff."
                        ),
                        "tooSimilar": (
                            "Automatic verification rejected the proposal: the output was too text-similar to the original "
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
            for _step in steps_models:
                if _step.name == "Verify" and _step.details:
                    verify_details_for_report = _step.details if isinstance(_step.details, dict) else None
                    break

            try:
                from refactoring_report import build_refactoring_report

                report_smells = (
                    before_reanalysis.get("codeSmells", [])
                    if before_reanalysis.get("codeSmells")
                    else smells
                )
                refactoring_report = build_refactoring_report(
                    file_path=req.filePath,
                    original=original,
                    candidate=candidate,
                    smells=report_smells,
                    refactoring_plan=refactoring_plan,
                    accept=accept,
                    analysis=analysis_result,
                    verify_details=verify_details_for_report,
                )
            except Exception as _report_err:
                print(f"⚠️  refactoring_report build failed: {_report_err}")
                refactoring_report = {
                    "file": (req.filePath or "unknown").replace("\\", "/"),
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

            if apply_result is not None and isinstance(apply_result, dict):
                apply_result = {**apply_result, "refactoringReport": refactoring_report}

            research_metrics = None
            if research_independent and multi_llm_runs:
                for r in sorted(
                    multi_llm_runs,
                    key=lambda x: int(x.get("smellDelta") or 0),
                    reverse=True,
                ):
                    if r.get("researchMetrics"):
                        research_metrics = r["researchMetrics"]
                        break
            if research_metrics is None and analysis_result:
                try:
                    from research_payload import build_research_metrics

                    research_metrics = build_research_metrics(
                        file_path=req.filePath,
                        original=original,
                        refactored=candidate,
                        analysis_result=analysis_result,
                        deltas=deltas,
                        verify_accepted=accept,
                        before_smell_count=before_count,
                        after_smell_count=after_count,
                        quality_before=metrics_before,
                        quality_after=metrics_after,
                    )
                except Exception as _rm_err:
                    print(f"⚠️  research_metrics build failed: {_rm_err}")
                    metrics = analysis_result.get("metrics", {})
                    research_metrics = {
                        "halstead": metrics.get("halstead"),
                        "method_lengths": metrics.get("method_lengths"),
                        "nesting_depth": metrics.get("nesting_depth"),
                        "coupling": metrics.get("coupling"),
                        "cohesion": metrics.get("cohesion"),
                        "diff_churn": metrics.get("diff_churn"),
                        "semantic_preservation": metrics.get("semantic_preservation"),
                        "token_efficiency": metrics.get("token_efficiency"),
                        "smell_resolution": analysis_result.get("smell_resolution"),
                    }

            research_outcome = {
                "adopted": bool(accept),
                "verifyAccepted": bool(accept),
                "identicalToOriginal": candidate.strip() == original.strip(),
                "smellsBefore": before_count,
                "smellsAfter": after_count,
                "smellDelta": before_count - after_count,
                "fileWrittenToWorkspace": bool(apply_result) if accept and not research_independent else False,
                "failurePrimaryReason": (
                    (failure_outcome or {}).get("primaryReason")
                    if failure_outcome
                    else None
                ),
                "fileLines": file_feasibility.get("lines") if file_feasibility else orig_line_count,
                "llmInvoked": (
                    file_feasibility.get("invokeLlm", True) if file_feasibility else bool(last_llm_out)
                ),
            }

            response_data = {
                "success": success,
                "filePath": req.filePath,
                "failureOutcome": failure_outcome,
                "fileSizeAssessment": file_feasibility,
                "steps": steps_json(),
                "originalContent": original,
                "refactoredContent": refactored_content,
                "llmCandidateContent": candidate,
                "proposedContent": proposed_for_review,
                "researchOutcome": research_outcome,
                "deltas": deltas,
                "applyResult": apply_result,
                "refactoringReport": refactoring_report,
                "rejected": not accept,
                "rejectionReason": rejection_reasons if rejection_reasons else None,
                "verificationRejectionReasons": verification_rejection_reasons if verification_rejection_reasons else None,
                "analysisConcerns": analysis_concerns if analysis_concerns else None,
                "message": (
                    "Research run complete: LLM output matched the original file — full metrics and pipeline trace are in the response; nothing was written to the workspace."
                    if (not accept and candidate.strip() == original.strip())
                    else None
                ),
                "error": user_error,
                "errorCode": (last_llm_out.error_code if (not success and last_llm_out and not last_llm_out.ok) else None),
                "experiment": {"refactorLlm": refactor_llm_experiment},
                "multiLlmRuns": hooks.sanitize_multi_llm_runs_for_client(multi_llm_runs),
                "researchMetrics": research_metrics,
                "pipelineMetadata": {
                    "retryCount": retry_count,
                    "model": hooks.MODEL,
                    "multiLlmChain": bool(req.multiLlmChain),
                    "multiLlmMode": (
                        "independent_parallel" if research_independent
                        else ("sequential_chain" if req.multiLlmChain else None)
                    ),
                    "llmChain": hooks.DEFAULT_MULTI_LLM_CHAIN if req.multiLlmChain else None,
                    "sampleId": req.sampleId,
                    "researchArtifactsOnly": bool(research_independent),
                    "liveFileModified": bool(apply_result),
                    "rejectionCategory": hooks.categorize_rejection(verification_rejection_reasons) if verification_rejection_reasons else None,
                    "fileSizeAssessment": file_feasibility,
                },
            }
            
            # Signal completion to SSE listeners
            await publish_detail(
                f"Refactoring {'completed successfully' if success else 'finished with issues'}" +
                (f" — smells reduced from {deltas.get('smellsBefore', '?')} to {deltas.get('smellsAfter', '?')}" if success and deltas else ""),
                "success" if success else "warning"
            )
            if job_id:
                hooks.publish_progress(job_id, {"type": "done", "success": success})

            # Validate response can be serialized
            try:
                import json
                json.dumps(response_data)  # Test serialization
            except Exception as serial_error:
                print(f"WARNING: Response serialization issue: {serial_error}")
                size_limit = 5 * 1024 * 1024
                if len(candidate) > size_limit:
                    response_data["refactoredContent"] = candidate[:size_limit] + "\n\n... [truncated due to size]"
                if len(original) > size_limit:
                    response_data["originalContent"] = original[:size_limit] + "\n\n... [truncated due to size]"

            # Persist artifacts + file-status (rejected runs must store candidate under .refactai/rejected/)
            try:
                _status = "refactored" if accept else "rejected"
                _rej = ",".join(rejection_reasons) if rejection_reasons else None
                _sb = before_count if 'before_count' in dir() else 0
                _sa = after_count if 'after_count' in dir() else 0
                _snap = hooks.compact_research_snapshot(research_metrics)
                _artifact_paths: Dict[str, Any] = {}
                if not accept:
                    _persist_candidate = (
                        candidate
                        if candidate is not None and str(candidate).strip()
                        else original
                    )
                    try:
                        _attempt_body: Dict[str, Any] = {
                            "filePath": req.filePath,
                            "originalContent": original,
                            "candidateContent": _persist_candidate,
                            "accepted": False,
                            "smellsBefore": _sb,
                            "smellsAfter": _sa,
                            "rejectionReason": _rej,
                            "userId": req.userId,
                            "userName": req.userName,
                        }
                        if _snap:
                            _attempt_body["researchSnapshot"] = _snap
                        _attempt = await hooks.backend_post(
                            client,
                            f"/workspaces/{req.workspaceId}/refactor-attempt",
                            _attempt_body,
                        )
                        if isinstance(_attempt, dict):
                            for _k in ("refactoredArtifactPath", "originalArtifactPath", "savedAt"):
                                if _attempt.get(_k) is not None:
                                    _artifact_paths[_k if _k != "savedAt" else "savedToProjectAt"] = _attempt.get(_k)
                    except Exception as _persist_err:
                        print(f"WARNING: rejected refactor-attempt persist failed: {_persist_err}")
                _payload = {
                    "filePath": req.filePath,
                    "status": _status,
                    "smellsBefore": _sb,
                    "smellsAfter": _sa,
                    "rejectionReason": _rej,
                    "userId": req.userId,
                    "userName": req.userName,
                    "verifyAccepted": accept,
                }
                if _snap:
                    _payload["researchSnapshot"] = _snap
                if apply_result and isinstance(apply_result, dict):
                    for _k in ("refactoredArtifactPath", "originalArtifactPath", "savedToProjectAt"):
                        if apply_result.get(_k) is not None:
                            _payload[_k] = apply_result.get(_k)
                for _k, _v in _artifact_paths.items():
                    _payload[_k] = _v
                requests.post(
                    f"{hooks.BACKEND_BASE}/workspaces/{req.workspaceId}/file-status",
                    json=_payload,
                    timeout=5,
                )
            except Exception:
                pass  # best-effort, don't fail the refactoring response

            return response_data
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Fatal error in _refactor_impl: {error_trace}")
        add_step(name="Fatal", agent="Coordinator", status="error", startedAt=hooks.now(), endedAt=hooks.now(), error=str(e))
        # Try to return at least the steps we have so far
        try:
            return {
                "success": False,
                "steps": steps_json(),
                "originalContent": original if 'original' in locals() else "",
                "refactoredContent": candidate if 'candidate' in locals() else "",
                "deltas": {},
                "applyResult": None,
                "error": str(e),
            }
        except Exception:
            # If even that fails, return minimal response
            return {
                "success": False,
                "steps": [{"name": "Fatal", "agent": "Coordinator", "status": "error", "error": str(e)}],
                "originalContent": "",
                "refactoredContent": "",
                "deltas": {},
                "applyResult": None,
                "error": str(e),
            }
