"""
MA-REF Study: LangGraph multi-agent runner for ma_ref_master (P-MA arm).

Research integrity:
- Locked cohort from ripple_ref_master (no re-sampling)
- LangGraph with three LLM agents (Planner → Editor → Verifier) + static agents
- Optional revise loop when the LLM verifier rejects (``MA_MAX_REVISE_LOOPS``)
- Same apply-and-verify measurement as B0 (via Ripple Risk Verifier node)
- Variant fixed to MA (no V1/V2 split)
"""
from __future__ import annotations

import json
import os
import time
import traceback
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

# P-MA arm is always a real multi-agent system (plan + edit + verify LLM roles).
os.environ.setdefault("MULTI_LLM_AGENT_MODE", "full")
os.environ.setdefault("REFACTOR_ORCHESTRATOR", "langgraph")

MA_VARIANT = "MA"
MA_STUDY_ID_DEFAULT = "ma_ref_master"
MA_MAX_ATTEMPTS_PER_PAIR = int(os.environ.get("MA_MAX_ATTEMPTS_PER_PAIR", "3"))


class MaRefModelConfig(BaseModel):
    modelId: str
    displayName: str = ""
    apiRoute: str = "openrouter"
    contextWindow: int = 1_000_000


class MaRefRunRequest(BaseModel):
    studyId: str = MA_STUDY_ID_DEFAULT
    workspaceId: str
    filePath: str
    model: MaRefModelConfig
    resume: bool = True
    cohortId: Optional[str] = None


class MaRefBatchRequest(BaseModel):
    studyId: str = MA_STUDY_ID_DEFAULT
    resume: bool = True
    maxCandidates: Optional[int] = None
    workspaceId: Optional[str] = None


def pair_key(workspace_id: str, file_path: str, model_id: str) -> str:
    return f"{workspace_id}|{file_path}|{model_id}|{MA_VARIANT}"


def _ma_meta_from_graph(graph_response: Dict[str, Any]) -> Dict[str, Any]:
    steps = graph_response.get("steps") or []
    experiment = graph_response.get("experiment") or {}
    llm_verify = experiment.get("llmVerify") or {}
    parsed = llm_verify.get("parsed") if isinstance(llm_verify, dict) else None
    approved = parsed.get("approved") if isinstance(parsed, dict) else None

    llm_plan_status: Optional[str] = None
    prompt_tokens = 0
    completion_tokens = 0
    for step in steps:
        agent = str(step.get("agent") or "")
        details = step.get("details") or {}
        if "Planning" in agent:
            planner = details.get("llmPlanner") or {}
            if planner.get("ok"):
                llm_plan_status = "ok"
            elif planner:
                llm_plan_status = "failed"
        if "Refactoring" in agent:
            llm = details.get("llm") or {}
            usage = llm.get("usage") or {}
            prompt_tokens = int(usage.get("prompt_tokens") or prompt_tokens or 0)
            completion_tokens = int(usage.get("completion_tokens") or completion_tokens or 0)

    meta: Dict[str, Any] = {
        "agentStepCount": len(steps),
        "multiLlmAgentMode": os.environ.get("MULTI_LLM_AGENT_MODE", "full"),
    }
    if llm_plan_status:
        meta["llmPlanStatus"] = llm_plan_status
    if approved is not None:
        meta["llmVerifyApproved"] = bool(approved)
    if prompt_tokens:
        meta["promptTokens"] = prompt_tokens
    if completion_tokens:
        meta["completionTokens"] = completion_tokens
    return meta


