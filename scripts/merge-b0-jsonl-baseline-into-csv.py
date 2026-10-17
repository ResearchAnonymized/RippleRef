#!/usr/bin/env python3
"""
Rebuild results_candidates.csv by merging archived B0 jsonl logs with the live study CSV.

The Qwen-only rerun replaced the CSV with Qwen rows only; per-system GUI progress showed
~10/100 instead of ~90/100. Jsonl archives under .run/ripple-ref-master-*.jsonl retain the
full 1,500-candidate B0 history (other models + old Qwen).

Current CSV rows win for the same pair_key (new Qwen rerun data takes precedence).

Usage:
  python3 scripts/merge-b0-jsonl-baseline-into-csv.py
  python3 scripts/merge-b0-jsonl-baseline-into-csv.py ripple_ref_master
"""
from __future__ import annotations

import csv
import glob
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STUDY_ID = "ripple_ref_master"
QWEN_NEW = "qwen/qwen3.6-plus"
QWEN_OLD = "qwen/qwen-3.6-plus"


def study_dir(study_id: str) -> Path:
    base = os.environ.get("EMSE_STUDY_BASE") or os.path.join(
        os.environ.get("TMPDIR", "/tmp"), "refactai/workspaces/ripple_study_runs"
    )
    return Path(base) / study_id


def load_jsonl_pairs() -> dict[str, dict]:
    pairs: dict[str, dict] = {}
    pattern = str(ROOT / ".run" / "ripple-ref-master-ripple_ref_master-*.jsonl")
    for path in sorted(glob.glob(pattern)):
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            pair_key = entry.get("pairKey")
            if not pair_key:
                continue
            pairs[pair_key] = entry
    return pairs


def map_status(entry: dict) -> str:
    status = str(entry.get("status") or "failed")
    rep = entry.get("rippleReport") or {}
    if status == "completed":
        return "completed"
    if not rep.get("parseSuccess", True) and rep.get("parseSuccess") is not None:
        return "failed_parsing"
    if status.startswith("failed"):
        return "failed_generation"
    return status


def jsonl_to_row(study_id: str, entry: dict) -> dict[str, str]:
    pair_key = entry["pairKey"]
    project_id, file_path, model_id, variant = pair_key.split("|", 3)
    rep = entry.get("rippleReport") or {}
    beh = rep.get("behavioral") or {}
    row: dict[str, str] = {
        "study_id": study_id,
        "project_id": project_id,
        "file_path": file_path,
        "model_id": model_id,
        "variant": variant,
        "pair_key": pair_key,
        "status": map_status(entry),
        "risk_level": str(rep.get("riskLevel") or ""),
        "contract_risk_level": str(rep.get("contractRiskLevel") or ""),
        "observed_risk_level": str(rep.get("observedRiskLevel") or ""),
        "verification_level": str(rep.get("verificationLevel") or ""),
        "callers_checked": str(rep.get("callersChecked") or ""),
        "observed_broken_caller_count": str(rep.get("observedBrokenCallerCount") or ""),
        "compile_probe_status": str(rep.get("compileProbeStatus") or ""),
        "behavioral_correct": str(beh.get("behavioralCorrect") if beh.get("behavioralCorrect") is not None else ""),
        "adoption_class": str(rep.get("adoptionClass") or ""),
        "latency_ms": str(entry.get("latencyMs") or ""),
        "error": str(entry.get("error") or ""),
        "orchestration": "single_pass",
        "lines_added": str(rep.get("linesAdded") or ""),
        "lines_removed": str(rep.get("linesRemoved") or ""),
        "churn": str(rep.get("churn") or ""),
        "methods_added": str(rep.get("methodsAdded") or ""),
        "methods_removed": str(rep.get("methodsRemoved") or ""),
        "smell_count_before": "",
        "smell_count_after": str(rep.get("smellCountAfter") or ""),
        "fan_out_delta": str(rep.get("fanOutDelta") or ""),
    }
    return row


def main() -> int:
    study_id = sys.argv[1] if len(sys.argv) > 1 else STUDY_ID
    path = study_dir(study_id)
    csv_path = path / "results_candidates.csv"

    jsonl_pairs = load_jsonl_pairs()
    if not jsonl_pairs:
        print("ERROR: no jsonl baseline found in .run/ripple-ref-master-*.jsonl", file=sys.stderr)
        return 1

    current: dict[str, dict[str, str]] = {}
    fieldnames: list[str] = []
    if csv_path.is_file():
        rows = list(csv.DictReader(open(csv_path, encoding="utf-8")))
        if rows:
            fieldnames = list(rows[0].keys())
            for row in rows:
                pk = row.get("pair_key") or ""
                if pk:
                    current[pk] = row

    merged: dict[str, dict[str, str]] = {}
    for pair_key, entry in jsonl_pairs.items():
        model_id = pair_key.split("|")[2]
        if model_id in (QWEN_OLD, QWEN_NEW) and pair_key.split("|")[3] == "V2":
            continue  # prefer live CSV for new Qwen V2 rerun
        merged[pair_key] = jsonl_to_row(study_id, entry)

    for pair_key, row in current.items():
        merged[pair_key] = row

    if not fieldnames and merged:
        fieldnames = list(next(iter(merged.values())).keys())
    elif fieldnames:
        for row in merged.values():
            for col in fieldnames:
                row.setdefault(col, "")

    out_rows = sorted(merged.values(), key=lambda r: (r.get("project_id", ""), r.get("file_path", ""), r.get("model_id", ""), r.get("variant", "")))
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(out_rows)

    from collections import Counter

    by_model = Counter(r.get("model_id") for r in out_rows)
    by_status = Counter(r.get("status") for r in out_rows)
    print(f"Merged {len(out_rows)} rows -> {csv_path}")
    print("By model:", dict(by_model))
    print("By status:", dict(by_status))
    print(f"Jsonl baseline pairs: {len(jsonl_pairs)}, live CSV pairs: {len(current)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
