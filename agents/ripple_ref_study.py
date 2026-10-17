"""
RIPPLE-REF Study: paired V1 (file-only) vs V2 (dependency-aware) experiment runner.

Artifacts are persisted via backend /api/ripple-ref/studies/{studyId}/artifacts/*.
"""
from __future__ import annotations

import json
import os
import time
import traceback
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from llm_prompts import REFACTOR_SYSTEM_PROMPT, build_refactor_smell_listing
from smell_prioritizer import build_public_api_signature


RIPPLE_REF_PROMPT_VERSION = "ripple-ref-v1"

V1_SYSTEM = REFACTOR_SYSTEM_PROMPT + """

RIPPLE-REF V1 (file-only):
- Refactor using only the target file and detected smells.
- Preserve all public/protected APIs and behaviour.
- Do not change package declaration.
"""

V2_SYSTEM = REFACTOR_SYSTEM_PROMPT + """

RIPPLE-REF V2 (dependency-aware):
- You receive a dependency context package describing downstream callers and caller-used APIs.
- ALLOWED: extract private helpers, simplify internal logic, reduce duplication, improve readability.
- NOT ALLOWED: remove caller-used public/protected APIs; change public/protected signatures;
  change constructor signatures used elsewhere; remove/change framework annotations;
  change package; change extends/implements; introduce unnecessary dependencies.
"""


class RippleRefModelConfig(BaseModel):
    provider: str = ""
    family: str = ""
    displayName: str = ""
    modelId: str
    apiRoute: str = "openrouter"
    contextWindow: int = 1_000_000
    promptVersion: str = RIPPLE_REF_PROMPT_VERSION


class RippleRefRunRequest(BaseModel):
    studyId: str
    workspaceId: str
    filePath: str
    variant: str = Field(description="V1 or V2")
    model: RippleRefModelConfig
    resume: bool = True


class RippleRefBatchRequest(BaseModel):
    studyId: str
    resume: bool = True
    maxCandidates: Optional[int] = None


def build_v1_user_prompt(
    *,
    file_path: str,
    original: str,
    smells: List[Dict],
    instructions: str,
    public_api: List[str],
) -> str:
    smell_listing = build_refactor_smell_listing(smells)
    lines = len(original.splitlines())
    return f"""RIPPLE-REF V1 — File-only multi-agent refactoring

File: {file_path} ({lines} lines)

DETECTED SMELLS:
{smell_listing}

LOCAL REFACTORING INSTRUCTIONS:
{instructions}

PUBLIC API (preserve signatures):
{chr(10).join(public_api) if public_api else "(none detected)"}

GENERAL: Preserve behaviour and all public/protected APIs.

```java
{original}
```

Return the complete refactored file in a ```java block."""


def build_v2_user_prompt(
    *,
    file_path: str,
    original: str,
    smells: List[Dict],
    instructions: str,
    dependency_context_text: str,
    public_api: List[str],
) -> str:
    smell_listing = build_refactor_smell_listing(smells)
    lines = len(original.splitlines())
    return f"""RIPPLE-REF V2 — Dependency-aware multi-agent refactoring

File: {file_path} ({lines} lines)

DETECTED SMELLS:
{smell_listing}

DEPENDENCY CONTEXT PACKAGE:
{dependency_context_text}

LOCAL REFACTORING INSTRUCTIONS:
{instructions}

PUBLIC API (preserve signatures):
{chr(10).join(public_api) if public_api else "(none detected)"}

Apply ripple-safety rules from the dependency context. Caller-used APIs are critical.

```java
{original}
```

Return the complete refactored file in a ```java block."""


def _extract_java_block(text: str) -> str:
    if not text:
        return ""
    if "```java" in text:
        start = text.index("```java") + len("```java")
        end = text.find("```", start)
        if end > start:
            return text[start:end].strip()
    if "```" in text:
        start = text.index("```") + 3
        end = text.find("```", start)
        if end > start:
            return text[start:end].strip()
    return text.strip()


