#!/usr/bin/env python3
"""Backfill fan_in_before / fan_out_before / downstream_caller_count_before in results_candidates.csv."""
from __future__ import annotations

import csv
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FAN_CSV = Path(os.environ.get("FAN_IN_OUT_CSV", ROOT / ".run/shared_cohort/fan_in_exposure.csv"))


def study_dir(study_id: str) -> Path:
    base = os.environ.get("EMSE_STUDY_BASE") or os.path.join(
        os.environ.get("TMPDIR", "/tmp"), "refactai/workspaces/ripple_study_runs"
    )
    return Path(base) / study_id


def load_fan_by_file(study_path: Path) -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    if FAN_CSV.is_file():
        for row in csv.DictReader(open(FAN_CSV, encoding="utf-8")):
            fp = row.get("file_path") or ""
            if fp:
                out[fp] = row
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
                if fp not in out or not (out[fp].get("fan_in_graph") or "").strip():
                    out[fp] = {
                        "fan_in_graph": str(fan_in),
                        "fan_out": str(int(prof.get("fanOut") or 0)),
                        "downstream_caller_count": str(len(prof.get("callerFiles") or [])),
                        "caller_used_api_count": str(len(prof.get("callerUsedApis") or [])),
                        "public_api_count": str(
                            len(prof.get("publicApis") or []) + len(prof.get("protectedApis") or [])
                        ),
                    }
    return out


def main() -> int:
    study_id = sys.argv[1] if len(sys.argv) > 1 else "ripple_ref_master"
    path = study_dir(study_id)
    csv_path = path / "results_candidates.csv"
    if not csv_path.is_file():
        print(f"ERROR: missing {csv_path}", file=sys.stderr)
        return 1

    fan_by_file = load_fan_by_file(path)
    if not fan_by_file:
        print("ERROR: no fan-in data (run collect-fan-in-for-cohort.py first)", file=sys.stderr)
        return 1

    rows = list(csv.DictReader(open(csv_path, encoding="utf-8")))
    if not rows:
        print("No rows")
        return 0
    fieldnames = list(rows[0].keys())
    for col in ("fan_in_before", "fan_out_before", "downstream_caller_count_before",
                "caller_used_api_count_before", "public_api_count_before"):
        if col not in fieldnames:
            fieldnames.append(col)

    updated = 0
    with_fan = 0
    for row in rows:
        fp = row.get("file_path") or ""
        exp = fan_by_file.get(fp)
        if not exp:
            continue
        fan_in = exp.get("fan_in_graph") or exp.get("fan_in_cohort_snapshot") or ""
        changed = False
        if fan_in and (row.get("fan_in_before") or "").strip() in ("", "0"):
            row["fan_in_before"] = str(fan_in)
            changed = True
            if int(float(fan_in or 0)) > 0:
                with_fan += 1
        fan_out = exp.get("fan_out") or ""
        if fan_out and not (row.get("fan_out_before") or "").strip():
            row["fan_out_before"] = str(fan_out)
            changed = True
        dc = exp.get("downstream_caller_count") or ""
        if dc and not (row.get("downstream_caller_count_before") or "").strip():
            row["downstream_caller_count_before"] = str(dc)
            changed = True
        cu = exp.get("caller_used_api_count") or ""
        if cu and not (row.get("caller_used_api_count_before") or "").strip():
            row["caller_used_api_count_before"] = str(cu)
            changed = True
        pa = exp.get("public_api_count") or ""
        if pa and not (row.get("public_api_count_before") or "").strip():
            row["public_api_count_before"] = str(pa)
            changed = True
        if changed:
            updated += 1

    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    unique_files = len({r.get("file_path") for r in rows if r.get("fan_in_before") and int(float(r.get("fan_in_before") or 0)) > 0})
    print(f"Updated {updated}/{len(rows)} rows in {csv_path}")
    print(f"Rows with fan_in_before > 0: {sum(1 for r in rows if r.get('fan_in_before') and int(float(r.get('fan_in_before') or 0)) > 0)}")
    print(f"Unique files with fan_in > 0: {unique_files}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
