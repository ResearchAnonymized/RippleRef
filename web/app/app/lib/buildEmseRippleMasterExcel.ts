/**
 * EMSE Ripple-REF + MA-REF master data workbook for paper analysis (RQ1–RQ5).
 */

import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const EMSE_RIPPLE_MASTER_FILENAME = 'EMSE_RIPPLE_MASTER_DATA.xlsx';
export const EMSE_B0_MASTER_FILENAME = 'EMSE_B0_MASTER_DATA.xlsx';
export const EMSE_MA_MASTER_FILENAME = 'EMSE_MA_MASTER_DATA.xlsx';
export const EMSE_MASTER_ALL_SHEETS_FILENAME = 'EMSE_MASTER_ALL_SHEETS.xlsx';
export const EMSE_ANALYSIS_MASTER_FILENAME = 'EMSE_ANALYSIS_RQ3_RQ5_DATA.xlsx';
/** One workbook: cohort + every RQ in raw candidate/file form (no stats, no per-model splits). */
export const EMSE_RAW_MASTER_ALL_RQS_FILENAME = 'EMSE_RAW_MASTER_ALL_RQs.xlsx';

/** Five frontier models — one sheet per model in B0 and MA workbooks */
export const EMSE_MODELS = [
  { id: 'anthropic/claude-opus-4.8', sheet: 'Claude_Opus_4_8', label: 'Claude Opus 4.8' },
  { id: 'openai/gpt-5.5', sheet: 'GPT_5_5', label: 'GPT-5.5' },
  { id: 'google/gemini-3.1-pro-preview', sheet: 'Gemini_3_1_Pro', label: 'Gemini 3.1 Pro' },
  { id: 'deepseek/deepseek-v4-pro', sheet: 'DeepSeek_V4_Pro', label: 'DeepSeek V4 Pro' },
  { id: 'qwen/qwen3.6-plus', sheet: 'Qwen_3_6_Plus', label: 'Qwen 3.6 Plus' },
] as const;

type CsvRow = Record<string, string>;

export type EmseStudyPaths = {
  rippleRefDir: string;
  maRefDir: string;
  outputPath: string;
};

type CohortFile = {
  projectId: string;
  filePath: string;
  repositoryName?: string;
  samplingGroup?: string;
  selectionReason?: string;
  loc?: number;
  smellCount?: number;
  fanIn?: number;
  fanOut?: number;
  publicApiCount?: number;
  callerUsedApiCount?: number;
  downstreamCallerCount?: number;
  dependencyRiskScore?: number;
  valueScore?: number;
  complexity?: number;
  hasInheritance?: boolean;
  hasInterface?: boolean;
};

function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    return row;
  });
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function readCsv(filePath: string): CsvRow[] {
  if (!fs.existsSync(filePath)) return [];
  return parseCsv(fs.readFileSync(filePath, 'utf8'));
}

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function pairKey(projectId: string, filePath: string, modelId: string, variant: string): string {
  return `${projectId}|${filePath}|${modelId}|${variant}`;
}

function modelShort(modelId: string): string {
  const p = modelId.split('/');
  return p[p.length - 1] ?? modelId;
}

function repoFolder(filePath: string): string {
  return filePath.split('/')[0] ?? filePath;
}

type RippleReport = {
  linesAdded?: number;
  linesRemoved?: number;
  churn?: number;
  methodsAdded?: number;
  methodsRemoved?: number;
  compileProbeStatus?: string;
  compileProbeAttempted?: boolean;
  affectedCallers?: string[];
};

type FileExposure = {
  fanInGraph?: number;
  fanOut?: number;
  downstreamCallerCount?: number;
  callerUsedApiCount?: number;
};

function loadSelectedFilesCsv(rippleDir: string): CohortFile[] {
  const rows = readCsv(path.join(rippleDir, 'selected_files.csv'));
  return rows.map((r) => ({
    projectId: r.project_id ?? '',
    filePath: r.file_path ?? '',
    samplingGroup: r.sampling_group,
    selectionReason: r.selection_reason,
    loc: num(r.loc),
    smellCount: num(r.smell_count),
    fanIn: num(r.fan_in),
    fanOut: num(r.fan_out),
    publicApiCount: num(r.public_api_count),
    callerUsedApiCount: num(r.caller_used_api_count),
    dependencyRiskScore: num(r.dependency_risk_score),
    valueScore: num(r.value_score),
  }));
}

function loadFileExposureMap(rippleDir: string): Map<string, FileExposure> {
  const map = new Map<string, FileExposure>();
  const sharedCsv = path.join(
    process.env.EMSE_SHARED_COHORT_DIR ?? path.join(process.cwd(), '..', '..', '.run/shared_cohort'),
    'fan_in_exposure.csv'
  );
  if (fs.existsSync(sharedCsv)) {
    for (const row of readCsv(sharedCsv)) {
      const fp = row.file_path ?? '';
      if (!fp) continue;
      map.set(fp, {
        fanInGraph: num(row.fan_in_graph),
        fanOut: num(row.fan_out),
        downstreamCallerCount: num(row.downstream_caller_count),
        callerUsedApiCount: num(row.caller_used_api_count),
      });
    }
  }
  const profDir = path.join(rippleDir, 'repository_profiles');
  if (!fs.existsSync(profDir)) return map;
  for (const name of fs.readdirSync(profDir)) {
    if (!name.endsWith('_dependency_scan.json')) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(profDir, name), 'utf8')) as {
        projectId?: string;
        fileProfiles?: Record<
          string,
          { fanIn?: number; fanOut?: number; callerFiles?: string[]; callerUsedApis?: string[] }
        >;
        reverseDependencyGraph?: Record<string, string[]>;
      };
      const reverse = j.reverseDependencyGraph ?? {};
      for (const [fp, prof] of Object.entries(j.fileProfiles ?? {})) {
        const key = fp;
        const reverseLen = reverse[fp]?.length ?? 0;
        const fanInReverse =
          reverseLen > 0 ? reverseLen : (prof.callerFiles?.length ?? prof.fanIn ?? 0);
        const existing = map.get(key);
        map.set(key, {
          fanInGraph: existing?.fanInGraph ?? fanInReverse,
          fanOut: existing?.fanOut ?? prof.fanOut,
          downstreamCallerCount: existing?.downstreamCallerCount ?? prof.callerFiles?.length ?? 0,
          callerUsedApiCount: existing?.callerUsedApiCount ?? prof.callerUsedApis?.length ?? 0,
        });
      }
    } catch {
      /* skip */
    }
  }
  return map;
}

function loadRippleReportMap(studyDir: string): Map<string, RippleReport> {
  const map = new Map<string, RippleReport>();
  const dir = path.join(studyDir, 'ripple_reports');
  if (!fs.existsSync(dir)) return map;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as RippleReport;
      map.set(name.replace(/\.json$/, ''), j);
    } catch {
      /* skip */
    }
  }
  return map;
}

