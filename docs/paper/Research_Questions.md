# TSE Journal Paper — Final Research Questions (locked)

> **Package:** `TSE/` (IEEE TSE venue). Source snapshot of `.run/EMSE_Research_Questions.md`.

**Studies:** `ripple_ref_master` (single-prompt baseline) + `ma_ref_master` (LangGraph multi-agent)  
**Cohort:** 150 Java files (15 OSS systems × 10 stratified files, seed=42) × 5 frontier models  
**Date locked:** 2026-07-03

---

## Final RQs

**RQ1 — Dependency Exposure Before Refactoring**  
What dependency and contract exposure do the selected Java files have before AI refactoring?

**RQ2 — Risks in Dependency-Aware Single-Prompt Refactoring**  
What ripple-effect risks are introduced by dependency-aware single-prompt AI refactoring?

**RQ3 — Effect of Multi-Agent Orchestration**  
Does LangGraph-based multi-agent orchestration reduce ripple-effect risks compared with dependency-aware single-prompt refactoring?

**RQ4 — Model-Specific Ripple-Risk Behaviour**  
How do frontier models differ in ripple-risk behaviour across single-prompt and multi-agent refactoring?

**RQ5 — Factors Associated with High Ripple Risk**  
Which file, model, orchestration, and edit characteristics are associated with high ripple risk?

---

## Why five RQs (TSE justification)

The evaluation has two independent dimensions:

1. **Orchestration:** dependency-aware **single-prompt** (B0-V2) vs **LangGraph multi-agent** (P)  
2. **Models:** five frontier LLMs under the same protocol  

Five RQs separate **pre-refactor exposure** (RQ1), **baseline risk** (RQ2), **orchestration effect** (RQ3), **provider heterogeneity** (RQ4), and **explanatory factors** (RQ5).

---

## Study conditions (paper terminology)

| Code | Study ID | Orchestration | Dependency context |
|------|----------|---------------|-------------------|
| **B0-V1** | `ripple_ref_master` | Single-prompt (1 LLM call) | File + smells only |
| **B0-V2** | `ripple_ref_master` | Single-prompt (1 LLM call) | + dependency context package in prompt |
| **P-MA** | `ma_ref_master` | LangGraph multi-agent (`MULTI_LLM_AGENT_MODE=full`) | Smell-aware agents (Planner + Refactorer + Verifier) |

**Primary paired comparison for RQ3:** P-MA vs **B0-V2** (same files, same models, same ripple verifier).  
**B0-V1:** sensitivity / ablation (prompt context only vs no context); not the headline RQ3 contrast.

---

## RQ → evidence map

| RQ | Primary analysis unit | Main data sources | Key metrics |
|----|----------------------|-------------------|-------------|
| **RQ1** | File (n=150) | `repository_profiles/*_dependency_scan.json`, `selected_files.csv`, `dependency_contexts/` | fan-in, fan-out, public/protected API counts, caller-used APIs, downstream callers, smell count, LOC, sampling_group |
| **RQ2** | Candidate (B0-V2; n≤750) | `ripple_ref_master/results_candidates.csv` where `variant=V2`, `ripple_reports/` | `risk_level`, `contract_risk_level`, `observed_risk_level`, `observed_broken_caller_count`, `adoption_class`, `risk_reasons`, smell before/after |
| **RQ3** | Paired (file×model) | Join P-MA and B0-V2 on `(project_id, file_path, model_id)` | Paired difference in risk score, High-risk rate, broken-caller count; McNemar / Wilcoxon; effect sizes + 95% CI |
| **RQ4** | Candidate × model × orchestration | Unified `results_candidates.csv` (B0-V2 + P-MA) | Risk/adoption rates by model; Friedman + pairwise tests across models; interaction orchestration×model |
| **RQ5** | Candidate (exploratory) | Unified table + file strata | Logistic / stratified models: fan-in, smells, LOC, model, orchestration, tokens, churn, `behavioral_correct`, sampling_group |

---

## Operational definitions (unchanged)

Ripple exposure (pre-refactor) and ripple outcome (L1–L5 verification) are defined in `RIPPLE_REF_RESEARCH_INTEGRITY.md`.  
Both B0 and P-MA candidates pass through the **same** `apply-and-verify` protocol for comparable `risk_level` and `observed_broken_caller_count`.

---

## Analysis plan (post data collection)

**Master Excel export (all RQ raw sheets):** run `bash scripts/export-emse-ripple-master-excel.sh` → `.run/EMSE_RIPPLE_MASTER_DATA.xlsx`

1. **RQ1:** Descriptive statistics + distributions by `sampling_group` and repository.  
2. **RQ2:** Counts and rates of risk levels, adoption classes, and change types on B0-V2.  
3. **RQ3:** Complete paired cases only; primary test on High vs not-High and `observed_broken_caller_count`.  
4. **RQ4:** Model-level summaries; test orchestration×model interaction on risk outcomes.  
5. **RQ5:** Multivariable models; report odds ratios / standardized effects with CIs; exploratory label.

---

## What we do not claim

- Single-prompt runs are **not** multi-agent (B0 is one `chat_completion` + static verify).  
- RQ3 compares **orchestration**, not prompt wording alone (B0-V2 already has dependency text).  
- Static caller extraction limits causal claims; manual audit sample supports RQ5 interpretation.

---

## Copy-paste (LaTeX)

```latex
\begin{itemize}
  \item \textbf{RQ1:} What dependency and contract exposure do the selected Java files have before AI refactoring?
  \item \textbf{RQ2:} What ripple-effect risks are introduced by dependency-aware single-prompt AI refactoring?
  \item \textbf{RQ3:} Does LangGraph-based multi-agent orchestration reduce ripple-effect risks compared with dependency-aware single-prompt refactoring?
  \item \textbf{RQ4:} How do frontier models differ in ripple-risk behaviour across single-prompt and multi-agent refactoring?
  \item \textbf{RQ5:} Which file, model, orchestration, and edit characteristics are associated with high ripple risk?
\end{itemize}
```
