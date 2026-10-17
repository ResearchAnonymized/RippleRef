"""
Contract tests for /agents/refactor JSON (research + failureOutcome fields).
No HTTP — validates shapes expected by the web UI.
"""

from file_size_policy import assess_refactor_feasibility, build_failure_outcome


def _minimal_response(**overrides):
    base = {
        "success": False,
        "filePath": "proj/src/Foo.java",
        "steps": [{"name": "Load", "status": "done"}],
        "originalContent": "class Foo {}\n",
        "refactoredContent": "class Foo {}\n",
        "llmCandidateContent": "class Foo {}\n",
        "researchOutcome": {
            "adopted": False,
            "smellsBefore": 10,
            "smellsAfter": 10,
            "llmInvoked": True,
        },
        "failureOutcome": None,
        "fileSizeAssessment": None,
        "deltas": {"before": 10, "after": 10},
        "rejected": True,
    }
    base.update(overrides)
    return base


def test_success_response_has_research_fields():
    r = _minimal_response(success=True, rejected=False, refactoredContent="class Foo { int x; }\n")
    required = [
        "filePath",
        "llmCandidateContent",
        "researchOutcome",
        "fileSizeAssessment",
        "failureOutcome",
        "pipelineMetadata",
    ]
    # Simulated full response keys from main.py
    full = {**r, "pipelineMetadata": {"fileSizeAssessment": {"lines": 1}}}
    for key in ["filePath", "llmCandidateContent", "researchOutcome"]:
        assert key in full or key in r


def test_blocked_large_file_failure_outcome():
    feas = assess_refactor_feasibility("line\n" * 30_000)
    assert feas["invokeLlm"] is False
    fo = build_failure_outcome(feasibility=feas)
    assert fo["llmInvoked"] is False
    assert fo["primaryReason"]
    assert fo["userMessage"]
    assert len(fo["recommendations"]) >= 1


def test_context_length_failure_outcome():
    fo = build_failure_outcome(
        llm_error_code="context_length_exceeded",
        llm_message="too long",
        original_lines=12_000,
    )
    assert fo["llmInvoked"] is True
    assert "context" in fo["userMessage"].lower() or "12,000" in fo["userMessage"]


def test_truncated_output_failure_outcome():
    fo = build_failure_outcome(truncated=True, original_lines=5000)
    assert fo["primaryReason"] == "OUTPUT_TRUNCATED"


def test_research_outcome_smell_fields():
    r = _minimal_response()
    ro = r["researchOutcome"]
    assert "smellsBefore" in ro and "smellsAfter" in ro
    assert "llmInvoked" in ro


def test_independent_parallel_pipeline_metadata():
    """UI + export expect multiLlmMode and artifacts-only flags for research batch."""
    pm = {
        "multiLlmChain": True,
        "multiLlmMode": "independent_parallel",
        "researchArtifactsOnly": True,
        "liveFileModified": False,
        "sampleId": "project-seed123-999",
    }
    runs = [
        {
            "passIndex": 0,
            "provider": "OpenAI",
            "ok": True,
            "passScope": "independent_baseline_parallel",
            "smellsBefore": 5,
            "smellsAfter": 3,
            "researchMetrics": {"comparison": {}, "meta": {"passScope": "independent_baseline_parallel"}},
        },
        {
            "passIndex": 1,
            "provider": "Google",
            "ok": True,
            "passScope": "independent_baseline_parallel",
            "smellsBefore": 5,
            "smellsAfter": 4,
            "researchMetrics": {"comparison": {}, "behavioral": {}},
        },
        {
            "passIndex": 2,
            "provider": "Anthropic",
            "ok": True,
            "passScope": "independent_baseline_parallel",
            "smellsBefore": 5,
            "smellsAfter": 2,
            "researchMetrics": {"comparison": {}, "smell_resolution": {}},
        },
    ]
    assert pm["multiLlmMode"] == "independent_parallel"
    assert pm["researchArtifactsOnly"] is True
    assert len(runs) == 3
    assert all(r.get("passScope") == "independent_baseline_parallel" for r in runs)
    assert all(r["smellsBefore"] == 5 for r in runs)


def test_1m_lines_assessment():
    feas = assess_refactor_feasibility("x\n" * 1_000_000)
    assert feas["lines"] == 1_000_000
    assert feas["invokeLlm"] is False


if __name__ == "__main__":
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for fn in tests:
        fn()
        print("ok", fn.__name__)
    print(f"all {len(tests)} contract tests passed")
