"""
Shared LLM helper for LLM-based agents (Planner, Verifier, Refactorer transport).

All HTTP calls delegate to llm_client.chat_completion() — OpenRouter or direct APIs.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from llm_client import chat_completion
from llm_errors import LLMErrorCode
from llm_provider_config import default_openrouter_model


@dataclass
class LLMAgentOutcome:
    ok: bool
    agent: str
    content: str = ""
    parsed: Optional[Any] = None
    error_code: Optional[str] = None
    message: str = ""
    model: str = ""
    usage: Optional[Dict[str, Any]] = None
    http_status: Optional[int] = None
    transport: str = ""
    logical_provider: Optional[str] = None

    def to_experiment_dict(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {
            "agent": self.agent,
            "ok": self.ok,
            "model": self.model,
            "message": self.message,
            "transport": self.transport,
        }
        if self.logical_provider:
            out["providerId"] = self.logical_provider
        if self.error_code:
            out["errorCode"] = self.error_code
        if self.usage:
            out["usage"] = self.usage
        if self.parsed is not None:
            out["parsed"] = self.parsed
        if self.content and not self.ok:
            out["contentSnippet"] = self.content[:500]
        return out


def _extract_json_block(text: str) -> Optional[Any]:
    if not text:
        return None
    stripped = text.strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", stripped, re.IGNORECASE)
    if fence:
        try:
            return json.loads(fence.group(1).strip())
        except json.JSONDecodeError:
            pass
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(stripped[start : end + 1])
        except json.JSONDecodeError:
            pass
    start = stripped.find("[")
    end = stripped.rfind("]")
    if start >= 0 and end > start:
        try:
            return json.loads(stripped[start : end + 1])
        except json.JSONDecodeError:
            pass
    return None


async def call_llm_agent(
    *,
    agent: str,
    system: str,
    user: str,
    model: Optional[str] = None,
    provider_id: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: int = 4096,
    expect_json: bool = False,
    timeout_seconds: int = 180,
) -> LLMAgentOutcome:
    """Unified LLM call for Planner / Verifier agents."""
    use_model = model or default_openrouter_model()
    result = await chat_completion(
        system=system,
        user=user,
        model=use_model,
        provider_id=provider_id,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout_seconds=timeout_seconds,
    )

    if not result.ok:
        return LLMAgentOutcome(
            ok=False,
            agent=agent,
            content=result.content,
            error_code=result.error_code,
            message=result.message,
            model=result.model or use_model,
            http_status=result.http_status,
            transport=result.transport,
            logical_provider=result.logical_provider,
        )

    parsed = _extract_json_block(result.content) if expect_json else None
    if expect_json and parsed is None:
        return LLMAgentOutcome(
            ok=False,
            agent=agent,
            content=result.content,
            error_code=LLMErrorCode.BAD_RESPONSE,
            message=f"{agent} did not return parseable JSON",
            model=result.model or use_model,
            usage=result.usage,
            http_status=result.http_status,
            transport=result.transport,
            logical_provider=result.logical_provider,
        )

    return LLMAgentOutcome(
        ok=True,
        agent=agent,
        content=result.content,
        parsed=parsed,
        model=result.model or use_model,
        usage=result.usage,
        http_status=result.http_status,
        transport=result.transport,
        logical_provider=result.logical_provider,
    )


# Backward-compatible alias
async def call_openrouter_agent(
    *,
    agent: str,
    system: str,
    user: str,
    model: Optional[str] = None,
    provider_id: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: int = 4096,
    expect_json: bool = False,
    timeout_seconds: int = 180,
) -> LLMAgentOutcome:
    return await call_llm_agent(
        agent=agent,
        system=system,
        user=user,
        model=model,
        provider_id=provider_id,
        temperature=temperature,
        max_tokens=max_tokens,
        expect_json=expect_json,
        timeout_seconds=timeout_seconds,
    )
