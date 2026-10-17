#!/usr/bin/env python3
"""
Replay apply-and-verify (L4 + optional L3 compile + L5 paired test probe) on saved candidates.

Reads diffs/*_before.java and diffs/*_after.java — does NOT call the LLM again.
L5 runs the same targeted Maven tests on original then refactored file in an isolated sandbox.
Updates results_candidates.csv test_probe_before_status, test_probe_status, test_regression, adoption_class.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional


def safe_artifact_name(workspace_id: str, file_path: str, model_id: str, variant: str) -> str:
    raw = f"{workspace_id}__{file_path}__{model_id}__{variant}"
    return raw.replace("/", "_").replace("\\", "_").replace(":", "_").replace("|", "_")


def api_get(base: str, path: str) -> Any:
    req = urllib.request.Request(f"{base}{path}")
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def api_post(base: str, path: str, body: Dict[str, Any], timeout: int = 600) -> Any:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{base}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def load_csv_rows(study_dir: Path) -> List[Dict[str, str]]:
    csv_path = study_dir / "results_candidates.csv"
    if not csv_path.is_file():
        return []
    with csv_path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def candidate_after_path(study_dir: Path, row: Dict[str, str]) -> Path:
    base = safe_artifact_name(
        row["project_id"], row["file_path"], row["model_id"], row["variant"]
    )
    return study_dir / "diffs" / f"{base}_after.java"


def should_backfill(row: Dict[str, str], force: bool) -> bool:
    if row.get("status") != "completed":
        return False
    if force:
        return True
    if os.environ.get("L5_PROBE_V2", "0") == "1":
        return not (row.get("test_probe_strategy") or "").strip()
    if os.environ.get("RETRY_SKIPPED", "0") == "1" and (row.get("test_probe_status") or "").strip() == "skipped":
        return True
    return (row.get("test_probe_status") or "").strip() == ""


def post_pipeline_progress(api: str, phase: str, study_id: str, processed: int, total: int) -> None:
    if os.environ.get("POST_PIPELINE_PROGRESS", "1") != "1":
        return
    status_study_id = os.environ.get("PIPELINE_STATUS_STUDY_ID", study_id)
    try:
        summary = api_get(api, f"/ripple-ref/studies/{study_id}/verification-summary")
        completed = int(summary.get("completedCandidates") or 0)
        pending = int(summary.get("l5Pending") or 0)
        probed = max(0, completed - pending)
    except Exception:
        probed = processed
        pending = max(0, total - processed)
    body = {
        "phase": phase,
        "state": "running",
        "backfillStudyId": study_id,
        "backfillProcessed": probed,
        "backfillTotal": probed + pending,
    }
    try:
        api_post(api, f"/ripple-ref/studies/{status_study_id}/pipeline-status", body, timeout=30)
    except Exception:
        pass


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill L5 test probe on saved ripple-ref candidates")
    parser.add_argument("study_id", help="e.g. ripple_ref_master or ma_ref_master")
    parser.add_argument("--api", default=os.environ.get("BACKEND_API", "http://127.0.0.1:8083/api"))
    parser.add_argument("--max", type=int, default=None, help="Max candidates to process")
    parser.add_argument("--force", action="store_true", help="Re-run even if test_probe_status already set")
    parser.add_argument("--compile", action="store_true", help="Also run compile probe (L3)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--workspace", help="Filter to one workspace id")
    parser.add_argument("--variant", help="Filter variant (V1, V2, MA)")
    args = parser.parse_args()

    compile_probe = args.compile or os.environ.get("RIPPLE_REF_COMPILE_PROBE", "0") == "1"
    test_timeout = int(os.environ.get("BACKFILL_TEST_TIMEOUT_SEC", "420"))
    backfill_phase = os.environ.get(
        "BACKFILL_PHASE",
        "backfill_ma" if args.study_id == "ma_ref_master" else "backfill_b0",
    )

    summary = api_get(args.api, f"/ripple-ref/studies/{args.study_id}?view=summary")
    study_dir = Path(summary.get("studyDir") or "")
    if not study_dir.is_dir():
        print(f"ERROR: study dir not found: {study_dir}", file=sys.stderr)
        return 1

    rows = load_csv_rows(study_dir)
    targets = [r for r in rows if should_backfill(r, args.force)]
    if args.workspace:
        targets = [r for r in targets if r.get("project_id") == args.workspace]
    if args.variant:
        targets = [r for r in targets if r.get("variant") == args.variant]

    print(f"Study: {args.study_id}")
    print(f"Dir: {study_dir}")
    print(f"Completed with saved code: {len(targets)} candidates to backfill")
    print(f"compileProbe={compile_probe} force={args.force} dry_run={args.dry_run}")

    ran = 0
    ok = 0
    fail = 0
    skipped = 0

    for row in targets:
        if args.max is not None and ran >= args.max:
            break
        after_path = candidate_after_path(study_dir, row)
        if not after_path.is_file():
            print(f"  SKIP missing diff: {row.get('pair_key')}")
            skipped += 1
            continue

        candidate_code = after_path.read_text(encoding="utf-8")
        pair_key = row.get("pair_key") or ""
        label = f"{Path(row['file_path']).name} {row['model_id'].split('/')[-1]} {row['variant']}"

        if args.dry_run:
            print(f"  DRY-RUN {label} ({pair_key})")
            ran += 1
            continue

        run_meta: Dict[str, Any] = {
            "backfillReplay": True,
            "verificationBackfill": True,
            "compileProbe": compile_probe,
            "testProbe": True,
        }
        if row.get("latency_ms"):
            try:
                run_meta["latencyMs"] = int(float(row["latency_ms"]))
            except ValueError:
                pass
        for src, dst in (
            ("prompt_tokens", "promptTokens"),
            ("completion_tokens", "completionTokens"),
            ("orchestration", "orchestration"),
            ("graph_version", "graphVersion"),
            ("multi_llm_agent_mode", "multiLlmAgentMode"),
            ("agent_step_count", "agentStepCount"),
            ("llm_plan_status", "llmPlanStatus"),
            ("cohort_id", "cohortId"),
        ):
            val = row.get(src)
            if val not in (None, ""):
                run_meta[dst] = val
        if row.get("llm_verify_approved") in ("true", "True", "1"):
            run_meta["llmVerifyApproved"] = True
        elif row.get("llm_verify_approved") in ("false", "False", "0"):
            run_meta["llmVerifyApproved"] = False
        if row.get("static_verify_accept") in ("true", "True", "1"):
            run_meta["staticVerifyAccept"] = True
        elif row.get("static_verify_accept") in ("false", "False", "0"):
            run_meta["staticVerifyAccept"] = False

        body = {
            "workspaceId": row["project_id"],
            "filePath": row["file_path"],
            "modelId": row["model_id"],
            "variant": row["variant"],
            "candidateCode": candidate_code,
            "runMeta": run_meta,
        }

        print(f"  RUN L5 {label} ...", flush=True)
        t0 = time.time()
        try:
            report = api_post(
                args.api,
                f"/ripple-ref/studies/{args.study_id}/apply-and-verify",
                body,
                timeout=test_timeout,
            )
            tests = report.get("tests") or {}
            tp = tests.get("status") or report.get("testProbeStatus") or "?"
            before_tp = tests.get("beforeStatus") or "?"
            passed = tests.get("testsPassed", 0)
            failed_n = tests.get("testsFailed", 0)
            passed_before = tests.get("beforeTestsPassed", 0)
            regression = tests.get("regression", False)
            strategy = tests.get("probeStrategy") or "?"
            adopt = report.get("adoptionClass") or "?"
            elapsed = int(time.time() - t0)
            print(
                f"    -> strategy={strategy} before={before_tp} after={tp} "
                f"passed_before={passed_before} passed_after={passed} failed={failed_n} "
                f"regression={regression} adoption={adopt} ({elapsed}s)"
            )
            ok += 1
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:500]
            print(f"    -> HTTP {e.code}: {detail}")
            fail += 1
        except Exception as e:
            print(f"    -> ERROR: {e}")
            fail += 1
        ran += 1
        if ran % 5 == 0 or ran == len(targets):
            post_pipeline_progress(args.api, backfill_phase, args.study_id, ran, len(targets))
        time.sleep(float(os.environ.get("BACKFILL_SLEEP_SEC", "2")))

    print("")
    print(f"Done: ran={ran} ok={ok} fail={fail} skipped={skipped}")
    try:
        comp = api_get(args.api, f"/ripple-ref/studies/{args.study_id}/completeness")
        tested = sum(
            1
            for r in load_csv_rows(study_dir)
            if (r.get("test_probe_status") or "").strip()
        )
        paired = sum(
            1
            for r in load_csv_rows(study_dir)
            if (r.get("test_probe_before_status") or "").strip()
        )
        regressions = sum(
            1
            for r in load_csv_rows(study_dir)
            if (r.get("test_regression") or "").strip().lower() in ("true", "1")
        )
        print(f"Completeness: {comp.get('completedRuns')}/{comp.get('plannedRuns')}")
        print(f"Rows with test_probe_status set: {tested}")
        print(f"Rows with paired before status: {paired}")
        print(f"Rows with test regression: {regressions}")
    except Exception:
        pass
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
