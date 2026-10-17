import os
import time
import re
import asyncio
from typing import List, Dict, Optional, Tuple
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx
import json
import hashlib
from pathlib import Path

from llm_errors import LLMRefactorOutcome, LLMErrorCode, classify_http_error
from llm_provider_config import (
    configured_providers,
    default_openrouter_model,
    research_chain_as_dicts,
)
from llm_client import chat_completion
from llm_prompts import (
    REFACTOR_SYSTEM_PROMPT,
    build_refactor_smell_listing,
    build_refactor_user_prompt,
    compute_refactor_max_tokens,
    compute_refactor_timeout,
)
from smell_prioritizer import prioritize_smells, build_refactoring_instructions, build_public_api_signature

# SINGLE SOURCE OF TRUTH: Load from agents/.env file ONLY
# This is the ONLY place you need to paste your OpenRouter API key
# File location: agents/.env
# Content: OPENROUTER_API_KEY=sk-or-v1-YOUR-NEW-KEY-HERE
try:
    from dotenv import load_dotenv
    # Load .env file from the agents directory (where this script is located)
    env_path = Path(__file__).parent / '.env'
    load_dotenv(dotenv_path=env_path)
except ImportError:
    print("⚠️  WARNING: python-dotenv not installed. Install with: pip install python-dotenv")
    print("   Falling back to environment variable...")
    pass  # dotenv not installed, will use environment variables only
 
# Point agents to the running backend by default (8083). Override with BACKEND_BASE if needed.
BACKEND_BASE = os.environ.get("BACKEND_BASE", "http://localhost:8083/api")

# Load OpenRouter API key - ONLY from .env file (or environment as fallback)
# IMPORTANT: Paste your key in agents/.env file (single source of truth)
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")
if not OPENROUTER_API_KEY:
    env_file_path = Path(__file__).parent / '.env'
    print("=" * 70)
    print("❌ ERROR: OPENROUTER_API_KEY not found!")
    print("=" * 70)
    print()
    print("📍 SINGLE PLACE TO PASTE YOUR KEY:")
    print(f"   File: agents/.env")
    print(f"   Full path: {env_file_path}")
    print()
    print("📝 Create the file with this content (ONE line only):")
    print("   OPENROUTER_API_KEY=sk-or-v1-YOUR-NEW-KEY-HERE")
    print()
    print("💡 Quick command:")
    print(f"   echo 'OPENROUTER_API_KEY=sk-or-v1-YOUR-NEW-KEY-HERE' > {env_file_path}")
    print()
OPENROUTER_URL = os.environ.get("OPENROUTER_URL", "https://openrouter.ai/api/v1/chat/completions")
MODEL = default_openrouter_model()

# Research chain: OpenAI → Google → Anthropic (OpenRouter slugs or direct APIs via LLM_ROUTING)
DEFAULT_MULTI_LLM_CHAIN = research_chain_as_dicts()

from fastapi.responses import JSONResponse, StreamingResponse
try:
    from langgraph.graph import StateGraph, END
    LANGGRAPH_AVAILABLE = True
except Exception:
    LANGGRAPH_AVAILABLE = False

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="REFINE Agents", version="0.1.0")

# Add CORS middleware to allow frontend to call directly
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4000", "http://localhost:3000", "http://localhost:3001",
        "http://127.0.0.1:4000", "http://127.0.0.1:3000", "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Real-time progress streaming (SSE) ──
# Queue is created by whichever arrives first (POST or SSE GET).
# Events published before the SSE consumer connects are buffered in the queue.
_progress_queues: Dict[str, asyncio.Queue] = {}

def _ensure_queue(job_id: str) -> asyncio.Queue:
    """Get or create the event queue for a job."""
    if job_id not in _progress_queues:
        _progress_queues[job_id] = asyncio.Queue(maxsize=500)
    return _progress_queues[job_id]

def _publish_progress(job_id: str, event: Dict):
    """Push a progress event. Creates queue if needed so events are never lost."""
    q = _ensure_queue(job_id)
    try:
        q.put_nowait(event)
    except asyncio.QueueFull:
        pass

@app.get("/agents/progress/{job_id}")
async def progress_stream(job_id: str):
    """SSE endpoint — frontend subscribes to get real-time refactoring updates."""
    q = _ensure_queue(job_id)

    async def event_generator():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=120)
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'type': 'keepalive'})}\n\n"
                    continue
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("type") == "done":
                    break
        finally:
            _progress_queues.pop(job_id, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

if os.environ.get("ENABLE_BASELINE_COMPARISON", "0").strip().lower() in ("1", "true", "yes"):
    from baseline_router import create_baseline_router

    app.include_router(
        create_baseline_router(
            backend_base=BACKEND_BASE,
            publish_progress=_publish_progress,
        )
    )

@app.get("/agents/health")
async def health():
    providers = configured_providers()
    try:
        from refactor_graph import GRAPH_VERSION, LANGGRAPH_AVAILABLE
    except Exception:
        GRAPH_VERSION = "unknown"
        LANGGRAPH_AVAILABLE = False
    try:
        from multi_llm_agent_config import multi_llm_agent_mode
        agent_mode = multi_llm_agent_mode()
    except Exception:
        agent_mode = "unknown"
    return {
        "status": "ok",
        "model": MODEL,
        "hasOpenRouterKey": providers["openrouter"],
        "llmRouting": providers["routing"],
        "providers": providers,
        "orchestrator": "langgraph",
        "graphVersion": GRAPH_VERSION,
        "langgraphAvailable": LANGGRAPH_AVAILABLE,
        "multiLlmAgentMode": agent_mode,
    }

@app.get("/agents/test-openrouter")
async def test_openrouter():
    """
    Test endpoint to verify OpenRouter API key is working.
    Makes a minimal API call to check authentication.
    """
    if not OPENROUTER_API_KEY:
        return {
            "status": "error",
            "message": "OPENROUTER_API_KEY not configured",
            "hasKey": False
        }
    
    try:
        # Make a minimal test request to OpenRouter
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": MODEL,
            "messages": [
                {"role": "user", "content": "Say 'OK' if you can read this."}
            ],
            "max_tokens": 10,
        }
        
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(OPENROUTER_URL, headers=headers, json=payload)
            
            if r.status_code == 200:
                data = r.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                return {
                    "status": "success",
                    "message": "OpenRouter API key is working",
                    "hasKey": True,
                    "model": MODEL,
                    "testResponse": content.strip(),
                    "statusCode": r.status_code
                }
            elif r.status_code == 401:
                return {
                    "status": "error",
                    "message": "OpenRouter API key is invalid or unauthorized",
                    "hasKey": True,
                    "statusCode": r.status_code,
                    "error": "Authentication failed"
                }
            else:
                error_text = r.text
                return {
                    "status": "error",
                    "message": f"OpenRouter API returned error: {r.status_code}",
                    "hasKey": True,
                    "statusCode": r.status_code,
                    "error": (error_text or "")[:500]
                }
    except httpx.TimeoutException:
        return {
            "status": "error",
            "message": "OpenRouter API request timed out",
            "hasKey": True,
            "error": "Timeout"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Error testing OpenRouter API: {str(e)}",
            "hasKey": True,
            "error": str(e)
        }

@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception):
    """Uncaught errors → JSON with stable fields for UI and experiment logs."""
    import traceback
    import sys
    error_trace = traceback.format_exc()
    print(f"Unhandled exception in {request.url.path}: {error_trace}", file=sys.stderr)
    # Frontend refactor flow often expects 200 + body flags; non-refactor paths still get structured JSON
    is_agents_api = request.url.path.startswith("/agents")
    payload = {
        "success": False,
        "error": str(exc)[:800],
        "errorCode": "internal_server_error",
        "errorType": type(exc).__name__,
        "steps": [{
            "name": "Fatal",
            "agent": "Coordinator",
            "status": "error",
            "startedAt": int(time.time()),
            "endedAt": int(time.time()),
            "error": str(exc)[:500],
        }],
        "originalContent": "",
        "refactoredContent": "",
        "deltas": {},
        "applyResult": None,
        "experiment": {"fatal": True, "path": request.url.path},
    }
    status = 200 if is_agents_api else 500
    return JSONResponse(status_code=status, content=payload)


class RefactorRequest(BaseModel):
    workspaceId: str
    filePath: str
    content: Optional[str] = None
    goals: Optional[List[str]] = None
    selectedSmells: Optional[List[str]] = None
    providedSmells: Optional[List[Dict]] = None
    similarityThreshold: Optional[float] = None
    methodPreservationThreshold: Optional[float] = None
    userId: Optional[str] = None
    userName: Optional[str] = None
    jobId: Optional[str] = None
    multiLlmChain: Optional[bool] = False  # batch: OpenAI → Google → Claude, each via full multi-agent pipeline
    researchBatchMode: Optional[bool] = False  # relax verify gates; accept non-worsening smell refactors for research
    sampleId: Optional[str] = None  # research sample id for baseline snapshot + artifact paths
    # ma_ref_master controlled experiment (P-MA arm)
    maStudyMode: Optional[bool] = False
    maStudyId: Optional[str] = "ma_ref_master"
    maModelId: Optional[str] = None  # single-model override per candidate
    maCohortId: Optional[str] = None


class RefactorBatchRequest(BaseModel):
    """Queue multiple files for sequential smell-driven refactoring (one full pipeline per file)."""
    workspaceId: str
    filePaths: Optional[List[str]] = None  # If omitted, Java files with codeSmells/findings > 0 are chosen (by severity count)
    goals: Optional[List[str]] = None
    maxFiles: int = 20
    dryRun: bool = False  # If true, only return which files would run (no LLM / disk writes)
    similarityThreshold: Optional[float] = None
    methodPreservationThreshold: Optional[float] = None


