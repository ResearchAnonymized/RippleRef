"""Tests for large-file refactor feasibility policy."""

from file_size_policy import (
    MAX_LINES_ATTEMPT,
    MAX_LINES_HARD_BLOCK,
    assess_refactor_feasibility,
    build_failure_outcome,
    estimate_tokens,
)


def _fake_java(lines: int) -> str:
    return "\n".join(f"    // line {i}" for i in range(lines))


def test_small_file_invokes_llm():
    f = assess_refactor_feasibility(_fake_java(400))
    assert f["invokeLlm"] is True
    assert f["tier"] == "small"
    assert f["blockCodes"] == []


def test_5000_loc_medium_tier_attempts_llm():
    f = assess_refactor_feasibility(_fake_java(5000))
    assert f["invokeLlm"] is True
    assert f["tier"] == "medium"
    assert f["lines"] == 5000


def test_15000_loc_large_tier_attempts_with_warning():
    f = assess_refactor_feasibility(_fake_java(15000))
    assert f["invokeLlm"] is True
    assert f["tier"] == "large"
    assert any("partial" in w.lower() or "truncat" in w.lower() for w in f["warnings"])


def test_30000_loc_blocked_single_shot():
    f = assess_refactor_feasibility(_fake_java(30000))
    assert f["invokeLlm"] is False
    assert "FILE_EXCEEDS_SINGLE_SHOT_LINE_LIMIT" in f["blockCodes"]


def test_1m_loc_hard_block():
    # Do not allocate 1M lines in memory; test policy math directly
    f = assess_refactor_feasibility("x\n" * 1_000_000)
    assert f["lines"] == 1_000_000
    assert f["invokeLlm"] is False
    assert "FILE_EXCEEDS_HARD_LINE_LIMIT" in f["blockCodes"]
    assert "FILE_EXCEEDS_SINGLE_SHOT_LINE_LIMIT" in f["blockCodes"]


def test_huge_token_estimate_blocks():
    huge = "word " * 700_000
    f = assess_refactor_feasibility(huge)
    assert f["invokeLlm"] is False
    assert "INPUT_EXCEEDS_CONTEXT_WINDOW" in f["blockCodes"]


def test_failure_outcome_preflight_message():
    feas = assess_refactor_feasibility(_fake_java(MAX_LINES_ATTEMPT + 1000))
    fo = build_failure_outcome(feasibility=feas)
    assert fo["llmInvoked"] is False
    assert fo["primaryReason"] == "FILE_EXCEEDS_SINGLE_SHOT_LINE_LIMIT"
    assert "lines" in fo["userMessage"].lower()
    assert len(fo["recommendations"]) >= 1


def test_failure_outcome_context_length():
    fo = build_failure_outcome(
        llm_error_code="context_length_exceeded",
        llm_message="too long",
        original_lines=8000,
    )
    assert fo["llmInvoked"] is True
    assert "context" in fo["userMessage"].lower() or "8000" in fo["userMessage"]


def test_estimate_tokens_positive():
    assert estimate_tokens("abcd") >= 1


if __name__ == "__main__":
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for fn in tests:
        fn()
        print("ok", fn.__name__)
    print(f"all {len(tests)} tests passed")
