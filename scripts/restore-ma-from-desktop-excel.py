#!/usr/bin/env python3
"""Restore ma_ref_master/results_candidates.csv from Desktop EMSE master workbook."""
from __future__ import annotations

import csv
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

OLD_QWEN = "qwen/qwen-3.6-plus"
NEW_QWEN = "qwen/qwen3.6-plus"

CSV_COLUMNS = [
    "study_id",
    "project_id",
    "file_path",
    "model_id",
    "variant",
    "pair_key",
    "status",
    "risk_level",
    "contract_risk_level",
    "observed_risk_level",
    "verification_level",
    "callers_checked",
    "observed_broken_caller_count",
    "compile_probe_status",
    "behavioral_correct",
    "adoption_class",
    "test_probe_status",
    "tests_passed",
    "tests_failed",
    "risk_reasons",
    "smell_before",
    "smell_after",
    "fan_in_before",
    "fan_out_before",
    "fan_out_after",
    "fan_out_delta",
    "caller_used_api_count_before",
    "public_api_count_before",
    "latency_ms",
    "prompt_tokens",
    "completion_tokens",
    "error",
    "completed_at",
    "orchestration",
    "graph_version",
    "multi_llm_agent_mode",
    "agent_step_count",
    "llm_plan_status",
    "llm_verify_approved",
    "static_verify_accept",
    "cohort_id",
    "test_probe_before_status",
    "tests_passed_before",
    "tests_failed_before",
    "test_regression",
    "test_probe_strategy",
    "downstream_caller_count_before",
    "lines_added",
    "lines_removed",
    "churn",
    "methods_added",
    "methods_removed",
]

EXCEL_TO_CSV = {
    "study_id": "study_id",
    "project_id": "project_id",
    "file_path": "file_path",
    "model_id": "model_id",
    "variant": "variant",
    "pair_key": "pair_key",
    "status": "status",
    "risk_level": "risk_level",
    "contract_risk_level": "contract_risk_level",
    "observed_risk_level": "observed_risk_level",
    "verification_level": "verification_level",
    "callers_checked": "callers_checked",
    "observed_broken_caller_count": "observed_broken_caller_count",
    "compile_probe_status": "compile_probe_status",
    "behavioral_correct": "behavioral_correct",
    "adoption_class": "adoption_class",
    "test_probe_status": "test_probe_status",
    "tests_passed": "tests_passed",
    "tests_failed": "tests_failed",
    "risk_reasons": "risk_reasons",
    "smell_before": "smell_before",
    "smell_after": "smell_after",
    "fan_in_before": "fan_in_before",
    "fan_out_before": "fan_out_before",
    "fan_out_after": "fan_out_after",
    "fan_out_delta": "fan_out_delta",
    "caller_used_api_count_before": "caller_used_api_count_before",
    "public_api_count_before": "public_api_count_before",
    "latency_ms": "latency_ms",
    "prompt_tokens": "prompt_tokens",
    "completion_tokens": "completion_tokens",
    "error": "error",
    "completed_at": "completed_at",
    "orchestration": "orchestration",
    "graph_version": "graph_version",
    "multi_llm_agent_mode": "multi_llm_agent_mode",
    "agent_step_count": "agent_step_count",
    "llm_plan_status": "llm_plan_status",
    "llm_verify_approved": "llm_verify_approved",
    "static_verify_accept": "static_verify_accept",
    "test_probe_before_status": "test_probe_before_status",
    "tests_passed_before": "tests_passed_before",
    "tests_failed_before": "tests_failed_before",
    "test_regression": "test_regression",
    "test_probe_strategy": "test_probe_strategy",
    "downstream_caller_count_before": "downstream_caller_count_before",
    "lines_added": "lines_added",
    "lines_removed": "lines_removed",
    "churn": "churn",
    "methods_added": "methods_added",
    "methods_removed": "methods_removed",
}


def fmt_val(val) -> str:
    if val is None:
        return ""
    try:
        import pandas as pd

        if pd.isna(val):
            return ""
    except Exception:
        pass
    if isinstance(val, bool):
        return "true" if val else "false"
    return str(val)


def study_base() -> Path:
    return Path(
        os.environ.get("EMSE_STUDY_BASE")
        or os.path.expanduser("~/.refactai/workspaces/ripple_study_runs")
    )


def default_excel() -> Path:
    env = os.environ.get("EMSE_DESKTOP_EXCEL")
    if env:
        return Path(env)
    return Path.home() / "Desktop/EMSE-Data/EMSE_Master/EMSE_MASTER_ALL_SHEETS.xlsx"


def patch_qwen(row: dict[str, str]) -> None:
    if row.get("model_id") == OLD_QWEN:
        row["model_id"] = NEW_QWEN
    pk = row.get("pair_key") or ""
    if OLD_QWEN in pk:
        row["pair_key"] = pk.replace(OLD_QWEN, NEW_QWEN)


def main() -> int:
    excel_path = Path(sys.argv[1]) if len(sys.argv) > 1 else default_excel()
    if not excel_path.is_file():
        print(f"ERROR: workbook not found: {excel_path}", file=sys.stderr)
        return 1

    try:
        import pandas as pd
    except ImportError:
        print("ERROR: pandas required (pip install pandas openpyxl)", file=sys.stderr)
        return 1

    ma_dir = study_base() / "ma_ref_master"
    ma_dir.mkdir(parents=True, exist_ok=True)
    csv_path = ma_dir / "results_candidates.csv"
    backup = ma_dir / f"results_candidates.partial-rerun-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.csv"
    if csv_path.is_file():
        shutil.copy2(csv_path, backup)
        print(f"Backed up partial CSV -> {backup}")

    df = pd.read_excel(excel_path, sheet_name="MA_00_Master_All")
    if len(df) != 750:
        print(f"WARNING: expected 750 MA rows, got {len(df)}", file=sys.stderr)

    rows: list[dict[str, str]] = []
    for _, src in df.iterrows():
        row = {col: "" for col in CSV_COLUMNS}
        row["study_id"] = "ma_ref_master"
        row["cohort_id"] = "ripple_ref_master_v1"
        for excel_col, csv_col in EXCEL_TO_CSV.items():
            if excel_col in src.index:
                row[csv_col] = fmt_val(src[excel_col])
        if not row["study_id"]:
            row["study_id"] = "ma_ref_master"
        if not row["variant"]:
            row["variant"] = "MA"
        patch_qwen(row)
        rows.append(row)

    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    completed = sum(1 for r in rows if r.get("status") == "completed")
    print(f"Restored {len(rows)} MA rows -> {csv_path}")
    print(f"  completed: {completed}/750")
    print(f"  qwen model id patched: {OLD_QWEN} -> {NEW_QWEN}")

    archive_dir = Path(__file__).resolve().parents[1] / ".run/restored_emse"
    archive_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(excel_path, archive_dir / excel_path.name)
    print(f"Archived workbook -> {archive_dir / excel_path.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