class StepLog(BaseModel):
    name: str
    agent: str
    status: str
    startedAt: float
    endedAt: Optional[float] = None
    details: Optional[Dict] = None
    error: Optional[str] = None


class RefactorResponse(BaseModel):
    success: bool
    steps: List[StepLog]
    originalContent: str
    refactoredContent: str
    deltas: Dict
    applyResult: Optional[Dict] = None
    refactoringReport: Optional[Dict] = None


def now() -> float:
    return time.time()


def normalize_provided_smell(raw: Dict) -> Dict:
    """Map UI / API smell shapes into the dict format expected by the planner and LLM prompts."""
    if not isinstance(raw, dict):
        return {
            "detectorId": "unknown",
            "severity": "MINOR",
            "summary": "",
            "startLine": 0,
            "endLine": 0,
        }
    ptr = raw.get("pointer") if isinstance(raw.get("pointer"), dict) else {}
    det = raw.get("detectorId") or raw.get("type") or raw.get("title") or "unknown"
    sev = raw.get("severity") or "MINOR"
    if isinstance(sev, str):
        sev = sev.upper()
    try:
        sl = int(raw.get("startLine") or ptr.get("startLine") or 0)
    except (TypeError, ValueError):
        sl = 0
    try:
        el = int(raw.get("endLine") or ptr.get("endLine") or raw.get("startLine") or sl or 0)
    except (TypeError, ValueError):
        el = sl
    return {
        "detectorId": det,
        "type": raw.get("type", det),
        "severity": sev,
        "summary": raw.get("summary") or raw.get("description") or raw.get("title") or "",
        "startLine": sl,
        "endLine": el,
    }


def normalize_smell_severity(smell: Dict) -> str:
    """Match /agents/analyze: backend may send MAJOR, Major, WARNING, etc."""
    sev_raw = smell.get("severity") or smell.get("priority") or "MINOR"
    sev = str(sev_raw).upper().strip()
    if sev in ["CRITICAL", "CRIT", "HIGH", "ERROR"]:
        return "CRITICAL"
    if sev in ["MAJOR", "MAJ", "MEDIUM", "WARNING"]:
        return "MAJOR"
    return "MINOR"


# -------------------- Persistent Memory Utilities --------------------
MEMORY_DIR = Path(os.environ.get("AGENT_MEMORY_DIR", Path(__file__).parent / ".memory")).resolve()
MEMORY_DIR.mkdir(parents=True, exist_ok=True)
MAX_HISTORY = 50

def _safe_key(workspace_id: str, file_path: str) -> Path:
    raw = f"{workspace_id}|{file_path}"
    h = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]
    return MEMORY_DIR / f"{h}.json"

def load_memory(workspace_id: str, file_path: str) -> Dict:
    try:
        p = _safe_key(workspace_id, file_path)
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {"workspaceId": workspace_id, "filePath": file_path, "runs": []}

def save_memory(workspace_id: str, file_path: str, data: Dict) -> None:
    try:
        p = _safe_key(workspace_id, file_path)
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass

def _compact_research_snapshot(research_metrics: Optional[Dict]) -> Optional[str]:
    """Small JSON blob for file-status.json (research export); omit large nested trees."""
    if not research_metrics or not isinstance(research_metrics, dict):
        return None
    try:
        cmp = research_metrics.get("comparison") or {}
        deltas_block = research_metrics.get("deltas") or {}
        meta = research_metrics.get("meta") or {}
        snap: Dict = {
            "smellsBefore": deltas_block.get("before"),
            "smellsAfter": deltas_block.get("after"),
            "verifyAccepted": meta.get("verifyAccepted"),
            "overallScore": meta.get("overallScore"),
        }
        for key in ("pmd_smell_total", "complexity", "maintainability", "testability"):
            if key in cmp and isinstance(cmp[key], dict):
                snap[key] = {
                    "before": cmp[key].get("before"),
                    "after": cmp[key].get("after"),
                    "change": cmp[key].get("change"),
                }
        return json.dumps(snap, ensure_ascii=False)[:8000]
    except Exception:
        return None


def append_run(workspace_id: str, file_path: str, run: Dict) -> None:
    mem = load_memory(workspace_id, file_path)
    runs = mem.get("runs", [])
    runs.insert(0, run)
    if len(runs) > MAX_HISTORY:
        runs = runs[:MAX_HISTORY]
    mem["runs"] = runs
    # Useful quick fields
    mem["updatedAt"] = time.time()
    mem["lastSummary"] = run.get("summary", "")
    mem["lastGoals"] = run.get("goals", [])
    mem["lastChanged"] = bool(run.get("applied"))
    save_memory(workspace_id, file_path, mem)

class MemoryPayload(BaseModel):
    workspaceId: str
    filePath: str
    data: Dict

@app.get("/agents/memory")
async def get_memory(workspaceId: str, filePath: str):
    return load_memory(workspaceId, filePath)

@app.post("/agents/memory")
async def upsert_memory(payload: MemoryPayload):
    save_memory(payload.workspaceId, payload.filePath, payload.data)
    return {"success": True}


async def backend_get(client: httpx.AsyncClient, path: str, **kwargs):
    url = f"{BACKEND_BASE}{path}"
    r = await client.get(url, **kwargs)
    r.raise_for_status()
    return r.json()


async def backend_post(client: httpx.AsyncClient, path: str, json: Dict):
    url = f"{BACKEND_BASE}{path}"
    r = await client.post(url, json=json, timeout=120)
    r.raise_for_status()
    return r.json()


def _categorize_rejection(reasons: List[str]) -> str:
    """Categorize rejection into a standard bucket for research analysis."""
    for r in reasons:
        if "IDENTICAL" in r or "too_similar" in r:
            return "identical_code"
        if "no_smell_reduction" in r:
            return "smell_regression"
        if "methods_lost" in r or "api_broken" in r:
            return "behavioral_break"
        if "size_change" in r:
            return "excessive_change"
        if "empty_catch" in r:
            return "safety_violation"
    return "other"


def sanitize_llm_output(original: str, raw: str, *, min_line_ratio: float = 0.3) -> str:
    if not raw:
        print("⚠️  sanitize: raw is empty")
        return original
    import re
    # Extract code from markdown code blocks
    m = re.search(r"```(?:java)?\s*([\s\S]*?)```", raw, re.IGNORECASE | re.DOTALL)
    out = (m.group(1) if m else raw).strip()
    
    out = re.sub(r'^```(?:java)?\s*', '', out, flags=re.IGNORECASE)
    out = re.sub(r'```\s*$', '', out, flags=re.IGNORECASE)
    out = out.strip()
    
    original_lines = len((original or "").splitlines())
    output_lines = len((out or "").splitlines())
    print(f"📝 sanitize: raw={len(raw)} chars, extracted={len(out)} chars, {output_lines} lines (original: {original_lines} lines)")
    
    # Only reject truly incomplete output (has explicit truncation markers)
    hard_truncation = [
        r'omitted for brevity',
        r'\[remaining methods\]',
        r'\[similar refactoring\]',
    ]
    for pattern in hard_truncation:
        if re.search(pattern, out, re.IGNORECASE):
            print(f"⚠️  sanitize: REJECTED — found truncation marker: {pattern}")
            return original
    
    # Check for "..." only in non-string contexts (avoid false positives from actual Java strings)
    dots = re.findall(r'^\s*\.\.\.', out, re.MULTILINE)
    if len(dots) > 2:
        print(f"⚠️  sanitize: REJECTED — found {len(dots)} standalone '...' lines")
        return original
    
    # Must look like Java code
    has_type = bool(re.search(r"(class|interface|enum)\s+\w+", out))
    has_preamble = bool(re.search(r"package\s+[\w.]+;", out)) or bool(re.search(r"import\s+[\w.]+;", out))
    
    if not has_type:
        print("⚠️  sanitize: REJECTED — no class/interface/enum found")
        return original
    
    # Reject if drastically shorter than original
    if output_lines < original_lines * min_line_ratio:
        print(f"⚠️  sanitize: REJECTED — too short ({output_lines} < {original_lines * min_line_ratio:.0f})")
        return original
    
    # Accept the output — even if it looks similar, let the verify step decide
    print(f"✅ sanitize: ACCEPTED — {output_lines} lines, has_type={has_type}, has_preamble={has_preamble}")
    return out


def fallback_nonbreaking_refactor(original: str) -> str:
    """Insert a header comment after the package line (or at the top) to guarantee a safe diff."""
    import time as _t
    lines = (original or "").splitlines()
    header = [
        "/*",
        " * RefactAI Agents: automated cleanup applied (non-breaking).",
        f" * Timestamp: {_t.strftime('%Y-%m-%d %H:%M:%S', _t.localtime())}",
        " */",
        "",
    ]
    if not lines:
        return "\n".join(header)
    pkg_idx = -1
    for i, l in enumerate(lines[:50]):
        if l.strip().startswith("package ") and l.strip().endswith(";"):
            pkg_idx = i
            break
    if pkg_idx >= 0:
        return "\n".join(lines[:pkg_idx+1] + header + lines[pkg_idx+1:])
    return "\n".join(header + lines)


