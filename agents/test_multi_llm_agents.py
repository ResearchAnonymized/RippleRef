"""Tests for multi-LLM agent mode."""
import pytest

from multi_llm_agent_config import is_multi_llm_agent_full, multi_llm_agent_mode
from multi_llm_agents import _normalize_plan_items, verifier_approved
from llm_agent_core import LLMAgentOutcome, _extract_json_block


def test_multi_llm_agent_mode_default_off(monkeypatch):
    monkeypatch.delenv("MULTI_LLM_AGENT_MODE", raising=False)
    assert multi_llm_agent_mode() == "off"
    assert is_multi_llm_agent_full() is False


def test_multi_llm_agent_mode_full(monkeypatch):
    monkeypatch.setenv("MULTI_LLM_AGENT_MODE", "full")
    assert is_multi_llm_agent_full() is True


def test_normalize_plan_items():
    fallback = [{"smellId": "x", "technique": "Extract Method"}]
    raw = [{"smellId": "LONG_METHOD", "technique": "Extract Method", "priority": "HIGH"}]
    out = _normalize_plan_items(raw, fallback)
    assert len(out) == 1
    assert out[0]["smellId"] == "LONG_METHOD"
    assert out[0]["source"] == "llm_planner"


def test_extract_json_block():
    parsed = _extract_json_block('{"approved": true, "confidence": 0.9}')
    assert parsed["approved"] is True


def test_verifier_approved():
    outcome = LLMAgentOutcome(ok=True, agent="v", parsed={"approved": False})
    assert verifier_approved(outcome) is False
