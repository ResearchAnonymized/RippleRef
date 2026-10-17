"""Tests for LLM provider configuration and routing."""
import pytest

from llm_provider_config import (
    CORE_PROVIDER_IDS,
    infer_provider_id,
    research_chain_as_dicts,
    research_provider_chain,
    resolve_transport,
    strip_openrouter_prefix,
)


def test_research_chain_has_three_core_providers():
    chain = research_provider_chain()
    assert len(chain) == 3
    assert [s.provider_id for s in chain] == list(CORE_PROVIDER_IDS)


def test_research_chain_dicts_include_provider_id():
    dicts = research_chain_as_dicts()
    assert len(dicts) == 3
    for entry in dicts:
        assert entry["providerId"] in CORE_PROVIDER_IDS
        assert entry["model"].startswith(f"{entry['providerId']}/")


def test_infer_provider_id_from_openrouter_slug():
    assert infer_provider_id("openai/gpt-5.5") == "openai"
    assert infer_provider_id("google/gemini-3.1-pro-preview") == "google"
    assert infer_provider_id("anthropic/claude-opus-4.8") == "anthropic"
    assert infer_provider_id("unknown/model") is None


def test_strip_openrouter_prefix():
    assert strip_openrouter_prefix("openai/gpt-5.5") == "gpt-5.5"


def test_resolve_transport_openrouter_mode(monkeypatch):
    monkeypatch.setenv("LLM_ROUTING", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    transport, model, logical = resolve_transport(model="openai/gpt-5.5")
    assert transport == "openrouter"
    assert model == "openai/gpt-5.5"
    assert logical == "openai"


def test_resolve_transport_auto_direct_when_key(monkeypatch):
    monkeypatch.setenv("LLM_ROUTING", "auto")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-openai")
    monkeypatch.setenv("OPENAI_MODEL", "gpt-4o")
    transport, model, logical = resolve_transport(provider_id="openai")
    assert transport == "openai"
    assert model == "gpt-4o"
    assert logical == "openai"


def test_resolve_transport_auto_fallback_openrouter(monkeypatch):
    monkeypatch.setenv("LLM_ROUTING", "auto")
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    transport, model, logical = resolve_transport(provider_id="openai", model="openai/gpt-5.5")
    assert transport == "openrouter"
    assert model == "openai/gpt-5.5"