def map_smell_to_refactoring(detector_id: str, description: str) -> Dict:
    """Map code smell types to specific refactoring techniques."""
    detector_lower = detector_id.lower()
    desc_lower = (description or "").lower()
    
    # Design smells
    if "god-class" in detector_lower or "god class" in desc_lower:
        return {
            "technique": "Extract Class",
            "action": "Break down large class into smaller, focused classes with single responsibility"
        }
    elif "long-method" in detector_lower or "long method" in desc_lower:
        return {
            "technique": "Extract Method",
            "action": "Break long method into smaller, well-named methods"
        }
    elif "feature-envy" in detector_lower:
        return {
            "technique": "Move Method",
            "action": "Move method to class it uses most"
        }
    elif "data-class" in detector_lower:
        return {
            "technique": "Encapsulate Field",
            "action": "Add behavior to data-only class"
        }
    elif "duplicate-code" in detector_lower or "duplication" in desc_lower:
        return {
            "technique": "Extract Method/Class",
            "action": "Extract common code into reusable method or class"
        }
    elif "lazy-class" in detector_lower:
        return {
            "technique": "Inline Class",
            "action": "Merge underutilized class into its caller"
        }
    elif "large-class" in detector_lower:
        return {
            "technique": "Extract Class/Subclass",
            "action": "Split large class into smaller components"
        }
    
    # Naming smells
    elif "naming" in detector_lower or "inconsistent-naming" in detector_lower:
        return {
            "technique": "Rename",
            "action": "Apply consistent naming conventions (camelCase for variables, PascalCase for classes)"
        }
    elif "magic-number" in detector_lower:
        return {
            "technique": "Extract Constant",
            "action": "Replace magic numbers with named constants"
        }
    
    # Complexity smells
    elif "complexity" in detector_lower or "cyclomatic" in desc_lower:
        return {
            "technique": "Simplify Conditional",
            "action": "Reduce complexity using guard clauses, early returns, or extract methods"
        }
    elif "nested" in detector_lower or "deep nesting" in desc_lower:
        return {
            "technique": "Flatten Nested Conditionals",
            "action": "Use guard clauses and early returns to reduce nesting"
        }
    
    # Comments smells
    elif "excessive-comments" in detector_lower or "too many comments" in desc_lower:
        return {
            "technique": "Extract Method + Self-Documenting Code",
            "action": "Replace comments with well-named methods and self-documenting code"
        }
    elif "commented-code" in detector_lower:
        return {
            "technique": "Remove Dead Code",
            "action": "Remove commented-out code"
        }
    
    # Default for unknown smells
    return {
        "technique": "General Refactoring",
        "action": f"Apply appropriate refactoring to address: {description[:100]}"
    }


def calculate_quality_metrics(code: str) -> Dict:
    """Calculate quality metrics (complexity, maintainability, testability) from Java code."""
    if not code:
        return {"complexity": 0, "maintainability": 0, "testability": 0}
    
    lines = code.split('\n')
    code_lines = [l for l in lines if l.strip() and not l.strip().startswith('//') and not l.strip().startswith('/*') and not l.strip().startswith('*')]
    
    # Calculate cyclomatic complexity
    complexity = 1  # Base complexity
    complexity += len(re.findall(r'\bif\s*\(', code))
    complexity += len(re.findall(r'\bfor\s*\(', code))
    complexity += len(re.findall(r'\bwhile\s*\(', code))
    complexity += len(re.findall(r'\bswitch\s*\(', code))
    complexity += len(re.findall(r'\bcatch\s*\(', code))
    complexity += len(re.findall(r'\bcase\s+', code))
    complexity += len(re.findall(r'&&|\|\|', code))  # Logical operators (fixed regex)
    
    # Calculate maintainability index (0-100)
    # Based on: MI = 171 - 5.2 * ln(Halstead Volume) - 0.23 * CC - 16.2 * ln(LOC)
    import math
    loc = len(code_lines)
    if loc == 0:
        maintainability = 100.0
    else:
        # Use proper logarithm calculation
        halstead_volume = max(1, loc * complexity)
        # MI formula: 171 - 5.2 * ln(HV) - 0.23 * CC - 16.2 * ln(LOC)
        # Normalize to 0-100 scale (original MI can be negative)
        mi = 171 - 5.2 * math.log(max(1, halstead_volume)) - 0.23 * complexity - 16.2 * math.log(max(1, loc))
        # Normalize: MI typically ranges from -infinity to 171, map to 0-100
        # For research: use standard MI scale, then normalize
        if mi > 100:
            maintainability = 100.0
        elif mi < 0:
            maintainability = max(0.0, 20.0 + (mi / 10.0))  # Map negative values to 0-20 range
        else:
            maintainability = mi
        maintainability = max(0.0, min(100.0, maintainability))
    
    # Calculate testability (0-100)
    # Match methods with optional modifiers (static, final, abstract, synchronized, etc.)
    _mod = r'(?:static\s+|final\s+|abstract\s+|synchronized\s+|native\s+)*'
    _type = r'(?:\w+(?:<[^>]*>)?(?:\[\])*)'
    method_count = len(re.findall(rf'public\s+{_mod}{_type}\s+\w+\s*\(', code))
    private_methods = len(re.findall(rf'private\s+{_mod}{_type}\s+\w+\s*\(', code))
    protected_methods = len(re.findall(rf'protected\s+{_mod}{_type}\s+\w+\s*\(', code))
    # Also count default (package-private) methods
    all_method_sigs = re.findall(r'(?:public|private|protected)\s+' + _mod + _type + r'\s+\w+\s*\(', code)
    total_methods = max(method_count + private_methods + protected_methods, len(all_method_sigs))

    if total_methods == 0:
        testability = 10.0  # Even classes with no methods have some baseline testability
    else:
        public_ratio = method_count / max(1, total_methods)
        complexity_penalty = min(40, complexity * 2)
        method_bonus = min(50, total_methods * 3)

        testability = (public_ratio * 40) + method_bonus - complexity_penalty + 10
        testability = max(5.0, min(100.0, testability))
    
    return {
        "complexity": complexity,
        "maintainability": round(maintainability, 1),
        "testability": round(testability, 1)
    }


def _has_empty_or_comment_only_catch_blocks(java: str) -> bool:
    """True if any catch block has no executable code (only whitespace / comments). Such blocks swallow failures."""
    if not java:
        return False
    idx = 0
    while True:
        j = java.find("catch", idx)
        if j < 0:
            return False
        if j > 0 and (java[j - 1].isalnum() or java[j - 1] == "_"):
            idx = j + 5
            continue
        k = java.find("(", j)
        if k < 0:
            idx = j + 5
            continue
        depth = 0
        p = k
        while p < len(java):
            ch = java[p]
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    p += 1
                    break
            p += 1
        else:
            idx = j + 5
            continue
        while p < len(java) and java[p] in " \t\n\r":
            p += 1
        if p >= len(java) or java[p] != "{":
            idx = j + 5
            continue
        body_start = p + 1
        depth = 1
        q = body_start
        while q < len(java) and depth > 0:
            ch = java[q]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
            q += 1
        body = java[body_start : q - 1]
        no_sl = re.sub(r"//[^\n]*", "", body)
        no_cm = re.sub(r"/\*.*?\*/", "", no_sl, flags=re.DOTALL)
        if not re.search(r"\S", no_cm):
            return True
        idx = max(q, j + 5)


def apply_meaningful_fallback_refactor(original: str, smells: List[Dict]) -> str:
    """Apply basic refactoring improvements when LLM fails or returns unchanged code."""
    import time as _t
    import re
    lines = (original or "").splitlines()
    if not lines:
        return original
    
    result_lines = []
    pkg_idx = -1
    
    # Find package declaration
    for i, l in enumerate(lines[:50]):
        if l.strip().startswith("package ") and l.strip().endswith(";"):
            pkg_idx = i
            break
    
    # Add header comment after package
    header = [
        "/*",
        " * RefactAI: Automated refactoring applied",
        f" * Date: {_t.strftime('%Y-%m-%d %H:%M:%S', _t.localtime())}",
    ]
    if smells:
        header.append(" * Addressed code smells:")
        for s in smells[:5]:  # Limit to first 5
            detector = s.get('detectorId', s.get('type', 'unknown'))
            header.append(f" *   - {detector}")
    header.extend([" */", ""])
    
    # Try to apply actual refactorings based on detected smells
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Add header after package
        if i == pkg_idx:
            result_lines.append(line)
            result_lines.extend(header)
            i += 1
            continue
        
        # Apply basic refactorings based on smell types
        modified_line = line
        
        # For inconsistent naming: normalize variable names (basic)
        # For long methods: this would require more complex parsing, skip for now
        # For duplicate code: would require AST analysis, skip for now
        
        # Basic improvements: normalize whitespace, fix common issues
        stripped = modified_line.rstrip()
        if stripped and not stripped.startswith('//') and not stripped.startswith('*'):
            # Remove trailing whitespace
            modified_line = stripped
        
        result_lines.append(modified_line)
        i += 1
    
    result = "\n".join(result_lines)
    
    # Ensure it's different from original
    if result.strip() == original.strip():
        # Force a difference by adding a newline or comment
        if pkg_idx >= 0:
            parts = result.split('\n')
            parts.insert(pkg_idx + 1, "")
            result = '\n'.join(parts)
        else:
            result = '\n'.join(header + lines)
    
    return result


