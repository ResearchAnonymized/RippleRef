/**
 * Extended research export: all saved reports (not sample-only), cohort columns, inclusion CSV.
 * Usage: cd web/app && npm run export:extended-research
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import ExcelJS from 'exceljs';
import {
  buildCrossProjectRefactoringExcel,
  buildProjectRefactoringExcel,
  mergeExportCandidates,
  type CrossProjectSlice,
} from '../app/lib/exportProjectRefactoringExcel';
import { parseSavedRefactoringReportBundle } from '../app/lib/savedRefactoringReport';
import { getResearchSamplePaths } from '../app/lib/researchExportCandidates';
import type { WorkspaceStudyFileInput } from '../app/lib/exportWorkspaceStudyCsv';
import {
  buildInclusionRow,
  classifyResearchCohort,
  inclusionRowsToCsv,
  type InclusionRow,
} from '../app/lib/researchExportCohort';
import { writeResearchAnalysisViews } from './write-research-analysis-views';
import { buildPaperAnalysisWorkbook, buildBalancedPaperAnalysisWorkbook, buildEqualN169Workbook, getBalancedCohortSummaries } from '../app/lib/researchStatisticalAnalysis';
import { balancedFileListCsv } from '../app/lib/researchCompleteCase';
import type { FullExcelFileItem } from '../app/lib/buildFullResearchExcel';
import {
  buildCombinedFrontierMasterWorkbook,
  FRONTIER_MASTER_FILENAME,
  openSystemsSummaryToCsv,
} from '../app/lib/buildCombinedFrontierMasterExcel';
import {
  sheetDefinitionsToAoa,
  SHEET_DEFINITIONS_FILENAME,
} from '../app/lib/researchExcelSheetDefinitions';

const HOME = os.homedir();
const WORKSPACES = path.join(HOME, '.refactai', 'workspaces');
const REGISTRY = path.join(WORKSPACES, 'projects.json');
const DEFAULT_USER = 'user-2f821fe5';

type RegistryMeta = { id: string; name: string; userId?: string };

function decodeReportName(stem: string): string {
  const pad = '='.repeat((4 - (stem.length % 4)) % 4);
  return Buffer.from(stem + pad, 'base64url').toString('utf8');
}

function resolveSourceFolder(wsDir: string): string {
  try {
    for (const ent of fs.readdirSync(wsDir, { withFileTypes: true })) {
      if (ent.isDirectory() && ent.name !== '.refactai') return ent.name;
    }
  } catch {
    /* ignore */
  }
  return path.basename(wsDir);
}

function loadRegistry(): Map<string, RegistryMeta> {
  const map = new Map<string, RegistryMeta>();
  if (fs.existsSync(REGISTRY)) {
    const list = JSON.parse(fs.readFileSync(REGISTRY, 'utf8')) as RegistryMeta[];
    for (const m of list) map.set(m.id, m);
  }
  return map;
}

function listProjectWorkspaceIds(): string[] {
  if (!fs.existsSync(WORKSPACES)) return [];
  return fs
    .readdirSync(WORKSPACES, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('project-'))
    .map((d) => d.name);
}

function loadSavedReports(wsDir: string): Map<string, object> {
  const dir = path.join(wsDir, '.refactai', 'saved-reports');
  const out = new Map<string, object>();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const fp = decodeReportName(f.replace(/\.json$/, ''));
    try {
      out.set(fp, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    } catch {
      /* skip */
    }
  }
  return out;
}

function loadSamplePathSet(wsDir: string): Set<string> {
  const mp = path.join(wsDir, '.refactai', 'research-sample-manifest.json');
  if (!fs.existsSync(mp)) return new Set();
  const m = JSON.parse(fs.readFileSync(mp, 'utf8')) as Parameters<typeof getResearchSamplePaths>[0];
  return new Set(getResearchSamplePaths(m));
}

function saveExtendedWorkspaceExport(wsDir: string, buffer: ArrayBuffer, meta: Record<string, unknown>): void {
  const dir = path.join(wsDir, '.refactai', 'exports', 'excel');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'extended.xlsx'), Buffer.from(buffer));
  fs.writeFileSync(
    path.join(dir, 'extended.meta.json'),
    JSON.stringify({ exportId: 'extended', ...meta, fullMetrics: true, exportVersion: 2, exportKind: 'extended_research' }, null, 2)
  );
}

