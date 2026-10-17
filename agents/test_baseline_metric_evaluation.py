"""Tests for REFINE-aligned baseline metric evaluation."""
from baseline_comparison.metric_evaluation import (
    flatten_comparison_metrics,
    validate_before_alignment,
)
from research_payload import build_pass_research_metrics
from test_research_payload import _minimal_analysis


def _sample_rm():
    return build_pass_research_metrics(
        file_path="src/Foo.java",
        pass_input="class Foo {}",
        pass_output="class Foo { void a() {} }",
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
    )


def test_flatten_comparison_has_improvement_not_just_after():
    flat = flatten_comparison_metrics(_sample_rm())
    assert flat["pmd_smells_before"] == 5
    assert flat["pmd_smells_after"] == 3
    assert flat["pmd_smells_improvement"] == 2
    assert flat["complexity_improvement"] == 2


def test_validate_before_alignment_flags_mismatch():
    base = {"pmd_smells_before": 5, "loc_before": 100, "complexity_before": 10}
    refine = {"pmd_smells_before": 4, "loc_before": 100, "complexity_before": 10}
    v = validate_before_alignment(
        baseline_before=base,
        refine_before=refine,
        baseline_original_sha256="a",
        refine_original_sha256="a",
    )
    assert v["same_before_total_findings"] is False
    assert v["same_before_loc"] is True
    assert "pmd_smells_before" in v["before_metric_mismatch_notes"]


def test_validate_before_alignment_passes_when_aligned():
    metrics = {
        "pmd_smells_before": 7,
        "loc_before": 120,
        "complexity_before": 11,
        "maintainability_before": 50,
        "testability_before": 40,
        "method_count_before": 5,
    }
    v = validate_before_alignment(
        baseline_before=metrics,
        refine_before=dict(metrics),
        baseline_original_sha256="same",
        refine_original_sha256="same",
    )
    assert v["same_before_total_findings"] is True
    assert v["same_before_metrics"] is True
    assert v["before_metric_mismatch_notes"] == ""
