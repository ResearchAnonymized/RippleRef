# REFINE Agents Service

Multi-agent orchestrator for Analyze → Plan → Refactor → Verify → Apply.

## Run

1) Create an `.env` (or export vars) with:

```
OPENROUTER_API_KEY=YOUR_KEY
BACKEND_BASE=http://localhost:8081/api
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
PORT=8091
```

2) Install deps and run:

```
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port ${PORT:-8091}
```

## Endpoint

POST `/agents/refactor-file`

```json
{
  "workspaceId": "project-xxx",
  "filePath": "src/main/java/.../MyClass.java",
  "goals": ["reduce smells", "improve readability"]
}
```

Returns the step log, refactored content, deltas, and apply result (if applied).

## Frontend

Next.js rewrite is configured to proxy `/agents/*` → `http://localhost:8091/*`.


