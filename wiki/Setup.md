# Setup

## Prerequisites

| Tool | Version |
|------|---------|
| JDK | 17+ |
| Maven | 3.8+ |
| Node.js | 18+ |
| npm | 9+ |
| Python | 3.10+ |

## Environment

```bash
cp agents/.env.example agents/.env
# set OPENROUTER_API_KEY and model IDs

# Optional UI overrides
cp web/app/.env.example web/app/.env.local
```

Canonical ports live in repo-root [`ports.env`](../ports.env):

| Service | Port |
|---------|------|
| Spring API | **8083** |
| Python agents | **8091** |
| Next.js UI | **3001** |

Artifacts and workspaces are typically written under:

```text
~/.refactai/workspaces/
~/.refactai/workspaces/ripple_study_runs/<study_id>/
```

## Fast path

```bash
# 1) API — package then run main class ai.refact.server.RefactAIServerApplication
cd backend && mvn -pl server -am package -DskipTests

# 2) Agents
./start_daemon.sh start          # or: cd agents && ./start.sh
./start_daemon.sh status

# 3) UI
cd web/app && npm install && npm run dev
# → http://localhost:3001 → RIPPLE-REF Study / Multi-Agent Study
```

Study panels are **enabled by default** in this package. Set `NEXT_PUBLIC_ENABLE_RIPPLE_REF_STUDY=0` only if you want to hide them.

## Backend (API)

```bash
cd backend
mvn -pl server -am clean package -DskipTests
```

Run the Spring Boot application from `backend/server` (main class `ai.refact.server.RefactAIServerApplication`). HTTP port defaults to **8083** (`application.yml`).

Key RIPPLE-REF REST surface (prefix may include `/api`):

- Study create / scan / select files / build contexts  
- Artifact upload: prompt, response, candidate  
- Apply-and-verify  

Controller: `…/controller/RippleRefStudyController.java`  
Service: `…/service/rippleref/RippleRefStudyService.java`

## Agents (Python)

```bash
cd agents
./start.sh    # creates .venv, defaults MULTI_LLM_AGENT_MODE=full
```

Important modules:

| Module | Purpose |
|--------|---------|
| `ripple_ref_study.py` | B0 V1/V2 single-prompt candidate runs |
| `ma_ref_study.py` | Multi-agent study runner |
| `refactor_graph.py` | LangGraph orchestration |
| `llm_prompts.py` / `llm_client.py` | Prompts and provider routing |
| `refactor_nodes/` | Plan / edit / verify / prepare_revise (MA) |

Architecture: [`../agents/AGENT_ARCHITECTURE.md`](../agents/AGENT_ARCHITECTURE.md).

## Web UI

```bash
cd web/app
npm install
npm run dev
```

Open `http://localhost:3001`. Dashboard tabs:

- **RIPPLE-REF Study** — single-prompt arm  
- **Multi-Agent Study** — MA arm  

Primary UI modules: `app/components/RippleRefStudyPanel.tsx`, `MaRefStudyPanel.tsx`, `app/lib/rippleRefStudy.ts`, `maRefStudy.ts`.

## Scripts

From repo root (after API + agents are healthy):

```bash
./start_daemon.sh status
bash scripts/preflight-ripple-ref-repos.sh
bash scripts/run-ripple-ref-master-overnight.sh
bash scripts/run-ma-ref-master-overnight.sh
```

Shared helpers: `scripts/ripple-ref-lib.sh`, `scripts/ma-ref-pipeline-lib.sh`.

## Sanity checks

1. `./start_daemon.sh status` shows API + agents OK  
2. Agents can reach OpenRouter with your key  
3. UI loads study tabs and can list/create a study  
4. One smoke candidate on a tiny Java file completes with artifacts on disk  

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Agents cannot call models | `agents/.env` key; network; model slug |
| UI cannot reach API / agents | Ports in `ports.env` (8083 / 8091); hard-refresh |
| Maven dependency errors | Build from `backend/` with parent POM; JDK 17 |
| Empty study dirs | Permissions on `~/.refactai`; study id spelling |
| Study tabs missing | Ensure `NEXT_PUBLIC_ENABLE_RIPPLE_REF_STUDY` is not `0` |
