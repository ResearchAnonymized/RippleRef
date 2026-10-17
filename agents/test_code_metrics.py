"""Tests for CBO / LCOM research metrics (agents/code_metrics.py)."""
from code_metrics import compute_coupling, compute_cohesion, compute_before_after


SAMPLE = '''
package demo;

import java.util.List;
import java.util.ArrayList;

public class Widget {
    private int count;
    private String name;

    public Widget() {
        this.count = 0;
    }

    public int getCount() {
        return count;
    }

    public void setCount(int c) {
        count = c;
    }

    public String getName() {
        return name;
    }
}
'''

REFACTORED_NO_FIELD = SAMPLE.replace("    private String name;\n\n", "")


def test_coupling_counts_external_types():
    c = compute_coupling(SAMPLE)
    assert c["import_count"] == 2
    assert c["type_references"] >= 1


def test_cohesion_detects_fields_and_methods():
    h = compute_cohesion(SAMPLE)
    assert h["fields"] >= 2  # int count + String name
    assert h["methods"] >= 4
    assert h["lcom"] >= 0


def test_before_after_fields_neutral_improved():
    ba = compute_before_after(SAMPLE, REFACTORED_NO_FIELD)
    fields = ba["cohesion"]["fields"]
    assert fields["before"] == 2
    assert fields["after"] == 1
    assert fields["change"] == -1
    assert fields["improved"] is None


def test_cbo_unchanged_when_imports_unchanged():
    ba = compute_before_after(SAMPLE, SAMPLE)
    assert ba["coupling"]["cbo"]["change"] == 0
    assert ba["coupling"]["import_count"]["change"] == 0
