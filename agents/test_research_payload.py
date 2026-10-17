#!/usr/bin/env python3
"""Tests for build_pass_research_metrics (full per-LLM pass payload)."""

from research_payload import build_pass_research_metrics


def _minimal_analysis():
    return {
        "summary": {
            "refactoring_successful": True,
            "overall_score": 72.0,
            "key_achievements": ["Reduced smells"],
            "concerns": [],
        },
        "improvements": {
            "code_smells": {"before": 5, "after": 3, "reduced": 2, "improvement_percent": 40.0},
            "structural_changes": {
                "methods_extracted": 1,
                "methods_renamed": 0,
                "classes_split": 0,
                "duplicate_code_removed": False,
                "naming_improved": True,
            },
        },
        "behavioral_correctness": {
            "behavioral_correct": True,
            "method_signatures_preserved": True,
            "exception_handling_preserved": True,
            "framework_contracts_preserved": True,
            "conditional_logic_preserved": True,
            "critical_method_calls_preserved": True,
        },
        "refactoring_practices": {"practices_applied": ["extract_method"]},
        "metrics": {
            "complexity": {"before": 10, "after": 8, "improved": True},
            "maintainability": {"before": 50, "after": 55, "improved": True},
            "lines_of_code": {"before": 100, "after": 98, "improved": True},
            "methods": {"before": 5, "after": 6, "improved": True},
            "halstead": {"volume": {"before": 1, "after": 0.9, "change": -0.1, "improved": True}},
            "coupling": {"cbo": {"before": 3, "after": 2, "change": -1, "improved": True}},
            "cohesion": {"lcom": {"before": 1, "after": 0.5, "change": -0.5, "improved": True}},
            "nesting_depth": {"max": {"before": 4, "after": 3, "change": -1, "improved": True}},
            "method_lengths": {"mean": {"before": 20, "after": 18, "change": -2, "improved": True}},
            "diff_churn": {"lines_added": 2, "lines_removed": 4, "churn_rate_percent": 3.0},
            "semantic_preservation": {"overall_preservation_rate": 0.95},
            "token_efficiency": {"total_tokens": 1000, "cost_usd": 0.01},
        },
        "smell_resolution": {
            "by_type": {
                "LongMethod": {
                    "before": 2,
                    "after": 1,
                    "resolved": 1,
                    "introduced": 0,
                    "net_change": -1,
                    "resolution_rate": 0.5,
                }
            },
            "total_before": 5,
            "total_after": 3,
            "overall_resolution_rate": 0.4,
        },
    }


def test_build_pass_research_metrics_has_all_sections():
    rm = build_pass_research_metrics(
        file_path="src/Foo.java",
        pass_input="class Foo { void a() {} void b() {} }",
        pass_output="class Foo { void a() { helper(); } void helper() {} void b() {} }",
        analysis_result=_minimal_analysis(),
        original_smells=[{"severity": "MAJOR"}] * 5,
        refactored_smells=[{"severity": "MAJOR"}] * 3,
        before_smell_count=5,
        after_smell_count=3,
        quality_before={"complexity": 10, "maintainability": 50, "testability": 40},
        quality_after={"complexity": 8, "maintainability": 55, "testability": 45},
        provider="OpenAI",
        model="openai/gpt-5.5",
        pass_index=0,
        verify_accepted=True,
    )
    assert rm.get("comparison"), "missing comparison"
    assert rm.get("behavioral"), "missing behavioral"
    behavioral = rm.get("behavioral") or {}
    assert behavioral.get("checks"), "missing behavioral checks for export"
    assert len(behavioral["checks"]) >= 6
    assert behavioral["checks"][0].get("why_pass") or behavioral["checks"][0].get("status") == "pass"
    assert rm.get("structural") is not None or rm.get("practices_applied") is not None
    assert rm.get("practices_applied") == ["extract_method"]
    assert rm.get("halstead")
    assert rm.get("smell_resolution")
    meta = rm.get("meta") or {}
    assert meta.get("llmProvider") == "OpenAI"
    assert meta.get("passIndex") == 0
    assert meta.get("passScope") == "multi_llm_chain"
    print("test_build_pass_research_metrics_has_all_sections: PASS")


if __name__ == "__main__":
    test_build_pass_research_metrics_has_all_sections()