async def run_ripple_ref_candidate(
    req: RippleRefRunRequest,
    *,
    backend_get,
    backend_post,
    call_llm_refactor,
    sanitize_llm_output,
    build_refactoring_plan_from_smells,
    prioritize_smells,
    model_override: Optional[str] = None,
) -> Dict[str, Any]:
    """Run one paired candidate (V1 or V2) with full artifact persistence."""
    variant = (req.variant or "V1").upper()
    if variant not in ("V1", "V2"):
        raise ValueError("variant must be V1 or V2")

    model_id = model_override or req.model.modelId
    pair_key = f"{req.workspaceId}|{req.filePath}|{model_id}|{variant}"

    async def _live(phase: str) -> None:
        await backend_post(
            f"/ripple-ref/studies/{req.studyId}/live-candidate",
            {
                "workspaceId": req.workspaceId,
                "filePath": req.filePath,
                "modelId": model_id,
                "variant": variant,
                "phase": phase,
            },
        )

    study = await backend_get(f"/ripple-ref/studies/{req.studyId}")
    if req.resume and study:
        completed = set((study or {}).get("completedCandidates") or [])
        if pair_key in completed:
            return {"status": "skipped", "pairKey": pair_key, "reason": "already_completed"}

    file_resp = await backend_get(
        f"/workspaces/{req.workspaceId}/files/content",
        params={"filePath": req.filePath},
    )
    original = file_resp.get("content") if isinstance(file_resp, dict) else str(file_resp or "")

    smells: List[Dict] = []
    try:
        analyze_resp = await backend_get(
            f"/workspaces/{req.workspaceId}/files/analysis",
            params={"filePath": req.filePath},
        )
        if isinstance(analyze_resp, dict):
            smells = analyze_resp.get("smells") or analyze_resp.get("codeSmells") or []
    except Exception:
        smells = []

    prioritized = prioritize_smells(smells, original) if smells else []
    plan = build_refactoring_plan_from_smells(prioritized[:15]) if prioritized else []
    instructions = "\n".join(
        f"- {p.get('technique', 'refactor')}: {p.get('description', p.get('smellId', ''))}"
        for p in (plan if isinstance(plan, list) else [])
    ) or "Reduce smells while preserving behaviour."

    public_api = build_public_api_signature(original)
    dependency_context_text = ""
    if variant == "V2":
        ctx = await backend_get(
            f"/ripple-ref/studies/{req.studyId}/dependency-context",
            params={"workspaceId": req.workspaceId, "filePath": req.filePath},
        )
        if isinstance(ctx, dict):
            dependency_context_text = ctx.get("contextText") or json.dumps(ctx, indent=2)
        else:
            dependency_context_text = str(ctx or "")

    if variant == "V1":
        user_prompt = build_v1_user_prompt(
            file_path=req.filePath,
            original=original,
            smells=prioritized,
            instructions=instructions,
            public_api=public_api,
        )
        system_prompt = V1_SYSTEM
    else:
        user_prompt = build_v2_user_prompt(
            file_path=req.filePath,
            original=original,
            smells=prioritized,
            instructions=instructions,
            dependency_context_text=dependency_context_text,
            public_api=public_api,
        )
        system_prompt = V2_SYSTEM

    full_prompt = f"SYSTEM:\n{system_prompt}\n\nUSER:\n{user_prompt}"
    await _live("preparing_prompt")
    await backend_post(
        f"/ripple-ref/studies/{req.studyId}/artifacts/prompt",
        {
            "workspaceId": req.workspaceId,
            "filePath": req.filePath,
            "modelId": model_id,
            "variant": variant,
            "promptText": full_prompt,
        },
    )

    started = time.time()
    run_meta: Dict[str, Any] = {
        # L3 compile + L5 targeted tests are optional (can be slow on large studies).
        "compileProbe": os.environ.get("RIPPLE_REF_COMPILE_PROBE", "0") == "1",
        "testProbe": os.environ.get("RIPPLE_REF_TEST_PROBE", "0") == "1",
    }
    candidate = ""
    raw_response = ""
    error = None
    try:
        await _live("llm_generation")
        llm_result = await call_llm_refactor(
            original,
            user_prompt,
            system_prompt=system_prompt,
            model=model_id,
        )
        if isinstance(llm_result, dict):
            raw_response = json.dumps(llm_result)
            candidate = llm_result.get("refactoredCode") or llm_result.get("content") or ""
            if not candidate and llm_result.get("text"):
                candidate = _extract_java_block(llm_result["text"])
            run_meta["promptTokens"] = llm_result.get("promptTokens") or llm_result.get("usage", {}).get("prompt_tokens")
            run_meta["completionTokens"] = llm_result.get("completionTokens") or llm_result.get("usage", {}).get("completion_tokens")
        else:
            raw_response = str(llm_result)
            candidate = _extract_java_block(raw_response)
        candidate = sanitize_llm_output(original, candidate) if candidate else ""
    except Exception as e:
        error = str(e)
        raw_response = json.dumps({"error": error, "trace": traceback.format_exc()})
        run_meta["error"] = error

    run_meta["latencyMs"] = int((time.time() - started) * 1000)

    await backend_post(
        f"/ripple-ref/studies/{req.studyId}/artifacts/response",
        {
            "workspaceId": req.workspaceId,
            "filePath": req.filePath,
            "modelId": model_id,
            "variant": variant,
            "rawResponse": raw_response,
        },
    )

    if candidate:
        await backend_post(
            f"/ripple-ref/studies/{req.studyId}/artifacts/candidate",
            {
                "workspaceId": req.workspaceId,
                "filePath": req.filePath,
                "modelId": model_id,
                "variant": variant,
                "candidateCode": candidate,
            },
        )

    verify_body = {
        "workspaceId": req.workspaceId,
        "filePath": req.filePath,
        "modelId": model_id,
        "variant": variant,
        "candidateCode": candidate or None,
        "runMeta": run_meta,
    }
    await _live("ripple_verification")
    report = await backend_post(
        f"/ripple-ref/studies/{req.studyId}/apply-and-verify",
        verify_body,
    )

    return {
        "status": "completed" if candidate and not error else "failed",
        "pairKey": pair_key,
        "variant": variant,
        "modelId": model_id,
        "rippleReport": report,
        "latencyMs": run_meta.get("latencyMs"),
        "error": error,
    }


async def run_ripple_ref_batch(
    req: RippleRefBatchRequest,
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
        for file_entry in files:
            file_path = file_entry.get("filePath") if isinstance(file_entry, dict) else str(file_entry)
            for model_cfg in models:
                model = RippleRefModelConfig(**model_cfg) if isinstance(model_cfg, dict) else model_cfg
                for variant in ("V1", "V2"):
                    pair_key = f"{workspace_id}|{file_path}|{model.modelId}|{variant}"
                    if req.resume and pair_key in completed:
                        results.append({"pairKey": pair_key, "status": "skipped"})
                        continue
                    if max_n is not None and count >= max_n:
                        return {"status": "partial", "results": results, "ran": count}
                    single_req = RippleRefRunRequest(
                        studyId=req.studyId,
                        workspaceId=workspace_id,
                        filePath=file_path,
                        variant=variant,
                        model=model,
                        resume=req.resume,
                    )
                    result = await run_single(single_req)
                    results.append(result)
                    count += 1

    completeness = await backend_get(f"/ripple-ref/studies/{req.studyId}/completeness")
    return {"status": "done", "results": results, "ran": count, "completeness": completeness}
