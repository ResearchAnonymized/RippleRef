#!/usr/bin/env python3
"""Patch study config + purge legacy Qwen rows before rerun."""
from __future__ import annotations

import csv
import json
import os
import sys
from pathlib import Path

OLD = "qwen/qwen-3.6-plus"
NEW = "qwen/qwen3.6-plus"


def study_base() -> Path:
    base = os.environ.get("EMSE_STUDY_BASE") or os.path.expanduser(
        "~/.refactai/workspaces/ripple_study_runs"
    )
    return Path(base)


def patch_config(study_dir: Path) -> int:
    cfg = study_dir / "config.json"
    if not cfg.is_file():
        return 0
    data = json.loads(cfg.read_text(encoding="utf-8"))
    n = 0
    for m in data.get("models") or []:
        if m.get("modelId") == OLD:
            m["modelId"] = NEW
            n += 1
    if n:
        cfg.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return n


def purge_csv(study_dir: Path) -> int:
    csv_path = study_dir / "results_candidates.csv"
    if not csv_path.is_file():
        return 0
    rows = list(csv.DictReader(open(csv_path, encoding="utf-8")))
    if not rows:
        return 0
    kept = [r for r in rows if r.get("model_id") != OLD]
    removed = len(rows) - len(kept)
    if removed:
        with open(csv_path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(kept)
    return removed


def main() -> int:
    base = study_base()
    for study in ("ripple_ref_master", "ma_ref_master"):
        d = base / study
        if not d.is_dir():
            print(f"skip {study} (no dir)")
            continue
        c = patch_config(d)
        r = purge_csv(d)
        print(f"{study}: config models patched={c}, csv rows removed={r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
