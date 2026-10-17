# Architecture

## System context

```mermaid
flowchart TB
  subgraph operators [Operators]
    RES[Researcher]
  end
  subgraph rippleref [RippleREF package]
    UI[Next.js Web UI]
    API[Spring Boot API]
    AG[Python Agents]
    SCR[Bash / Python scripts]
  end
  subgraph external [External]
    LLM[OpenRouter / LLM providers]
    GIT[Subject GitHub Java repos]
  end
  subgraph storage [Local storage]
    WS["~/.refactai/workspaces"]
    RUN["ripple_study_runs/<study>"]
  end
  RES --> UI
  RES --> SCR
  UI --> API
  UI --> AG
  SCR --> API
  SCR --> AG
  AG --> LLM
  AG --> API
  API --> GIT
  API --> WS
  API --> RUN
```

## Component map

| Component | Tech | Responsibility |
|-----------|------|----------------|
| Web UI | Next.js / React | Study configuration, progress, results tables, MA pipeline view |
| Study API | Spring Boot | Repo scan, file selection, dependency context, verify, artifact I/O |
| Agents | Python + LangGraph | LLM generation (B0 and MA) |
| Scripts | Bash/Python | Batch overnight runs, backfills, exports |
| Workspaces | Filesystem | Cloned repos + per-candidate artifacts |

## Backend ripple package

```mermaid
flowchart LR
  CTRL[RippleRefStudyController] --> SVC[RippleRefStudyService]
  SVC --> SEL[FileSelector / ProductionClassifier]
  SVC --> SCAN[DependencyScanner]
  SVC --> CTX[ContextBuilder]
  SVC --> EXT[JavaProfileExtractor]
  SVC --> VER[RippleVerifier]
  VER --> L2[CallerImpactAnalyzer]
  VER --> L3[CompileProbe]
  VER --> L5[TestProbe / BehavioralVerifier]
```

Profiling is **regex / textual** (not JavaParser/JDT on the study path). Smell eligibility may use **PMD**. See `docs/RIPPLE_REF_TECHNICAL_SETUP.md`.

## Artifact layout (per study)

```text
ripple_study_runs/<study_id>/
  results_candidates.csv
  results_candidates.json
  prompts/
  model_responses/
  generated_candidates/
  before_profiles/  after_profiles/
  ripple_reports/   behavioral_reports/
  dependency_contexts/
  diffs/  original_files/  agent_traces/  ...
```

Identity key:

```text
pair_key = project_id | file_path | model_id | variant
```

## Single-prompt vs multi-agent path

```mermaid
sequenceDiagram
  participant UI
  participant AG as Agents
  participant API as Study API
  participant LLM
  UI->>API: create study / select cohort / build contexts
  alt B0-V2
    UI->>AG: run ripple_ref candidate
    AG->>API: fetch dependency context
    AG->>LLM: V2 prompt + source
    LLM-->>AG: candidate text
    AG->>API: store prompt/response/candidate
  else P-MA
    UI->>AG: run ma_ref candidate
    AG->>AG: LangGraph plan/edit/verify loop
    AG->>LLM: multiple agent calls
    AG->>API: store artifacts / traces
  end
  AG->>API: apply-and-verify
  API-->>UI: risk / adoption / reports
```

## Web UI entry points

- Dashboard nav: **RIPPLE-REF Study**, **Multi-Agent Study**  
- Panels: `RippleRefStudyPanel`, `MaRefStudyPanel`, results tables, L5 pipeline panels  