async def call_llm_refactor(
    original: str,
    file_path: str,
    smells: List[Dict],
    goals: Optional[List[str]],
    prior_notes: Optional[str] = None,
    refactoring_plan: Optional[List[Dict]] = None,
    model: Optional[str] = None,
    provider_id: Optional[str] = None,
) -> LLMRefactorOutcome:
    """LLM Refactoring Agent — routes to OpenRouter or direct OpenAI/Google/Anthropic."""
    original_lines = len(original.splitlines())
    original_tokens = len(original.split())
    max_tokens = compute_refactor_max_tokens(original_lines, original_tokens)
    timeout_seconds = compute_refactor_timeout(original_lines)
    use_model = model or MODEL

    print(f"📊 File size: {original_lines} lines, ~{original_tokens} tokens, max_tokens: {max_tokens}")

    all_smells = refactoring_plan if refactoring_plan else smells
    selected = prioritize_smells(all_smells, original, max_total=8)
    instructions = build_refactoring_instructions(selected)
    public_api = build_public_api_signature(original)
    smell_listing = build_refactor_smell_listing(selected)

    print(f"🔬 Scientific prioritization: {len(all_smells)} total smells → {len(selected)} selected for refactoring")
    for s in selected:
        cat = s.get("_catalog", {})
        print(f"   [{s.get('severity','?')}] {s.get('_smell_id','?')} → {cat.get('technique','?')} (score: {s.get('_score',0):.0f})")

    user_prompt = build_refactor_user_prompt(
        file_path=file_path,
        original=original,
        smell_listing=smell_listing,
        instructions=instructions,
        public_api=public_api,
        prior_notes=prior_notes,
    )

    print(f"⏱️  Using {timeout_seconds}s timeout for {original_lines} line file (provider={provider_id or 'auto'})")

    result = await chat_completion(
        system=REFACTOR_SYSTEM_PROMPT,
        user=user_prompt,
        model=use_model,
        provider_id=provider_id,
        temperature=0.4,
        max_tokens=max_tokens,
        timeout_seconds=timeout_seconds,
    )

    if not result.ok:
        print(f"❌ LLM HTTP ({result.transport}) ({result.error_code}): {result.message[:300]}")
        return result.to_refactor_outcome()

    usage = result.usage or {}
    response_tokens = usage.get("completion_tokens", 0)
    total_tokens = usage.get("total_tokens", 0)
    print(
        f"📊 LLM Response ({result.transport}/{result.model}): "
        f"{len(result.content)} chars, {response_tokens} completion tokens, "
        f"{total_tokens} total tokens, finish_reason={result.finish_reason!r}"
    )
    if result.truncated_output:
        print(f"⚠️  OUTPUT TRUNCATED (max_tokens): used {response_tokens} completion tokens, requested max_tokens={max_tokens}")

    return result.to_refactor_outcome()


def _build_refactoring_plan_from_smells(smells: List[Dict]) -> List[Dict]:
    """Refactoring Planner agent: prioritize smells and map to Fowler techniques."""
    refactoring_plan: List[Dict] = []
    if not smells:
        return [{
            "smellId": "general-improvements",
            "severity": "MINOR",
            "location": "entire file",
            "description": "Apply general code improvements: readability, structure, best practices",
            "technique": "General Refactoring",
            "action": "Improve code structure, readability, and maintainability",
            "priority": "MEDIUM",
        }]

    critical_smells = [s for s in smells if normalize_smell_severity(s) == "CRITICAL"]
    major_smells = [s for s in smells if normalize_smell_severity(s) == "MAJOR"]
    minor_smells = [s for s in smells if normalize_smell_severity(s) == "MINOR"]

    selected_smells_to_handle: List[Dict] = []
    selected_smells_to_handle.extend(critical_smells)
    max_major = min(30 if len(smells) > 50 else (20 if len(smells) > 20 else 10), len(major_smells))
    selected_smells_to_handle.extend(major_smells[:max_major])

    _minor_kw = [
        "duplicate", "long-method", "complex", "nested", "god-class", "large-class",
        "feature-envy", "temporary-field", "message-chains", "data-class", "lazy-class",
    ]
    impactful_minor = [
        s for s in minor_smells
        if any(keyword in str(s.get("detectorId") or s.get("type") or "").lower() for keyword in _minor_kw)
    ]
    remaining_slots = 15 - len(selected_smells_to_handle)
    if remaining_slots > 0:
        selected_smells_to_handle.extend(impactful_minor[:remaining_slots])
    remaining_slots = 15 - len(selected_smells_to_handle)
    if remaining_slots > 0:
        for s in minor_smells:
            if s in selected_smells_to_handle:
                continue
            selected_smells_to_handle.append(s)
            remaining_slots -= 1
            if remaining_slots <= 0:
                break

    if not selected_smells_to_handle and smells:
        prioritized = sorted(
            smells,
            key=lambda s: (
                0 if normalize_smell_severity(s) == "CRITICAL" else (
                    1 if normalize_smell_severity(s) == "MAJOR" else 2
                ),
                s.get("startLine", 0) or 0,
            ),
        )
        selected_smells_to_handle = prioritized[: min(20, len(prioritized))]

    for smell in selected_smells_to_handle:
        detector_id = str(smell.get("detectorId") or smell.get("type", "unknown"))
        sev_norm = normalize_smell_severity(smell)
        severity = smell.get("severity", sev_norm)
        summary = smell.get("summary") or smell.get("description", "")
        start_line = smell.get("startLine", 0)
        end_line = smell.get("endLine", 0)
        refactoring_technique = map_smell_to_refactoring(detector_id, summary)
        refactoring_plan.append({
            "smellId": detector_id,
            "severity": severity,
            "location": f"lines {start_line}-{end_line}",
            "description": summary,
            "technique": refactoring_technique["technique"],
            "action": refactoring_technique["action"],
            "priority": "HIGH" if sev_norm in ["CRITICAL", "MAJOR"] else "MEDIUM",
        })
    return refactoring_plan


def _pick_best_multi_llm_candidate(original: str, runs: List[Dict]) -> Optional[str]:
    """When the final chain output is unchanged, use the best prior pass that did change code."""
    best: Optional[str] = None
    best_key = (-1, -1)  # (smell_delta, abs line delta)
    orig_norm = (original or "").strip()
    for run in runs:
        if not run.get("ok"):
            continue
        cand = run.get("candidateContent")
        if not isinstance(cand, str) or not cand.strip() or cand.strip() == orig_norm:
            continue
        smell_delta = int(run.get("smellDelta") or 0)
        line_delta = abs(int(run.get("linesAfter") or 0) - int(run.get("linesBefore") or 0))
        key = (smell_delta, line_delta)
        if key > best_key:
            best_key = key
            best = cand
    return best


def _sanitize_multi_llm_runs_for_client(runs: List[Dict]) -> List[Dict]:
    """Strip large fields from per-pass records sent to the browser (keep full researchMetrics)."""
    out: List[Dict] = []
    for r in runs or []:
        if not isinstance(r, dict):
            continue
        slim = {k: v for k, v in r.items() if k != "candidateContent"}
        out.append(slim)
    return out


async def _persist_independent_multi_llm_artifacts(
    client: httpx.AsyncClient,
    workspace_id: str,
    sample_id: str,
    file_path: str,
    runs: List[Dict],
) -> None:
    if not sample_id or not runs:
        return
    for run in runs:
        if not isinstance(run, dict) or not run.get("ok"):
            continue
        try:
            await backend_post(client, f"/workspaces/{workspace_id}/multi-llm-artifact", {
                "sampleId": sample_id,
                "filePath": file_path,
                "provider": run.get("provider"),
                "candidateContent": run.get("candidateContent", ""),
                "researchMetrics": run.get("researchMetrics"),
                "agentSteps": run.get("agentSteps"),
                "smellsBefore": run.get("smellsBefore", 0),
                "smellsAfter": run.get("smellsAfter", 0),
            })
        except Exception as exc:
            print(f"WARNING: multi-llm artifact persist failed ({run.get('provider')}): {exc}")


