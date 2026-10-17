#!/usr/bin/env python3
"""Import cohort_manifest.json into ripple study dir (offline, no new API needed)."""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def study_path(study_id: str) -> Path:
    base = os.environ.get("EMSE_STUDY_BASE") or os.path.join(
        os.environ.get("TMPDIR", "/tmp"), "refactai/workspaces/ripple_study_runs"
    )
    # Also check persistent default
    persistent = Path.home() / ".refactai/workspaces/ripple_study_runs" / study_id
    tmp = Path(base) / study_id
    if persistent.is_dir():
        return persistent
    return tmp


def main() -> int:
    study_id = sys.argv[1] if len(sys.argv) > 1 else "ripple_ref_master"
    manifest_path = Path(
        sys.argv[2] if len(sys.argv) > 2 else ROOT / ".run/shared_cohort/cohort_manifest.json"
    )
    if not manifest_path.is_file():
        print(f"ERROR: missing {manifest_path}", file=sys.stderr)
        return 1

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    selected = manifest.get("selectedByRepo") or {}
    file_count = sum(len(v) for v in selected.values())
    if file_count != 150:
        print(f"ERROR: expected 150 files, got {file_count}", file=sys.stderr)
        return 1

    study_dir = study_path(study_id)
    if not study_dir.is_dir():
        print(f"ERROR: study dir missing {study_dir}", file=sys.stderr)
        return 1

    state_file = study_dir / "study_state.json"
    state = json.loads(state_file.read_text(encoding="utf-8")) if state_file.is_file() else {}
    state["selectedByRepo"] = selected
    state["status"] = "ready"
    if "config" in state and isinstance(state["config"], dict):
        state["config"]["cohortId"] = manifest.get("cohortId", f"{study_id}_v1")
        state["config"]["cohortSourceStudyId"] = manifest.get("sourceStudyId", study_id)
        state["config"]["workspaceIds"] = sorted(selected.keys())
        state["config"]["repositoryCount"] = len(selected)
        state["config"]["filesPerRepository"] = 10

    state_file.write_text(json.dumps(state, indent=2), encoding="utf-8")

    cohort_dir = study_dir / "cohort"
    cohort_dir.mkdir(parents=True, exist_ok=True)
    out_manifest = dict(manifest)
    out_manifest["importedAt"] = datetime.now(timezone.utc).isoformat()
    out_manifest["fileCount"] = file_count
    (cohort_dir / "cohort_manifest.json").write_text(json.dumps(out_manifest, indent=2), encoding="utf-8")

    print(f"Imported {file_count} files into {study_dir}")
    print(f"study_state.json updated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
