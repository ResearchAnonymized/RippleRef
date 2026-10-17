#!/usr/bin/env python3
"""Point study_state.json studyDir at the persistent workspace (fixes TMPDIR wipe)."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def study_path(study_id: str) -> Path:
    base = os.environ.get("EMSE_STUDY_BASE") or os.path.join(
        os.environ.get("REFACTAI_WORKSPACE_TEMP_DIR", os.path.expanduser("~/.refactai/workspaces")),
        "ripple_study_runs",
    )
    return Path(base) / study_id


def main() -> int:
    study_id = sys.argv[1] if len(sys.argv) > 1 else "ripple_ref_master"
    pers = study_path(study_id)
    state_file = pers / "study_state.json"
    if not state_file.is_file():
        print(f"ERROR: missing {state_file}", file=sys.stderr)
        return 1
    data = json.loads(state_file.read_text(encoding="utf-8"))
    new = str(pers.resolve())
    old = data.get("studyDir")
    if old != new:
        data["studyDir"] = new
        state_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
        print(f"Patched {study_id} studyDir -> {new}")
    else:
        print(f"{study_id} studyDir already {new}")
    for sub in (
        "prompts",
        "model_responses",
        "generated_candidates",
        "ripple_reports",
        "diffs",
        "behavioral_reports",
        "test_reports",
    ):
        (pers / sub).mkdir(parents=True, exist_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
