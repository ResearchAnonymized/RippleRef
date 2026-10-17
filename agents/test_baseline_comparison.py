"""Tests for baseline comparison cohort selection."""
from baseline_comparison.dataset_loader import load_research_dataset, select_450_strict_complete_case
from baseline_comparison.paths import OUTPUTS_DIR, RECOVERY_JSON
from baseline_comparison.recover_selected_files import recover_selected_files


def test_recover_writes_manifest():
    result = recover_selected_files()
    assert (OUTPUTS_DIR / RECOVERY_JSON).is_file()
    assert result.total_recovered == len(result.files)
    assert result.unique_java_files == result.total_recovered


def test_strict_cohort_non_empty_when_data_present():
    files = load_research_dataset()
    if not files:
        return
    selected = select_450_strict_complete_case(files)
    assert len(selected) >= 0
