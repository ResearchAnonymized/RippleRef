# TSE package manifest

## Included (paper-facing)

- Locked research questions (RQ1–RQ5)
- Integrity plans for `ripple_ref_master` and `ma_ref_master`
- Experimental setting, methodology answers, MA architecture, L5 reference
- Excel export plan (pointers to `.run/` workbooks)

## Not included (live / large)

- Excel binaries (stay in `.run/EMSE_*.xlsx`)
- JSONL run logs (`.run/ripple-ref-*.jsonl`, study dirs)
- Candidate sandboxes / prompts under `~/.refactai/workspaces/ripple_study_runs/`
- Backend/agent source (remains in monorepo; linked from README)

## Explicitly out of scope (ICSE)

| Item | Belongs to |
|------|------------|
| REFINE smell-driven refactoring product | `REFINE/`, `START_HERE_REFINE.md` |
| ICSE RQ1–RQ3 (smell effectiveness / providers) | `wiki/ICSE_*.tex` / `wiki/ICSE_*.md` |
| Direct-Prompt baseline 150 for ICSE | `agents/baseline_comparison/`, ICSE workbooks |
| ICSE rebuttal audit | `.run/ICSE_*.md` |

## Naming

| Label in older paths | Meaning for TSE paper |
|----------------------|------------------------|
| `EMSE_*` under `.run/` / `wiki/` | Same Ripple-REF / MA-REF study; prefer `TSE/` copies when drafting |
| RIPPLE-REF | Single-prompt arm + verification protocol |
| MA-REF | Multi-agent arm |

## Sync note

Files in `TSE/` were snapshotted from monorepo sources on package creation. If you edit integrity or RQs, update **both** the canonical source and the `TSE/` copy (or re-copy intentionally). Canonical sources:

| TSE file | Source |
|----------|--------|
| `Research_Questions.md` | `.run/EMSE_Research_Questions.md` |
| `Methodology_Implementation_Answers.md` | `.run/EMSE_METHODOLOGY_IMPLEMENTATION_ANSWERS.md` |
| `Experimental_Setting.md` | `wiki/EMSE_Experimental_Setting.md` |
| `Multi_Agent_Architecture.md` | `wiki/EMSE_Multi_Agent_Architecture.md` |
| `Final_Study_Plan.md` | `wiki/EMSE_Final_Study_Plan.md` |
| `RIPPLE_REF_RESEARCH_INTEGRITY.md` | repo root |
| `MA_RESEARCH_INTEGRITY.md` | repo root |
| `L5_BEHAVIORAL_TESTING_PAPER_REFERENCE.md` | repo root |
| `Excel_Export_Plan.md` | `EMSE_EXCEL_EXPORT_PLAN.md` |