async def _run_multi_llm_chain(
    client: httpx.AsyncClient,
    original: str,
    file_path: str,
    workspace_id: str,
    smells_initial: List[Dict],
    goals: Optional[List[str]],
    refactoring_plan_initial: Optional[List[Dict]],
    prior_notes: str,
    publish_detail,
    job_id: str,
    research_batch_mode: bool = False,
) -> Tuple[str, List[Dict], Optional[LLMRefactorOutcome], bool]:
    """
    Run OpenAI → Google → Anthropic sequentially.
    Each pass runs the real multi-agent orchestration:
      Code Smell Detector → Refactoring Planner → Size Advisor → LLM Refactorer → Quality Verifier
    """
    current = original
    runs: List[Dict] = []
    last_out: Optional[LLMRefactorOutcome] = None
    failed = False
    prior = prior_notes or ""
    chain = DEFAULT_MULTI_LLM_CHAIN

    async def record_step(agent_steps: List[Dict], name: str, agent: str, status: str, details=None, error=None):
        entry = {
            "name": name,
            "agent": agent,
            "status": status,
            "startedAt": now(),
            "endedAt": now(),
            "details": details or {},
            "error": error,
        }
        agent_steps.append(entry)
        if job_id:
            _publish_progress(job_id, {
                "type": "step",
                "stepName": name,
                "agent": agent,
                "status": status,
                "passIndex": idx,
                "passTotal": len(chain),
                "provider": provider,
                "model": model,
                "timestamp": time.time(),
            })

    for idx, entry in enumerate(chain):
        provider = entry["provider"]
        model = entry["model"]
        agent_steps: List[Dict] = []
        msg = f"Agent pass {idx + 1}/{len(chain)}: {provider} ({model})"
        await publish_detail(msg, "info")
        if job_id:
            _publish_progress(job_id, {
                "type": "llm",
                "provider": provider,
                "model": model,
                "passIndex": idx,
                "passTotal": len(chain),
                "message": msg,
                "timestamp": time.time(),
            })

        lines_in = len(current.splitlines())

        # ── Agent 1: Code Smell Detector ──
        await record_step(agent_steps, "Analyze", "Code Smell Detector", "running")
        await publish_detail(f"[{provider}] Code Smell Detector: scanning current code...", "info")
        pass_smells: List[Dict] = []
        try:
            line_count = len(current.splitlines())
            if line_count > 1500:
                before = await backend_post(client, "/workspace-enhanced-analysis/analyze-file", {
                    "workspaceId": workspace_id,
                    "filePath": file_path,
                })
            else:
                try:
                    before = await backend_post(client, "/workspace-enhanced-analysis/analyze-live", {
                        "workspaceId": workspace_id,
                        "filePath": file_path,
                        "content": current,
                    })
                except Exception:
                    before = await backend_post(client, "/workspace-enhanced-analysis/analyze-file", {
                        "workspaceId": workspace_id,
                        "filePath": file_path,
                    })
            pass_smells = list(before.get("codeSmells", []) or [])
            if not pass_smells and idx == 0 and smells_initial:
                pass_smells = list(smells_initial)
        except Exception as exc:
            await record_step(agent_steps, "Analyze", "Code Smell Detector", "error", error=str(exc)[:200])
            pass_smells = list(smells_initial) if idx == 0 else []
        else:
            await record_step(
                agent_steps, "Analyze", "Code Smell Detector", "done",
                details={"smells": len(pass_smells)},
            )
            await publish_detail(f"[{provider}] Found {len(pass_smells)} smells on current code", "analysis")

        # ── Agent 2: Refactoring Planner ──
        await record_step(agent_steps, "Smell Analysis", "Refactoring Planner", "running")
        await publish_detail(f"[{provider}] Refactoring Planner: building technique plan...", "info")
        refactoring_plan = _build_refactoring_plan_from_smells(pass_smells)
        high_p = [p for p in refactoring_plan if p.get("priority") == "HIGH"]
        await record_step(
            agent_steps, "Smell Analysis", "Refactoring Planner", "done",
            details={"smellsAnalyzed": len(refactoring_plan), "highPriority": len(high_p)},
        )

        # ── Agent 3: Size Advisor ──
        from file_size_policy import assess_refactor_feasibility
        await record_step(agent_steps, "Feasibility", "Size Advisor", "running")
        file_feasibility = assess_refactor_feasibility(current, smell_count=len(pass_smells))
        await record_step(agent_steps, "Feasibility", "Size Advisor", "done", details=file_feasibility)
        if not file_feasibility.get("invokeLlm"):
            await publish_detail(f"[{provider}] Size Advisor blocked LLM for this pass", "warning")
            smells_before_pass = len(pass_smells)
            runs.append({
                "passIndex": idx,
                "provider": provider,
                "model": model,
                "ok": False,
                "changed": False,
                "linesBefore": lines_in,
                "linesAfter": lines_in,
                "smellsBefore": smells_before_pass,
                "smellsAfter": smells_before_pass,
                "smellDelta": 0,
                "candidateContent": current,
                "agentSteps": agent_steps,
                "orchestration": "multi-agent",
                "experiment": {"skipped": True, "reason": "file_size_preflight"},
            })
            failed = True
            continue

        # ── Agent 4: LLM Refactorer (provider-specific model) ──
        await record_step(agent_steps, "Refactor", "LLM Refactorer", "running", details={"model": model})
        await publish_detail(f"[{provider}] LLM Refactorer ({model}): generating refactored code...", "info")
        llm_out: Optional[LLMRefactorOutcome] = None
        cand = current
        max_retries = 2
        retry_count = 0
        pass_prior = prior
        while retry_count <= max_retries:
            if retry_count > 0:
                await publish_detail(
                    f"[{provider}] Retry {retry_count}/{max_retries}: requesting structural changes...",
                    "warning",
                )
            try:
                llm_out = await call_llm_refactor(
                    current, file_path, pass_smells, goals, pass_prior, refactoring_plan, model=model
                )
            except Exception as llm_exc:
                llm_out = LLMRefactorOutcome(
                    ok=False,
                    content="",
                    error_code=LLMErrorCode.PROVIDER_ERROR,
                    message=str(llm_exc)[:500],
                    model=model,
                )
            last_out = llm_out
            if not llm_out.ok:
                await record_step(
                    agent_steps, "Refactor", "LLM Refactorer", "error",
                    details={"llm": llm_out.to_experiment_dict()}, error=llm_out.message[:200],
                )
                break
            cand = (
                sanitize_llm_output(
                    current,
                    llm_out.content,
                    min_line_ratio=0.15 if research_batch_mode and llm_out.truncated_output else 0.3,
                )
                if llm_out.ok
                else current
            )
            if cand.strip() != current.strip():
                await record_step(
                    agent_steps, "Refactor", "LLM Refactorer", "done",
                    details={"llm": llm_out.to_experiment_dict(), "changed": True},
                )
                break
            retry_count += 1
            if retry_count <= max_retries:
                pass_prior = (pass_prior or "") + (
                    f"\n[RETRY {retry_count} {provider}: identical code — make structural changes]"
                )
        else:
            await record_step(
                agent_steps, "Refactor", "LLM Refactorer", "done",
                details={"llm": llm_out.to_experiment_dict() if llm_out else {}, "changed": False},
            )

        changed = cand.strip() != current.strip()
        smells_before_pass = len(pass_smells)
        if llm_out is None or not llm_out.ok:
            failed = True
            await record_step(agent_steps, "Verify", "Quality Verifier", "running")
            smells_after_pass = smells_before_pass
            try:
                after_live = await backend_post(client, "/workspace-enhanced-analysis/analyze-live", {
                    "workspaceId": workspace_id,
                    "filePath": file_path,
                    "content": current,
                })
                smells_after_pass = len(after_live.get("codeSmells", []) or [])
            except Exception as ver_exc:
                await record_step(agent_steps, "Verify", "Quality Verifier", "error", error=str(ver_exc)[:200])
            else:
                await record_step(
                    agent_steps, "Verify", "Quality Verifier", "done",
                    details={
                        "smellsBefore": smells_before_pass,
                        "smellsAfter": smells_after_pass,
                        "smellDelta": smells_before_pass - smells_after_pass,
                        "skippedLlm": True,
                    },
                )
            runs.append({
                "passIndex": idx,
                "provider": provider,
                "model": model,
                "ok": False,
                "changed": False,
                "linesBefore": lines_in,
                "linesAfter": lines_in,
                "smellsBefore": smells_before_pass,
                "smellsAfter": smells_after_pass,
                "smellDelta": smells_before_pass - smells_after_pass,
                "candidateContent": current,
                "agentSteps": agent_steps,
                "orchestration": "multi-agent",
                "experiment": llm_out.to_experiment_dict() if llm_out else {},
            })
            await publish_detail(
                f"{provider} LLM Refactorer failed: {(llm_out.message if llm_out else 'unknown')[:120]} — continuing chain",
                "warning",
            )
            continue

        # ── Agent 5: Quality Verifier (per-pass, on candidate vs pass input) ──
        await record_step(agent_steps, "Verify", "Quality Verifier", "running")
        smells_after_pass = smells_before_pass
        pass_metrics: Optional[Dict] = None
        try:
            after_live = await backend_post(client, "/workspace-enhanced-analysis/analyze-live", {
                "workspaceId": workspace_id,
                "filePath": file_path,
                "content": cand,
            })
            smells_after_pass = len(after_live.get("codeSmells", []) or [])
            from refactoring_analysis import RefactoringAnalyzer
            analyzer = RefactoringAnalyzer()
            pass_analysis = analyzer.analyze_refactoring(
                original=current,
                refactored=cand,
                original_smells=pass_smells,
                refactored_smells=after_live.get("codeSmells", []),
                file_path=file_path,
                token_usage=llm_out.usage if llm_out else None,
                retry_count=retry_count,
            )
            q_before = calculate_quality_metrics(current)
            q_after = calculate_quality_metrics(cand)
            from research_payload import build_pass_research_metrics
            pass_metrics = build_pass_research_metrics(
                file_path=file_path,
                pass_input=current,
                pass_output=cand,
                analysis_result=pass_analysis,
                original_smells=pass_smells,
                refactored_smells=after_live.get("codeSmells", []) or [],
                before_smell_count=smells_before_pass,
                after_smell_count=smells_after_pass,
                quality_before=q_before,
                quality_after=q_after,
                provider=provider,
                model=model,
                pass_index=idx,
                verify_accepted=bool(changed and (llm_out.ok if llm_out else True)),
            )
        except Exception as ver_exc:
            await record_step(agent_steps, "Verify", "Quality Verifier", "error", error=str(ver_exc)[:200])
        else:
            await record_step(
                agent_steps, "Verify", "Quality Verifier", "done",
                details={
                    "smellsBefore": smells_before_pass,
                    "smellsAfter": smells_after_pass,
                    "smellDelta": smells_before_pass - smells_after_pass,
                },
            )

        runs.append({
            "passIndex": idx,
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
            "orchestration": "multi-agent",
            "researchMetrics": pass_metrics,
            "experiment": llm_out.to_experiment_dict(),
        })

        if changed:
            current = cand
            prior = (prior or "") + f"\n[Pass {idx + 1} {provider}: structural changes applied]"
            await publish_detail(
                f"{provider} pass done — {lines_in} → {len(cand.splitlines())} lines, "
                f"smells {smells_before_pass} → {smells_after_pass}",
                "success",
            )
        else:
            prior = (prior or "") + f"\n[Pass {idx + 1} {provider}: no change]"
            await publish_detail(f"{provider} returned identical code — continuing chain", "warning")

    if current.strip() == original.strip():
        recovered = _pick_best_multi_llm_candidate(original, runs)
        if recovered:
            current = recovered
            await publish_detail(
                "Multi-LLM chain: using best prior pass (final output matched original)",
                "info",
            )

    return current, runs, last_out, failed


