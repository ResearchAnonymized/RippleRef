"""LangGraph refactor orchestration tests."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from refactor_graph import (
    GRAPH_VERSION,
    LANGGRAPH_AVAILABLE,
    build_refactor_graph,
    build_provider_subgraph,
    use_langgraph_orchestrator,
)
from refactor_pipeline import PipelineHooks, PipelineExecution, enrich_response_for_langgraph


def test_langgraph_available_and_graph_compiles():
  if not LANGGRAPH_AVAILABLE:
    pytest.skip("langgraph not installed")
  app = build_refactor_graph()
  assert app is not None
  provider = build_provider_subgraph()
  assert provider is not None


def test_use_langgraph_orchestrator_default(monkeypatch):
  monkeypatch.delenv("REFACTOR_ORCHESTRATOR", raising=False)
  assert use_langgraph_orchestrator() is True
  monkeypatch.setenv("REFACTOR_ORCHESTRATOR", "legacy")
  assert use_langgraph_orchestrator() is False


def test_enrich_response_adds_pipeline_metadata():
  resp = enrich_response_for_langgraph(
    {"success": True, "steps": [{"name": "Load"}]},
    graph_version=GRAPH_VERSION,
    node_trace=["load", "analyze"],
  )
  meta = resp["pipelineMetadata"]
  assert meta["orchestration"] == "langgraph"
  assert meta["graphVersion"] == GRAPH_VERSION
  assert meta["nodeTrace"] == ["load", "analyze"]
  assert resp["steps"][0]["framework"] == "langgraph"


@pytest.mark.asyncio
async def test_load_node_early_exit_sets_response(monkeypatch):
  if not LANGGRAPH_AVAILABLE:
    pytest.skip("langgraph not installed")

  from refactor_pipeline import run_load

  hooks = MagicMock()
  hooks.now.return_value = 1.0
  hooks.backend_get = AsyncMock(side_effect=RuntimeError("missing file"))

  req = SimpleNamespace(
    workspaceId="ws1",
    filePath="Foo.java",
    content=None,
    sampleId=None,
    researchBatchMode=False,
    multiLlmChain=False,
  )
  pipeline = PipelineExecution(req, "", hooks)
  await run_load(pipeline)
  assert pipeline.response_data is not None
  assert pipeline.response_data["success"] is False


@pytest.mark.asyncio
async def test_orchestrate_refactor_load_failure(monkeypatch):
  if not LANGGRAPH_AVAILABLE:
    pytest.skip("langgraph not installed")

  from refactor_graph import orchestrate_refactor

  hooks = MagicMock()
  hooks.now.return_value = 1.0
  hooks.ensure_queue = MagicMock()
  hooks.publish_progress = MagicMock()
  hooks.backend_get = AsyncMock(side_effect=RuntimeError("missing file"))
  hooks.load_memory = MagicMock(return_value={})
  hooks.append_run = MagicMock()

  req = SimpleNamespace(
    workspaceId="ws1",
    filePath="Foo.java",
    content=None,
    sampleId=None,
    researchBatchMode=False,
    multiLlmChain=False,
    goals=[],
    providedSmells=None,
    selectedSmells=None,
  )

  monkeypatch.setenv("REFACTOR_ORCHESTRATOR", "langgraph")
  result = await orchestrate_refactor(req, "", hooks)
  assert result["pipelineMetadata"]["orchestration"] == "langgraph"
  assert "load" in result["pipelineMetadata"]["nodeTrace"]
  assert result["success"] is False
