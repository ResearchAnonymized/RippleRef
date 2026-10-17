# RefactAI feature test matrix

Use this document to verify **every major feature** after changes. Automated scripts are listed in each section; manual UI steps are marked **UI**.

**Prerequisites:** `./restart_all.sh` (or backend `:8083`, agents `:8091`, web `:4000` running).

**Quick automated run (no LLM cost):**

```bash
./scripts/run-feature-tests.sh
```

**Full API smoke (needs workspace + curl):**

```bash
./scripts/e2e-refactai-smoke.sh
```

**Optional live LLM refactor (slow, needs `OPENROUTER_API_KEY` in `agents/.env`):**

```bash
E2E_RUN_AGENTS_REFACTOR=1 ./scripts/e2e-refactai-smoke.sh
```

---

## A. Infrastructure and health

| ID | Feature | Type | Steps | Pass criteria |
|----|---------|------|-------|----------------|
| A.1 | Backend health | Auto | `curl -s http://localhost:8083/api/health` | JSON with `status` |
| A.2 | Agents health | Auto | `curl -s http://localhost:8091/agents/health` | `status: ok`; `hasOpenRouterKey` reflects `.env` |
| A.3 | Web app loads | UI | Open `http://localhost:4000` | Dashboard or project hub renders |
| A.4 | Service restart | Manual | `./restart_all.sh` | All three ports respond to A.1–A.2 |

---

## B. Workspaces and upload

| ID | Feature | Type | Steps | Pass criteria |
|----|---------|------|-------|----------------|
| B.1 | List workspaces | Auto | `GET /api/workspaces` | Array with at least one project after upload |
| B.2 | Upload project (zip/dir) | UI | Projects → upload gantt or sample | Progress completes; files listed |
| B.3 | Lightweight file list | Auto | `GET .../files/paginated?analyzeCodeSmells=false` | Fast response; smell field may be cached/null |
| B.4 | Full PMD file list | Auto | `GET .../files/paginated?analyzeCodeSmells=true` | Java files have `codeSmells` numbers |
| B.5 | Large project upload (>400 Java) | UI | Upload 1000+ file project | No infinite hang; hub loads; note in UI if assess skipped |
| B.6 | Open project resume | UI | Re-open saved project | Files/smells load; not stuck at 0% |

---

## C. PMD smell detection

| ID | Feature | Type | Steps | Pass criteria |
|----|---------|------|-------|----------------|
| C.1 | analyze-file (on disk) | Auto | `POST /api/workspace-enhanced-analysis/analyze-file` | `codeSmells[]` with PMD-style `type` |
| C.2 | analyze-live (buffer) | Auto | `POST .../analyze-live` with Java `content` | Smells match snippet; temp file cleaned |
| C.3 | Smell severity breakdown | UI | Open file with smells | Critical / Major / Minor counts shown |
| C.4 | Legacy assessment smells not mixed | UI | File with only PMD | No `design.*` legacy-only labels dominating |
| C.5 | Re-analyze after edit | UI | Edit not required — refactor apply then C.1 | Count changes if file on disk changed |

---

## D. User profiles

| ID | Feature | Type | Steps | Pass criteria |
|----|---------|------|-------|----------------|
| D.1 | List profiles | Auto | `GET /api/users` | Includes saved profiles |
| D.2 | Select profile | UI | Pick existing user (e.g. Waseem) | Session loads; not forced to “Create only” |
| D.3 | Backend down | UI | Stop backend, open app | Error banner + Retry; not fake “create profile” |
| D.4 | Create duplicate name | UI | Create profile with existing name | Reuses existing id (no duplicate crash) |

---

## E. Controlled refactoring — small file (happy / reject paths)

**Fixture:** `examples/sample-java-repo` or any `.java` with 5–50 smells, &lt; 800 lines.

| ID | Feature | Type | Steps | Pass criteria |
|----|---------|------|-------|----------------|
| E.1 | Start Refactoring | UI | Smells loaded → **Start Refactoring** | Pipeline steps advance; ends on **Review** |
| E.2 | No stale file buffer | UI | Open file A, then file B (88 smells), refactor B | Metrics show B’s line count (~2k), not A’s (~980) |
| E.3 | Review: smell header vs metrics | UI | After E.1 on Scalr-scale file | Header PMD ≈ verify-step smells (±5); mismatch banner if not |
| E.4 | Identical LLM output | Auto/UI | Large file or repeated failure | `failureOutcome` or rejection `IDENTICAL_CODE`; research report still on Review |
| E.5 | Rejected but research complete | UI | Failed verify | Banner “not adopted”; Evidence panel + Export CSV + Save report enabled |
| E.6 | Successful adopt | UI | Small clean refactor | Green banner; optional “Saved in project”; smells decrease or explained |
| E.7 | Diff view | UI | **View Changes (Diff)** | Side-by-side; line stats match summary |
| E.8 | Rollback | UI | **Rollback** after apply | File restored from snapshot |
| E.9 | Save full report | UI | **Save full report** on Review | Reload via View report — same metrics |
| E.10 | Export report CSV | UI | Export buttons | Downloads non-empty CSV |
| E.11 | Export research metrics CSV | UI | Export research metrics | Sheet includes before/after rows |
| E.12 | Multi-agent 8 steps | UI | Expand pipeline | Load → Analyze → Plan → Feasibility → Refactor → Verify → Apply → Compile → Analysis |
| E.13 | Agent analyze only | Auto | `POST /agents/analyze` | `decision`, `refactoringPlan`, `steps` |
| E.14 | Execute path (advanced) | UI | Advanced → plan → **Start Execution** | Same end state as E.1 (Review) |

---

## F. File size policy (5k / 25k / 1M LOC)

