# TSE paper package — RIPPLE-REF / MA-REF

**Venue target:** IEEE Transactions on Software Engineering (TSE)  
**Topic:** Repository-level ripple safety of LLM-generated Java refactoring  
**Entry point from monorepo root:** [`../START_HERE_TSE.md`](../START_HERE_TSE.md)

This folder holds **paper-facing** documents for the TSE journal paper.  
Runtime study artifacts stay under `.run/` and `~/.refactai/workspaces/ripple_study_runs/` (see [`MANIFEST.md`](./MANIFEST.md)).

> Historical note: many filenames under `.run/` and `wiki/` still use the prefix **EMSE**. Content is the same study; **use this `TSE/` package** when writing the paper.

---

## Documents in this package

| File | Role |
|------|------|
| [`Research_Questions.md`](./Research_Questions.md) | Locked RQ1–RQ5 |
| [`RIPPLE_REF_RESEARCH_INTEGRITY.md`](./RIPPLE_REF_RESEARCH_INTEGRITY.md) | B0 study rules, L1–L5, risk definitions |
| [`MA_RESEARCH_INTEGRITY.md`](./MA_RESEARCH_INTEGRITY.md) | P-MA arm rules / pairing with B0 |
| [`Experimental_Setting.md`](./Experimental_Setting.md) | Experimental setting draft |
| [`Methodology_Implementation_Answers.md`](./Methodology_Implementation_Answers.md) | Methodology Q&A for TSE write-up |
| [`Multi_Agent_Architecture.md`](./Multi_Agent_Architecture.md) | MA architecture for the paper |
| [`Final_Study_Plan.md`](./Final_Study_Plan.md) | Study plan snapshot |
| [`L5_BEHAVIORAL_TESTING_PAPER_REFERENCE.md`](./L5_BEHAVIORAL_TESTING_PAPER_REFERENCE.md) | L5 test-probe reporting |
| [`Excel_Export_Plan.md`](./Excel_Export_Plan.md) | Workbook layout for analysis |
| [`MANIFEST.md`](./MANIFEST.md) | Scope / non-goals / data locations |

---

## Conditions (paper terms)

| Paper term | Study ID | Variant |
|------------|----------|---------|
| Single-prompt (SP), dependency-aware | `ripple_ref_master` | `V2` |
| Single-prompt ablation | `ripple_ref_master` | `V1` |
| Multi-agent (MA) | `ma_ref_master` | `MA` |

**Primary RQ3 contrast:** P-MA vs B0-V2 on `(project_id, file_path, model_id)`.

---

## Analysis data

| Artifact | Path |
|----------|------|
| **Local EMSE_Master mirror** | [`EMSE_Master/`](./EMSE_Master/) |
| Desktop source (Finder) | `~/Desktop/Waseem-Desktop/EMSE-Data/EMSE_Master/` |
| Raw master (all RQs) | `EMSE_Master/EMSE_RAW_MASTER_ALL_RQs.xlsx` (also `../.run/`) |
| Final raw master (Desktop) | `EMSE_RAW_MASTER_ALL_RQs-Final.xlsx` — copy manually if missing here |
| Methodology answers | `EMSE_Master/EMSE_METHODOLOGY_IMPLEMENTATION_ANSWERS.md` |
| Study runs | `~/.refactai/workspaces/ripple_study_runs/ripple_ref_master/` · `ma_ref_master/` |

---

## Implementation (monorepo — not in this folder)

| Area | Location |
|------|----------|
| Backend study API | `backend/server/.../rippleref/`, `RippleRefStudyController.java` |
| Agent runners | `agents/ripple_ref_study.py`, `agents/ma_ref_study.py` |
| GUI | Dashboard → **RIPPLE-REF Study** |
| Run scripts | `scripts/run-ripple-ref-*.sh`, `scripts/export-emse-ripple-master-excel.sh` |
