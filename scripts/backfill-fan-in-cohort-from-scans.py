#!/usr/bin/env python3
"""
Correct fan_in=0 in cohort_manifest.json and selected_files.csv using
repository_profiles/*_dependency_scan.json reverseDependencyGraph.

Run after dependency scan exists and before Excel export:
  python3 scripts/backfill-fan-in-cohort-from-scans.py ripple_ref_master
"""
from __future__ import annotations

import csv
import json
import os
import sys
from pathlib import Path


def study_path(study_id: str) -> Path:
    base = os.environ.get("EMSE_STUDY_BASE") or os.path.join(
        os.environ.get("TMPDIR", "/tmp"), "refactai/workspaces/ripple_study_runs"
    )
    return Path(base) / study_id


def load_fan_in_map(study_dir: Path) -> dict[str, int]:
    out: dict[str, int] = {}
    prof_dir = study_dir / "repository_profiles"
    if not prof_dir.is_dir():
        return out
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
    return out


def patch_manifest(study_dir: Path, fan_map: dict[str, int]) -> int:
    manifest_path = study_dir / "cohort" / "cohort_manifest.json"
    if not manifest_path.is_file():
        return 0
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    updated = 0
    for entries in (data.get("selectedByRepo") or {}).values():
        for e in entries:
            fp = str(e.get("filePath") or "")
            if not fp:
                continue
            corrected = fan_map.get(fp)
            if corrected is None:
                continue
            if int(e.get("fanIn") or 0) != corrected:
                e["fanIn"] = corrected
                updated += 1
    if updated:
        manifest_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return updated


def patch_selected_files(study_dir: Path, fan_map: dict[str, int]) -> int:
    csv_path = study_dir / "selected_files.csv"
    if not csv_path.is_file():
        return 0
    rows = list(csv.DictReader(open(csv_path, encoding="utf-8")))
    if not rows:
        return 0
    fieldnames = list(rows[0].keys())
    updated = 0
    for row in rows:
        fp = row.get("file_path") or ""
        corrected = fan_map.get(fp)
        if corrected is None:
            continue
        old = int(row.get("fan_in") or 0)
        if old != corrected:
            row["fan_in"] = str(corrected)
            updated += 1
    if updated:
        with open(csv_path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(rows)
    return updated


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: backfill-fan-in-cohort-from-scans.py <study_id>", file=sys.stderr)
        return 1
    study_id = sys.argv[1]
    study_dir = study_path(study_id)
    if not study_dir.is_dir():
        print(f"ERROR: missing study dir {study_dir}", file=sys.stderr)
        return 1

    fan_map = load_fan_in_map(study_dir)
    if not fan_map:
        print(f"No dependency scans in {study_dir / 'repository_profiles'}")
        return 1

    m = patch_manifest(study_dir, fan_map)
    s = patch_selected_files(study_dir, fan_map)
    nonzero = sum(1 for v in fan_map.values() if v > 0)
    print(f"Fan-in map: {len(fan_map)} files, {nonzero} with fan_in>0")
    print(f"Updated cohort_manifest entries: {m}")
    print(f"Updated selected_files.csv rows: {s}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
