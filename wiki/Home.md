# RippleRef Wiki

<p align="center"><img src="../docs/assets/banner.gif" alt="RippleRef" width="100%"/></p>

**Most refactoring tools ask: did the file change?**  
**RippleRef asks: what moved in the dependency graph?**

This wiki is the operator manual for the open research stack — Web UI, Spring API, Python / LangGraph agents, and batch scripts.

## Reading path (30 minutes)

| # | Page | Payoff |
|---|------|--------|
| 1 | [Setup](Setup.md) | UI + API + agents running locally |
| 2 | [Architecture](Architecture.md) | How generation meets the shared verifier |
| 3 | [Agentic systems](Agentic-Systems.md) | Single-prompt V2 vs multi-agent loop |
| 4 | [Experiment protocol](Experiment-Protocol.md) | Cohort thinking, L1–L5, integrity |
| 5 | [Replication guide](Replication-Guide.md) | Run *your* study without cargo-culting ours |

## Deep references

| Doc | Why open it |
|-----|-------------|
| [`../docs/RIPPLE_REF_TECHNICAL_SETUP.md`](../docs/RIPPLE_REF_TECHNICAL_SETUP.md) | Implementation-level truth |
| [`../docs/RIPPLE_REF_RESEARCH_INTEGRITY.md`](../docs/RIPPLE_REF_RESEARCH_INTEGRITY.md) | B0 rules / risk definitions |
| [`../docs/MA_RESEARCH_INTEGRITY.md`](../docs/MA_RESEARCH_INTEGRITY.md) | Multi-agent pairing rules |
| [`../docs/L5_BEHAVIORAL_TESTING_PAPER_REFERENCE.md`](../docs/L5_BEHAVIORAL_TESTING_PAPER_REFERENCE.md) | Test-probe reporting |
| [`EMSE_Experimental_Setting.md`](EMSE_Experimental_Setting.md) | Experimental setting narrative |
| [`EMSE_Multi_Agent_Architecture.md`](EMSE_Multi_Agent_Architecture.md) | MA architecture write-up |

## One picture to remember

<p align="center">
  <img src="../docs/assets/architecture.gif" alt="Control → Generate → Verify → Evidence" width="100%"/>
</p>

Same verify path for single-prompt and multi-agent → fair science. More detail: [Architecture](Architecture.md).
