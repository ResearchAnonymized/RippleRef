#!/usr/bin/env python3
"""
Backfill results_candidates.csv from ripple_reports/*.json (edit metrics, compile_probe)
without re-running LLMs. Run after study collection or when CSV columns were added later.

Usage:
  python3 scripts/enrich-ripple-study-csv-from-artifacts.py ripple_ref_master
  python3 scripts/enrich-ripple-study-csv-from-artifacts.py ma_ref_master
"""
from __future__ import annotations

import csv
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

NEW_COLS = [
    "downstream_caller_count_before",
    "lines_added",
    "lines_removed",
    "churn",
    "methods_added",
    "methods_removed",
]


def safe_stem(project_id: str, file_path: str, model_id: str, variant: str) -> str:
    return (
        f"{project_id}__{file_path}__{model_id}__{variant}"
        .replace("/", "_")
        .replace("\\", "_")
        .replace(":", "_")
        .replace("|", "_")
    )


def study_dir(study_id: str) -> Path:
    base = os.environ.get("EMSE_STUDY_BASE") or os.path.join(
        os.environ.get("TMPDIR", "/tmp"), "refactai/workspaces/ripple_study_runs"
    )
    return Path(base) / study_id


def load_report_map(study_path: Path) -> dict[str, dict]:
    reports_dir = study_path / "ripple_reports"
    out: dict[str, dict] = {}
    if not reports_dir.is_dir():
        return out
    for p in reports_dir.glob("*.json"):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            out[p.stem] = data
        except Exception:
            pass
    return out


def load_fan_in_map(study_path: Path) -> dict[str, int]:
    out: dict[str, int] = {}
    prof_dir = study_path / "repository_profiles"
    if prof_dir.is_dir():
        for p in prof_dir.glob("*_dependency_scan.json"):
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
            reverse = data.get("reverseDependencyGraph") or {}
            profiles = data.get("fileProfiles") or {}
            for fp, prof in profiles.items():
                fan_in = len(reverse.get(fp) or [])
                if fan_in == 0:
                    fan_in = len(prof.get("callerFiles") or [])
                if fan_in == 0:
                    fan_in = int(prof.get("fanIn") or 0)
                out[fp] = fan_in
    before_dir = study_path / "before_profiles"
    if before_dir.is_dir():
        for p in before_dir.glob("*.json"):
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
            fp = data.get("filePath")
            fi = data.get("fanIn")
            if fp and fi is not None:
                out[str(fp)] = int(fi)
    return out


def enrich_row(row: dict[str, str], report: dict | None, fan_map: dict[str, int]) -> bool:
    changed = False
    if not report:
        return False
    mapping = {
        "lines_added": report.get("linesAdded"),
        "lines_removed": report.get("linesRemoved"),
        "churn": report.get("churn"),
        "methods_added": report.get("methodsAdded"),
        "methods_removed": report.get("methodsRemoved"),
    }
    for col, val in mapping.items():
        if val is None:
            continue
        sval = str(val)
        if (row.get(col) or "").strip() != sval:
            row[col] = sval
            changed = True
    compile_status = report.get("compileProbeStatus")
    if compile_status and not (row.get("compile_probe_status") or "").strip():
        row["compile_probe_status"] = str(compile_status)
        changed = True
    elif not (row.get("compile_probe_status") or "").strip():
        if report.get("compileProbeAttempted"):
            row["compile_probe_status"] = "skipped"
            changed = True
        elif report:
            row["compile_probe_status"] = "not_run"
            changed = True
    affected = report.get("affectedCallers") or []
    if affected and not (row.get("downstream_caller_count_before") or "").strip():
        row["downstream_caller_count_before"] = str(len(affected))
        changed = True
    fp = row.get("file_path") or ""
    corrected_fan = fan_map.get(fp)
    if corrected_fan is not None and int(row.get("fan_in_before") or 0) == 0 and corrected_fan > 0:
        row["fan_in_before"] = str(corrected_fan)
        changed = True
    return changed


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: enrich-ripple-study-csv-from-artifacts.py <study_id>", file=sys.stderr)
        return 1
    study_id = sys.argv[1]
    path = study_dir(study_id)
    csv_path = path / "results_candidates.csv"
    if not csv_path.is_file():
        print(f"ERROR: missing {csv_path}", file=sys.stderr)
        return 1

    reports = load_report_map(path)
    fan_map = load_fan_in_map(path)
    rows = list(csv.DictReader(open(csv_path, encoding="utf-8")))
    if not rows:
        print("No rows")
        return 0

    fieldnames = list(rows[0].keys())
    for col in NEW_COLS:
        if col not in fieldnames:
            fieldnames.append(col)

    updated = 0
    for row in rows:
        stem = safe_stem(
            row.get("project_id", ""),
            row.get("file_path", ""),
            row.get("model_id", ""),
            row.get("variant", ""),
        )
        if enrich_row(row, reports.get(stem), fan_map):
            updated += 1

    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    print(f"Enriched {updated}/{len(rows)} rows in {csv_path}")
    print(f"Reports loaded: {len(reports)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
