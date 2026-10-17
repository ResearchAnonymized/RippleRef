"""Tests for unified planning and verification gates."""
from planning import build_rule_refactoring_plan
from verification_gates import evaluate_verification_gates, apply_llm_verifier_to_accept


def _map_smell(detector_id: str, summary: str):
    return {"technique": "Extract Method", "action": f"Fix {detector_id}"}


def _norm(sev):
    return str(sev.get("severity", "MINOR")).upper()


def test_build_rule_refactoring_plan():
    smells = [
        {"detectorId": "LONG_METHOD", "severity": "MAJOR", "startLine": 10, "endLine": 50, "description": "long"},
    ]
    plan, meta = build_rule_refactoring_plan(
        smells,
        map_smell_to_refactoring=_map_smell,
        normalize_severity=_norm,
    )
    assert len(plan) == 1
    assert plan[0]["smellId"] == "LONG_METHOD"
    assert meta["highPriority"] == 1


def test_verification_gates_reject_identical():
    code = "public class A { public void m() {} }"
    gates = evaluate_verification_gates(
        original=code,
        candidate=code,
        before_count=5,
        after_count=5,
        build_public_api_signature=lambda c: ["void m()"],
        has_empty_catch=lambda c: False,
    )
    assert gates.accept is False
    assert "too_similar" in gates.rejection_reasons[0]


def test_apply_llm_verifier_rejects():
    accept, reasons = apply_llm_verifier_to_accept(True, [], {"approved": False})
    assert accept is False
    assert "llm_verifier_rejected" in reasons
