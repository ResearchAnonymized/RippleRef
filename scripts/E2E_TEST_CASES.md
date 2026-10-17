# RefactAI end-to-end test matrix (PMD + agents)

> **Full feature catalog (UI + research + file size):** see [FEATURE_TEST_MATRIX.md](./FEATURE_TEST_MATRIX.md)  
> **Run all automated tests:** `./scripts/run-feature-tests.sh`

Run the automated smoke suite (requires backend + agents up, and at least one workspace):

```bash
cd /path/to/refactai
./scripts/e2e-refactai-smoke.sh
# Optional: pick workspace explicitly
WORKSPACE_ID=project-xxxxx ./scripts/e2e-refactai-smoke.sh
# Optional: run full agent refactor on one small file (needs OPENROUTER key on agents; slow)
E2E_RUN_AGENTS_REFACTOR=1 ./scripts/e2e-refactai-smoke.sh
```

Environment defaults:

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_BASE` | `http://localhost:8083/api` | Spring Boot |
| `AGENTS_BASE` | `http://localhost:8091` | FastAPI agents |
| `WORKSPACE_ID` | (first from `GET /workspaces`) | Project under test |

---

## 1. First-level file list (PMD counts per file)

| ID | Objective | Steps | Pass criteria |
|----|-------------|-------|-----------------|
| **1.1** | Paginated listing runs PMD when requested | `GET {API_BASE}/workspaces/{id}/files/paginated?page=0&size=30&analyzeCodeSmells=true` | HTTP 200; JSON has `files` array; each `.java` entry has numeric or null `codeSmells` (null allowed for non-Java); no server error |
| **1.2** | Counts are stable for unchanged files | Same request twice | Same `codeSmells` for the same `relativePath` (same `lastModified`) |
| **1.3** | PMD engine is active (not legacy Fowler strings in API) | Inspect one file with `codeSmells > 0`, then **2.1** for detail | `analyze-file` smell `type` / `title` looks like **PMD rule ids** (e.g. `ExcessiveClassLength`, `EmptyCatchBlock`), not legacy display strings like `Large Class` |

---

## 2. Per-file “Analyze” (enhanced analysis = PMD)

| ID | Objective | Steps | Pass criteria |
|----|-------------|-------|-----------------|
| **2.1** | On-disk file analysis | `POST {API_BASE}/workspace-enhanced-analysis/analyze-file` body `{"workspaceId":"…","filePath":"relative/path/To.java"}` | HTTP 200; `codeSmells` is array; each item has `severity`, `description` (or `title`) |
| **2.2** | Live buffer analysis (temp file) | `POST …/analyze-live` with `workspaceId`, `filePath`, `content` = small Java with empty `catch` | `codeSmells.length >= 1` (quickstart includes empty catch) |
| **2.3** | PMD reacts to content change | `analyze-live` with “bad” snippet, then with “fixed” snippet (e.g. log in catch) | Second response has **fewer or equal** violations than first (not a strict theorem; script uses a strong empty-catch vs commented catch pair) |

---

## 3. Multi-agent pipeline (agents service)

| ID | Objective | Steps | Pass criteria |
|----|-------------|-------|-----------------|
| **3.1** | Agents healthy | `GET {AGENTS_BASE}/agents/health` | `status` ok / JSON indicates service up |
| **3.2** | Analyze-only agent path (no LLM refactor) | `POST {AGENTS_BASE}/agents/analyze` body `{"workspaceId":"…","filePath":"…"}` | HTTP 200; `success` true preferred; `steps` includes analysis; `smells` or plan populated when file has issues |
| **3.3** | Batch dry-run | `POST {AGENTS_BASE}/agents/refactor-batch` body `{"workspaceId":"…","dryRun":true,"maxFiles":5}` | HTTP 200; `dryRun` true; `filePaths` is array (may be empty if no smelly files in listing) |
| **3.4** | Full refactor (optional, costly) | `POST {AGENTS_BASE}/agents/refactor` with same `workspaceId` / `filePath` for a **small** `.java` file | With `E2E_RUN_AGENTS_REFACTOR=1`: `success` true **or** structured `success` false with `error` (quota/network); `steps` present; if success, `deltas` may include smell before/after |

---

## 4. Post-refactor PMD (before / after)

| ID | Objective | Steps | Pass criteria |
|----|-------------|-------|-----------------|
| **4.1** | Backend smell count after disk change | After a successful apply from agents or manual `POST /api/refactoring/apply`, re-run **2.1** | `codeSmells` length reflects new file contents |
| **4.2** | Agent-reported deltas | Inspect `POST /agents/refactor` response `deltas` / `experiment` fields when present | Contains before/after smell counts or metrics consistent with re-running **2.1** |

---

## 5. UI (manual spot-check)

| ID | Objective | Steps | Pass criteria |
|----|-------------|-------|-----------------|
| **5.1** | File list badges | Open Files dashboard with “smell” column | Numbers match order-of-magnitude from **1.1** for same workspace |
| **5.2** | File analysis panel | Open a Java file → Analyze | List shows PMD-style rule names, not legacy-only labels |
| **5.3** | After refactor | Apply AI refactor on small file → re-analyze | Smell count drops or rule set changes plausibly |

---

## Troubleshooting

- **Stale Java behaviour**: run `./restart_all.sh` (builds server JAR) or `cd backend/server && mvn -DskipTests package` before `java -jar …`.
- **Smell `type` shows legacy labels** (e.g. `Missing Test Coverage`, `Large Class`): the API is almost certainly still running a **pre-PMD** server JAR — rebuild and restart, then re-run `./scripts/e2e-refactai-smoke.sh`.
- **No workspaces**: upload/clone a project first; script exits with a clear message.
- **Agents refactor always fails**: check `agents/.env` for `OPENROUTER_API_KEY` and `agents/agents.log`.