function loadCohortFiles(maDir: string, rippleDir: string): CohortFile[] {
  const manifest = readJson<{
    selectedByRepo?: Record<
      string,
      Array<Record<string, unknown>>
    >;
  }>(path.join(maDir, 'cohort', 'cohort_manifest.json'));

  const files: CohortFile[] = [];
  if (manifest?.selectedByRepo) {
    for (const [projectId, entries] of Object.entries(manifest.selectedByRepo)) {
      for (const e of entries) {
        files.push({
          projectId,
          filePath: String(e.filePath ?? ''),
          samplingGroup: e.samplingGroup != null ? String(e.samplingGroup) : undefined,
          selectionReason: e.selectionReason != null ? String(e.selectionReason) : undefined,
          loc: num(e.loc),
          smellCount: num(e.smellCount),
          fanIn: num(e.fanIn),
          fanOut: num(e.fanOut),
          publicApiCount: num(e.publicApiCount),
          callerUsedApiCount: num(e.callerUsedApiCount),
          downstreamCallerCount: num(e.downstreamCallerCount),
          dependencyRiskScore: num(e.dependencyRiskScore),
          valueScore: num(e.valueScore),
          complexity: num(e.complexity),
          hasInheritance: bool(e.hasInheritance),
          hasInterface: bool(e.hasInterface),
        });
      }
    }
  }
  if (files.length === 0) {
    return loadSelectedFilesCsv(rippleDir);
  }
  return files;
}

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function bool(v: unknown): boolean | undefined {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return undefined;
}

/** Top-level checkout folder in cohort file paths (e.g. guava-master). */
const KNOWN_REPO_LABELS: Record<string, string> = {
  'ant-master': 'Apache Ant',
  'argouml-master': 'ArgoUML',
  'checkstyle-master': 'Checkstyle',
  'eclipse-collections-master': 'Eclipse Collections',
  'ganttproject-master': 'GanttProject',
  'guava-master': 'Guava',
  'jabref-main': 'JabRef',
  'jEdit-master': 'jEdit',
  'jhotdraw-develop': 'JHotDraw',
  'jsoup-master': 'jsoup',
  'junit4-main': 'JUnit4',
  'logback-master': 'Logback',
  'mockito-main': 'Mockito',
  'slf4j-master': 'SLF4J',
  'xerces-j-main': 'Xerces-J',
};

function deriveRepoFolderByProject(cohortFiles: CohortFile[]): Map<string, string> {
  const folders = new Map<string, Set<string>>();
  for (const f of cohortFiles) {
    const folder = repoFolder(f.filePath);
    if (!folder) continue;
    if (!folders.has(f.projectId)) folders.set(f.projectId, new Set());
    folders.get(f.projectId)!.add(folder);
  }
  const out = new Map<string, string>();
  for (const [pid, set] of folders) {
    const sorted = [...set].sort();
    out.set(pid, sorted.length === 1 ? sorted[0]! : sorted.join(' | '));
  }
  return out;
}

function displayRepositoryName(folder: string): string {
  const primary = folder.split(' | ')[0]?.trim() ?? folder;
  if (KNOWN_REPO_LABELS[primary]) return KNOWN_REPO_LABELS[primary];
  return primary
    .replace(/-master$/i, '')
    .replace(/-main$/i, '')
    .replace(/-develop$/i, '');
}

function loadRepoNameMap(rippleDir: string, cohortFiles: CohortFile[]): Map<string, string> {
  const folderByPid = deriveRepoFolderByProject(cohortFiles);
  const map = new Map<string, string>();
  for (const r of readCsv(path.join(rippleDir, 'repositories.csv'))) {
    if (!r.project_id) continue;
    const folder = folderByPid.get(r.project_id) ?? '';
    const fromCsv = (r.repository_name ?? '').trim();
    const name =
      fromCsv && fromCsv !== r.project_id
        ? fromCsv
        : folder
          ? displayRepositoryName(folder)
          : r.project_id;
    map.set(r.project_id, name);
  }
  for (const f of cohortFiles) {
    if (!map.has(f.projectId)) {
      const folder = folderByPid.get(f.projectId) ?? repoFolder(f.filePath);
      map.set(f.projectId, folder ? displayRepositoryName(folder) : f.projectId);
    }
  }
  return map;
}

function buildProjectLookupRows(
  rippleDir: string,
  cohortFiles: CohortFile[],
  repoNames: Map<string, string>
): Record<string, string | number>[] {
  const folderByPid = deriveRepoFolderByProject(cohortFiles);
  const repoCsv = readCsv(path.join(rippleDir, 'repositories.csv'));
  const seen = new Set<string>();
  const rows: Record<string, string | number>[] = [];

  const push = (pid: string, csvRow?: CsvRow) => {
    if (!pid || seen.has(pid)) return;
    seen.add(pid);
    const folder = folderByPid.get(pid) ?? '';
    rows.push({
      project_id: pid,
      repository_name: repoNames.get(pid) ?? (folder ? displayRepositoryName(folder) : pid),
      repository_folder: folder,
      repository_path: csvRow?.repository_path ?? '',
      commit_hash: csvRow?.commit_hash ?? '',
      selected_file_count: cohortFiles.filter((f) => f.projectId === pid).length,
      java_file_count: num(csvRow?.java_file_count) ?? '',
      production_file_count: num(csvRow?.production_file_count) ?? '',
    });
  };

  for (const r of repoCsv) push(r.project_id ?? '', r);
  for (const f of cohortFiles) push(f.projectId);
  rows.sort((a, b) => String(a.repository_name).localeCompare(String(b.repository_name)));
  return rows;
}

function addProjectLookupSheet(wb: ExcelJS.Workbook, data: StudyData) {
  sheetFromAoa(
    wb,
    '0_Project_ID_Map',
    objectsToAoa(buildProjectLookupRows(data.rippleRefDir, data.cohortFiles, data.repoNames))
  );
}

function loadSkipNotes(studyDir: string): Map<string, string> {
  const notes = new Map<string, string>();
  const dir = path.join(studyDir, 'test_reports');
  if (!fs.existsSync(dir)) return notes;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as {
        status?: string;
        probeStrategy?: string;
        notes?: string;
      };
      if (j.status === 'skipped' || j.probeStrategy === 'none') {
        notes.set(name.replace(/\.json$/, ''), j.notes ?? 'unknown');
      }
    } catch {
      /* skip */
    }
  }
  return notes;
}

