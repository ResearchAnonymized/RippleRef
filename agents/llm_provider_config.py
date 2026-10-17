"""
Central LLM provider configuration for the agentic refactoring pipeline.

Supports three frontier providers (OpenAI, Google, Anthropic) via:
  - OpenRouter (single key, provider/model slugs) — default
  - Direct native APIs when provider-specific keys are set (LLM_ROUTING=auto|direct)

Research multi-LLM runs use RESEARCH_PROVIDER_CHAIN — one pass per provider on frozen baseline.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import List, Literal, Optional

try:
    from dotenv import load_dotenv

    load_dotenv(dotenv_path=Path(__file__).parent / ".env")
except ImportError:
    pass

ProviderId = Literal["openrouter", "openai", "google", "anthropic"]
RoutingMode = Literal["openrouter", "direct", "auto"]

# Logical provider ids used in research metrics and chain slots
CORE_PROVIDER_IDS = ("openai", "google", "anthropic")

_PROVIDER_LABELS = {
    "openai": "OpenAI",
    "google": "Google",
    "anthropic": "Anthropic",
}

_OPENROUTER_PREFIX = {
    "openai": "openai/",
    "google": "google/",
    "anthropic": "anthropic/",
}


@dataclass(frozen=True)
class ProviderSlot:
    """One research pass: logical provider + models for OpenRouter and direct APIs."""

    provider_id: str
    label: str
    openrouter_model: str
    direct_model: str

    def to_chain_dict(self) -> dict:
        return {
            "provider": self.label,
            "providerId": self.provider_id,
            "model": self.openrouter_model,
            "directModel": self.direct_model,
        }


def _env(key: str, default: str = "") -> str:
    return (os.environ.get(key) or default).strip()


def routing_mode() -> RoutingMode:
    raw = _env("LLM_ROUTING", "auto").lower()
    if raw in ("direct", "native"):
        return "direct"
    if raw in ("openrouter", "or"):
        return "openrouter"
    return "auto"


def openrouter_api_key() -> Optional[str]:
    key = _env("OPENROUTER_API_KEY")
    return key or None


def openrouter_url() -> str:
    return _env("OPENROUTER_URL", "https://openrouter.ai/api/v1/chat/completions")


def provider_api_key(provider_id: str) -> Optional[str]:
    env_map = {
        "openai": "OPENAI_API_KEY",
        "google": "GOOGLE_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
    }
    env_name = env_map.get(provider_id)
    if not env_name:
        return None
    key = _env(env_name)
    return key or None


def default_openrouter_model() -> str:
    return _env("OPENROUTER_MODEL", "anthropic/claude-opus-4.8")


# Legacy study slugs → current OpenRouter model ids
_OPENROUTER_MODEL_ALIASES: dict[str, str] = {
    "qwen/qwen-3.6-plus": "qwen/qwen3.6-plus",
}


def normalize_openrouter_model(model: Optional[str]) -> Optional[str]:
    """Map deprecated/typo OpenRouter slugs to valid ids."""
    if not model:
        return model
    return _OPENROUTER_MODEL_ALIASES.get(model.strip(), model.strip())


def infer_provider_id(model: Optional[str]) -> Optional[str]:
    """Map OpenRouter slug prefix to logical provider id."""
    if not model:
        return None
    m = model.lower()
    for pid, prefix in _OPENROUTER_PREFIX.items():
        if m.startswith(prefix):
            return pid
    return None


def strip_openrouter_prefix(model: str) -> str:
    for prefix in _OPENROUTER_PREFIX.values():
        if model.lower().startswith(prefix):
            return model[len(prefix) :]
    return model


def direct_model_for(provider_id: str, openrouter_model: Optional[str] = None) -> str:
    """Resolve native model id for direct API calls."""
    env_defaults = {
        "openai": _env("OPENAI_MODEL", "gpt-4o"),
        "google": _env("GOOGLE_MODEL", "gemini-2.0-flash"),
        "anthropic": _env("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
    }
    if provider_id in env_defaults and env_defaults[provider_id]:
        return env_defaults[provider_id]
    if openrouter_model:
        return strip_openrouter_prefix(openrouter_model)
    return env_defaults.get(provider_id, "gpt-4o")


def openrouter_model_for(provider_id: str) -> str:
    env_map = {
        "openai": _env("OPENROUTER_MODEL_OPENAI", "openai/gpt-5.5"),
        "google": _env("OPENROUTER_MODEL_GOOGLE", "google/gemini-3.1-pro-preview"),
        "anthropic": _env(
            "OPENROUTER_MODEL_CLAUDE",
            _env("OPENROUTER_MODEL", "anthropic/claude-opus-4.8"),
        ),
    }
    return env_map.get(provider_id, default_openrouter_model())


def research_provider_chain() -> List[ProviderSlot]:
    """Canonical OpenAI → Google → Anthropic research chain."""
    slots: List[ProviderSlot] = []
    for pid in CORE_PROVIDER_IDS:
        or_model = openrouter_model_for(pid)
        slots.append(
            ProviderSlot(
                provider_id=pid,
                label=_PROVIDER_LABELS[pid],
                openrouter_model=or_model,
                direct_model=direct_model_for(pid, or_model),
            )
        )
    return slots


def research_chain_as_dicts() -> List[dict]:
    """Backward-compatible chain for pipeline hooks (provider + model keys)."""
    return [
        {"provider": s.label, "providerId": s.provider_id, "model": s.openrouter_model}
        for s in research_provider_chain()
    ]


def resolve_transport(
    *,
    provider_id: Optional[str] = None,
    model: Optional[str] = None,
) -> tuple[ProviderId, str, str]:
    """
    Pick transport backend and resolved model ids.

    Returns (transport, model_for_request, logical_provider_id).
    transport is openrouter | openai | google | anthropic
    """
    logical = provider_id or infer_provider_id(model)
    mode = routing_mode()
    use_model = normalize_openrouter_model(model) or model

    if mode == "openrouter":
        if not openrouter_api_key():
            raise ValueError("OPENROUTER_API_KEY required when LLM_ROUTING=openrouter")
        resolved = use_model or default_openrouter_model()
        return "openrouter", resolved, logical or infer_provider_id(resolved) or "openrouter"

    if logical and provider_api_key(logical):
        direct = direct_model_for(logical, model)
        return logical, direct, logical  # type: ignore[return-value]

    if mode == "direct":
        if logical:
            raise ValueError(f"{logical.upper()}_API_KEY required when LLM_ROUTING=direct")
        raise ValueError("LLM_ROUTING=direct requires provider_id or model with known prefix")

    # auto: direct when key exists, else OpenRouter
    if logical and provider_api_key(logical):
        return logical, direct_model_for(logical, model), logical  # type: ignore[return-value]

    if not openrouter_api_key():
        if logical:
            raise ValueError(
                f"No {logical.upper()}_API_KEY and no OPENROUTER_API_KEY — configure agents/.env"
            )
        raise ValueError("OPENROUTER_API_KEY not configured in agents/.env")

    use_model = normalize_openrouter_model(model) or model or default_openrouter_model()
    return "openrouter", use_model, logical or infer_provider_id(use_model) or "openrouter"


def configured_providers() -> dict:
    """Health/diagnostics: which backends are available."""
    out = {
        "routing": routing_mode(),
        "openrouter": bool(openrouter_api_key()),
        "openai": bool(provider_api_key("openai")),
        "google": bool(provider_api_key("google")),
        "anthropic": bool(provider_api_key("anthropic")),
        "researchChain": [s.to_chain_dict() for s in research_provider_chain()],
        "defaultModel": default_openrouter_model(),
    }
    return out
