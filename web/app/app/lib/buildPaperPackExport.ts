/**
 * One-shot paper pack export: per-system → combined → master → paper-ready folders.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  buildCombinedFrontierMasterWorkbook,
  filterFrontierMasterItems,
  openSystemsSummaryToCsv,
  type OpenSystemSummaryRow,
} from './buildCombinedFrontierMasterExcel';
import { buildFullResearchWorkbook, type FullExcelFileItem } from './buildFullResearchExcel';
import {
  aoaToCsv,
  buildFileMaster527Aoa,
  buildPaperReadyWorkbook,
  frontierPassRowsFromItems,
  paperReadySheetsToCsvMap,
  PAPER_READY_FILENAME,
} from './buildPaperReadyAnalysis';
import {
  buildRq3BehaviourWorkbook,
  RQ3_BEHAVIOUR_FILENAME,
} from './researchRq3Behaviour';
import { loadResearchDatasetFromDisk, type LoadedResearchFile } from './researchDatasetLoader';
import { classifyResearchCohort } from './researchExportCohort';
import { sheetDefinitionsToAoa, SHEET_DEFINITIONS_FILENAME } from './researchExcelSheetDefinitions';
import {
  buildAnalysisReferenceMarkdown,
  buildPaperReadySheetIndexMarkdown,
} from './researchAnalysisDocumentation';
import {
  buildCleaningMasterWorkbook,
  CLEANING_MASTER_CSV,
  CLEANING_MASTER_FILENAME,
  KEY_METRICS_CSV,
} from './buildCleaningMasterExport';
import ExcelJS from 'exceljs';

export const PAPER_PACK_ROOT = 'paper-pack';
export const MASTER_527_FILENAME = 'REFINE_MASTER_527.xlsx';
export const COMBINED_527_FILENAME = 'REFINE_combined_frontier_527.xlsx';

export type PaperPackExportResult = {
  outDir: string;
  exportedAt: string;
  frontierFileCount: number;
  passRowCount: number;
  projectCount: number;
  paths: {
    readme: string;
    rqMap: string;
    manifest: string;
    master: string;
    combined: string;
    paperReady: string;
    csvDir: string;
    icsePaper: string;
    icseMaster: string;
    icseCombined: string;
    icseCleaningMaster: string;
  };
};

function loadedToItem(f: LoadedResearchFile): FullExcelFileItem {
  return {
    filePath: f.filePath,
    fileName: f.fileName,
    bundle: f.bundle,
    savedReportId: encodeURIComponent(f.filePath),
    missingReason: '',
    candidate: {
      filePath: f.filePath,
      label: f.fileName,
      hasSavedReport: true,
      status: 'refactored',
    },
    inCurrentSample: f.inCurrentSample,
    projectName: f.projectName,
    sourceFolder: f.sourceFolder,
    workspaceId: f.workspaceId,
  };
}

function safeDirName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_').slice(0, 80);
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function buildFolderGuide(): string {
  return `# REFINE Paper Pack — Folder Guide

## Primary cohort
- **527 files** — \`A_frontier_parallel\` (independent parallel, 3 LLM providers)
- **1,581 provider passes** — 527 × 3

## Top-level files (open first)

| File | Purpose |
|------|---------|
| \`STUDY_START_HERE.txt\` | Quick orientation |
| \`STUDY_PAPER_READY.xlsx\` | **Start here for paper** — RQ1/RQ2 stats + formula docs |
| \`STUDY_MASTER_527.xlsx\` | All raw metrics (sheets 00–45) |
| \`STUDY_MASTER_ONE_SHEET.xlsx\` | **One sheet** — all systems, all extracted metrics (cleaning) |

## Folder layout

| Folder | Contents |
|--------|----------|
| \`00_README/\` | RQ map, study scope, export manifest |
| \`01_per_system/\` | One subfolder per OSS project (15) |
| \`02_combined/\` | Combined workbook + CSV masters |
| \`03_master/\` | Full master (same as STUDY_MASTER_527.xlsx) |
| \`04_paper_ready/\` | Paper workbook + CSV copies of analysis sheets |
| \`05_reference/\` | Analysis guide, formulas, sheet defs, cohort flow |
| \`06_archive/\` | Legacy chain (sensitivity only — not primary) |

## STUDY_PAPER_READY.xlsx — read in this order

1. \`00_ANALYSIS_GUIDE\` — plain English
2. \`97_Stats_Column_Formulas\` + \`98_Pass_Column_Formulas\`
3. \`RQ1_03_Excel_CHECK\` — verify means (live Excel formulas)
4. \`RQ1_03_Effectiveness_Stats\` — main RQ1
5. \`RQ2_01_Provider_Compare\` — main RQ2

Markdown copies: \`05_reference/ANALYSIS_AND_FORMULAS.md\`, \`PAPER_READY_SHEET_INDEX.md\`

## What to open for writing

| Task | File / sheet |
|------|----------------|
| RQ1 acceptance | \`RQ1_01_Acceptance\` |
| RQ1 smell/quality | \`RQ1_03_Effectiveness_Stats\` |
| Verify RQ1 numbers | \`RQ1_03_Excel_CHECK\` vs \`01_Pass_Master\` |
| RQ2 providers | \`RQ2_01_Provider_Compare\` |
| Raw metrics | \`STUDY_MASTER_527\` → \`20_Multi_LLM_Metrics_Long\` |
| Formulas (text) | \`05_reference/ANALYSIS_AND_FORMULAS.md\` |
| Master sheet index | \`05_reference/Research_Excel_Sheet_Reference.md\` |
| Cohort flow | \`05_reference/Research_Cohort_Inclusion_Flow.md\` |
| Missing data | \`99_Data_Quality\` |
`;
}

function buildRqMap(): string {
  return `# Research Questions → Data Map (527 cohort)

## RQ1
*To what extent does the multi-agent workflow reduce code smells and improve automated quality indicators?*

| Report | Paper-ready sheet | Master source |
|--------|-------------------|---------------|
| Acceptance / rejection | RQ1_01, RQ1_02 | 32, 36, 17 |
| Smell before/after & tests | RQ1_03 | 20, 32, 02 |
| File-level summary | RQ1_04 | 32 |
| Quality metrics | RQ1_03 (paired rows) | 20, 07–12 |
| Preservation proxies | 03, 13, 35 (descriptive) | master |

## RQ2
*How do refactoring outcomes differ across LLM providers under the same multi-agent workflow?*

| Report | Paper-ready sheet | Test |
|--------|-------------------|------|
| Provider smell/quality | RQ2_01 | Friedman + Holm Wilcoxon |
| Acceptance by provider | RQ1_01 (by provider) | Wilson CI |
| Tokens / edit size | RQ1_03 delta rows | Friedman in RQ2_01 |

## Code references
- Tests: \`web/app/app/lib/statisticalTests.ts\`
- Sheet builders: \`web/app/app/lib/buildPaperReadyAnalysis.ts\`
- Pass rows: \`web/app/app/lib/researchAnalysisExports.ts\`
`;
}

function buildStudyScope(exportedAt: string, frontierN: number, passN: number, systems: OpenSystemSummaryRow[]): string {
  const lines = systems.map(
    (r) =>
      `  ${r.project_name.padEnd(32)} frontier=${String(r.frontier_saved).padStart(3)}  (saved total=${r.saved_reports_total})`
  );
  const totalFrontier = systems.reduce((s, r) => s + r.frontier_saved, 0);
  return [
    'REFINE Paper Pack — Study Scope',
    '================================',
    '',
    `Exported: ${exportedAt}`,
    '',
    'Primary evaluation cohort: 527 frontier files (A_frontier_parallel)',
    `  Files in this export: ${frontierN}`,
    `  Provider pass rows: ${passN}`,
    '',
    'Per-project frontier counts:',
    ...lines,
    `  TOTAL frontier in pack: ${totalFrontier}`,
    '',
    'Honesty rules:',
    '  - Automated metrics only; preservation fields are proxies',
    '  - Legacy chain files in 06_archive/ — not primary RQ1/RQ2',
    '  - Report per-table N from 99_Data_Quality when needed',
  ].join('\n');
}

export async function runPaperPackExport(options?: {
  workspacesRoot?: string;
  outRoot?: string;
  /** When set, writes directly here (no paper-pack-timestamp subfolder). */
  outDir?: string;
}): Promise<PaperPackExportResult> {
  const exportedAt = new Date().toISOString();
  const stamp = exportedAt.replace(/[:.]/g, '-').slice(0, 19);
  const outDir =
    options?.outDir ??
    path.join(options?.outRoot ?? path.join(os.homedir(), 'REFINE-export'), `${PAPER_PACK_ROOT}-${stamp}`);

  const dirs = {
    readme: path.join(outDir, '00_README'),
    perSystem: path.join(outDir, '01_per_system'),
    combined: path.join(outDir, '02_combined'),
    master: path.join(outDir, '03_master'),
    paperReady: path.join(outDir, '04_paper_ready'),
    reference: path.join(outDir, '05_reference'),
    archive: path.join(outDir, '06_archive'),
    csvDir: path.join(outDir, '04_paper_ready', 'rq_analysis_csv'),
  };

  for (const d of Object.values(dirs)) {
    fs.mkdirSync(d, { recursive: true });
  }

  const { files: allLoaded } = loadResearchDatasetFromDisk(options?.workspacesRoot);
  const allItems = allLoaded.map(loadedToItem);
  const frontierItems = filterFrontierMasterItems(allItems);
  const legacyItems = allItems.filter(
    (i) =>
      i.bundle &&
      classifyResearchCohort(i.bundle, i.inCurrentSample ?? false).cohort ===
        'B_legacy_chain_non_frontier'
  );

  const lockedSampleSlots = Object.fromEntries(
    [...new Set(allLoaded.map((f) => f.projectName))].map((name) => {
      const n = allLoaded.filter((f) => f.projectName === name && f.inCurrentSample).length;
      return [name, n];
    })
  );

  // --- 01 per system ---
  const byProject = new Map<string, FullExcelFileItem[]>();
  for (const item of frontierItems) {
    const key = item.projectName ?? 'unknown';
    if (!byProject.has(key)) byProject.set(key, []);
    byProject.get(key)!.push(item);
  }

  for (const [projectName, items] of [...byProject.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const projDir = path.join(dirs.perSystem, safeDirName(projectName));
    fs.mkdirSync(projDir, { recursive: true });

    const wsId = items[0]?.workspaceId ?? projectName;
    const sourceFolder = items[0]?.sourceFolder ?? projectName;
    const projBuffer = await buildFullResearchWorkbook({
      workspaceId: wsId,
      projectName,
      sourceFolder,
      items,
      includePerFileSheets: false,
      addProjectSummarySheets: true,
      includeResearchAnalysisSheets: false,
      completenessNotes: [
        `Frontier-only export for ${projectName}`,
        `Files: ${items.length}`,
        'Sheets 00–21 + 17–20 multi-LLM passes',
      ],
    });
    fs.writeFileSync(path.join(projDir, 'project.xlsx'), Buffer.from(projBuffer));

    const passRows = frontierPassRowsFromItems(items);
    fs.writeFileSync(path.join(projDir, 'project_passes.csv'), recordsToCsv(passRows));
    fs.writeFileSync(
      path.join(projDir, 'project_meta.json'),
      JSON.stringify(
        {
          projectName,
          workspaceId: wsId,
          frontierFiles: items.length,
          passRows: passRows.length,
          exportedAt,
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(projDir, 'saved_report_index.csv'),
      ['file_path,file_name,saved_report_id', ...items.map((i) => `${i.filePath},${i.fileName},${i.savedReportId}`)].join('\n')
    );
  }

  // --- 02 combined ---
  const combinedBuffer = await buildFullResearchWorkbook({
    workspaceId: 'combined-527',
    projectName: 'All Projects — Frontier 527',
    sourceFolder: 'all',
    items: frontierItems,
    includePerFileSheets: false,
    addProjectSummarySheets: true,
    includeResearchAnalysisSheets: false,
    completenessNotes: [
      'Combined frontier cohort — all 527 files',
      'Raw metrics only — see 04_paper_ready for statistical analysis',
    ],
  });
  const combinedPath = path.join(dirs.combined, COMBINED_527_FILENAME);
  fs.writeFileSync(combinedPath, Buffer.from(combinedBuffer));

  const allPassRows = frontierPassRowsFromItems(frontierItems);
  fs.writeFileSync(
    path.join(dirs.combined, 'combined_pass_master_1581.csv'),
    recordsToCsv(allPassRows)
  );
  fs.writeFileSync(
    path.join(dirs.combined, 'combined_file_master_527.csv'),
    aoaToCsv(buildFileMaster527Aoa(allPassRows))
  );

  // --- 03 master ---
  const combinedMaster = await buildCombinedFrontierMasterWorkbook(allItems, {
    exportedAt,
    lockedSampleSlots,
  });
  const masterPath = path.join(dirs.master, MASTER_527_FILENAME);
  fs.writeFileSync(masterPath, Buffer.from(combinedMaster.buffer));

  // --- 04 paper ready ---
  const paper = await buildPaperReadyWorkbook(frontierItems, exportedAt);
  const paperPath = path.join(dirs.paperReady, PAPER_READY_FILENAME);
  fs.writeFileSync(paperPath, Buffer.from(paper.buffer));

  const frontierLoaded = allLoaded.filter(
    (f) => classifyResearchCohort(f.bundle, f.inCurrentSample).cohort === 'A_frontier_parallel'
  );
  const rq3BehaviourPath = path.join(dirs.paperReady, RQ3_BEHAVIOUR_FILENAME);
  fs.writeFileSync(
    rq3BehaviourPath,
    Buffer.from(await buildRq3BehaviourWorkbook(frontierLoaded, exportedAt))
  );

  const cleaning = await buildCleaningMasterWorkbook(frontierItems, exportedAt);
  const cleaningPath = path.join(outDir, CLEANING_MASTER_FILENAME);
  fs.writeFileSync(cleaningPath, Buffer.from(cleaning.buffer));
  fs.writeFileSync(path.join(dirs.combined, CLEANING_MASTER_CSV), cleaning.csv);
  fs.writeFileSync(path.join(outDir, KEY_METRICS_CSV), cleaning.keyMetricsCsv);
  fs.writeFileSync(path.join(dirs.combined, KEY_METRICS_CSV), cleaning.keyMetricsCsv);
  fs.writeFileSync(
    path.join(dirs.reference, 'ANALYSIS_VALIDATION_REPORT.txt'),
    [
      'Analysis validation (embedded in STUDY_MASTER_ONE_SHEET → 02_Analysis_Validation)',
      `Exported: ${exportedAt}`,
      `Status: ${cleaning.validation.summary.validation_errors === 0 ? 'PASS' : 'FAIL'}`,
      '',
      ...Object.entries(cleaning.validation.summary).map(([k, v]) => `${k}: ${v}`),
      '',
      ...(cleaning.validation.issues.length
        ? cleaning.validation.issues.map((i) => `[${i.severity}] ${i.check}: ${i.detail}`)
        : ['No issues detected']),
    ].join('\n'),
    'utf8'
  );
  fs.writeFileSync(
    path.join(dirs.reference, 'METRICS_EXPORT_AUDIT.txt'),
    [
      'Pass metrics export audit (auto-generated)',
      `Exported: ${exportedAt}`,
      `Pass rows: ${cleaning.audit.passCount}`,
      `With researchMetrics: ${cleaning.audit.withResearchMetrics}`,
      `PMD changed: ${cleaning.audit.pmdChanged} | unchanged: ${cleaning.audit.pmdEqualBeforeAfter}`,
      `Export vs JSON mismatches: ${cleaning.audit.auditIssueCount}`,
      ...(cleaning.audit.sampleIssues.length
        ? ['', 'Sample issues:', ...cleaning.audit.sampleIssues.map((s) => `  - ${s}`)]
        : ['', 'All checked export fields match saved researchMetrics.']),
    ].join('\n'),
    'utf8'
  );

  const csvMap = paperReadySheetsToCsvMap(frontierItems, exportedAt);
  for (const [name, aoa] of Object.entries(csvMap)) {
    fs.writeFileSync(path.join(dirs.csvDir, name), aoaToCsv(aoa));
  }

  // --- 05 reference ---
  const defsWb = new ExcelJS.Workbook();
  const defsWs = defsWb.addWorksheet('All_Sheet_Definitions');
  for (const row of sheetDefinitionsToAoa(exportedAt)) defsWs.addRow(row);
  defsWs.views = [{ state: 'frozen', ySplit: 8 }];
  const defsPath = path.join(dirs.reference, SHEET_DEFINITIONS_FILENAME);
  fs.writeFileSync(defsPath, Buffer.from((await defsWb.xlsx.writeBuffer()) as ArrayBuffer));

  const wikiRoot = path.join(process.cwd(), '..', '..', 'wiki');
  for (const name of ['Research_Cohort_Inclusion_Flow.md', 'Research_Excel_Sheet_Reference.md']) {
    const src = path.join(wikiRoot, name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(dirs.reference, name));
    }
  }

  writeText(
    path.join(dirs.reference, 'ANALYSIS_AND_FORMULAS.md'),
    buildAnalysisReferenceMarkdown(paper.fileCount, paper.passRowCount)
  );
  writeText(path.join(dirs.reference, 'PAPER_READY_SHEET_INDEX.md'), buildPaperReadySheetIndexMarkdown());
  writeText(
    path.join(dirs.reference, 'README.txt'),
    [
      '05_reference — documentation for study dataset',
      '',
      'ANALYSIS_AND_FORMULAS.md     Full guide + every stats/pass formula (markdown)',
      'PAPER_READY_SHEET_INDEX.md   Tab index for STUDY_PAPER_READY.xlsx',
      'Research_Excel_Sheet_Reference.md   Master workbook sheet guide (00–45)',
      'Research_Cohort_Inclusion_Flow.md   How 680 saved → 527 frontier',
      'REFINE_Sheet_Definitions.xlsx     Machine-readable sheet catalog',
    ].join('\n')
  );

  writeText(
    path.join(dirs.combined, 'README.txt'),
    [
      '02_combined — all 527 frontier files in one place',
      '',
      'REFINE_combined_frontier_527.xlsx   Raw metrics, all projects',
      'combined_pass_master_1581.csv         All provider pass rows',
      'combined_file_master_527.csv          One row per file',
      'open_systems_summary.csv              Per-project counts',
    ].join('\n')
  );

  writeText(
    path.join(dirs.master, 'README.txt'),
    '03_master — full master workbook (identical to ../STUDY_MASTER_527.xlsx). Start sheet: 43_MASTER_GUIDE'
  );

  writeText(
    path.join(dirs.paperReady, 'README.txt'),
    [
      '04_paper_ready — statistical analysis for paper',
      '',
      'REFINE_PAPER_READY.xlsx   Same as ../STUDY_PAPER_READY.xlsx',
      'REFINE_RQ3_Behaviour_450.xlsx   RQ3 smell-oriented behaviour (450 complete-case)',
      'rq_analysis_csv/            CSV export of every analysis sheet',
      '',
      'Read order: 00_ANALYSIS_GUIDE → 97/98 formulas → RQ1_03 → RQ2_01 → RQ3 behaviour workbook',
    ].join('\n')
  );

  writeText(
    path.join(dirs.perSystem, 'README.txt'),
    '01_per_system — one subfolder per OSS project. Each contains project.xlsx, project_passes.csv, saved_report_index.csv'
  );

  writeText(
    path.join(dirs.archive, 'README.txt'),
    '06_archive — legacy sequential chain cohort (NOT primary RQ1/RQ2). Sensitivity analysis only.'
  );

  fs.writeFileSync(path.join(dirs.combined, 'open_systems_summary.csv'), openSystemsSummaryToCsv(combinedMaster.openSystems));

  // --- 06 archive legacy ---
  if (legacyItems.length > 0) {
    const legacyBuffer = await buildFullResearchWorkbook({
      workspaceId: 'legacy-archive',
      projectName: 'Legacy Chain — Sensitivity Only',
      sourceFolder: 'all',
      items: legacyItems,
      includePerFileSheets: false,
      includeResearchAnalysisSheets: false,
      completenessNotes: [
        'NOT primary cohort — legacy sequential chain',
        `Files: ${legacyItems.length}`,
      ],
    });
    fs.writeFileSync(path.join(dirs.archive, 'legacy_chain_sensitivity.xlsx'), Buffer.from(legacyBuffer));
  }

  // --- README ---
  const rqMapPath = path.join(dirs.readme, 'RQ_MAP.md');
  const folderGuidePath = path.join(dirs.readme, 'FOLDER_GUIDE.md');
  const scopePath = path.join(dirs.readme, 'STUDY_SCOPE.txt');
  const manifestPath = path.join(dirs.readme, 'export_manifest.json');

  writeText(folderGuidePath, buildFolderGuide());
  writeText(rqMapPath, buildRqMap());
  writeText(scopePath, buildStudyScope(exportedAt, paper.fileCount, paper.passRowCount, combinedMaster.openSystems));

  const manifest = {
    exportedAt,
    outDir,
    cohort: 'A_frontier_parallel',
    frontierFiles: paper.fileCount,
    passRows: paper.passRowCount,
    projects: byProject.size,
    paths: {
      perSystem: dirs.perSystem,
      combined: combinedPath,
      master: masterPath,
      paperReady: paperPath,
      csvDir: dirs.csvDir,
      reference: dirs.reference,
      archive: dirs.archive,
    },
    openSystems: combinedMaster.openSystems,
  };
  writeText(manifestPath, JSON.stringify(manifest, null, 2));

  // Top-level copies with clear study export names (easy to find on Desktop)
  const icsePaper = path.join(outDir, 'STUDY_PAPER_READY.xlsx');
  const icseMaster = path.join(outDir, 'STUDY_MASTER_527.xlsx');
  const icseCombined = path.join(outDir, 'STUDY_COMBINED_527.xlsx');
  fs.copyFileSync(paperPath, icsePaper);
  fs.copyFileSync(masterPath, icseMaster);
  fs.copyFileSync(combinedPath, icseCombined);

  writeText(
    path.join(outDir, 'STUDY_START_HERE.txt'),
    [
      'Research study dataset — 527 frontier files (multi-agent, 3 LLM providers)',
      '================================================================',
      '',
      `Exported: ${exportedAt}`,
      `Files: ${paper.fileCount}  |  Provider passes: ${paper.passRowCount}  |  Projects: 15`,
      '',
      'FOLDER STRUCTURE',
      '----------------',
      'study-dataset/',
      '├── STUDY_PAPER_READY.xlsx      ← START HERE for paper (RQ1 + RQ2)',
      '├── STUDY_MASTER_527.xlsx       ← all raw metrics (sheets 00–45)',
      '├── STUDY_MASTER_ONE_SHEET.xlsx ← cleaning: tab 01_Key_Metrics FIRST, then full master',
      '├── STUDY_KEY_METRICS.csv       ← 44 key columns only (smell removed + %)',
      '├── STUDY_COMBINED_527.xlsx     ← 527 files raw, multi-tab',
      '├── STUDY_START_HERE.txt        ← this file',
      '├── 00_README/                 ← RQ map, study scope, manifest',
      '├── 01_per_system/             ← 15 project folders (project.xlsx each)',
      '├── 02_combined/               ← combined xlsx + CSV masters',
      '├── 03_master/                 ← full master (same as STUDY_MASTER_527)',
      '├── 04_paper_ready/            ← paper xlsx + rq_analysis_csv/',
      '├── 05_reference/              ← formulas, sheet defs, cohort flow (READ THIS)',
      '└── 06_archive/                ← legacy only (not primary)',
      '',
      'STEP 0 — DATA CLEANING (start with key metrics tab)',
      '---------------------------------------------------',
      'STUDY_MASTER_ONE_SHEET.xlsx',
      '  Tab 01_Key_Metrics  ← START HERE (columns M–R = smells before/after/removed/%)',
      '  Tab 02_Full_Metrics_All_Columns ← full data (readable headers; keys in 00_Column_Guide)',
      '  Tab 00_Column_Guide ← column meanings & formulas',
      `  ${cleaning.projectCount} systems | ${cleaning.fileCount} files | ${cleaning.rowCount} rows`,
      '  Smell columns: pmd_smells_before, after, remaining, removed, reduction_pct, delta',
      '  Example Test.java 3→0: before=3 after=0 removed=3 reduction_pct=100',
      '  CSV full: 02_combined/STUDY_MASTER_ONE_SHEET.csv',
      '  CSV key:  02_combined/STUDY_KEY_METRICS.csv',
      '',
      'STEP 1 — OPEN STUDY_PAPER_READY.xlsx',
      '-----------------------------------',
      'Tab 00_ANALYSIS_GUIDE        Plain-English guide (read first)',
      'Tab 97_Stats_Column_Formulas Every stats column formula',
      'Tab 98_Pass_Column_Formulas  Every raw pass column source',
      'Tab 01_Pass_Master           1581 pass rows (raw data)',
      'Tab RQ1_03_Excel_CHECK       LIVE Excel formulas — verify stats',
      'Tab RQ1_03_Effectiveness_Stats  MAIN RQ1 results table',
      'Tab RQ1_01_Acceptance        Acceptance rates + Wilson CI',
      'Tab RQ1_02_Rejection         Failure categories',
      'Tab RQ2_01_Provider_Compare  MAIN RQ2 (Friedman + Wilcoxon)',
      'Tab 99_Data_Quality          Missing-data audit',
      '',
      'STEP 2 — READ 05_reference/ (same info as markdown)',
      '---------------------------------------------------',
      'ANALYSIS_AND_FORMULAS.md           Full guide + all formulas',
      'PAPER_READY_SHEET_INDEX.md         Tab index for paper workbook',
      'Research_Excel_Sheet_Reference.md  Master workbook sheets 00–45',
      'Research_Cohort_Inclusion_Flow.md  680 → 527 inclusion story',
      '',
      'STEP 3 — RAW METRICS (if needed)',
      '--------------------------------',
      'STUDY_MASTER_527.xlsx → start tab 43_MASTER_GUIDE',
      'Per-project: 01_per_system/<project>/project.xlsx',
      '',
      'RESEARCH QUESTIONS',
      '------------------',
      'RQ1: Effectiveness — smells & quality (RQ1_03_Effectiveness_Stats)',
      'RQ2: Provider comparison (RQ2_01_Provider_Compare)',
      '',
      'Regenerate: cd web/app && npm run export:icse-dataset',
    ].join('\n')
  );

  return {
    outDir,
    exportedAt,
    frontierFileCount: paper.fileCount,
    passRowCount: paper.passRowCount,
    projectCount: byProject.size,
    paths: {
      readme: dirs.readme,
      rqMap: rqMapPath,
      manifest: manifestPath,
      master: masterPath,
      combined: combinedPath,
      paperReady: paperPath,
      csvDir: dirs.csvDir,
      icsePaper,
      icseMaster,
      icseCombined,
      icseCleaningMaster: cleaningPath,
    },
  };
}

export function validatePaperPackCounts(result: PaperPackExportResult): string[] {
  const issues: string[] = [];
  if (result.frontierFileCount < 500) {
    issues.push(`expected ~527 frontier files, got ${result.frontierFileCount}`);
  }
  if (result.passRowCount < 1500) {
    issues.push(`expected ~1581 pass rows, got ${result.passRowCount}`);
  }
  if (result.projectCount < 15) {
    issues.push(`expected 15 projects, got ${result.projectCount}`);
  }
  if (!fs.existsSync(result.paths.paperReady)) {
    issues.push('paper-ready workbook missing');
  }
  if (!fs.existsSync(result.paths.master)) {
    issues.push('master workbook missing');
  }
  return issues;
}