function safeArtifactStem(projectId: string, filePath: string, modelId: string, variant: string): string {
  return `${projectId}__${filePath}__${modelId}__${variant}`
    .replace(/\//g, '_')
    .replace(/\\/g, '_')
    .replace(/:/g, '_')
    .replace(/\|/g, '_');
}

function sheetFromAoa(wb: ExcelJS.Workbook, name: string, aoa: (string | number | boolean | null | undefined)[][]) {
  const ws = wb.addWorksheet(name.slice(0, 31));
  for (const row of aoa) {
    ws.addRow(row.map((c) => (c == null ? '' : c)));
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  header.font = { bold: true, color: { argb: 'FFE2E8F0' } };
  ws.columns.forEach((col) => {
    col.width = Math.min(48, Math.max(10, String(col.values?.[1] ?? '').length + 2));
  });
  return ws;
}

function rowToMaster(
  row: CsvRow,
  repoNames: Map<string, string>,
  study: 'B0' | 'MA',
  report?: RippleReport | null,
  exposure?: FileExposure | null
): Record<string, string | number> {
  const rp = report ?? null;
  const linesAdded = num(row.lines_added) ?? rp?.linesAdded ?? '';
  const linesRemoved = num(row.lines_removed) ?? rp?.linesRemoved ?? '';
  const churn = num(row.churn) ?? rp?.churn ?? '';
  const methodsAdded = num(row.methods_added) ?? rp?.methodsAdded ?? '';
  const methodsRemoved = num(row.methods_removed) ?? rp?.methodsRemoved ?? '';
  const compileStatus =
    (row.compile_probe_status ?? '').trim() ||
    rp?.compileProbeStatus ||
    (rp?.compileProbeAttempted ? 'skipped' : rp ? 'not_run' : '');
  const downstreamCallers =
    num(row.downstream_caller_count_before) ??
    rp?.affectedCallers?.length ??
    exposure?.downstreamCallerCount ??
    '';
  const csvFanIn = num(row.fan_in_before);
  const fanInBefore =
    csvFanIn != null && csvFanIn > 0 ? csvFanIn : (exposure?.fanInGraph ?? csvFanIn ?? '');

  const out: Record<string, string | number> = {
    study_arm: study,
    study_id: row.study_id ?? '',
    project_id: row.project_id ?? '',
    repository_name: repoNames.get(row.project_id ?? '') ?? '',
    repo_folder: repoFolder(row.file_path ?? ''),
    file_path: row.file_path ?? '',
    file_name: path.basename(row.file_path ?? ''),
    model_id: row.model_id ?? '',
    model_short: modelShort(row.model_id ?? ''),
    variant: row.variant ?? '',
    pair_key: row.pair_key ?? '',
    status: row.status ?? '',
    risk_level: row.risk_level ?? '',
    contract_risk_level: row.contract_risk_level ?? '',
    observed_risk_level: row.observed_risk_level ?? '',
    verification_level: row.verification_level ?? '',
    callers_checked: num(row.callers_checked) ?? '',
    observed_broken_caller_count: num(row.observed_broken_caller_count) ?? '',
    compile_probe_status: compileStatus,
    behavioral_correct: row.behavioral_correct ?? '',
    adoption_class: row.adoption_class ?? '',
    test_probe_strategy: row.test_probe_strategy ?? '',
    test_probe_status: row.test_probe_status ?? '',
    test_probe_before_status: row.test_probe_before_status ?? '',
    test_regression: row.test_regression ?? '',
    tests_passed: num(row.tests_passed) ?? '',
    tests_failed: num(row.tests_failed) ?? '',
    tests_passed_before: num(row.tests_passed_before) ?? '',
    tests_failed_before: num(row.tests_failed_before) ?? '',
    smell_before: num(row.smell_before) ?? '',
    smell_after: num(row.smell_after) ?? '',
    smell_delta: (num(row.smell_after) ?? 0) - (num(row.smell_before) ?? 0),
    fan_in_before: fanInBefore,
    fan_in_graph: exposure?.fanInGraph ?? fanInBefore,
    downstream_caller_count_before: downstreamCallers,
    lines_added: linesAdded,
    lines_removed: linesRemoved,
    churn,
    methods_added: methodsAdded,
    methods_removed: methodsRemoved,
    net_loc_delta: (Number(linesAdded) || 0) - (Number(linesRemoved) || 0),
    fan_out_before: num(row.fan_out_before) ?? '',
    fan_out_after: num(row.fan_out_after) ?? '',
    fan_out_delta: num(row.fan_out_delta) ?? '',
    caller_used_api_count_before: num(row.caller_used_api_count_before) ?? '',
    public_api_count_before: num(row.public_api_count_before) ?? '',
    latency_ms: num(row.latency_ms) ?? '',
    prompt_tokens: num(row.prompt_tokens) ?? '',
    completion_tokens: num(row.completion_tokens) ?? '',
    orchestration: row.orchestration ?? '',
    graph_version: row.graph_version ?? '',
    multi_llm_agent_mode: row.multi_llm_agent_mode ?? '',
    agent_step_count: num(row.agent_step_count) ?? '',
    llm_plan_status: row.llm_plan_status ?? '',
    llm_verify_approved: row.llm_verify_approved ?? '',
    static_verify_accept: row.static_verify_accept ?? '',
    risk_reasons: row.risk_reasons ?? '',
    error: row.error ?? '',
    completed_at: row.completed_at ?? '',
    is_high_risk: (row.risk_level ?? '').toLowerCase() === 'high' ? 1 : 0,
    l5_test_eligible: ['targeted', 'module'].includes(row.test_probe_strategy ?? '') ? 1 : 0,
    l5_preserved:
      row.test_probe_before_status === 'success' &&
      row.test_probe_status === 'success' &&
      row.test_regression !== 'true'
        ? 1
        : 0,
    l5_regression: row.test_regression === 'true' ? 1 : 0,
  };
  return out;
}

function objectsToAoa(rows: Record<string, string | number>[]): (string | number)[][] {
  if (rows.length === 0) return [['(no rows)']];
  const keys = Object.keys(rows[0]);
  return [keys, ...rows.map((r) => keys.map((k) => r[k] ?? ''))];
}

export function resolveDefaultStudyPaths(): EmseStudyPaths {
  const base = process.env.EMSE_STUDY_BASE
    ? process.env.EMSE_STUDY_BASE
    : path.join(os.tmpdir(), 'refactai/workspaces/ripple_study_runs');
  const outDir = process.env.EMSE_MASTER_OUTPUT_DIR ?? path.join(process.cwd(), '..', '..', '.run');
  return {
    rippleRefDir: path.join(base, 'ripple_ref_master'),
    maRefDir: path.join(base, 'ma_ref_master'),
    outputPath: path.join(outDir, EMSE_RIPPLE_MASTER_FILENAME),
  };
}

function newWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'RefactAI EMSE Export';
  wb.created = new Date();
  return wb;
}

type StudyData = {
  rippleRefDir: string;
  maRefDir: string;
  repoNames: Map<string, string>;
  projectLookup: Record<string, string | number>[];
  cohortFiles: CohortFile[];
  files150: Record<string, string | number>[];
  systems: Record<string, string | number>[];
  b0Rows: CsvRow[];
  maRows: CsvRow[];
  masterB0: Record<string, string | number>[];
  masterMa: Record<string, string | number>[];
  b0SkipNotes: Map<string, string>;
  maSkipNotes: Map<string, string>;
  rq3: Record<string, string | number>[];
  rq2: Record<string, string | number>[];
  rq4: Record<string, string | number>[];
  rq5: Record<string, string | number>[];
  fileExposure: Map<string, FileExposure>;
};

const QWEN_MODEL_ID = 'qwen/qwen3.6-plus';

function buildQwenDiagnosticsRows(b0Rows: CsvRow[], maRows: CsvRow[]): Record<string, string | number>[] {
  const qwenV2 = b0Rows.filter((r) => r.model_id === QWEN_MODEL_ID && r.variant === 'V2');
  const qwenV1 = b0Rows.filter((r) => r.model_id === QWEN_MODEL_ID && r.variant === 'V1');
  const maQwen = maRows.filter((r) => r.model_id === QWEN_MODEL_ID && r.status === 'completed');
  const b0QwenOk = qwenV2.filter((r) => r.status === 'completed');
  const joinKey = (r: CsvRow) => `${r.project_id}|${r.file_path}|${r.model_id}`;
  const maKeys = new Set(maQwen.map(joinKey));
  const b0Keys = new Set(b0QwenOk.map(joinKey));

  const summary: Record<string, string | number>[] = [
    { section: 'summary', metric: 'B0-V2 total', value: qwenV2.length },
    { section: 'summary', metric: 'B0-V2 completed', value: b0QwenOk.length },
    {
      section: 'summary',
      metric: 'B0-V2 failed_parsing',
      value: qwenV2.filter((r) => r.status === 'failed_parsing').length,
    },
    { section: 'summary', metric: 'B0-V1 total', value: qwenV1.length },
    { section: 'summary', metric: 'MA completed', value: maQwen.length },
    { section: 'summary', metric: 'RQ3 paired complete', value: [...maKeys].filter((k) => b0Keys.has(k)).length },
    { section: 'summary', metric: 'MA-only (B0 parse fail)', value: [...maKeys].filter((k) => !b0Keys.has(k)).length },
    {
      section: 'recommendation',
      metric: 'RQ3 Qwen usable',
      value:
        b0QwenOk.length === 0
          ? 'NO — exclude Qwen from paired RQ3 or rerun B0 with parser fix'
          : b0QwenOk.length < maQwen.length
            ? 'PARTIAL — use paired_complete subset only'
            : 'YES',
    },
  ];

  const errorCounts = new Map<string, number>();
  for (const r of qwenV2.filter((r) => (r.status ?? '').startsWith('failed'))) {
    const err = (r.error ?? 'no_error').slice(0, 160);
    errorCounts.set(err, (errorCounts.get(err) ?? 0) + 1);
  }
  const errorRows = [...errorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([error, count]) => ({ section: 'top_errors', metric: error, value: count }));

  const detailRows = qwenV2.map((r) => ({
    section: 'row_detail',
    project_id: r.project_id ?? '',
    file_path: r.file_path ?? '',
    variant: r.variant ?? '',
    status: r.status ?? '',
    error: (r.error ?? '').slice(0, 200),
    ma_status: maRows.find((m) => joinKey(m) === joinKey(r))?.status ?? 'missing',
    paired_complete: maKeys.has(joinKey(r)) && b0Keys.has(joinKey(r)) ? 1 : 0,
  }));

  return [...summary, ...errorRows, ...detailRows];
}

function buildDataQualityRows(data: StudyData): Record<string, string | number>[] {
  const fanInZero = data.files150.filter((f) => Number(f.fan_in_cohort_snapshot) === 0).length;
  const fanInCorrected = data.files150.filter((f) => Number(f.fan_in_graph_corrected) > 0).length;
  const compileEmpty = data.masterB0.filter((r) => !String(r.compile_probe_status ?? '').trim()).length;
  const compileEmptyMa = data.masterMa.filter((r) => !String(r.compile_probe_status ?? '').trim()).length;
  const editMissing = data.masterB0.filter(
    (r) => r.status === 'completed' && r.lines_added === '' && r.lines_removed === ''
  ).length;
  const qwenFail = data.b0Rows.filter(
    (r) => r.model_id === QWEN_MODEL_ID && r.variant === 'V2' && r.status === 'failed_parsing'
  ).length;

  return [
    { issue: 'fan_in_cohort_zero', count: fanInZero, total: data.files150.length, fix: 'Use fan_in_graph_corrected column; rerun dependency scan after backend fix' },
    { issue: 'fan_in_graph_nonzero', count: fanInCorrected, total: data.files150.length, fix: 'Corrected from repository_profiles/*_dependency_scan.json' },
    { issue: 'compile_probe_empty_B0', count: compileEmpty, total: data.masterB0.length, fix: 'Compile probe not enabled during study (RIPPLE_REF_COMPILE_PROBE=0); L5 backfill only' },
    { issue: 'compile_probe_empty_MA', count: compileEmptyMa, total: data.masterMa.length, fix: 'Same as B0 — enrich script sets status from ripple_reports when attempted' },
    { issue: 'edit_metrics_missing_B0', count: editMissing, total: data.masterB0.filter((r) => r.status === 'completed').length, fix: 'Run enrich-ripple-study-csv-from-artifacts.py on both studies' },
    { issue: 'qwen_b0_failed_parsing', count: qwenFail, total: 150, fix: 'Exclude from paired RQ3 or rerun B0 Qwen subset; see Qwen_B0_Diagnostics sheet' },
    { issue: 'study_csv_rows_B0', count: data.b0Rows.length, total: 1182, fix: data.b0Rows.length === 0 ? 'CRITICAL: results_candidates.csv missing — restore study dir' : 'OK' },
    { issue: 'study_csv_rows_MA', count: data.maRows.length, total: 750, fix: data.maRows.length === 0 ? 'CRITICAL: results_candidates.csv missing — restore study dir' : 'OK' },
  ];
}

function loadStudyData(rippleRefDir: string, maRefDir: string): StudyData {
  const fileExposure = loadFileExposureMap(rippleRefDir);
  const b0Reports = loadRippleReportMap(rippleRefDir);
  const maReports = loadRippleReportMap(maRefDir);
  const cohortFiles = loadCohortFiles(maRefDir, rippleRefDir);
  const repoNames = loadRepoNameMap(rippleRefDir, cohortFiles);
  const projectLookup = buildProjectLookupRows(rippleRefDir, cohortFiles, repoNames);
  const b0Rows = readCsv(path.join(rippleRefDir, 'results_candidates.csv'));
  const maRows = readCsv(path.join(maRefDir, 'results_candidates.csv'));
  const b0SkipNotes = loadSkipNotes(rippleRefDir);
  const maSkipNotes = loadSkipNotes(maRefDir);

  const enrichRow = (
    row: CsvRow,
    study: 'B0' | 'MA',
    reports: Map<string, RippleReport>
  ) => {
    const stem = safeArtifactStem(row.project_id ?? '', row.file_path ?? '', row.model_id ?? '', row.variant ?? '');
    return rowToMaster(
      row,
      repoNames,
      study,
      reports.get(stem),
      fileExposure.get(row.file_path ?? '')
    );
  };

  const systems = readCsv(path.join(rippleRefDir, 'repositories.csv')).map((r) => ({
    project_id: r.project_id,
    repository_name: repoNames.get(r.project_id ?? '') ?? r.repository_name,
    repository_path: r.repository_path,
    commit_hash: r.commit_hash,
    java_file_count: num(r.java_file_count),
    production_file_count: num(r.production_file_count),
    excluded_file_count: num(r.excluded_file_count),
    total_loc: num(r.total_loc),
    production_loc: num(r.production_loc),
    analysis_timestamp: r.analysis_timestamp,
    selected_file_count: cohortFiles.filter((f) => f.projectId === r.project_id).length,
  }));

  const files150 = cohortFiles.map((f) => {
    const exp = fileExposure.get(f.filePath);
    const fanInCohort = f.fanIn ?? 0;
    const fanInGraph = exp?.fanInGraph ?? fanInCohort;
    return {
      project_id: f.projectId,
      repository_name: repoNames.get(f.projectId) ?? f.projectId,
      repo_folder: repoFolder(f.filePath),
      file_path: f.filePath,
      file_name: path.basename(f.filePath),
      sampling_group: f.samplingGroup ?? '',
      selection_reason: f.selectionReason ?? '',
      loc: f.loc ?? '',
      smell_count: f.smellCount ?? '',
      fan_in_cohort_snapshot: fanInCohort,
      fan_in_graph_corrected: fanInGraph,
      fan_out: f.fanOut ?? exp?.fanOut ?? '',
      downstream_caller_count: f.downstreamCallerCount ?? exp?.downstreamCallerCount ?? '',
      public_api_count: f.publicApiCount ?? '',
      caller_used_api_count: f.callerUsedApiCount ?? exp?.callerUsedApiCount ?? '',
      dependency_risk_score: f.dependencyRiskScore ?? '',
      value_score: f.valueScore ?? '',
      complexity: f.complexity ?? '',
      has_inheritance: f.hasInheritance === true ? 1 : f.hasInheritance === false ? 0 : '',
      has_interface: f.hasInterface === true ? 1 : f.hasInterface === false ? 0 : '',
      fan_in_note:
        fanInCohort === 0 && (exp?.downstreamCallerCount ?? 0) > 0
          ? 'fan_in_graph was 0 (bug fixed); use downstream_caller_count for exposure'
          : '',
    };
  });

  const masterB0 = b0Rows.map((r) => enrichRow(r, 'B0', b0Reports));
  const masterMa = maRows.map((r) => enrichRow(r, 'MA', maReports));
  const masterAll = [...masterB0, ...masterMa];

  const rq2 = b0Rows.filter((r) => r.variant === 'V2').map((r) => enrichRow(r, 'B0', b0Reports));

  const joinKey = (r: CsvRow) => `${r.project_id}|${r.file_path}|${r.model_id}`;
  const maCompleted = new Map(maRows.filter((r) => r.status === 'completed').map((r) => [joinKey(r), r]));
  const b0V2Completed = new Map(
    b0Rows.filter((r) => r.status === 'completed' && r.variant === 'V2').map((r) => [joinKey(r), r])
  );
  const rq3: Record<string, string | number>[] = [];
  for (const [, ma] of maCompleted) {
    const b0 = b0V2Completed.get(joinKey(ma));
    const maM = enrichRow(ma, 'MA', maReports);
    const base = {
      project_id: ma.project_id,
      repository_name: repoNames.get(ma.project_id ?? '') ?? '',
      file_path: ma.file_path,
      file_name: path.basename(ma.file_path ?? ''),
      model_id: ma.model_id,
      model_short: modelShort(ma.model_id ?? ''),
      pair_key_ma: ma.pair_key,
      pair_key_b0: b0?.pair_key ?? '',
      paired_complete: b0 ? 1 : 0,
      ma_status: ma.status,
      b0_status: b0?.status ?? 'missing',
    };
    if (b0) {
      const b0M = enrichRow(b0, 'B0', b0Reports);
      rq3.push({
        ...base,
        ma_risk_level: maM.risk_level,
        b0_risk_level: b0M.risk_level,
        ma_high_risk: maM.is_high_risk,
        b0_high_risk: b0M.is_high_risk,
        ma_broken_callers: maM.observed_broken_caller_count,
        b0_broken_callers: b0M.observed_broken_caller_count,
        ma_adoption_class: maM.adoption_class,
        b0_adoption_class: b0M.adoption_class,
        ma_behavioral_correct: maM.behavioral_correct,
        b0_behavioral_correct: b0M.behavioral_correct,
        ma_test_probe_strategy: maM.test_probe_strategy,
        b0_test_probe_strategy: b0M.test_probe_strategy,
        ma_l5_preserved: maM.l5_preserved,
        b0_l5_preserved: b0M.l5_preserved,
        ma_l5_regression: maM.l5_regression,
        b0_l5_regression: b0M.l5_regression,
        delta_high_risk: Number(maM.is_high_risk) - Number(b0M.is_high_risk),
        delta_broken_callers:
          Number(maM.observed_broken_caller_count || 0) - Number(b0M.observed_broken_caller_count || 0),
      });
    } else {
      rq3.push(base);
    }
  }

  const rq4 = masterAll.filter((r) => r.status === 'completed' && (r.variant === 'V2' || r.variant === 'MA'));
  const fileMeta = new Map(cohortFiles.map((f) => [`${f.projectId}|${f.filePath}`, f]));
  const rq5 = rq4.map((r) => {
    const meta = fileMeta.get(`${r.project_id}|${r.file_path}`);
    const exp = fileExposure.get(r.file_path as string);
    const cohortFanIn = meta?.fanIn ?? 0;
    const graphFanIn = exp?.fanInGraph ?? cohortFanIn;
    return {
      ...r,
      sampling_group: meta?.samplingGroup ?? '',
      file_loc: meta?.loc ?? '',
      file_smell_count: meta?.smellCount ?? '',
      file_fan_in_cohort: cohortFanIn,
      file_fan_in_graph: graphFanIn,
      file_fan_out: meta?.fanOut ?? exp?.fanOut ?? '',
      file_public_api_count: meta?.publicApiCount ?? '',
      file_caller_used_api_count: meta?.callerUsedApiCount ?? exp?.callerUsedApiCount ?? '',
      file_downstream_caller_count: meta?.downstreamCallerCount ?? exp?.downstreamCallerCount ?? '',
      file_dependency_risk_score: meta?.dependencyRiskScore ?? '',
      file_value_score: meta?.valueScore ?? '',
      orchestration_label: r.variant === 'MA' ? 'multi_agent' : 'single_prompt',
    };
  });

  return {
    rippleRefDir,
    maRefDir,
    repoNames,
    projectLookup,
    cohortFiles,
    files150,
    systems,
    b0Rows,
    maRows,
    masterB0,
    masterMa,
    b0SkipNotes,
    maSkipNotes,
    rq2,
    rq3,
    rq4,
    rq5,
    fileExposure,
  };
}

function rq3CompletePairs(data: StudyData): Record<string, string | number>[] {
  return data.rq3.filter((r) => r.paired_complete === 1);
}

function addSharedCohortSheets(wb: ExcelJS.Workbook, data: StudyData) {
  addProjectLookupSheet(wb, data);
  sheetFromAoa(wb, '1_Selected_Systems', objectsToAoa(data.systems as Record<string, string | number>[]));
  sheetFromAoa(wb, '2_Selected_Files', objectsToAoa(data.files150));
  sheetFromAoa(wb, '3_RQ1_Raw_Exposure', objectsToAoa(data.files150));
  const fanInRows = data.files150.map((f) => ({
    project_id: f.project_id,
    file_path: f.file_path,
    fan_in_cohort_snapshot: f.fan_in_cohort_snapshot,
    fan_in_graph_corrected: f.fan_in_graph_corrected,
    fan_out: f.fan_out,
    downstream_caller_count: f.downstream_caller_count,
    caller_used_api_count: f.caller_used_api_count,
    fan_in_note: f.fan_in_note,
  }));
  sheetFromAoa(wb, 'Fan_In_150_Files', objectsToAoa(fanInRows));
}

function addModelSheets(
  wb: ExcelJS.Workbook,
  prefix: string,
  rows: Record<string, string | number>[],
  variantFilter: string
) {
  const filtered = rows.filter((r) => r.variant === variantFilter);
  for (const m of EMSE_MODELS) {
    const modelRows = filtered.filter((r) => r.model_id === m.id);
    sheetFromAoa(wb, `${prefix}_Model_${m.sheet}`, objectsToAoa(modelRows));
  }
}

export async function buildB0MasterWorkbook(data: StudyData): Promise<ExcelJS.Workbook> {
  const wb = newWorkbook();
  addSharedCohortSheets(wb, data);

  const v2All = data.masterB0.filter((r) => r.variant === 'V2');
  const v1All = data.masterB0.filter((r) => r.variant === 'V1');

  sheetFromAoa(wb, 'B0_00_Master_All', objectsToAoa(data.masterB0));
  sheetFromAoa(wb, 'B0_01_V2_All_RQ2', objectsToAoa(v2All));
  sheetFromAoa(wb, 'B0_02_V1_Ablation', objectsToAoa(v1All));
  addModelSheets(wb, 'B0_V2', data.masterB0, 'V2');
  addModelSheets(wb, 'B0_V1', data.masterB0, 'V1');

  const b0Skip = data.masterB0.filter((r) => r.test_probe_strategy === 'none' || r.test_probe_status === 'skipped');
  sheetFromAoa(wb, 'B0_L5_Skip_Detail', objectsToAoa(b0Skip));

  const completedV2 = v2All.filter((r) => r.status === 'completed').length;
  sheetFromAoa(wb, 'B0_Summary', [
    ['EMSE B0 (ripple_ref_master) — single-prompt baseline'],
    ['Generated', new Date().toISOString()],
    ['Study dir', data.rippleRefDir],
    [],
    ['Variants', 'V1 = file-only prompt; V2 = dependency-aware (RQ2 primary)'],
    ['V2 rows total', v2All.length],
    ['V2 completed', completedV2],
    ['V1 rows total', v1All.length],
    [],
    ['Model sheets', 'B0_V2_Model_* — 150 rows each (30 files × 5 models planned per file×model)'],
    ['RQ2 analysis', 'Use B0_01_V2_All_RQ2, filter status=completed'],
    [],
    ['Sheet index'],
    ['1-3', 'Shared cohort + RQ1 exposure'],
    ['B0_00', 'All B0 candidates (V1+V2)'],
    ['B0_01', 'B0-V2 all — RQ2 raw'],
    ['B0_02', 'B0-V1 ablation'],
    ['B0_V2_Model_*', 'One sheet per LLM (V2)'],
    ['B0_V1_Model_*', 'One sheet per LLM (V1)'],
    ['B0_L5_Skip_Detail', 'L5 skipped rows'],
  ]);
  return wb;
}

export async function buildMaMasterWorkbook(data: StudyData): Promise<ExcelJS.Workbook> {
  const wb = newWorkbook();
  addSharedCohortSheets(wb, data);

  sheetFromAoa(wb, 'MA_00_Master_All', objectsToAoa(data.masterMa));
  addModelSheets(wb, 'MA', data.masterMa, 'MA');

  const maSkip = data.masterMa.filter((r) => r.test_probe_strategy === 'none' || r.test_probe_status === 'skipped');
  sheetFromAoa(wb, 'MA_L5_Skip_Detail', objectsToAoa(maSkip));

  sheetFromAoa(wb, 'MA_Summary', [
    ['EMSE P-MA (ma_ref_master) — LangGraph multi-agent'],
    ['Generated', new Date().toISOString()],
    ['Study dir', data.maRefDir],
    [],
    ['Planned', '750 = 150 files × 5 models'],
    ['Completed', data.masterMa.filter((r) => r.status === 'completed').length],
    [],
    ['Model sheets', 'MA_Model_* — 150 rows each'],
    ['RQ3 pairing', 'See EMSE_ANALYSIS_RQ3_RQ5_DATA.xlsx'],
    [],
    ['Sheet index'],
    ['1-3', 'Shared cohort + RQ1 exposure'],
    ['MA_00', 'All MA candidates'],
    ['MA_Model_*', 'One sheet per LLM'],
    ['MA_L5_Skip_Detail', 'L5 skipped rows'],
  ]);
  return wb;
}

export async function buildAnalysisWorkbook(data: StudyData): Promise<ExcelJS.Workbook> {
  const wb = newWorkbook();
  sheetFromAoa(wb, 'RQ3_Paired_All', objectsToAoa(data.rq3));
  sheetFromAoa(wb, 'RQ3_Paired_750_Stats', objectsToAoa(rq3CompletePairs(data)));
  for (const m of EMSE_MODELS) {
    const modelPairs = data.rq3.filter((r) => r.model_id === m.id);
    sheetFromAoa(wb, `RQ3_Paired_${m.sheet}`, objectsToAoa(modelPairs));
  }
  sheetFromAoa(wb, 'RQ4_By_Model', objectsToAoa(data.rq4));
  sheetFromAoa(wb, 'RQ5_Factors', objectsToAoa(data.rq5));
  sheetFromAoa(wb, 'Qwen_B0_Diagnostics', objectsToAoa(buildQwenDiagnosticsRows(data.b0Rows, data.maRows)));
  sheetFromAoa(wb, 'Data_Quality_Notes', objectsToAoa(buildDataQualityRows(data)));

  const pairedN = data.rq3.filter((r) => r.paired_complete === 1).length;
  const other: (string | number)[][] = [
    ['Section', 'Metric', 'Value'],
    ['RQ3', 'paired complete', pairedN],
    ['RQ3', 'MA only (B0 parse fail)', data.maRows.filter((r) => r.status === 'completed').length - pairedN],
  ];
  sheetFromAoa(wb, 'Cross_Arm_Summary', other);
  sheetFromAoa(wb, 'Analysis_Summary', [
    ['EMSE cross-arm analysis — RQ3, RQ4, RQ5'],
    ['Generated', new Date().toISOString()],
    ['RQ3 paired n', pairedN],
    [],
    ['Sheets'],
    ['RQ3_Paired_All', 'All 750 MA keys with B0 join'],
    ['RQ3_Paired_*', 'Per-model paired subsets'],
    ['RQ4_By_Model', 'B0-V2 + MA completed, all models'],
    ['RQ5_Factors', 'Explanatory variables + outcomes'],
  ]);
  return wb;
}

/** Single workbook with every sheet (B0 + MA + analysis + cohort). */
export async function buildUnifiedMasterWorkbook(data: StudyData): Promise<ExcelJS.Workbook> {
  const wb = newWorkbook();
  const masterAll = [...data.masterB0, ...data.masterMa];
  const v2All = data.masterB0.filter((r) => r.variant === 'V2');
  const v1All = data.masterB0.filter((r) => r.variant === 'V1');
  const pairedN = data.rq3.filter((r) => r.paired_complete === 1).length;

  sheetFromAoa(wb, '00_Summary_Notes', [
    ['EMSE MASTER — all sheets in one workbook'],
    ['Generated', new Date().toISOString()],
    ['Ripple dir', data.rippleRefDir],
    ['MA dir', data.maRefDir],
    [],
    ['Sheet groups'],
    ['00', 'This summary'],
    ['0', 'Project ID → repository name lookup'],
    ['1–3', 'Cohort: systems, files, RQ1 exposure'],
    ['4', 'Combined B0+MA master'],
    ['B0_*', 'Single-prompt baseline + per-model V2/V1'],
    ['MA_*', 'Multi-agent P-MA + per-model'],
    ['RQ3_*', 'Paired MA vs B0-V2 (+ per model)'],
    ['RQ4_*', 'Model comparison'],
    ['RQ5_*', 'Risk factors'],
    [],
    ['RQ3 paired complete', pairedN],
    ['Models', EMSE_MODELS.map((m) => m.label).join(', ')],
  ]);

  addSharedCohortSheets(wb, data);
  sheetFromAoa(wb, '4_Master_All_Data', objectsToAoa(masterAll));

  sheetFromAoa(wb, 'B0_00_Master_All', objectsToAoa(data.masterB0));
  sheetFromAoa(wb, 'B0_01_V2_All_RQ2', objectsToAoa(v2All));
  sheetFromAoa(wb, 'B0_02_V1_Ablation', objectsToAoa(v1All));
  addModelSheets(wb, 'B0_V2', data.masterB0, 'V2');
  addModelSheets(wb, 'B0_V1', data.masterB0, 'V1');
  sheetFromAoa(
    wb,
    'B0_L5_Skip_Detail',
    objectsToAoa(data.masterB0.filter((r) => r.test_probe_strategy === 'none' || r.test_probe_status === 'skipped'))
  );

  sheetFromAoa(wb, 'MA_00_Master_All', objectsToAoa(data.masterMa));
  addModelSheets(wb, 'MA', data.masterMa, 'MA');
  sheetFromAoa(
    wb,
    'MA_L5_Skip_Detail',
    objectsToAoa(data.masterMa.filter((r) => r.test_probe_strategy === 'none' || r.test_probe_status === 'skipped'))
  );

  sheetFromAoa(wb, 'RQ3_Paired_All', objectsToAoa(data.rq3));
  sheetFromAoa(wb, 'RQ3_Paired_750_Stats', objectsToAoa(rq3CompletePairs(data)));
  for (const m of EMSE_MODELS) {
    sheetFromAoa(wb, `RQ3_Paired_${m.sheet}`, objectsToAoa(data.rq3.filter((r) => r.model_id === m.id)));
  }
  sheetFromAoa(wb, 'RQ4_By_Model', objectsToAoa(data.rq4));
  sheetFromAoa(wb, 'RQ5_Factors', objectsToAoa(data.rq5));
  sheetFromAoa(wb, 'Qwen_B0_Diagnostics', objectsToAoa(buildQwenDiagnosticsRows(data.b0Rows, data.maRows)));
  sheetFromAoa(wb, 'Data_Quality_Notes', objectsToAoa(buildDataQualityRows(data)));
  sheetFromAoa(wb, 'Cross_Arm_Summary', [
    ['Metric', 'Value'],
    ['RQ3 paired complete', pairedN],
    ['MA completed', data.maRows.filter((r) => r.status === 'completed').length],
    ['B0-V2 completed', data.b0Rows.filter((r) => r.status === 'completed' && r.variant === 'V2').length],
  ]);

  return wb;
}

/** Raw data only — one tab per RQ plus cohort and full candidate tables (no statistical analysis). */
export async function buildRawMasterAllRqsWorkbook(data: StudyData): Promise<ExcelJS.Workbook> {
  const wb = newWorkbook();
  const masterAll = [...data.masterB0, ...data.masterMa];
  const pairedN = data.rq3.filter((r) => r.paired_complete === 1).length;
  const rq3Raw = data.rq3.map((r) => {
    const { delta_high_risk, delta_broken_callers, ...rest } = r;
    void delta_high_risk;
    void delta_broken_callers;
    return rest;
  });

  sheetFromAoa(wb, '00_Index', [
    ['EMSE RAW MASTER — all research questions (unanalyzed)'],
    ['Generated', new Date().toISOString()],
    ['Ripple dir', data.rippleRefDir],
    ['MA dir', data.maRefDir],
    [],
    ['Sheet', 'RQ', 'Rows (approx)', 'Description'],
    ['0_Project_ID_Map', 'Lookup', 15, 'project_id → repository_name (use with VLOOKUP)'],
    ['1_Selected_Systems', 'Cohort', 15, '15 OSS systems in the study'],
    ['2_Selected_Files', 'Cohort', 150, 'Stratified file sample (seed=42)'],
    ['3_RQ1_Raw_Exposure', 'RQ1', 150, 'Pre-refactor dependency & contract exposure per file'],
    ['4_RQ2_Raw_B0_V2', 'RQ2', 750, 'Single-prompt B0-V2 candidate outcomes (raw)'],
    ['5_MA_Raw_PMA', 'RQ3 arm', 750, 'Multi-agent P-MA candidate outcomes (raw)'],
    ['6_RQ3_Raw_Paired', 'RQ3', 750, 'File×model pairs: B0-V2 vs P-MA side-by-side (no test stats)'],
    ['RQ3_Paired_750_Stats', 'RQ3', 750, 'Complete paired cases only — use for McNemar / Wilcoxon (includes deltas)'],
    ['7_RQ4_Raw_By_Model', 'RQ4', '≤1500', 'Completed B0-V2 + MA by model (raw)'],
    ['8_RQ5_Raw_Factors', 'RQ5', '≤1500', 'Candidate-level factors + outcomes for exploratory models'],
    ['9_Master_All_Candidates', 'All', '≤2250', 'Full B0 V1+V2 + MA candidate table'],
    ['Fan_In_150_Files', 'RQ1', 150, 'Fan-in / fan-out exposure lookup'],
    ['Completeness_Summary', 'Meta', 5, 'Collection completeness counts'],
    [],
    ['RQ3 paired complete', pairedN],
    ['Note', 'Statistical tests (McNemar, Wilcoxon, etc.) are NOT in this file — run separately on these sheets.'],
  ]);

  addProjectLookupSheet(wb, data);
  sheetFromAoa(wb, '1_Selected_Systems', objectsToAoa(data.systems as Record<string, string | number>[]));
  sheetFromAoa(wb, '2_Selected_Files', objectsToAoa(data.files150));
  sheetFromAoa(wb, '3_RQ1_Raw_Exposure', objectsToAoa(data.files150));
  sheetFromAoa(wb, '4_RQ2_Raw_B0_V2', objectsToAoa(data.rq2));
  sheetFromAoa(wb, '5_MA_Raw_PMA', objectsToAoa(data.masterMa));
  sheetFromAoa(wb, '6_RQ3_Raw_Paired', objectsToAoa(rq3Raw));
  sheetFromAoa(wb, 'RQ3_Paired_750_Stats', objectsToAoa(rq3CompletePairs(data)));
  sheetFromAoa(wb, '7_RQ4_Raw_By_Model', objectsToAoa(data.rq4));
  sheetFromAoa(wb, '8_RQ5_Raw_Factors', objectsToAoa(data.rq5));
  sheetFromAoa(wb, '9_Master_All_Candidates', objectsToAoa(masterAll));
  const fanInRows = data.files150.map((f) => ({
    project_id: f.project_id,
    file_path: f.file_path,
    fan_in_cohort_snapshot: f.fan_in_cohort_snapshot,
    fan_in_graph_corrected: f.fan_in_graph_corrected,
    fan_out: f.fan_out,
    downstream_caller_count: f.downstream_caller_count,
    caller_used_api_count: f.caller_used_api_count,
    fan_in_note: f.fan_in_note,
  }));
  sheetFromAoa(wb, 'Fan_In_150_Files', objectsToAoa(fanInRows));
  sheetFromAoa(wb, 'Completeness_Summary', [
    ['Metric', 'Value'],
    ['Files in cohort', data.files150.length],
    ['B0-V2 completed', data.b0Rows.filter((r) => r.status === 'completed' && r.variant === 'V2').length],
    ['P-MA completed', data.maRows.filter((r) => r.status === 'completed').length],
    ['RQ3 paired complete', pairedN],
    ['B0-V1 completed (ablation)', data.b0Rows.filter((r) => r.status === 'completed' && r.variant === 'V1').length],
  ]);
  return wb;
}

export async function buildEmseRippleMasterWorkbook(paths: EmseStudyPaths): Promise<ExcelJS.Workbook> {
  const data = loadStudyData(paths.rippleRefDir, paths.maRefDir);
  const wb = newWorkbook();
  const masterAll = [...data.masterB0, ...data.masterMa];

  addProjectLookupSheet(wb, data);
  sheetFromAoa(wb, '1_Selected_Systems', objectsToAoa(data.systems as Record<string, string | number>[]));
  sheetFromAoa(wb, '2_Selected_Files', objectsToAoa(data.files150));
  sheetFromAoa(wb, '3_Master_All_Data', objectsToAoa(masterAll));
  sheetFromAoa(wb, '4_RQ1_Raw_Exposure', objectsToAoa(data.files150));
  sheetFromAoa(wb, '5_RQ2_Raw_B0_V2', objectsToAoa(data.rq2));
  sheetFromAoa(wb, '6_RQ3_Raw_Paired', objectsToAoa(data.rq3));
  sheetFromAoa(wb, '7_RQ4_Raw_By_Model', objectsToAoa(data.rq4));
  sheetFromAoa(wb, '8_RQ5_Raw_Factors', objectsToAoa(data.rq5));
  sheetFromAoa(wb, 'Qwen_B0_Diagnostics', objectsToAoa(buildQwenDiagnosticsRows(data.b0Rows, data.maRows)));
  sheetFromAoa(wb, 'Data_Quality_Notes', objectsToAoa(buildDataQualityRows(data)));

  const maCompleted = new Map(
    data.maRows.filter((r) => r.status === 'completed').map((r) => [`${r.project_id}|${r.file_path}|${r.model_id}`, r])
  );
  const b0V2Completed = new Map(
    data.b0Rows
      .filter((r) => r.status === 'completed' && r.variant === 'V2')
      .map((r) => [`${r.project_id}|${r.file_path}|${r.model_id}`, r])
  );

  const other: (string | number)[][] = [
    ['Section', 'Metric', 'Value'],
    ['Completeness', 'MA planned', 750],
    ['Completeness', 'MA completed', data.maRows.filter((r) => r.status === 'completed').length],
    ['Completeness', 'B0-V2 planned', 750],
    ['Completeness', 'B0-V2 completed', data.b0Rows.filter((r) => r.status === 'completed' && r.variant === 'V2').length],
    ['Completeness', 'RQ3 paired complete', data.rq3.filter((r) => r.paired_complete === 1).length],
    [],
    ['Also exported', 'EMSE_B0_MASTER_DATA.xlsx', 'B0 + per-model sheets'],
    ['Also exported', 'EMSE_MA_MASTER_DATA.xlsx', 'MA + per-model sheets'],
    ['Also exported', 'EMSE_ANALYSIS_RQ3_RQ5_DATA.xlsx', 'Cross-arm RQ3–RQ5'],
  ];
  sheetFromAoa(wb, '9_Other_Supporting', other);

  const pairedN = data.rq3.filter((r) => r.paired_complete === 1).length;
  sheetFromAoa(wb, '10_Summary_Notes', [
    ['EMSE combined index workbook — see also B0 / MA / Analysis files'],
    ['Generated', new Date().toISOString()],
    ['RQ3 paired n', pairedN],
    ['B0-V2 failed_parsing (MA ok)', maCompleted.size - b0V2Completed.size],
  ]);
  return wb;
}

export type EmseExportBundle = {
  unified: string;
  combined: string;
  b0: string;
  ma: string;
  analysis: string;
  rawMaster: string;
};

export async function writeAllEmseExports(paths?: Partial<EmseStudyPaths>): Promise<EmseExportBundle> {
  const resolved = { ...resolveDefaultStudyPaths(), ...paths };
  const outDir = path.dirname(resolved.outputPath);
  fs.mkdirSync(outDir, { recursive: true });

  const data = loadStudyData(resolved.rippleRefDir, resolved.maRefDir);

  const unifiedPath = path.join(outDir, EMSE_MASTER_ALL_SHEETS_FILENAME);
  const combinedPath = path.join(outDir, EMSE_RIPPLE_MASTER_FILENAME);
  const b0Path = path.join(outDir, EMSE_B0_MASTER_FILENAME);
  const maPath = path.join(outDir, EMSE_MA_MASTER_FILENAME);
  const analysisPath = path.join(outDir, EMSE_ANALYSIS_MASTER_FILENAME);
  const rawMasterPath = path.join(outDir, EMSE_RAW_MASTER_ALL_RQS_FILENAME);

  await (await buildUnifiedMasterWorkbook(data)).xlsx.writeFile(unifiedPath);
  await (await buildEmseRippleMasterWorkbook(resolved)).xlsx.writeFile(combinedPath);
  await (await buildB0MasterWorkbook(data)).xlsx.writeFile(b0Path);
  await (await buildMaMasterWorkbook(data)).xlsx.writeFile(maPath);
  await (await buildAnalysisWorkbook(data)).xlsx.writeFile(analysisPath);
  await (await buildRawMasterAllRqsWorkbook(data)).xlsx.writeFile(rawMasterPath);

  return {
    unified: unifiedPath,
    combined: combinedPath,
    b0: b0Path,
    ma: maPath,
    analysis: analysisPath,
    rawMaster: rawMasterPath,
  };
}

export async function writeUnifiedEmseMasterExcel(paths?: Partial<EmseStudyPaths>): Promise<string> {
  const resolved = { ...resolveDefaultStudyPaths(), ...paths };
  const outDir = path.dirname(resolved.outputPath);
  fs.mkdirSync(outDir, { recursive: true });
  const data = loadStudyData(resolved.rippleRefDir, resolved.maRefDir);
  const unifiedPath = path.join(outDir, EMSE_MASTER_ALL_SHEETS_FILENAME);
  await (await buildUnifiedMasterWorkbook(data)).xlsx.writeFile(unifiedPath);
  return unifiedPath;
}

export async function writeEmseRippleMasterExcel(paths?: Partial<EmseStudyPaths>): Promise<string> {
  const bundle = await writeAllEmseExports(paths);
  return bundle.unified;
}
