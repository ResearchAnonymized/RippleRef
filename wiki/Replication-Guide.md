# Replication guide

How to use this package to run a **similar** RippleREF experiment.

## Goals vs non-goals

| Do | Don't |
|----|-------|
| Rebuild UI + API + agents from this tree | Expect bundled Excel result tables |
| Pin models, seeds, token caps | Silently change protocol mid-run |
| Persist all artifacts per pair key | Overwrite historical study dirs carelessly |
| Document exact model slugs and dates | Claim bit-identical LLM outputs |

## Minimal replication checklist

1. **Environment** — JDK 17, Node 18+, Python 3.10+, OpenRouter key ([Setup](Setup.md))  
2. **Subject systems** — clone Java repos into workspaces the API expects  
3. **Cohort** — select production files (UI or scripts); lock a manifest JSON/CSV  
4. **Contexts** — build dependency context packages for selected files  
5. **B0-V2** — run single-prompt candidates for each `(file, model)`  
6. **MA** — import the same file cohort; run multi-agent candidates  
7. **Verify** — ensure apply-and-verify completed; inspect ripple reports  
8. **Analyze** — export CSV/JSON yourself; apply your own statistics notebook  

## Smoke test (one file)

Before overnight batches:

1. Pick one small production `.java` file in one repo  
2. Run B0-V2 for one model  
3. Confirm under `ripple_study_runs/<study>/`: prompt, response, candidate, profiles, ripple report  
4. Run MA for the same file/model  
5. Compare statuses and risk fields  

## Batch runs

Use scripts under `scripts/` only after reading headers and setting study IDs:

- `run-ripple-ref-master-overnight.sh`  
- `run-ma-ref-master-overnight.sh`  
- `preflight-ripple-ref-repos.sh`  

Expect **hours–days** and non-trivial LLM cost for hundreds of pairs.

## Fair comparison tips

- Same cohort files for B0-V2 and MA  
- Same models and temperature / token settings unless ablating  
- Same verifier build (do not mix unverified code changes mid-study)  
- Record `RIPPLE_REF_MAX_OUTPUT_TOKENS`, graph version, commit hash of this package  

## Validity pitfalls

- Token-cap truncation can yield incomplete Java that still passes lightweight sanitizers  
- Missing on-disk artifacts ≠ automatic invalid historical rows — separate storage failures from generation failures  
- Prefer an independent Java parser when auditing candidate completeness  

## Publishing your replication

1. Publish **code** (this package or your fork)  
2. Publish **cohort manifests** and **configuration**  
3. Optionally publish **anonymized metrics CSV** (not required in this template)  
4. Cite RippleREF + your paper  

## Support map

| Question | Where |
|----------|-------|
| How components connect | [Architecture](Architecture.md) |
| How agents work | [Agentic systems](Agentic-Systems.md) |
| Protocol details | [Experiment protocol](Experiment-Protocol.md) |
| Deep implementation | `docs/RIPPLE_REF_TECHNICAL_SETUP.md` |
