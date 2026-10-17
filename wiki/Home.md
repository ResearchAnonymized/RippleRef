# RippleREF Wiki

Welcome. This wiki explains how the **RippleREF** platform runs repository-level ripple experiments for LLM Java refactoring.

## Reading order

1. [Setup](Setup.md) — install and run UI / API / agents  
2. [Architecture](Architecture.md) — components and data flow (diagrams)  
3. [Agentic systems](Agentic-Systems.md) — single-prompt vs multi-agent  
4. [Experiment protocol](Experiment-Protocol.md) — cohort, models, L1–L5  
5. [Replication guide](Replication-Guide.md) — how to run your own study  

## Related docs

| Doc | Location |
|-----|----------|
| Technical setup (deep) | [`../docs/RIPPLE_REF_TECHNICAL_SETUP.md`](../docs/RIPPLE_REF_TECHNICAL_SETUP.md) |
| B0 integrity | [`../docs/RIPPLE_REF_RESEARCH_INTEGRITY.md`](../docs/RIPPLE_REF_RESEARCH_INTEGRITY.md) |
| MA integrity | [`../docs/MA_RESEARCH_INTEGRITY.md`](../docs/MA_RESEARCH_INTEGRITY.md) |
| L5 testing notes | [`../docs/L5_BEHAVIORAL_TESTING_PAPER_REFERENCE.md`](../docs/L5_BEHAVIORAL_TESTING_PAPER_REFERENCE.md) |
| Paper-facing snapshots | [`../docs/paper/`](../docs/paper/) |
| Experimental setting | [`EMSE_Experimental_Setting.md`](EMSE_Experimental_Setting.md) |
| MA architecture narrative | [`EMSE_Multi_Agent_Architecture.md`](EMSE_Multi_Agent_Architecture.md) |

## Design principles

- **Same verification path** for single-prompt and multi-agent candidates  
- **Artifacts first**: prompts, responses, candidates, profiles, ripple reports  
- **No silent “completed” without stored evidence** in a well-run study  
- **Code replication package** — results Excel files are not shipped here  
