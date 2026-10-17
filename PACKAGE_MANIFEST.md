# RippleREF package manifest

Built as a **code-first** replication package from the RefactAI monorepo.

## Included

| Path | Contents |
|------|----------|
| `agents/` | Python agents, LangGraph, prompts, MA + RippleREF study runners (no `.venv`, no `.env`, no `baseline_comparison/`) |
| `backend/` | Parent POM, `core/` modules, `server/` Spring Boot API including `rippleref` |
| `web/app/` | Next.js UI including RIPPLE-REF / MA study panels (no `node_modules`) |
| `scripts/` | Overnight runners, libs, export/helper scripts |
| `docs/` | Technical setup + integrity + L5 notes + paper-facing markdown snapshots |
| `wiki/` | Human wiki with Mermaid diagrams |
| `README.md`, `LICENSE`, `CITATION.cff`, `.gitignore`, `agents/.env.example` | Project meta |

## Excluded on purpose

- All `*.xlsx` / result workbooks  
- Secrets (`.env`)  
- `node_modules/`, `.venv/`, `target/`, `.next/`  
- ICSE / REFINE product trees  
- Historical `~/.refactai/workspaces/ripple_study_runs/` dumps  
- ICSE wiki pages  

## Suggested GitHub repository name

**`RippleRef`** — public — `https://github.com/ResearchAnonymized/RippleRef`

Not named after a venue (avoid “TSE-replication”).
