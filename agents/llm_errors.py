"""
Structured LLM / OpenRouter error classification for robust handling and research logging.

OpenRouter uses an OpenAI-compatible API; errors often appear as:
  {"error": {"message": "...", "code": "...", "type": "..."}}
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple


# Stable codes for experiments / papers (keep lowercase snake for JSON)
class LLMErrorCode:
    OK = None  # use None when ok
    MISSING_API_KEY = "missing_api_key"
    LLM_TIMEOUT = "llm_timeout"
    NETWORK_ERROR = "network_error"
    OPENROUTER_AUTH = "openrouter_auth"
    OPENROUTER_RATE_LIMIT = "openrouter_rate_limit"
    OPENROUTER_QUOTA = "openrouter_quota"
    CONTEXT_LENGTH = "context_length_exceeded"
    MODEL_NOT_FOUND = "model_not_found"
    PROVIDER_ERROR = "provider_error"
    PROVIDER_UNAVAILABLE = "provider_unavailable"
    BAD_RESPONSE = "bad_response"
    EMPTY_CONTENT = "empty_content"
    CONTENT_FILTER = "content_filter"
    UNKNOWN_HTTP = "unknown_http_error"
    OUTPUT_TRUNCATED = "output_truncated_max_tokens"


def _truncate(s: Optional[str], max_len: int = 800) -> Optional[str]:
    if s is None:
        return None
    s = s.strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 3] + "..."


def parse_openrouter_error_body(text: str) -> Tuple[Optional[str], str]:
    """Return (error_code_hint, message) from response body JSON or raw text."""
    if not text or not text.strip():
        return None, "Empty error body"
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None, _truncate(text, 500) or "Non-JSON error body"

    err = data.get("error")
    if isinstance(err, dict):
        msg = err.get("message") or err.get("description") or str(err)
        code = str(err.get("code") or err.get("type") or "").lower()
        if "context" in code or "length" in code or "token" in msg.lower() and "limit" in msg.lower():
            return "context", msg
        if "rate" in code or "rate_limit" in msg.lower():
            return "rate", msg
        if "quota" in msg.lower() or "credit" in msg.lower() or "billing" in msg.lower():
            return "quota", msg
        if "content" in code and "policy" in msg.lower():
            return "filter", msg
        return code or None, msg
    if isinstance(err, str):
        return None, err
    return None, _truncate(text, 500) or "Unknown error shape"


def classify_http_error(status_code: int, body: str) -> Tuple[str, str]:
    """Map HTTP status + body to LLMErrorCode and user-facing message."""
    hint, msg = parse_openrouter_error_body(body)
    if status_code == 401:
        return LLMErrorCode.OPENROUTER_AUTH, msg or "Invalid or expired API key"
    if status_code == 402:
        return LLMErrorCode.OPENROUTER_QUOTA, msg or "Payment or quota required"
    if status_code == 429:
        return LLMErrorCode.OPENROUTER_RATE_LIMIT, msg or "Rate limited — retry later"
    if status_code == 404:
        return LLMErrorCode.MODEL_NOT_FOUND, msg or "Model or endpoint not found"
    if status_code == 400 and hint == "context":
        return LLMErrorCode.CONTEXT_LENGTH, msg or "Request too large for model context window"
    if status_code == 400 and "context" in (msg or "").lower():
        return LLMErrorCode.CONTEXT_LENGTH, msg or "Context length exceeded"
    if status_code == 400:
        return LLMErrorCode.PROVIDER_ERROR, msg or "Bad request to provider"
    if status_code in (502, 503, 504):
        return LLMErrorCode.PROVIDER_UNAVAILABLE, msg or "Provider temporarily unavailable"
    if status_code >= 500:
        return LLMErrorCode.PROVIDER_ERROR, msg or msg or f"Provider error HTTP {status_code}"
    return LLMErrorCode.UNKNOWN_HTTP, msg or f"HTTP {status_code}"


@dataclass
class LLMRefactorOutcome:
    """Result of a single OpenRouter chat completion for refactoring."""

    ok: bool
    content: str
    message: str = ""
    error_code: Optional[str] = None
    http_status: Optional[int] = None
    finish_reason: Optional[str] = None
    usage: Optional[Dict[str, Any]] = None
    provider_error_snippet: Optional[str] = None
    truncated_output: bool = False
    model: Optional[str] = None

    def to_experiment_dict(self) -> Dict[str, Any]:
        """Compact dict for logging / research pipelines."""
        out = {
            "llmOk": self.ok,
            "llmErrorCode": self.error_code,
            "llmMessage": self.message,
            "httpStatus": self.http_status,
            "finishReason": self.finish_reason,
            "truncatedOutput": self.truncated_output,
            "usage": self.usage,
            "model": self.model,
            "providerErrorSnippet": self.provider_error_snippet,
            "contentChars": len(self.content or ""),
        }
        if self.ok and self.truncated_output:
            out["llmWarningCode"] = LLMErrorCode.OUTPUT_TRUNCATED
        return out