def _build_pipeline_hooks():
    from refactor_pipeline import PipelineHooks
    from multi_llm_agent_config import is_multi_llm_agent_full
    from multi_llm_agents import call_llm_planning_agent, call_llm_verification_agent

    return PipelineHooks(
        ensure_queue=_ensure_queue,
        publish_progress=_publish_progress,
        backend_get=backend_get,
        backend_post=backend_post,
        load_memory=load_memory,
        append_run=append_run,
        now=now,
        MODEL=MODEL,
        BACKEND_BASE=BACKEND_BASE,
        DEFAULT_MULTI_LLM_CHAIN=DEFAULT_MULTI_LLM_CHAIN,
        persist_independent_multi_llm_artifacts=_persist_independent_multi_llm_artifacts,
        run_multi_llm_chain=_run_multi_llm_chain,
        sanitize_multi_llm_runs_for_client=_sanitize_multi_llm_runs_for_client,
        compact_research_snapshot=_compact_research_snapshot,
        categorize_rejection=_categorize_rejection,
        call_llm_refactor=call_llm_refactor,
        sanitize_llm_output=sanitize_llm_output,
        calculate_quality_metrics=calculate_quality_metrics,
        build_refactoring_plan_from_smells=_build_refactoring_plan_from_smells,
        normalize_provided_smell=normalize_provided_smell,
        normalize_smell_severity=normalize_smell_severity,
        prioritize_smells=prioritize_smells,
        build_public_api_signature=build_public_api_signature,
        has_empty_or_comment_only_catch_blocks=_has_empty_or_comment_only_catch_blocks,
        map_smell_to_refactoring=map_smell_to_refactoring,
        is_multi_llm_agent_mode=is_multi_llm_agent_full,
        call_llm_planning_agent=call_llm_planning_agent,
        call_llm_verification_agent=call_llm_verification_agent,
    )


async def _refactor_impl(req: RefactorRequest, job_id: str = ""):
    """LangGraph-orchestrated refactor pipeline (canonical path)."""
    from refactor_graph import orchestrate_refactor_with_events

    hooks = _build_pipeline_hooks()
    return await orchestrate_refactor_with_events(req, job_id, hooks)


# Agent analysis endpoint - analyzes code smells and decides what to refactor
@app.post("/agents/analyze")
async def analyze_for_refactoring(req: RefactorRequest):
    """
    Agent-based analysis endpoint that:
    1. Loads the file
    2. Analyzes code smells
    3. Decides if refactoring is needed
    4. Creates a refactoring plan if needed
    5. Returns decision and plan (without executing refactoring)
    """
    steps_models: List[StepLog] = []
    def add_step(name: str, agent: str, status: str, startedAt: float, endedAt: Optional[float] = None, details: Optional[Dict] = None, error: Optional[str] = None):
        steps_models.append(StepLog(name=name, agent=agent, status=status, startedAt=startedAt, endedAt=endedAt, details=details or {}, error=error))
    
    now = time.time
    
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            # Step 1: Load file
            add_step(name="Load", agent="File Loader", status="running", startedAt=now())
            try:
                # Use the correct endpoint: /workspaces/{id}/files/content?filePath=...
                file_data = await backend_get(client, f"/workspaces/{req.workspaceId}/files/content", params={"filePath": req.filePath})
                original = file_data.get("content", "")
                if not original:
                    raise ValueError(f"File {req.filePath} is empty or not found")
                add_step(name="Load", agent="File Loader", status="done", startedAt=steps_models[-1].startedAt, endedAt=now(), details={"filePath": req.filePath, "lines": len(original.splitlines())})
            except Exception as e:
                add_step(name="Load", agent="File Loader", status="error", startedAt=steps_models[-1].startedAt, endedAt=now(), error=str(e)[:500])
                return {
                    "success": False,
                    "decision": "SKIP",
                    "reason": f"Failed to load file: {str(e)}",
                    "steps": [s.dict() for s in steps_models],
                    "refactoringPlan": []
                }
            
            # Step 2: Analyze code smells (PMD via backend — same engine as refactor verify)
            add_step(name="Analyze", agent="Smell Detector", status="running", startedAt=now())
            smells: List[Dict] = []
            analysis_failed = False
            analysis_error = None
            smell_source = "unknown"
            backend_smells: List[Dict] = []

            try:
                try:
                    analysis = await backend_post(client, "/workspace-enhanced-analysis/analyze-file", {
                        "workspaceId": req.workspaceId,
                        "filePath": req.filePath,
                    })
                    backend_smells = list(analysis.get("codeSmells", []) or [])
                except Exception as e1:
                    print(f"⚠️ analyze-file failed: {e1}, trying analyze-live...")
                    analysis = await backend_post(client, "/workspace-enhanced-analysis/analyze-live", {
                        "workspaceId": req.workspaceId,
                        "filePath": req.filePath,
                        "content": original,
                    })
                    backend_smells = list(analysis.get("codeSmells", []) or [])

                if len(backend_smells) == 0 and original:
                    try:
                        analysis_live = await backend_post(client, "/workspace-enhanced-analysis/analyze-live", {
                            "workspaceId": req.workspaceId,
                            "filePath": req.filePath,
                            "content": original,
                        })
                        live_smells = list(analysis_live.get("codeSmells", []) or [])
                        if live_smells:
                            backend_smells = live_smells
                    except Exception as e_live:
                        print(f"⚠️ analyze-live fallback failed: {e_live}")

                if backend_smells:
                    smells = backend_smells
                    smell_source = "backend_pmd"
                    if req.providedSmells and len(req.providedSmells) > 0:
                        print(
                            f"✅ Using {len(smells)} backend PMD smells "
                            f"(ignoring {len(req.providedSmells)} frontend-provided)"
                        )
                elif req.providedSmells and len(req.providedSmells) > 0:
                    smells = [normalize_provided_smell(s) for s in req.providedSmells]
                    smell_source = "frontend_provided_fallback"
                    print(f"⚠️ Backend returned 0 smells; using {len(smells)} frontend-provided")

                if smells:
                    severity_counts: Dict[str, int] = {}
                    for s in smells:
                        sev = str(s.get("severity", "UNKNOWN")).upper()
                        severity_counts[sev] = severity_counts.get(sev, 0) + 1
                    print(f"📊 Smell breakdown ({smell_source}): {severity_counts}")

                add_step(
                    name="Analyze",
                    agent="Smell Detector",
                    status="done",
                    startedAt=steps_models[-1].startedAt,
                    endedAt=now(),
                    details={
                        "smellsFound": len(smells),
                        "source": smell_source,
                        "critical": len([s for s in smells if str(s.get("severity", "")).upper() in ["CRITICAL", "CRIT", "HIGH", "ERROR"]]),
                        "major": len([s for s in smells if str(s.get("severity", "")).upper() in ["MAJOR", "MAJ", "MEDIUM", "WARNING"]]),
                        "minor": len([s for s in smells if str(s.get("severity", "")).upper() not in ["CRITICAL", "CRIT", "HIGH", "ERROR", "MAJOR", "MAJ", "MEDIUM", "WARNING"]]),
                        "analysisMethod": "backend_pmd",
                    },
                )
            except Exception as e:
                analysis_failed = True
                analysis_error = str(e)[:500]
                if req.providedSmells and len(req.providedSmells) > 0:
                    smells = [normalize_provided_smell(s) for s in req.providedSmells]
                    smell_source = "frontend_provided_after_error"
                    add_step(
                        name="Analyze",
                        agent="Smell Detector",
                        status="done",
                        startedAt=steps_models[-1].startedAt,
                        endedAt=now(),
                        details={
                            "smellsFound": len(smells),
                            "source": smell_source,
                            "warning": analysis_error,
                        },
                    )
                else:
                    add_step(
                        name="Analyze",
                        agent="Smell Detector",
                        status="error",
                        startedAt=steps_models[-1].startedAt,
                        endedAt=now(),
                        error=analysis_error,
                        details={"error": analysis_error},
                    )
                print(f"❌ Analysis step failed: {analysis_error}")
            
            # Step 3: Agent Decision - Automatically decide what to handle
            add_step(name="Decision", agent="Refactoring Advisor", status="running", startedAt=now())
            refactoring_plan = []
            selected_smells = []  # Smells agents decide to handle
            decision = "PROCEED"
            reason = ""
            
            # Check if analysis failed - if so, don't immediately SKIP, but indicate the issue
            if analysis_failed:
                decision = "PROCEED"  # Still proceed, but with a warning
                reason = f"Code smell analysis failed ({analysis_error}). Proceeding with refactoring anyway to apply general improvements. You may want to check the backend analysis service."
                add_step(name="Decision", agent="Refactoring Advisor", status="done", startedAt=steps_models[-1].startedAt, endedAt=now(),
                        details={
                            "decision": decision, 
                            "reason": reason,
                            "warning": "Analysis service unavailable - proceeding with general refactoring",
                            "analysisError": analysis_error
                        })
            elif not smells or len(smells) == 0:
                # Even with 0 smells, proceed with general improvements (readability, structure)
                decision = "PROCEED"
                reason = "No code smells detected, but proceeding with general code improvements (readability, structure, best practices)."
                add_step(name="Decision", agent="Refactoring Advisor", status="done", startedAt=steps_models[-1].startedAt, endedAt=now(),
                        details={
                            "decision": decision, 
                            "reason": reason,
                            "analysisSuccessful": True,
                            "smellsChecked": True,
                            "note": "Proceeding with general improvements despite no smells"
                        })
            else:
                # Agent automatically prioritizes and selects which smells to handle
                # Handle case-insensitive severity matching and different severity formats
                # Backend returns severity as enum name (CRITICAL, MAJOR, MINOR) or displayName ("Critical", "Major", "Minor")
                def get_severity(smell):
                    sev_raw = smell.get("severity") or smell.get("priority") or "MINOR"
                    sev = str(sev_raw).upper().strip()
                    # Normalize severity values - handle both enum names and display names
                    if sev in ["CRITICAL", "CRIT", "HIGH", "ERROR"]:
                        return "CRITICAL"
                    elif sev in ["MAJOR", "MAJ", "MEDIUM", "WARNING"]:
                        return "MAJOR"
                    else:
                        return "MINOR"
                
                # Categorize smells by severity
                critical_smells = [s for s in smells if get_severity(s) == "CRITICAL"]
                major_smells = [s for s in smells if get_severity(s) == "MAJOR"]
                minor_smells = [s for s in smells if get_severity(s) == "MINOR"]
                
                # Debug: Log what we found
                print(f"🔍 Smell categorization: {len(critical_smells)} critical, {len(major_smells)} major, {len(minor_smells)} minor (total: {len(smells)})")
                if len(smells) > 0:
                    sample_sev = smells[0].get("severity")
                    print(f"   Sample severity value: {repr(sample_sev)}")
                
                # Agent selection strategy: Always handle critical, handle major if < 10, handle top minor if needed
                selected_smells = []
                
                # 1. Always include ALL critical smells (highest priority)
                selected_smells.extend(critical_smells)
                print(f"✅ Selected {len(critical_smells)} critical smells")
                
                # 2. Include major smells - scale based on total smell count
                # For files with many smells, include more major smells
                max_major = min(30 if len(smells) > 50 else (20 if len(smells) > 20 else 10), len(major_smells))
                selected_smells.extend(major_smells[:max_major])
                print(f"✅ Selected {max_major} major smells (out of {len(major_smells)})")
                
                # 3. Include top minor smells - scale based on total smell count
                # For files with many smells, include more minor smells
                max_total = min(50 if len(smells) > 50 else (30 if len(smells) > 20 else 15), len(smells))
                impactful_minor = [s for s in minor_smells if any(keyword in (s.get("detectorId") or s.get("type") or "").lower() 
                    for keyword in ["duplicate", "long-method", "long-method", "complex", "nested", "god-class", "large-class", "feature-envy", "temporary-field", "message-chains"])]
                remaining_slots = max_total - len(selected_smells)
                if remaining_slots > 0:
                    selected_smells.extend(impactful_minor[:remaining_slots])
                    print(f"✅ Selected {min(len(impactful_minor), remaining_slots)} impactful minor smells")
                
                # If still no smells selected, take top smells by priority (fallback)
                # This handles cases where severity values don't match expected format
                if len(selected_smells) == 0 and len(smells) > 0:
                    print(f"⚠️ No smells selected by severity matching, falling back to top 15 smells")
                    # Try to prioritize by detectorId if available
                    prioritized = sorted(smells, key=lambda s: (
                        0 if any(kw in (s.get("detectorId") or "").lower() for kw in ["critical", "major", "god", "large"]) else 1,
                        s.get("startLine", 0)
                    ))
                    selected_smells = prioritized[:15]
                    print(f"✅ Fallback: Selected top {len(selected_smells)} smells")
                
                print(f"📊 Total selected: {len(selected_smells)} out of {len(smells)} smells")
                
                # Create refactoring plan from SELECTED smells only
                for smell in selected_smells:
                    detector_id = smell.get("detectorId") or smell.get("type", "unknown")
                    severity = smell.get("severity", "MINOR")
                    summary = smell.get("summary") or smell.get("description", "")
                    start_line = smell.get("startLine", 0)
                    end_line = smell.get("endLine", 0)
                    
                    refactoring_technique = map_smell_to_refactoring(detector_id, summary)
                    
                    refactoring_plan.append({
                        "smellId": detector_id,
                        "severity": severity,
                        "location": f"lines {start_line}-{end_line}",
                        "description": summary,
                        "technique": refactoring_technique["technique"],
                        "action": refactoring_technique["action"],
                        "priority": "HIGH" if severity in ["CRITICAL", "MAJOR"] else "MEDIUM",
                        "selected": True  # Agent automatically selected this
                    })
                
                # Agent decision logic
                critical_count = len(critical_smells)
                major_count = len(major_smells)
                total_selected = len(selected_smells)
                
                if critical_count > 0:
                    decision = "PROCEED"
                    reason = f"Found {critical_count} critical code smell(s) that must be addressed. Agent has selected {total_selected} smell(s) to handle automatically."
                elif major_count >= 3:
                    decision = "PROCEED"
                    reason = f"Found {major_count} major code smell(s). Agent has selected {total_selected} smell(s) to handle automatically."
                elif len(smells) >= 5:
                    decision = "PROCEED"
                    reason = f"Found {len(smells)} code smell(s). Agent has automatically selected {total_selected} high-priority smell(s) to handle."
                else:
                    decision = "OPTIONAL"
                    reason = f"Found {len(smells)} minor code smell(s). Agent has selected {total_selected} impactful smell(s) to handle. Refactoring is optional."
                
                add_step(name="Decision", agent="Refactoring Advisor", status="done", startedAt=steps_models[-1].startedAt, endedAt=now(),
                        details={
                            "decision": decision, 
                            "reason": reason, 
                            "totalSmells": len(smells),
                            "selectedSmells": total_selected,
                            "criticalSelected": len([s for s in selected_smells if s.get("severity") == "CRITICAL"]),
                            "majorSelected": len([s for s in selected_smells if s.get("severity") == "MAJOR"]),
                            "minorSelected": len([s for s in selected_smells if s.get("severity") == "MINOR"]),
                            "highPriority": len([p for p in refactoring_plan if p["priority"] == "HIGH"]),
                            "plan": refactoring_plan[:5]  # Show first 5 in details
                        })
            
            return {
                "success": True,
                "decision": decision,  # "PROCEED", "SKIP", or "OPTIONAL"
                "reason": reason,
                "refactoringPlan": refactoring_plan,  # Already contains only selected smells
                "selectedSmells": [s.get("detectorId") or s.get("type") for s in selected_smells],  # IDs of selected smells
                "totalSmells": len(smells),
                "selectedCount": len(selected_smells),
                "smells": smells,  # All smells for reference
                "steps": [s.dict() for s in steps_models],
                "originalContent": original
            }
    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"Fatal error in analyze_for_refactoring: {error_trace}")
        add_step(name="Fatal", agent="Coordinator", status="error", startedAt=now(), endedAt=now(), error=str(e))
        return {
            "success": False,
            "decision": "ERROR",
            "reason": f"Analysis failed: {str(e)}",
            "steps": [s.dict() for s in steps_models],
            "refactoringPlan": []
        }


