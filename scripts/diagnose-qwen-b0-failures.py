#!/usr/bin/env python3
"""Summarize Qwen B0 parsing failures for RQ3/RQ4 pairing decisions."""
from __future__ import annotations

import csv
import os
from collections import Counter
from pathlib import Path

QWEN = "qwen/qwen3.6-plus"


def study_csv(study_id: str) -> Path:
    base = os.environ.get("EMSE_STUDY_BASE") or os.path.join(
        os.environ.get("TMPDIR", "/tmp"), "refactai/workspaces/ripple_study_runs"
    )
    return Path(base) / study_id / "results_candidates.csv"


def main() -> None:
    b0 = study_csv("ripple_ref_master")
    ma = study_csv("ma_ref_master")
    if not b0.is_file():
        print(f"Missing {b0}")
        return
    b0_rows = list(csv.DictReader(open(b0, encoding="utf-8")))
    ma_rows = list(csv.DictReader(open(ma, encoding="utf-8"))) if ma.is_file() else []

    qwen_v2 = [r for r in b0_rows if r.get("model_id") == QWEN and r.get("variant") == "V2"]
    qwen_v1 = [r for r in b0_rows if r.get("model_id") == QWEN and r.get("variant") == "V1"]
    print("=== Qwen B0-V2 ===")
    print("Status:", dict(Counter(r.get("status", "") for r in qwen_v2)))
    print("Total:", len(qwen_v2))
    errors = Counter((r.get("error") or "no_error")[:120] for r in qwen_v2 if r.get("status", "").startswith("failed"))
    print("Top errors:")
    for e, n in errors.most_common(10):
        print(f"  {n:3d}  {e}")

    ma_qwen = [r for r in ma_rows if r.get("model_id") == QWEN and r.get("status") == "completed"]
    b0_qwen_ok = [r for r in qwen_v2 if r.get("status") == "completed"]
    print("\n=== Qwen pairing (file×model) ===")
    print(f"MA completed: {len(ma_qwen)}")
    print(f"B0-V2 completed: {len(b0_qwen_ok)}")
    print(f"B0-V2 failed_parsing: {sum(1 for r in qwen_v2 if r.get('status') == 'failed_parsing')}")

    def key(r):
        return f"{r['project_id']}|{r['file_path']}|{r['model_id']}"

    ma_keys = {key(r) for r in ma_qwen}
    b0_keys = {key(r) for r in b0_qwen_ok}
    print(f"Paired Qwen complete: {len(ma_keys & b0_keys)}")
    print(f"MA-only (B0 parse fail): {len(ma_keys - b0_keys)}")

    print("\n=== Recommendation ===")
    fail_rate = sum(1 for r in qwen_v2 if r.get("status") == "failed_parsing") / max(1, len(qwen_v2))
    if fail_rate >= 0.9:
        print("Exclude Qwen from paired RQ3 primary analysis OR rerun B0 with fixed parser/prompt.")
        print("Document as model-specific generation failure (wiki/EMSE_Experimental_Setting.md).")
    elif fail_rate > 0:
        print("Use paired_complete=1 subset; report attrition for Qwen explicitly.")


if __name__ == "__main__":
    main()
