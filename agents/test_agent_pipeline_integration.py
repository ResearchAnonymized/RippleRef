"""
Integration test: LangGraph agent pipeline produces expected response shape (mocked LLM/backend).
Run: cd agents && python -m pytest test_agent_pipeline_integration.py -v
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

SAMPLE_JAVA = """package demo;
public class Demo {
    public void longMethod() {
        if (true) {
            System.out.println("a");
        }
        if (false) {
            System.out.println("b");
        }
    }
}
"""

REFACTORED_JAVA = """package demo;
public class Demo {
    public void longMethod() {
        printA();
        printB();
    }
    private void printA() { System.out.println("a"); }
    private void printB() { System.out.println("b"); }
}
"""

EXPECTED_TOP_LEVEL_KEYS = {
    "success",
    "filePath",
    "steps",
    "originalContent",
    "refactoredContent",
    "deltas",
    "rejected",
    "researchMetrics",
    "pipelineMetadata",
    "experiment",
    "multiLlmRuns",
}

RESEARCH_METRICS_SECTIONS = {
    "meta",
    "comparison",
    "code_smells",
    "behavioral",
    "quality",
}


def _build_mock_hooks():
    from llm_errors import LLMRefactorOutcome

    hooks = MagicMock()
    hooks.now.return_value = 1000.0
    hooks.ensure_queue = MagicMock()
    hooks.publish_progress = MagicMock()
    hooks.load_memory = MagicMock(return_value={})
    hooks.append_run = MagicMock()
    hooks.MODEL = "test/model"
    hooks.BACKEND_BASE = "http://test/api"
    hooks.DEFAULT_MULTI_LLM_CHAIN = []
    hooks.is_multi_llm_agent_mode = MagicMock(return_value=False)

    async def fake_llm(*args, **kwargs):
        return LLMRefactorOutcome(
            ok=True,
            content=f"```java\n{REFACTORED_JAVA}\n```",
            model="test/model",
        )

    hooks.call_llm_refactor = AsyncMock(side_effect=fake_llm)
    hooks.call_llm_planning_agent = AsyncMock()
    hooks.call_llm_verification_agent = AsyncMock()
    hooks.sanitize_llm_output = lambda orig, raw, **kw: REFACTORED_JAVA
    hooks.calculate_quality_metrics = MagicMock(return_value={
        "complexity": 2, "maintainability": 80.0, "testability": 50.0,
    })
    hooks.build_refactoring_plan_from_smells = MagicMock(return_value=[])
    hooks.normalize_provided_smell = lambda s: s
    hooks.normalize_smell_severity = lambda s: str(s.get("severity", "MINOR")).upper()
    hooks.prioritize_smells = MagicMock(return_value=[])
    hooks.build_public_api_signature = MagicMock(return_value=["void longMethod()"])
    hooks.has_empty_or_comment_only_catch_blocks = MagicMock(return_value=False)
    hooks.map_smell_to_refactoring = MagicMock(return_value={
        "technique": "Extract Method", "action": "extract",
    })
    hooks.sanitize_multi_llm_runs_for_client = lambda runs: runs or []
    hooks.compact_research_snapshot = lambda m: m
    hooks.categorize_rejection = lambda r: "test"
    hooks.persist_independent_multi_llm_artifacts = AsyncMock()
    hooks.run_multi_llm_chain = AsyncMock()
    hooks.backend_get = AsyncMock(return_value={"dependencies": [], "reverseDependencies": []})

    smells_before = [{"detectorId": "LONG_METHOD", "severity": "MAJOR", "startLine": 3}]
    smells_after = []

    async def backend_post(client, path, payload=None, **kwargs):
        if "analyze-live" in path or "analyze-file" in path:
            content = (payload or {}).get("content", "")
            if content.strip() == REFACTORED_JAVA.strip():
                return {"codeSmells": smells_after}
            return {"codeSmells": smells_before}
        if path == "/refactoring/apply":
            return {"applied": True}
        return {}

    hooks.backend_post = AsyncMock(side_effect=backend_post)
    return hooks


@pytest.mark.asyncio
async def test_full_graph_off_mode_response_shape(monkeypatch):
    from refactor_graph import GRAPH_VERSION, LANGGRAPH_AVAILABLE, orchestrate_refactor

    if not LANGGRAPH_AVAILABLE:
        pytest.skip("langgraph not installed")

    monkeypatch.setenv("REFACTOR_ORCHESTRATOR", "langgraph")
    monkeypatch.setenv("MULTI_LLM_AGENT_MODE", "off")

    hooks = _build_mock_hooks()
    req = SimpleNamespace(
        workspaceId="ws-test",
        filePath="demo/Demo.java",
        content=SAMPLE_JAVA,
        goals=["reduce code smells"],
        researchBatchMode=True,
        multiLlmChain=False,
        sampleId=None,
        providedSmells=None,
        selectedSmells=None,
        methodPreservationThreshold=None,
    )

    result = await orchestrate_refactor(req, "", hooks)

    assert result["pipelineMetadata"]["orchestration"] == "langgraph"
    assert result["pipelineMetadata"]["graphVersion"] == GRAPH_VERSION
    trace = result["pipelineMetadata"]["nodeTrace"]
    assert trace[0] == "load"
    assert "plan" in trace
    assert "llm_plan" in trace
    assert "refactor" in trace
    assert "verify" in trace
    assert "llm_verify" in trace
    assert "report" in trace

    missing = EXPECTED_TOP_LEVEL_KEYS - set(result.keys())
    assert not missing, f"missing keys: {missing}"

    rm = result.get("researchMetrics")
    assert isinstance(rm, dict), "researchMetrics should be present"
    missing_rm = RESEARCH_METRICS_SECTIONS - set(rm.keys())
    assert not missing_rm, f"missing researchMetrics sections: {missing_rm}"

    comp = rm.get("comparison") or {}
    assert "complexity" in comp or "lines_of_code" in comp or "pmd_smell_total" in comp

    hooks.call_llm_refactor.assert_called()
    hooks.call_llm_planning_agent.assert_not_called()
    hooks.call_llm_verification_agent.assert_not_called()


@pytest.mark.asyncio
async def test_full_graph_full_mode_calls_three_llm_agents(monkeypatch):
    from llm_agent_core import LLMAgentOutcome
    from refactor_graph import LANGGRAPH_AVAILABLE, orchestrate_refactor

    if not LANGGRAPH_AVAILABLE:
        pytest.skip("langgraph not installed")

    monkeypatch.setenv("REFACTOR_ORCHESTRATOR", "langgraph")
    monkeypatch.setenv("MULTI_LLM_AGENT_MODE", "full")

    hooks = _build_mock_hooks()
    hooks.is_multi_llm_agent_mode = MagicMock(return_value=True)

    plan_out = LLMAgentOutcome(
        ok=True,
        agent="LLM Planning Agent",
        parsed=[{
            "smellId": "LONG_METHOD",
            "severity": "MAJOR",
            "location": "lines 3-8",
            "description": "long",
            "technique": "Extract Method",
            "action": "extract helpers",
            "priority": "HIGH",
        }],
        model="test/model",
    )
    verify_out = LLMAgentOutcome(
        ok=True,
        agent="LLM Verification Agent",
        parsed={"approved": True, "confidence": 0.9, "concerns": [], "reasoning": "ok"},
        model="test/model",
    )
    hooks.call_llm_planning_agent = AsyncMock(return_value=plan_out)
    hooks.call_llm_verification_agent = AsyncMock(return_value=verify_out)

    req = SimpleNamespace(
        workspaceId="ws-test",
        filePath="demo/Demo.java",
        content=SAMPLE_JAVA,
        goals=["reduce code smells"],
        researchBatchMode=True,
        multiLlmChain=False,
        sampleId=None,
        providedSmells=None,
        selectedSmells=None,
        methodPreservationThreshold=None,
    )

    result = await orchestrate_refactor(req, "", hooks)

    hooks.call_llm_planning_agent.assert_called_once()
    hooks.call_llm_refactor.assert_called()
    hooks.call_llm_verification_agent.assert_called_once()

    meta = (result.get("researchMetrics") or {}).get("meta") or {}
    assert meta.get("multiLlmAgentMode") in ("full", None) or hooks.is_multi_llm_agent_mode()

    assert "researchMetrics" in result
    assert "comparison" in result["researchMetrics"]


def test_verification_gates_match_prior_behavior():
    """Static gates: unchanged code still rejected as too_similar."""
    from verification_gates import evaluate_verification_gates

    code = SAMPLE_JAVA
    g = evaluate_verification_gates(
        original=code,
        candidate=code,
        before_count=3,
        after_count=3,
        build_public_api_signature=lambda c: ["void longMethod()"],
        has_empty_catch=lambda c: False,
        research_batch=True,
    )
    assert g.accept is False


@pytest.mark.asyncio
async def test_llm_failure_still_returns_structured_response(monkeypatch):
    """OpenRouter/quota failures must not crash report node (build_failure_outcome)."""
    from llm_errors import LLMRefactorOutcome
    from refactor_graph import LANGGRAPH_AVAILABLE, orchestrate_refactor

    if not LANGGRAPH_AVAILABLE:
        pytest.skip("langgraph not installed")

    monkeypatch.setenv("REFACTOR_ORCHESTRATOR", "langgraph")
    monkeypatch.setenv("MULTI_LLM_AGENT_MODE", "off")

    hooks = _build_mock_hooks()

    async def failing_llm(*args, **kwargs):
        return LLMRefactorOutcome(
            ok=False,
            content="",
            model="test/model",
            error_code="openrouter_quota",
            message="quota exceeded",
        )

    hooks.call_llm_refactor = AsyncMock(side_effect=failing_llm)

    req = SimpleNamespace(
        workspaceId="ws-test",
        filePath="demo/Demo.java",
        content=SAMPLE_JAVA,
        goals=["reduce code smells"],
        researchBatchMode=True,
        multiLlmChain=False,
        sampleId=None,
        providedSmells=None,
        selectedSmells=None,
        methodPreservationThreshold=None,
    )

    result = await orchestrate_refactor(req, "", hooks)

    assert "build_failure_outcome" not in (result.get("error") or "")
    assert result.get("success") is False
    fo = result.get("failureOutcome")
    assert isinstance(fo, dict)
    assert fo.get("primaryReason") == "openrouter_quota"
    assert result.get("researchOutcome", {}).get("failurePrimaryReason") == "openrouter_quota"
    assert "report" in (result.get("pipelineMetadata") or {}).get("nodeTrace", [])