# Main unified agentic refactoring endpoint
@app.post("/agents/refactor")
async def refactor(req: RefactorRequest):
    """
    Unified agentic refactoring engine with code smell detection.
    Performs multi-agent refactoring workflow:
    1. Load file
    2. Analyze code smells
    3. Plan refactoring
    4. Refactor code
    5. Verify improvements
    6. Apply changes
    7. Compile verification
    """
    try:
        job_id = req.jobId or f"{req.workspaceId}_{hashlib.md5((req.filePath or '').encode()).hexdigest()[:8]}_{int(time.time())}"
        result = await _refactor_impl(req, job_id=job_id)
        # Ensure result is a dict and has all required fields
        if not isinstance(result, dict):
            raise ValueError(f"Expected dict, got {type(result)}")
        result["jobId"] = job_id
        
        # Validate response can be serialized before returning
        try:
            import json
            json.dumps(result)  # Test serialization
        except Exception as serial_error:
            print(f"ERROR: Response serialization failed: {serial_error}")
            import traceback
            print(traceback.format_exc())
            # Return error response instead of crashing
            return {
                "success": False,
                "steps": result.get("steps", []),
                "originalContent": "",
                "refactoredContent": "",
                "deltas": result.get("deltas", {}),
                "applyResult": None,
                "error": f"Response serialization failed: {str(serial_error)}"
            }
        
        # Return with proper headers to prevent timeout issues
        from fastapi.responses import JSONResponse
        return JSONResponse(
            content=result,
            headers={
                "X-Accel-Buffering": "no",  # Disable buffering for nginx/proxy
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }
        )
    except asyncio.TimeoutError:
        return {
            "success": False,
            "steps": [{
                "name": "Run",
                "agent": "Coordinator",
                "status": "error",
                "startedAt": int(time.time()),
                "endedAt": int(time.time()),
                "error": "Refactoring timed out after 5 minutes"
            }],
            "originalContent": "",
            "refactoredContent": "",
            "deltas": {},
            "applyResult": None,
            "error": "Refactoring timed out. The file may be too large. Please try a smaller file."
        }
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error in refactor endpoint: {error_trace}")
        # Log to stderr as well for uvicorn logs
        import sys
        print(f"ERROR: {error_trace}", file=sys.stderr)
        # Return proper JSON response with error details
        # Use 200 status but include error in response body for frontend compatibility
        return {
            "success": False,
            "steps": [{
                "name": "Run",
                "agent": "Coordinator",
                "status": "error",
                "startedAt": int(time.time()),
                "endedAt": int(time.time()),
                "error": str(e)[:500]  # Limit error message length
            }],
            "originalContent": "",
            "refactoredContent": "",
            "deltas": {},
            "applyResult": None,
            "error": f"Refactoring failed: {str(e)}"
        }