function cohortSummary(rows: InclusionRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    out[r.cohort] = (out[r.cohort] ?? 0) + 1;
    if (r.in_current_sample) out.in_current_sample = (out.in_current_sample ?? 0) + 1;
    if (r.include_in_multi_llm_analysis) out.multi_llm_3pass = (out.multi_llm_3pass ?? 0) + 1;
  }
  return out;
}

async function main(): Promise<void> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(HOME, 'RENDRI-R-export', ts);
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, 'per_project'), { recursive: true });

  const registry = loadRegistry();
  const workspaceIds = listProjectWorkspaceIds();
  console.log(`Extended export → ${outDir}`);
  console.log(`Workspaces: ${workspaceIds.length}`);

  const slices: CrossProjectSlice[] = [];
  const inclusionRows: InclusionRow[] = [];
  const userId = Array.from(registry.values()).find((m) => m.userId)?.userId ?? DEFAULT_USER;

  for (const wsId of workspaceIds) {
    const wsDir = path.join(WORKSPACES, wsId);
    const meta = registry.get(wsId);
    const projectName = meta?.name ?? wsId;
    const sourceFolder = resolveSourceFolder(wsDir);
    const reports = loadSavedReports(wsDir);
    if (reports.size === 0) continue;

    const samplePathSet = loadSamplePathSet(wsDir);
    const savedList = Array.from(reports.keys()).map((filePath) => ({ filePath, savedAt: Date.now() }));
    const progressFiles: WorkspaceStudyFileInput[] = savedList.map(({ filePath }) => ({
      filePath,
      status: 'refactored',
    }));

    const candidates = mergeExportCandidates(progressFiles, savedList).filter((c) => c.hasSavedReport);
    candidates.sort((a, b) => a.filePath.localeCompare(b.filePath));

    const cohortNotes: string[] = [];
    let a = 0;
    let b = 0;
    let c = 0;
    for (const cand of candidates) {
      const raw = reports.get(cand.filePath);
      const bundle = raw ? parseSavedRefactoringReportBundle(raw) : null;
      const inSample = samplePathSet.has(cand.filePath);
      if (bundle) {
        inclusionRows.push(
          buildInclusionRow(bundle, {
            projectName,
            workspaceId: wsId,
            filePath: cand.filePath,
            fileName: cand.label,
          }, inSample)
        );
        const co = classifyResearchCohort(bundle, inSample).cohort;
        if (co === 'A_frontier_parallel') a += 1;
        else if (co === 'B_legacy_chain_non_frontier') b += 1;
        else c += 1;
      }
    }
    cohortNotes.push(
      `${projectName}: ${candidates.length} saved — A_frontier=${a}, B_legacy=${b}, other/C=${c}, in_sample=${[...samplePathSet].filter((p) => reports.has(p)).length}`
    );

    const loadBundle = async (filePath: string) => {
      const raw = reports.get(filePath);
      if (!raw) return null;
      const bundle = parseSavedRefactoringReportBundle(raw);
      if (bundle) {
        bundle.workspaceId = wsId;
        bundle.filePath = filePath;
      }
      return bundle;
    };

    console.log(`  ${projectName}: ${candidates.length} file(s)`);

    const built = await buildProjectRefactoringExcel({
      workspaceId: wsId,
      projectName,
      sourceFolder,
      candidates,
      loadBundle,
      samplePathSet,
      completenessNotes: [
        'Extended export: all saved reports with cohort tags (not sample-only).',
        'RQ2/RQ3: use sheet 20 per provider; top-level metrics may reflect best smell-delta pass.',
        ...cohortNotes,
      ],
      includePerFileSheets: true,
    });

    const safeName = projectName.replace(/[^\w.-]+/g, '_').slice(0, 80);
    fs.writeFileSync(path.join(outDir, 'per_project', `${safeName}.xlsx`), Buffer.from(built.buffer));
    saveExtendedWorkspaceExport(wsDir, built.buffer, {
      filename: built.filename,
      savedAt: Date.now(),
      projectLabel: projectName,
      fileCount: built.filePaths.length,
      exportedCount: built.exported,
      skippedCount: built.skipped,
      filePaths: built.filePaths,
      sourceFolder,
    });

    slices.push({
      workspaceId: wsId,
      projectName,
      sourceFolder,
      samplePathSet,
      candidates,
      loadBundle,
      completenessNotes: cohortNotes,
    });
  }

  const summary = cohortSummary(inclusionRows);
  const crossNotes = [
    'RENDRI-R extended export — all saved reports across projects.',
    `Total files: ${inclusionRows.length}`,
    `Cohort A (frontier parallel): ${summary.A_frontier_parallel ?? 0}`,
    `Cohort B (legacy non-frontier chain): ${summary.B_legacy_chain_non_frontier ?? 0}`,
    `Cohort C / other: ${(summary.C_no_multi_llm ?? 0) + (summary.other ?? 0)}`,
    `In current 150-file sample: ${summary.in_current_sample ?? 0}`,
    `With 3-pass multi-LLM: ${summary.multi_llm_3pass ?? 0}`,
    'Primary RQ2/RQ3 analysis: filter sheet 20 by cohort; do not pool A and B without labelling.',
  ];

  const cross = await buildCrossProjectRefactoringExcel({
    slices,
    includePerFileSheets: false,
    addProjectSummarySheets: true,
    includeResearchAnalysisSheets: true,
  });

  const masterPath = path.join(outDir, 'RENDRI-R_master_all_files.xlsx');
  fs.writeFileSync(masterPath, Buffer.from(cross.buffer));

  const paperItems: FullExcelFileItem[] = [];
  for (const slice of slices) {
    const sourceFolder = slice.sourceFolder || slice.projectName;
    for (const c of slice.candidates) {
      const bundle = await slice.loadBundle(c.filePath);
      paperItems.push({
        filePath: c.filePath,
        fileName: c.label,
        bundle,
        savedReportId: bundle ? encodeURIComponent(c.filePath) : '',
        missingReason: bundle ? '' : 'no saved full report',
        candidate: c,
        projectName: slice.projectName,
        sourceFolder,
        workspaceId: slice.workspaceId,
        inCurrentSample: slice.samplePathSet?.has(c.filePath) ?? false,
      });
    }
  }
  const exportedAtIso = new Date().toISOString();
  const lockedSampleSlots = Object.fromEntries(
    slices.map((s) => [s.projectName, s.samplePathSet?.size ?? 0])
  );
  const combined = await buildCombinedFrontierMasterWorkbook(paperItems, {
    exportedAt: exportedAtIso,
    lockedSampleSlots,
  });
  const combinedPath = path.join(outDir, FRONTIER_MASTER_FILENAME);
  fs.writeFileSync(combinedPath, Buffer.from(combined.buffer));

  const defsWb = new ExcelJS.Workbook();
  const defsWs = defsWb.addWorksheet('All_Sheet_Definitions');
  for (const row of sheetDefinitionsToAoa(exportedAtIso)) defsWs.addRow(row);
  defsWs.getRow(8).font = { bold: true };
  defsWs.views = [{ state: 'frozen', ySplit: 8 }];
  const defsPath = path.join(outDir, SHEET_DEFINITIONS_FILENAME);
  fs.writeFileSync(defsPath, Buffer.from((await defsWb.xlsx.writeBuffer()) as ArrayBuffer));
  fs.mkdirSync(path.join(HOME, 'RENDRI-R-export', 'reference'), { recursive: true });
  fs.writeFileSync(
    path.join(HOME, 'RENDRI-R-export', 'reference', SHEET_DEFINITIONS_FILENAME),
    Buffer.from((await defsWb.xlsx.writeBuffer()) as ArrayBuffer)
  );

  const openSystemsPath = path.join(outDir, 'open_systems_summary.csv');
  fs.writeFileSync(openSystemsPath, openSystemsSummaryToCsv(combined.openSystems));

  const paperPath = path.join(outDir, 'RENDRI-R_PAPER_ANALYSIS.xlsx');
  const paperBuffer = await buildPaperAnalysisWorkbook(paperItems, exportedAtIso);
  fs.writeFileSync(paperPath, Buffer.from(paperBuffer));

  const balancedPath = path.join(outDir, 'RENDRI-R_PAPER_ANALYSIS_BALANCED.xlsx');
  const balancedBuffer = await buildBalancedPaperAnalysisWorkbook(paperItems, new Date().toISOString());
  fs.writeFileSync(balancedPath, Buffer.from(balancedBuffer));

  const equalNPath = path.join(outDir, 'RENDRI-R_EQUAL_N_169.xlsx');
  const equalNBuffer = await buildEqualN169Workbook(paperItems, new Date().toISOString());
  fs.writeFileSync(equalNPath, Buffer.from(equalNBuffer));

  const balancedMeta = getBalancedCohortSummaries(paperItems);
  fs.writeFileSync(
    path.join(outDir, 'balanced_cohort_full_files.csv'),
    balancedFileListCsv(balancedMeta.extended, 'full')
  );
  fs.writeFileSync(
    path.join(outDir, 'balanced_cohort_run_files.csv'),
    balancedFileListCsv(balancedMeta.extended, 'run')
  );
  fs.writeFileSync(
    path.join(outDir, 'balanced_cohort_summary.json'),
    JSON.stringify(
      {
        full: balancedMeta.full,
        run: balancedMeta.run,
        primaryFull: balancedMeta.primaryFull,
      },
      null,
      2
    )
  );
  // Legacy name — same lean all-files workbook (no 340 per-file tabs)
  const crossPath = path.join(outDir, 'extended_cross_project.xlsx');
  fs.writeFileSync(crossPath, Buffer.from(cross.buffer));

  const inclusionPath = path.join(outDir, 'inclusion_cohort.csv');
  fs.writeFileSync(inclusionPath, inclusionRowsToCsv(inclusionRows));

  const scopePath = path.join(outDir, 'STUDY_SCOPE.txt');
  const openSystemsLines = combined.openSystems.map(
    (r) =>
      `  ${r.project_name}: saved=${r.saved_reports_total}, frontier=${r.frontier_saved}, sample_slots=${r.locked_sample_slots}, frontier_in_sample=${r.frontier_in_sample}`
  );
  const osTotals = combined.openSystems.reduce(
    (acc, r) => ({
      saved: acc.saved + r.saved_reports_total,
      frontier: acc.frontier + r.frontier_saved,
      slots: acc.slots + r.locked_sample_slots,
      fis: acc.fis + r.frontier_in_sample,
    }),
    { saved: 0, frontier: 0, slots: 0, fis: 0 }
  );
  fs.writeFileSync(
    scopePath,
    [
      'RENDRI-R Extended Export — Study Scope',
      '=====================================',
      '',
      `Exported at: ${exportedAtIso}`,
      `Total saved reports: ${inclusionRows.length}`,
      `Open-source systems: ${combined.openSystems.length}`,
      '',
      '15 open systems — file counts:',
      ...openSystemsLines,
      '',
      `  TOTAL: saved=${osTotals.saved}, frontier=${osTotals.frontier}, sample_slots=${osTotals.slots}, frontier_in_sample=${osTotals.fis}`,
      '',
      'Cohorts:',
      '  A_frontier_parallel — GPT-5.5, Gemini 3.1 Pro, Claude Opus 4.8, independent_parallel',
      '  B_legacy_chain_non_frontier — GPT-4o-mini, Gemini 2.5 Flash, Claude Sonnet 4.6, sequential chain',
      '  C_no_multi_llm — older runs without 3 provider passes',
      '',
      'Primary locked sample: in_current_sample=yes (150 files, cohort A only)',
      'Extended multi-LLM analysis: include_in_multi_llm_analysis=yes (293 files typical)',
      '',
      'PRIMARY — Combined master (frontier LLMs): RENDRI-R_MASTER_COMPLETE.xlsx',
      '  All frontier cohort data in ONE file: sheets 00–30 (metrics + RQ stats) + 31–44 (audit + balanced + 15 systems).',
      'All cohorts master: RENDRI-R_master_all_files.xlsx — every saved report, sheets 00–30.',
      'Statistical analysis: sheets 24–28 (RQ2 Wilcoxon/t, RQ3 Friedman, acceptance CI).',
      'Per-project detail: per_project/<project>.xlsx (all files for that project).',
      '',
      'Honesty rules:',
      '  - No human review in evaluation loop',
      '  - Use sheet 20 (Multi_LLM_Metrics_Long) for RQ2/RQ3 per provider',
      '  - Do not use bundle-level best-provider metrics as sole RQ2 evidence',
      '  - A vs B compare different files — distribution-level only unless re-run paired',
      '',
      `User archive id: ${userId}`,
    ].join('\n')
  );

  fs.writeFileSync(
    path.join(outDir, 'export_manifest.json'),
    JSON.stringify(
      {
        exportedAt: exportedAtIso,
        outDir,
        combinedMasterWorkbook: combinedPath,
        sheetDefinitionsWorkbook: defsPath,
        combinedMasterFrontierFiles: combined.frontierFileCount,
        combinedMasterInSample: combined.inSampleCount,
        combinedMasterPrimaryPasses: combined.primaryPassRows,
        openSystemsSummary: openSystemsPath,
        openSystems: combined.openSystems,
        masterWorkbook: masterPath,
        paperAnalysis: paperPath,
        crossProject: crossPath,
        inclusionCohort: inclusionPath,
        totalFiles: inclusionRows.length,
        cohortSummary: summary,
        crossExported: cross.exported,
        crossSkipped: cross.skipped,
        projects: slices.map((s) => ({ id: s.workspaceId, name: s.projectName, files: s.candidates.length })),
      },
      null,
      2
    )
  );

  const { analysisDir, counts: analysisCounts } = writeResearchAnalysisViews(outDir);
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'export_manifest.json'), 'utf8')) as Record<string, unknown>;
  manifest.analysisViews = analysisDir;
  manifest.analysisCounts = analysisCounts;
  fs.writeFileSync(path.join(outDir, 'export_manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('\n=== Extended export complete ===');
  console.log(`★ COMBINED MASTER (frontier): ${combinedPath}`);
  console.log(`  Sheet definitions: ${defsPath}`);
  console.log(`  ${combined.frontierFileCount} frontier files (${combined.inSampleCount} in 150-sample), ${combined.primaryPassRows} primary passes`);
  console.log('\n15 open-source systems:');
  console.log('  project                          saved  frontier  sample  frontier-in-sample');
  for (const r of combined.openSystems) {
    const name = r.project_name.padEnd(32);
    console.log(
      `  ${name} ${String(r.saved_reports_total).padStart(5)}  ${String(r.frontier_saved).padStart(8)}  ${String(r.locked_sample_slots).padStart(6)}  ${String(r.frontier_in_sample).padStart(19)}`
    );
  }
  console.log(
    `  ${'TOTAL'.padEnd(32)} ${String(osTotals.saved).padStart(5)}  ${String(osTotals.frontier).padStart(8)}  ${String(osTotals.slots).padStart(6)}  ${String(osTotals.fis).padStart(19)}`
  );
  console.log(`\nOpen systems CSV: ${openSystemsPath}`);
  console.log(`Master (all cohorts): ${masterPath}`);
  console.log(`Paper analysis ONLY: ${paperPath}`);
  console.log(`Paper BALANCED (equal N): ${balancedPath}`);
  console.log(`Equal N 169 ONLY: ${equalNPath}`);
  console.log(`  FULL cohort: ${balancedMeta.full.balanced_files} files (${balancedMeta.full.balanced_pass_rows} passes)`);
  console.log(`  RUN cohort: ${balancedMeta.run.balanced_files} files (${balancedMeta.run.balanced_pass_rows} passes)`);
  console.log(`Cross-project: ${crossPath}`);
  console.log(`Inclusion CSV: ${inclusionPath}`);
  console.log(`Analysis views: ${analysisDir}`);
  console.log(`  RQ2 primary passes: ${analysisCounts.primaryPassRows}`);
  console.log(`  RQ2 extended passes: ${analysisCounts.extendedPassRows}`);
  console.log(`  RQ3 comparison rows: ${analysisCounts.comparisonWideRows}`);
  console.log(`Files: ${inclusionRows.length} (${cross.exported} with full reports)`);
  console.log(`Cohorts: A=${summary.A_frontier_parallel ?? 0} B=${summary.B_legacy_chain_non_frontier ?? 0} C/other=${(summary.C_no_multi_llm ?? 0) + (summary.other ?? 0)}`);
  console.log(`In current sample: ${summary.in_current_sample ?? 0}`);
  console.log(`3-pass multi-LLM: ${summary.multi_llm_3pass ?? 0}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
