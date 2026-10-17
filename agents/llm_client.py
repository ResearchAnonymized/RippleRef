"""
Unified LLM chat transport for the agentic pipeline.

All LLM agents (Planner, Refactorer, Verifier) and research multi-provider runs
route through chat_completion() — OpenRouter or direct OpenAI / Google / Anthropic APIs.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional, Union

import httpx

from llm_errors import LLMErrorCode, classify_http_error
from llm_provider_config import (
    openrouter_api_key,
    openrouter_url,
    provider_api_key,
    resolve_transport,
)


@dataclass
class ChatCompletionResult:
    ok: bool
    content: str
    message: str = ""
    error_code: Optional[str] = None
    http_status: Optional[int] = None
    finish_reason: Optional[str] = None
    usage: Optional[Dict[str, Any]] = None
    truncated_output: bool = False
    model: str = ""
    transport: str = ""
    logical_provider: Optional[str] = None
    provider_error_snippet: Optional[str] = None

    def to_refactor_outcome(self):
        from llm_errors import LLMRefactorOutcome

        return LLMRefactorOutcome(
            ok=self.ok,
            content=self.content,
            message=self.message,
            error_code=self.error_code,
            http_status=self.http_status,
            finish_reason=self.finish_reason,
            usage=self.usage,
            truncated_output=self.truncated_output,
            model=self.model,
            provider_error_snippet=self.provider_error_snippet,
        )


def _missing_key_message(transport: str) -> ChatCompletionResult:
    key_names = {
        "openrouter": "OPENROUTER_API_KEY",
        "openai": "OPENAI_API_KEY",
        "google": "GOOGLE_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
    }
    return ChatCompletionResult(
        ok=False,
        content="",
        error_code=LLMErrorCode.MISSING_API_KEY,
        message=f"{key_names.get(transport, 'API key')} not configured in agents/.env",
        transport=transport,
    )


def _parse_openai_compatible(
    data: Dict[str, Any],
    *,
    transport: str,
    model: str,
    logical_provider: Optional[str],
    http_status: int,
) -> ChatCompletionResult:
    choices = data.get("choices") or []
    if not choices:
        return ChatCompletionResult(
            ok=False,
            content="",
            error_code=LLMErrorCode.EMPTY_CONTENT,
            message=f"{transport} returned no choices",
            http_status=http_status,
            model=model,
            transport=transport,
            logical_provider=logical_provider,
        )

    choice0 = choices[0] or {}
    content = (choice0.get("message") or {}).get("content") or ""
    finish_reason = (choice0.get("finish_reason") or "").strip().lower()
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else None

    if finish_reason in ("content_filter", "blocked"):
        return ChatCompletionResult(
            ok=False,
            content=content,
            error_code=LLMErrorCode.CONTENT_FILTER,
            message="Model refused or filtered the output (content policy).",
            http_status=http_status,
            finish_reason=finish_reason,
            usage=usage,
            model=model,
            transport=transport,
            logical_provider=logical_provider,
        )

    if not content.strip():
        return ChatCompletionResult(
            ok=False,
            content="",
            error_code=LLMErrorCode.EMPTY_CONTENT,
            message="Model returned an empty message.",
            http_status=http_status,
            finish_reason=finish_reason or None,
            usage=usage,
            model=model,
            transport=transport,
            logical_provider=logical_provider,
        )

    truncated = finish_reason == "length"
    msg = "Completion received."
    if truncated:
        msg = "Completion hit max_tokens limit — output may be incomplete."

    return ChatCompletionResult(
        ok=True,
        content=content,
        message=msg,
        http_status=http_status,
        finish_reason=finish_reason or None,
        usage=usage,
        truncated_output=truncated,
        model=model,
        transport=transport,
        logical_provider=logical_provider,
    )


async def _http_post(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: Dict[str, str],
    payload: Dict[str, Any],
    transport: str,
    model: str,
    logical_provider: Optional[str],
    params: Optional[Dict[str, str]] = None,
) -> Union[ChatCompletionResult, httpx.Response]:
    try:
        r = await client.post(url, headers=headers, json=payload, params=params)
    except httpx.TimeoutException:
        return ChatCompletionResult(
            ok=False,
            content="",
            error_code=LLMErrorCode.LLM_TIMEOUT,
            message=f"LLM request timed out ({transport})",
            model=model,
            transport=transport,
            logical_provider=logical_provider,
        )
    except httpx.RequestError as exc:
        return ChatCompletionResult(
            ok=False,
            content="",
            error_code=LLMErrorCode.NETWORK_ERROR,
            message=f"Could not reach {transport} API: {exc}",
            model=model,
            transport=transport,
            logical_provider=logical_provider,
            provider_error_snippet=str(exc)[:500],
        )

    body_text = r.text or ""
    if r.status_code != 200:
        code, msg = classify_http_error(r.status_code, body_text)
        if r.status_code == 404 and transport == "openrouter" and "no endpoints found" in body_text.lower():
            msg = (
                f"OpenRouter returned 404: no endpoint for model '{model}'. "
                "Check OPENROUTER_MODEL_* in agents/.env against openrouter.ai/models."
            )
        return ChatCompletionResult(
            ok=False,
            content="",
            error_code=code,
            message=msg,
            http_status=r.status_code,
            model=model,
            transport=transport,
            logical_provider=logical_provider,
            provider_error_snippet=body_text[:800],
        )
    return r


async def _call_openrouter(
    client: httpx.AsyncClient,
    *,
    system: str,
    user: str,
    model: str,
    temperature: float,
    max_tokens: int,
    logical_provider: Optional[str],
) -> ChatCompletionResult:
    key = openrouter_api_key()
    if not key:
        return _missing_key_message("openrouter")

    url = openrouter_url()
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    result = await _http_post(
        client, url, headers=headers, payload=payload,
        transport="openrouter", model=model, logical_provider=logical_provider,
    )
    if isinstance(result, ChatCompletionResult):
        return result
    try:
        data = result.json()
    except Exception as je:
        return ChatCompletionResult(
            ok=False, content="", error_code=LLMErrorCode.BAD_RESPONSE,
            message=f"Invalid JSON from OpenRouter: {je}", model=model,
            transport="openrouter", logical_provider=logical_provider,
        )
    return _parse_openai_compatible(
        data, transport="openrouter", model=model,
        logical_provider=logical_provider, http_status=result.status_code,
    )


async def _call_openai(
    client: httpx.AsyncClient,
    *,
    system: str,
    user: str,
    model: str,
    temperature: float,
    max_tokens: int,
    logical_provider: Optional[str],
) -> ChatCompletionResult:
    key = provider_api_key("openai")
    if not key:
        return _missing_key_message("openai")

    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    result = await _http_post(
        client, url, headers=headers, payload=payload,
        transport="openai", model=model, logical_provider=logical_provider,
    )
    if isinstance(result, ChatCompletionResult):
        return result
    try:
        data = result.json()
    except Exception as je:
        return ChatCompletionResult(
            ok=False, content="", error_code=LLMErrorCode.BAD_RESPONSE,
            message=f"Invalid JSON from OpenAI: {je}", model=model,
            transport="openai", logical_provider=logical_provider,
        )
    return _parse_openai_compatible(
        data, transport="openai", model=model,
        logical_provider=logical_provider, http_status=result.status_code,
    )


async def _call_anthropic(
    client: httpx.AsyncClient,
    *,
    system: str,
    user: str,
    model: str,
    temperature: float,
    max_tokens: int,
    logical_provider: Optional[str],
) -> ChatCompletionResult:
    key = provider_api_key("anthropic")
    if not key:
        return _missing_key_message("anthropic")

    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "temperature": temperature,
    }
    result = await _http_post(
        client, url, headers=headers, payload=payload,
        transport="anthropic", model=model, logical_provider=logical_provider,
    )
    if isinstance(result, ChatCompletionResult):
        return result

    try:
        data = result.json()
    except Exception as je:
        return ChatCompletionResult(
            ok=False, content="", error_code=LLMErrorCode.BAD_RESPONSE,
            message=f"Invalid JSON from Anthropic: {je}", model=model,
            transport="anthropic", logical_provider=logical_provider,
        )

    blocks = data.get("content") or []
    content = "".join(
        b.get("text") or "" for b in blocks
        if isinstance(b, dict) and b.get("type") == "text"
    )
    stop = (data.get("stop_reason") or "").lower()
    usage_raw = data.get("usage") or {}
    usage = {
        "prompt_tokens": usage_raw.get("input_tokens"),
        "completion_tokens": usage_raw.get("output_tokens"),
        "total_tokens": (usage_raw.get("input_tokens") or 0) + (usage_raw.get("output_tokens") or 0),
    }
    truncated = stop == "max_tokens"

    if not content.strip():
        return ChatCompletionResult(
            ok=False, content="", error_code=LLMErrorCode.EMPTY_CONTENT,
            message="Anthropic returned empty content", model=model, transport="anthropic",
            logical_provider=logical_provider, finish_reason=stop or None, usage=usage,
        )

    msg = "Completion received."
    if truncated:
        msg = "Completion hit max_tokens limit — output may be incomplete."

    return ChatCompletionResult(
        ok=True, content=content, message=msg, model=model, transport="anthropic",
        logical_provider=logical_provider, finish_reason=stop or None, usage=usage,
        truncated_output=truncated, http_status=result.status_code,
    )


async def _call_google(
    client: httpx.AsyncClient,
    *,
    system: str,
    user: str,
    model: str,
    temperature: float,
    max_tokens: int,
    logical_provider: Optional[str],
) -> ChatCompletionResult:
    key = provider_api_key("google")
    if not key:
        return _missing_key_message("google")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    headers = {"Content-Type": "application/json"}
    params = {"key": key}
    combined = f"{system}\n\n{user}" if system else user
    payload = {
        "contents": [{"role": "user", "parts": [{"text": combined}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        },
    }
    result = await _http_post(
        client, url, headers=headers, payload=payload, params=params,
        transport="google", model=model, logical_provider=logical_provider,
    )
    if isinstance(result, ChatCompletionResult):
        return result

    try:
        data = result.json()
    except Exception as je:
        return ChatCompletionResult(
            ok=False, content="", error_code=LLMErrorCode.BAD_RESPONSE,
            message=f"Invalid JSON from Google: {je}", model=model,
            transport="google", logical_provider=logical_provider,
        )

    candidates = data.get("candidates") or []
    if not candidates:
        return ChatCompletionResult(
            ok=False, content="", error_code=LLMErrorCode.EMPTY_CONTENT,
            message="Google returned no candidates", model=model, transport="google",
            logical_provider=logical_provider,
        )

    parts = ((candidates[0] or {}).get("content") or {}).get("parts") or []
    content = "".join(p.get("text", "") for p in parts if isinstance(p, dict))
    finish = ((candidates[0] or {}).get("finishReason") or "").lower()
    usage_meta = data.get("usageMetadata") or {}
    usage = {
        "prompt_tokens": usage_meta.get("promptTokenCount"),
        "completion_tokens": usage_meta.get("candidatesTokenCount"),
        "total_tokens": usage_meta.get("totalTokenCount"),
    }
    truncated = finish in ("max_tokens", "max_output_tokens")

    if not content.strip():
        return ChatCompletionResult(
            ok=False, content="", error_code=LLMErrorCode.EMPTY_CONTENT,
            message="Google returned empty content", model=model, transport="google",
            logical_provider=logical_provider, finish_reason=finish or None, usage=usage,
        )

    msg = "Completion received."
    if truncated:
        msg = "Completion hit max output tokens — output may be incomplete."

    return ChatCompletionResult(
        ok=True, content=content, message=msg, model=model, transport="google",
        logical_provider=logical_provider, finish_reason=finish or None, usage=usage,
        truncated_output=truncated, http_status=result.status_code,
    )


async def chat_completion(
    *,
    system: str,
    user: str,
    model: Optional[str] = None,
    provider_id: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: int = 4096,
    timeout_seconds: int = 180,
) -> ChatCompletionResult:
    """
    Single entry point for all LLM chat calls in the agent pipeline.

    provider_id: logical provider (openai|google|anthropic) for research slots.
    model: OpenRouter slug or direct model id (resolved by llm_provider_config).
    """
    try:
        transport, resolved_model, logical = resolve_transport(
            provider_id=provider_id,
            model=model,
        )
    except ValueError as exc:
        return ChatCompletionResult(
            ok=False,
            content="",
            error_code=LLMErrorCode.MISSING_API_KEY,
            message=str(exc),
            model=model or "",
            transport=provider_id or "openrouter",
            logical_provider=provider_id,
        )

    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        if transport == "openrouter":
            return await _call_openrouter(
                client, system=system, user=user, model=resolved_model,
                temperature=temperature, max_tokens=max_tokens,
                logical_provider=logical,
            )
        if transport == "openai":
            return await _call_openai(
                client, system=system, user=user, model=resolved_model,
                temperature=temperature, max_tokens=max_tokens,
                logical_provider=logical,
            )
        if transport == "anthropic":
            return await _call_anthropic(
                client, system=system, user=user, model=resolved_model,
                temperature=temperature, max_tokens=max_tokens,
                logical_provider=logical,
            )
        if transport == "google":
            return await _call_google(
                client, system=system, user=user, model=resolved_model,
                temperature=temperature, max_tokens=max_tokens,
                logical_provider=logical,
            )

    return ChatCompletionResult(
        ok=False,
        content="",
        error_code=LLMErrorCode.PROVIDER_ERROR,
        message=f"Unknown transport: {transport}",
        model=resolved_model,
        transport=str(transport),
        logical_provider=logical,
    )
