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
```

Artifacts and workspaces are typically written under:

```text
~/.refactai/workspaces/
~/.refactai/workspaces/ripple_study_runs/<study_id>/
```

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
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
./start.sh
```

Important modules:

| Module | Purpose |
|--------|---------|
| `ripple_ref_study.py` | B0 V1/V2 single-prompt candidate runs |
| `ma_ref_study.py` | Multi-agent study runner |
| `refactor_graph.py` | LangGraph orchestration |
| `llm_prompts.py` / `llm_client.py` | Prompts and provider routing |
| `refactor_nodes/` | Plan / edit / verify nodes (incl. MA ripple verify) |

## Web UI

```bash
cd web/app
npm install
npm run dev
```

Open `http://localhost:3001` (or `NEXT_PUBLIC_FRONTEND_PORT`). In the dashboard, open:

- **RIPPLE-REF Study** — single-prompt arm  
- **Multi-Agent Study** — MA arm  

Primary UI modules: `app/components/RippleRefStudyPanel.tsx`, `MaRefStudyPanel.tsx`, `app/lib/rippleRefStudy.ts`, `maRefStudy.ts`.

## Scripts

From repo root (after API + agents are healthy):

```bash
# Examples — read each script header before running
bash scripts/preflight-ripple-ref-repos.sh
bash scripts/run-ripple-ref-master-overnight.sh
bash scripts/run-ma-ref-master-overnight.sh
```

Shared helpers: `scripts/ripple-ref-lib.sh`, `scripts/ma-ref-pipeline-lib.sh`.

## Sanity checks

1. API health endpoint responds  
2. Agents process can reach OpenRouter with your key  
3. UI loads and can list/create a study  
4. One smoke candidate on a tiny Java file completes with artifacts on disk  

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Agents cannot call models | `agents/.env` key; network; model slug |
| UI cannot reach API | CORS / base URL in web client; API port |
| Maven dependency errors | Build from `backend/` with parent POM; JDK 17 |
| Empty study dirs | Permissions on `~/.refactai`; study id spelling |
