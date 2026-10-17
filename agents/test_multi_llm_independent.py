"""Tests for independent parallel multi-LLM helpers."""

from multi_llm_independent import _pick_best_independent_candidate


def test_pick_best_by_smell_delta():
    baseline = "class A { void m() {} }"
    runs = [
        {"ok": True, "candidateContent": "class A { void m() { x(); } }", "smellDelta": 1},
        {"ok": True, "candidateContent": "class A { void m() { y(); z(); } }", "smellDelta": 3},
        {"ok": False, "candidateContent": "class A { void n() {} }", "smellDelta": 0},
    ]
    best = _pick_best_independent_candidate(baseline, runs)
    assert "y(); z();" in best


def test_pick_best_falls_back_to_any_changed():
    baseline = "class A {}"
    runs = [
        {"ok": True, "changed": True, "candidateContent": "class A { int x; }", "smellDelta": 0},
    ]
    best = _pick_best_independent_candidate(baseline, runs)
    assert best.strip() != baseline.strip()


if __name__ == "__main__":
    test_pick_best_by_smell_delta()
    test_pick_best_falls_back_to_any_changed()
    print("ok")
