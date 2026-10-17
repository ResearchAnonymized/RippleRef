"""Tests for 150-file stratified baseline sampling."""
from baseline_comparison.stratified_sample_150 import (
    FILES_PER_SYSTEM,
    TARGET_TOTAL,
    allocate_across_cells,
    smell_stratum,
    stratified_pick_per_system,
)
import random


def test_allocate_across_cells_sums_to_target():
    cells = [("low|small", 5), ("mid|medium", 10), ("high|large", 3)]
    alloc = allocate_across_cells(cells, 10)
    assert sum(alloc.values()) == 10


def test_smell_strata():
    assert smell_stratum(3) == "low"
    assert smell_stratum(20) == "mid"
    assert smell_stratum(80) == "high"


def test_stratified_pick_per_system_count():
    records = [
        {"file_path": f"f{i}.java", "refine_pmd_before": i * 5, "refine_loc_before": 100 + i * 50}
        for i in range(30)
    ]
    rng = random.Random(42)
    picked = stratified_pick_per_system(records, FILES_PER_SYSTEM, rng)
    assert len(picked) == FILES_PER_SYSTEM
    assert len({r["file_path"] for r in picked}) == FILES_PER_SYSTEM