async def run_ma_ref_candidate(
    req: MaRefRunRequest,
    *,
    backend_get,
    backend_post,
    refactor_fn,
) -> Dict[str, Any]:
    model_id = req.model.modelId
    key = pair_key(req.workspaceId, req.filePath, model_id)

    async def _live(phase: str) -> None:
        await backend_post(
            f"/ripple-ref/studies/{req.studyId}/live-candidate",
            {
                "workspaceId": req.workspaceId,
                "filePath": req.filePath,
                "modelId": model_id,
                "variant": MA_VARIANT,
                "phase": phase,
            },
        )

    study = await backend_get(f"/ripple-ref/studies/{req.studyId}")
    if req.resume and study:
        completed = set((study or {}).get("completedCandidates") or [])
        failed = set((study or {}).get("failedCandidates") or [])
        if key in completed:
            return {"status": "skipped", "pairKey": key, "reason": "already_completed"}
        if key in failed:
            return {"status": "skipped", "pairKey": key, "reason": "terminal_failed"}

    integrity = await backend_get(f"/ripple-ref/studies/{req.studyId}/integrity-preflight")
    if isinstance(integrity, dict) and not integrity.get("integrityOk", True):
        return {
            "status": "failed",
            "pairKey": key,
            "error": f"integrity_preflight_failed: {integrity.get('integrityIssues')}",
        }

    config = (study or {}).get("config") or {}
    cohort_id = req.cohortId or config.get("cohortId")

    started = time.time()
    error = None
    status = "failed"
    graph_response: Dict[str, Any] = {}
    ripple_report: Dict[str, Any] = {}

    try:
        await _live("langgraph_pipeline")
        refactor_body = {
            "workspaceId": req.workspaceId,
            "filePath": req.filePath,
            "researchBatchMode": True,
            "maStudyMode": True,
            "maStudyId": req.studyId,
            "maModelId": model_id,
            "maCohortId": cohort_id,
        }
        graph_response = await refactor_fn(refactor_body)
        if not isinstance(graph_response, dict):
            graph_response = {"raw": graph_response}

        candidate = graph_response.get("refactoredContent") or ""
        steps = graph_response.get("steps") or []
        experiment = graph_response.get("experiment") or {}

        await backend_post(
            f"/ripple-ref/studies/{req.studyId}/artifacts/agent-steps",
            {
                "workspaceId": req.workspaceId,
                "filePath": req.filePath,
                "modelId": model_id,
                "variant": MA_VARIANT,
                "steps": {
                    "steps": steps,
                    "graphVersion": experiment.get("graphVersion") or graph_response.get("graphVersion"),
                    "nodeTrace": experiment.get("nodeTrace") or graph_response.get("nodeTrace"),
                    "orchestration": "multi_agent",
                    "multiLlmAgentMode": os.environ.get("MULTI_LLM_AGENT_MODE", "full"),
                },
            },
        )

        if candidate:
            await backend_post(
                f"/ripple-ref/studies/{req.studyId}/artifacts/candidate",
                {
                    "workspaceId": req.workspaceId,
                    "filePath": req.filePath,
                    "modelId": model_id,
                    "variant": MA_VARIANT,
                    "candidateCode": candidate,
                },
            )

        ripple_report = experiment.get("rippleReport") or graph_response.get("rippleReport") or {}
        if not ripple_report and graph_response.get("researchMetrics"):
            ripple_report = graph_response.get("researchMetrics", {}).get("rippleReport") or {}

        llm_verify = experiment.get("llmVerify") or {}
        status = "completed" if candidate and graph_response.get("success", True) else "failed_generation"
        if graph_response.get("error"):
            error = str(graph_response.get("error"))
            status = "failed_generation"

        try:
            patch_body = {
                "workspaceId": req.workspaceId,
                "filePath": req.filePath,
                "modelId": model_id,
                "variant": MA_VARIANT,
                "latencyMs": int((time.time() - started) * 1000),
                **_ma_meta_from_graph(graph_response),
            }
            await backend_post(
                f"/ripple-ref/studies/{req.studyId}/artifacts/candidate-meta",
                patch_body,
            )
        except Exception as patch_exc:
            if error is None:
                error = f"candidate_meta_patch: {patch_exc}"

    except Exception as e:
        error = str(e)
        status = "failed"
        graph_response = {"error": error, "trace": traceback.format_exc()}

    latency_ms = int((time.time() - started) * 1000)
    result: Dict[str, Any] = {
        "status": status,
        "pairKey": key,
        "variant": MA_VARIANT,
        "modelId": model_id,
        "orchestration": "multi_agent",
        "graphVersion": graph_response.get("graphVersion") or (graph_response.get("experiment") or {}).get("graphVersion"),
        "agentStepCount": len(graph_response.get("steps") or []),
        "rippleReport": ripple_report,
        "latencyMs": latency_ms,
        "error": error,
    }

    if status != "skipped":
        try:
            record_body = {
                "workspaceId": req.workspaceId,
                "filePath": req.filePath,
                "modelId": model_id,
                "variant": MA_VARIANT,
                "status": status,
                "error": error,
                "latencyMs": latency_ms,
                "agentStepCount": result["agentStepCount"],
                "graphVersion": result.get("graphVersion"),
                "orchestration": "multi_agent",
                "multiLlmAgentMode": os.environ.get("MULTI_LLM_AGENT_MODE", "full"),
                "maxAttempts": MA_MAX_ATTEMPTS_PER_PAIR,
                **_ma_meta_from_graph(graph_response),
            }
            record = await backend_post(
                f"/ripple-ref/studies/{req.studyId}/record-candidate-outcome",
                record_body,
            )
            if isinstance(record, dict):
                result["outcomeRecord"] = record
        except Exception as rec_exc:
            result["outcomeRecordError"] = str(rec_exc)[:300]

    return result


async def run_ma_ref_batch(
    req: MaRefBatchRequest,
    *,
    backend_get,
    run_single,
) -> Dict[str, Any]:
    study = await backend_get(f"/ripple-ref/studies/{req.studyId}")
    if not study:
        raise ValueError(f"Study not found: {req.studyId}")

    config = study.get("config") or {}
    models = config.get("models") or []
    selected_by_repo = study.get("selectedByRepo") or {}
    completed = set(study.get("completedCandidates") or [])

    results: List[Dict[str, Any]] = []
    count = 0
    max_n = req.maxCandidates

    for workspace_id, files in selected_by_repo.items():
        if req.workspaceId and workspace_id != req.workspaceId:
            continue
        for file_entry in files:
            file_path = file_entry.get("filePath") if isinstance(file_entry, dict) else str(file_entry)
            for model_cfg in models:
                model = MaRefModelConfig(**model_cfg) if isinstance(model_cfg, dict) else model_cfg
                pk = pair_key(workspace_id, file_path, model.modelId)
                if req.resume and pk in completed:
                    results.append({"pairKey": pk, "status": "skipped"})
                    continue
                if max_n is not None and count >= max_n:
                    return {"status": "partial", "results": results, "ran": count}
                single_req = MaRefRunRequest(
                    studyId=req.studyId,
                    workspaceId=workspace_id,
                    filePath=file_path,
                    model=model,
                    resume=req.resume,
                    cohortId=config.get("cohortId"),
                )
                result = await run_single(single_req)
                results.append(result)
                count += 1

    completeness = await backend_get(f"/ripple-ref/studies/{req.studyId}/completeness")
    return {"status": "done", "results": results, "ran": count, "completeness": completeness}
