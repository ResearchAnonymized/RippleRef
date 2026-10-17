#!/usr/bin/env python3
"""
Collect fan-in / fan-out / downstream callers for the locked 150-file cohort.

Reads repository_profiles/*_dependency_scan.json from the study dir (after bootstrap + scan).
Writes .run/shared_cohort/fan_in_exposure.csv and patches cohort_manifest.json fanIn fields.

Usage:
  python3 scripts/collect-fan-in-for-cohort.py
  EMSE_STUDY_BASE=... python3 scripts/collect-fan-in-for-cohort.py ripple_ref_master
"""
from __future__ import annotations

import csv
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COHORT_MANIFEST = Path(os.environ.get("COHORT_MANIFEST", ROOT / ".run/shared_cohort/cohort_manifest.json"))
OUT_CSV = Path(os.environ.get("FAN_IN_OUT_CSV", ROOT / ".run/shared_cohort/fan_in_exposure.csv"))


def study_dir(study_id: str) -> Path:
    base = os.environ.get("EMSE_STUDY_BASE") or os.path.join(
        os.environ.get("TMPDIR", "/tmp"), "refactai/workspaces/ripple_study_runs"
    )
    return Path(base) / study_id


def load_fan_maps(study_path: Path) -> dict[str, dict]:
    out: dict[str, dict] = {}
    prof_dir = study_path / "repository_profiles"
    if not prof_dir.is_dir():
        return out
    for p in prof_dir.glob("*_dependency_scan.json"):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        project_id = data.get("projectId") or p.name.replace("_dependency_scan.json", "")
        reverse = data.get("reverseDependencyGraph") or {}
        profiles = data.get("fileProfiles") or {}
        for fp, prof in profiles.items():
            fan_in = len(reverse.get(fp) or [])
            if fan_in == 0:
                fan_in = len(prof.get("callerFiles") or [])
            if fan_in == 0:
                fan_in = int(prof.get("fanIn") or 0)
            out[fp] = {
                "project_id": project_id,
                "file_path": fp,
                "fan_in_cohort_snapshot": int(prof.get("fanIn") or 0),
                "fan_in_graph": fan_in,
                "fan_out": int(prof.get("fanOut") or 0),
                "downstream_caller_count": len(prof.get("callerFiles") or []),
                "caller_used_api_count": len(prof.get("callerUsedApis") or []),
                "public_api_count": len(prof.get("publicApis") or []) + len(prof.get("protectedApis") or []),
            }
    return out


def cohort_files(manifest: dict) -> list[tuple[str, str]]:
    files: list[tuple[str, str]] = []
    for ws, entries in (manifest.get("selectedByRepo") or {}).items():
        for e in entries:
            fp = e.get("filePath") if isinstance(e, dict) else str(e)
            if fp:
                files.append((ws, fp))
    if not files:
        for repo in manifest.get("repos") or []:
            ws = repo.get("workspaceId") or ""
            for fp in repo.get("files") or []:
                files.append((ws, fp))
    return files


def main() -> int:
    study_id = sys.argv[1] if len(sys.argv) > 1 else "ripple_ref_master"
    if not COHORT_MANIFEST.is_file():
        print(f"ERROR: missing {COHORT_MANIFEST}", file=sys.stderr)
        return 1

    manifest = json.loads(COHORT_MANIFEST.read_text(encoding="utf-8"))
    fan_map = load_fan_maps(study_dir(study_id))
    if not fan_map:
        print(
            f"ERROR: no dependency scans in {study_dir(study_id) / 'repository_profiles'}",
            file=sys.stderr,
        )
        print("Run: bash scripts/bootstrap-ripple-ref-from-cohort.sh", file=sys.stderr)
        return 1

    rows: list[dict[str, str | int]] = []
    missing = 0
    for ws, fp in cohort_files(manifest):
        exp = fan_map.get(fp)
        if not exp:
            missing += 1
            rows.append(
                {
                    "project_id": ws,
                    "file_path": fp,
                    "fan_in_cohort_snapshot": 0,
                    "fan_in_graph": "",
                    "fan_out": "",
                    "downstream_caller_count": "",
                    "caller_used_api_count": "",
                    "public_api_count": "",
                    "note": "not_in_dependency_scan",
                }
            )
            continue
        rows.append({**exp, "note": ""})

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "project_id",
        "file_path",
        "fan_in_cohort_snapshot",
        "fan_in_graph",
        "fan_out",
        "downstream_caller_count",
        "caller_used_api_count",
        "public_api_count",
        "note",
    ]
    with open(OUT_CSV, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})

    # Patch manifest selectedByRepo fanIn
    selected = manifest.get("selectedByRepo") or {}
    patched = 0
    for entries in selected.values():
        for e in entries:
            if not isinstance(e, dict):
                continue
            fp = e.get("filePath") or ""
            exp = fan_map.get(fp)
            if not exp:
                continue
            new_fan = exp["fan_in_graph"]
            if int(e.get("fanIn") or 0) != new_fan:
                e["fanIn"] = new_fan
                patched += 1
    if patched:
        COHORT_MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    nonzero = sum(1 for r in rows if isinstance(r.get("fan_in_graph"), int) and r["fan_in_graph"] > 0)
    print(f"Wrote {len(rows)} rows -> {OUT_CSV}")
    print(f"fan_in_graph > 0: {nonzero}/{len(rows)} | manifest fanIn patched: {patched} | missing: {missing}")
    return 0 if missing == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