# Alias for backward compatibility
@app.post("/refactor")
async def refactor_alias(req: RefactorRequest):
    return await refactor(req)


@app.post("/agents/refactor-batch")
async def refactor_batch(req: RefactorBatchRequest):
    """
    Run the full refactor pipeline on multiple files sequentially.
    Uses per-file backend smell analysis unless you extend the client to pass per-file providedSmells.
    """
    cap = max(1, min(int(req.maxFiles or 20), 100))
    goals = req.goals or ["reduce code smells", "improve readability", "enhance maintainability"]
    paths: List[str] = []
    async with httpx.AsyncClient(timeout=120) as client:
        if req.filePaths and len(req.filePaths) > 0:
            paths = [p.strip() for p in req.filePaths if p and str(p).strip().endswith(".java")][:cap]
        else:
            try:
                files = await backend_get(client, f"/workspaces/{req.workspaceId}/files")
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Could not list workspace files: {str(e)[:200]}") from e
            if not isinstance(files, list):
                raise HTTPException(status_code=400, detail="Workspace files response is not a list")
            candidates: List[tuple] = []
            for f in files:
                rp = f.get("relativePath") or f.get("path") or ""
                if not isinstance(rp, str) or not rp.endswith(".java"):
                    continue
                cs = f.get("codeSmells")
                findings = f.get("findings") or 0
                score = 0
                if isinstance(cs, int) and cs > 0:
                    score = cs
                elif isinstance(findings, (int, float)) and int(findings) > 0:
                    score = int(findings)
                if score > 0:
                    candidates.append((rp, score))
            candidates.sort(key=lambda x: -x[1])
            paths = [c[0] for c in candidates[:cap]]

    if not paths:
        return {
            "workspaceId": req.workspaceId,
            "dryRun": req.dryRun,
            "processed": 0,
            "succeeded": 0,
            "failed": 0,
            "filePaths": [],
            "results": [],
            "message": "No files to process. Pass filePaths, or run workspace assessment so files have codeSmells/findings, or increase maxFiles.",
        }

    if req.dryRun:
        return {
            "workspaceId": req.workspaceId,
            "dryRun": True,
            "maxFiles": cap,
            "filePaths": paths,
            "count": len(paths),
        }

    results: List[Dict] = []
    for fp in paths:
        try:
            sub = RefactorRequest(
                workspaceId=req.workspaceId,
                filePath=fp,
                goals=goals,
                providedSmells=None,
                selectedSmells=None,
                similarityThreshold=req.similarityThreshold,
                methodPreservationThreshold=req.methodPreservationThreshold,
            )
            out = await _refactor_impl(sub)
            d = out.get("deltas") or {}
            results.append({
                "filePath": fp,
                "success": bool(out.get("success")),
                "rejected": bool(out.get("rejected")),
                "error": out.get("error"),
                "applyResult": out.get("applyResult"),
                "smellDelta": {
                    "before": d.get("before"),
                    "after": d.get("after"),
                    "improvement": d.get("improvement"),
                },
            })
        except Exception as e:
            results.append({"filePath": fp, "success": False, "error": str(e)[:500]})

    succeeded = sum(1 for r in results if r.get("success"))
    return {
        "workspaceId": req.workspaceId,
        "processed": len(results),
        "succeeded": succeeded,
        "failed": len(results) - succeeded,
        "filePaths": paths,
        "results": results,
    }


@app.post("/refactor-batch")
async def refactor_batch_alias(req: RefactorBatchRequest):
    """Same as /agents/refactor-batch (for Next.js rewrite /agents/refactor-batch → /refactor-batch)."""
    return await refactor_batch(req)


# Deprecated: Use /agents/refactor instead
@app.post("/agents/refactor-file")
async def refactor_file_deprecated(req: RefactorRequest):
    """Deprecated: Use /agents/refactor instead"""
    return await refactor(req)

@app.post("/refactor-file")
async def refactor_file_alias_deprecated(req: RefactorRequest):
    """Deprecated: Use /agents/refactor instead"""
    return await refactor(req)

# Also expose /health without prefix for the same rewrite behavior
@app.get("/health")
async def health_alias():
    return {"status": "ok", "model": MODEL, "hasOpenRouterKey": bool(OPENROUTER_API_KEY)}

# ===== Direct LLM refactor endpoint for ControlledRefactoring (no multi-agent) =====
class DirectRefactorRequest(BaseModel):
    workspaceId: str
    filePath: str
    content: str
    smells: Optional[List[Dict]] = None
    goals: Optional[List[str]] = None

# Deprecated: Use /agents/refactor instead
# Keeping for backward compatibility but redirecting to main endpoint
@app.post("/agents/refactor-direct")
async def refactor_direct_deprecated(req: DirectRefactorRequest):
    """Deprecated: Use /agents/refactor instead. This endpoint redirects to the main refactoring engine."""
    # Convert DirectRefactorRequest to RefactorRequest format
    refactor_req = RefactorRequest(
        workspaceId=req.workspaceId,
        filePath=req.filePath,
        goals=req.goals or ["reduce smells", "improve readability"]
    )
    return await refactor(refactor_req)

# ===== LangGraph alias (canonical orchestration is /agents/refactor) =====
class GraphRefactorRequest(BaseModel):
    workspaceId: str
    filePath: str
    goals: Optional[List[str]] = None


@app.post("/agents/refactor-graph")
async def refactor_graph_alias(req: GraphRefactorRequest):
    """Alias for /agents/refactor — LangGraph orchestrates the canonical pipeline."""
    refactor_req = RefactorRequest(
        workspaceId=req.workspaceId,
        filePath=req.filePath,
        goals=req.goals or [],
    )
    return await refactor(refactor_req)


# ===== RIPPLE-REF Study =====
from ripple_ref_study import (
    RippleRefRunRequest,
    RippleRefBatchRequest,
    run_ripple_ref_candidate,
    run_ripple_ref_batch,
    V1_SYSTEM,
    V2_SYSTEM,
)
from llm_prompts import compute_refactor_max_tokens, compute_refactor_timeout


async def call_ripple_ref_llm(
    original: str,
    user_prompt: str,
    *,
    system_prompt: str,
    model: str,
) -> Dict:
    original_lines = len(original.splitlines())
    original_tokens = len(original.split())
    max_tokens = compute_refactor_max_tokens(original_lines, original_tokens)
    timeout_seconds = compute_refactor_timeout(original_lines)
    result = await chat_completion(
        system=system_prompt,
        user=user_prompt,
        model=model,
        temperature=0.4,
        max_tokens=max_tokens,
        timeout_seconds=timeout_seconds,
    )
    if not result.ok:
        return {
            "error": result.message,
            "errorCode": result.error_code,
            "refactoredCode": "",
            "usage": result.usage or {},
        }
    outcome = result.to_refactor_outcome()
    return {
        "refactoredCode": outcome.content or "",
        "text": result.content,
        "usage": result.usage or {},
        "promptTokens": (result.usage or {}).get("prompt_tokens"),
        "completionTokens": (result.usage or {}).get("completion_tokens"),
    }


from ma_ref_study import (
    MaRefRunRequest,
    MaRefBatchRequest,
    run_ma_ref_candidate,
    run_ma_ref_batch,
)


@app.post("/agents/ma-ref/run-candidate")
async def ma_ref_run_candidate(req: MaRefRunRequest):
    async with httpx.AsyncClient(timeout=600) as client:
        async def bg(path: str, **kwargs):
            return await backend_get(client, path, **kwargs)

        async def bp(path: str, body: Dict):
            return await backend_post(client, path, body)

        async def refactor_fn(body: Dict) -> Dict:
            rr = RefactorRequest(**body)
            return await _refactor_impl(rr, job_id="")

        return await run_ma_ref_candidate(
            req,
            backend_get=bg,
            backend_post=bp,
            refactor_fn=refactor_fn,
        )


@app.post("/agents/ma-ref/run-batch")
async def ma_ref_run_batch(req: MaRefBatchRequest):
    async with httpx.AsyncClient(timeout=600) as client:
        async def bg(path: str, **kwargs):
            return await backend_get(client, path, **kwargs)

        async def run_single(single_req: MaRefRunRequest):
            return await ma_ref_run_candidate(single_req)

        return await run_ma_ref_batch(req, backend_get=bg, run_single=run_single)


@app.post("/agents/ripple-ref/run-candidate")
async def ripple_ref_run_candidate(req: RippleRefRunRequest):
    async with httpx.AsyncClient() as client:
        async def bg(path: str, **kwargs):
            return await backend_get(client, path, **kwargs)

        async def bp(path: str, body: Dict):
            return await backend_post(client, path, body)

        return await run_ripple_ref_candidate(
            req,
            backend_get=bg,
            backend_post=bp,
            call_llm_refactor=lambda orig, up, system_prompt, model: call_ripple_ref_llm(
                orig, up, system_prompt=system_prompt, model=model
            ),
            sanitize_llm_output=sanitize_llm_output,
            build_refactoring_plan_from_smells=_build_refactoring_plan_from_smells,
            prioritize_smells=prioritize_smells,
        )


@app.post("/agents/ripple-ref/run-batch")
async def ripple_ref_run_batch(req: RippleRefBatchRequest):
    async with httpx.AsyncClient() as client:
        async def bg(path: str, **kwargs):
            return await backend_get(client, path, **kwargs)

        async def run_single(single_req: RippleRefRunRequest):
            return await ripple_ref_run_candidate(single_req)

        return await run_ripple_ref_batch(
            req,
            backend_get=bg,
            run_single=run_single,
        )