| ID | Feature | Type | Steps | Pass criteria |
|----|---------|------|-------|----------------|
| F.1 | Policy unit tests | Auto | `python3 agents/test_file_size_policy.py` | All tests pass |
| F.2 | ~5000 LOC attempt | UI/Auto | File with ~5k lines + refactor | Feasibility warns; LLM runs; long timeout OK |
| F.3 | ~25k+ LOC skip LLM | Auto | `assess_refactor_feasibility` → 30k lines | `invokeLlm: false`, block code set |
| F.4 | ~25k+ LOC pipeline | UI | Real file &gt;25k lines in workspace | Feasibility step; Refactor skipped; **Why refactoring did not complete** panel |
| F.5 | ~1M LOC | UI | Million-line file if available | No 25-min hang; clear “exceeds limit” message; smells/analysis may still run |
| F.6 | Client timeout scale | UI | Check amber notice under Start Refactoring | Mentions minutes scaled to line count |
| F.7 | Stale content ignored (agents) | Auto | Send `content` with 100 lines, workspace has 5k | Agents log: ignore client buffer; use workspace |
| F.8 | Partial LLM output | UI | ~2k line file with marginal LLM change | Amber “partial file” if candidate lines &lt; 85% original |

---

## G. Research artifacts and persistence

| ID | Feature | Type | Steps | Pass criteria |
|----|---------|------|-------|----------------|
| G.1 | Saved refactoring report API | Auto | `mvn test -Dtest=SavedRefactoringReportServiceTest` | Tests pass |
| G.2 | Refactored artifacts on disk | Auto | `mvn test -Dtest=RefactoredArtifactsServiceTest` | Tests pass |
| G.3 | File status integration | Auto | `mvn test -Dtest=FileStatusArtifactsIntegrationTest` | Tests pass |
| G.4 | PMD cache persistence | Auto | `mvn test -Dtest=PmdAnalysisPersistenceTest` | Tests pass |
| G.5 | verify-refactai script | Auto | `./scripts/verify-refactai-persistence.sh` | Backend tests + type-check |
| G.6 | View saved report (UI) | UI | After G.2 run, **View report** on file | FullSavedRefactoringReportView loads |

---

## H. Assessment and project hub

| ID | Feature | Type | Steps | Pass criteria |
|----|---------|------|-------|----------------|
| H.1 | Assessment response policy | Auto | `mvn test -Dtest=AssessmentResponsePolicyTest` | Pass |
| H.2 | Lightweight assess after upload | UI | Upload large project | Hub opens without full per-file PMD during upload |
| H.3 | Manual assess | UI | Run assess when offered | Progress completes or clear error (not generic only) |

---

## I. Dependencies and graphs

| ID | Feature | Type | Steps | Pass criteria |
|----|---------|------|-------|----------------|
| I.1 | File impact graph | UI | Refactoring tab → dependency section | Graph loads for selected file |
| I.2 | Ripple impact API | Auto | `mvn test -Dtest=RippleImpactControllerMvcTest` | Pass |

---

## J. Negative and edge cases

| ID | Feature | Type | Steps | Pass criteria |
|----|---------|------|-------|----------------|
| J.1 | No API key | UI | Remove key from `agents/.env`, restart agents | Clear error on refactor; health shows no key |
| J.2 | Agents down | UI | Stop agents, refactor | Connection error message |
| J.3 | Browser timeout | UI | Refactor huge file, close tab early | Abort; can retry |
| J.4 | Double-click refactor | UI | Start twice quickly | Second run ignored or queued; no mixed metrics |
| J.5 | Next file | UI | **Next File** on Review | Switches file; prior metrics cleared |
| J.6 | Empty Java file | Auto | analyze-file on empty class | 0 smells; refactor completes with message |
| J.7 | Non-Java file | UI | Open `.xml` / resource | Refactor not offered or graceful skip |

---

## K. LLM and OpenRouter

| ID | Feature | Type | Steps | Pass criteria |
|----|---------|------|-------|----------------|
| K.1 | OpenRouter test script | Manual | `python3 agents/test_openrouter.py` | Key valid (if configured) |
| K.2 | Context length exceeded | UI | Very large file in attempt tier | `failureOutcome` mentions context / tokens |
| K.3 | Output truncated | UI | Large refactor | `OUTPUT_TRUNCATED` or verify `size_change` reject |
| K.4 | Refactor batch dry-run | Auto | `POST /agents/refactor-batch` `dryRun:true` | Returns path list without LLM |

---

## L. Regression checklist (before paper / demo)

Run in order:

1. `./scripts/run-feature-tests.sh`
2. `./scripts/e2e-refactai-smoke.sh`
3. UI: **B.2** upload → **C.3** smells → **E.1** small file refactor → **E.5** save report
4. UI: **E.2** switch file (stale buffer) on known Scalr + previous small file
5. UI or **F.4**: one oversized file for **failureOutcome** panel
6. Export CSVs for paper appendix

---

## Traceability: code ↔ tests

| Area | Automated tests | Manual IDs |
|------|-----------------|------------|
| File size policy | `agents/test_file_size_policy.py`, `agents/test_refactor_response_contract.py` | F.* |
| Response JSON contract | `agents/test_refactor_response_contract.py` | E.4–E.5 |
| PMD detector | `ComprehensiveCodeSmellDetectorTest` | C.* |
| Saved reports | `SavedRefactoringReportServiceTest` | G.6 |
| Ingest / UI helpers | `web/app/app/lib/__tests__/ingestRefactorResponse.test.mjs` | E.2–E.3 |
| E2E API | `scripts/e2e-refactai-smoke.sh` | A, B, C, K.4 |
| Full agent flow | `agents/test_refactoring_system.py` | E.* |
