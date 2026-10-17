/**
 * One-shot: rebuild full-metric Excel for all workspaces from saved reports on disk.
 * Usage: cd web/app && npx tsx scripts/export-all-research-excel.ts
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  buildCrossProjectRefactoringExcel,
  buildProjectRefactoringExcel,
  mergeExportCandidates,
  type CrossProjectSlice,
  type ExportCandidate,
} from '../app/lib/exportProjectRefactoringExcel';
import { parseSavedRefactoringReportBundle } from '../app/lib/savedRefactoringReport';
import { expandResearchSampleCandidates, getResearchSamplePaths } from '../app/lib/researchExportCandidates';
import type { WorkspaceStudyFileInput } from '../app/lib/exportWorkspaceStudyCsv';
import { buildPaperWideRow } from '../app/lib/exportProjectRefactoringExcel';

const HOME = os.homedir();
const WORKSPACES = path.join(HOME, '.refactai', 'workspaces');
const REGISTRY = path.join(WORKSPACES, 'projects.json');
const DEFAULT_USER = 'user-2f821fe5';

type RegistryMeta = {
  id: string;
  name: string;
  userId?: string;
};

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

function listAllWorkspaceIds(): string[] {
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

function loadBatchMissing(wsDir: string, saved: Set<string>): Array<{ filePath: string; reason: string }> {
  const batchPath = path.join(wsDir, '.refactai', 'batch-run-latest.json');
  if (!fs.existsSync(batchPath)) return [];
  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8')) as {
    results?: Array<{ filePath?: string; reportSaved?: boolean; status?: string; error?: string }>;
  };
  const missing: Array<{ filePath: string; reason: string }> = [];
  for (const r of batch.results ?? []) {
    const fp = r.filePath ?? '';
    if (!fp || saved.has(fp)) continue;
    missing.push({
      filePath: fp,
      reason: r.error ?? `batch status: ${r.status ?? 'unknown'} — no saved report`,
    });
  }
  return missing;
}

function loadManifestPicked(wsDir: string): string[] {
  const mp = path.join(wsDir, '.refactai', 'research-sample-manifest.json');
  if (!fs.existsSync(mp)) return [];
  const m = JSON.parse(fs.readFileSync(mp, 'utf8')) as Parameters<typeof getResearchSamplePaths>[0];
  return getResearchSamplePaths(m);
}

function replaceWorkspaceExport(wsDir: string, buffer: ArrayBuffer, meta: Record<string, unknown>): void {
  // SAFETY: only touch .refactai/exports/excel — never saved-reports, refactored/, originals/, etc.
  const dir = path.join(wsDir, '.refactai', 'exports', 'excel');
  const allowedRoot = path.join(wsDir, '.refactai', 'exports', 'excel');
  if (!dir.startsWith(allowedRoot)) {
    throw new Error(`Refusing to write outside exports/excel: ${dir}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.xlsx') || f.endsWith('.meta.json')) {
      fs.unlinkSync(path.join(dir, f));
    }
  }
  const exportId = 'latest';
  const filename = String(meta.filename ?? 'research-export.xlsx');
  fs.writeFileSync(path.join(dir, `${exportId}.xlsx`), Buffer.from(buffer));
  fs.writeFileSync(
    path.join(dir, `${exportId}.meta.json`),
    JSON.stringify({ exportId, filename, ...meta, fullMetrics: true, exportVersion: 2 }, null, 2)
  );
}

function saveUserArchive(
  userId: string,
  buffer: ArrayBuffer,
  indexJson: string,
  meta: Record<string, unknown>
): void {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const exportId = `${ts}-cross-project`;
  const dir = path.join(HOME, '.refactai', 'users', userId, 'research-archive', exportId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'workbook.xlsx'), Buffer.from(buffer));
  fs.writeFileSync(path.join(dir, 'files_index.json'), indexJson);
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ exportId, userId, ...meta, fullMetrics: true, exportVersion: 2 }, null, 2)
  );
}

async function main(): Promise<void> {
  const registry = loadRegistry();
  const workspaceIds = listAllWorkspaceIds();
  console.log(`Found ${workspaceIds.length} workspace(s)`);

  const slices: CrossProjectSlice[] = [];
  const userId = Array.from(registry.values()).find((m) => m.userId)?.userId ?? DEFAULT_USER;

  for (const wsId of workspaceIds) {
    const wsDir = path.join(WORKSPACES, wsId);
    const meta = registry.get(wsId);
    const projectName = meta?.name ?? wsId;
    const sourceFolder = resolveSourceFolder(wsDir);
    const reports = loadSavedReports(wsDir);
    const savedPaths = new Set(reports.keys());
    const missing = loadBatchMissing(wsDir, savedPaths);
    const picked = loadManifestPicked(wsDir);

    const completenessNotes: string[] = [];
    if (missing.length) {
      completenessNotes.push(
        `${projectName}: ${missing.length} file(s) in batch without saved report (agent connection lost):`
      );
      for (const m of missing) completenessNotes.push(`  - ${m.filePath}`);
    }
    if (picked.length && savedPaths.size < picked.length) {
      completenessNotes.push(
        `${projectName}: sample size ${picked.length}, saved reports ${savedPaths.size}`
      );
    }

    const savedList = Array.from(savedPaths).map((filePath) => ({ filePath, savedAt: Date.now() }));
    const progressFiles: WorkspaceStudyFileInput[] = Array.from(savedPaths).map((filePath) => ({
      filePath,
      status: 'refactored',
    }));

    for (const m of missing) {
      progressFiles.push({
        filePath: m.filePath,
        status: 'error',
      });
    }

    let candidates = mergeExportCandidates(progressFiles, savedList);
    if (picked.length) {
      candidates = expandResearchSampleCandidates(candidates, picked, savedPaths, {
        sampleOnly: true,
      });
    }

    if (candidates.length === 0 && reports.size === 0) {
      console.log(`  skip ${projectName} (${wsId}) — no data`);
      slices.push({
        workspaceId: wsId,
        projectName,
        sourceFolder,
        candidates: [],
        loadBundle: async () => null,
        completenessNotes: [`${projectName}: empty workspace — no saved reports`],
      });
      continue;
    }

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

    console.log(`  export ${projectName}: ${candidates.length} file(s), ${reports.size} full report(s)`);

    const built = await buildProjectRefactoringExcel({
      workspaceId: wsId,
      projectName,
      sourceFolder,
      candidates,
      loadBundle,
      completenessNotes,
      includePerFileSheets: true,
    });

    replaceWorkspaceExport(wsDir, built.buffer, {
      filename: built.filename,
      savedAt: Date.now(),
      projectLabel: projectName,
      fileCount: built.filePaths.length,
      exportedCount: built.exported,
      skippedCount: built.skipped,
      filePaths: built.filePaths,
      exportKind: 'batch_auto',
      sourceFolder,
    });
    console.log(`    → saved ${built.filename} (${built.exported} full, ${built.skipped} incomplete)`);

    slices.push({
      workspaceId: wsId,
      projectName,
      sourceFolder,
      candidates,
      loadBundle,
      completenessNotes,
    });
  }

  const cross = await buildCrossProjectRefactoringExcel({ slices });
  const indexRows = slices.flatMap((sl) =>
    sl.candidates.map((c) => {
      const row = buildPaperWideRow(null, c, c.label, {
        workspaceId: sl.workspaceId,
        projectName: sl.projectName,
      });
      return { ...row, source_folder: sl.sourceFolder };
    })
  );
  saveUserArchive(userId, cross.buffer, JSON.stringify(indexRows, null, 2), {
    filename: cross.filename,
    savedAt: Date.now(),
    fileCount: cross.filePaths.length,
    exportedCount: cross.exported,
    skippedCount: cross.skipped,
    exportKind: 'cross_project',
    sourceProjectLabels: slices.map((s) => s.projectName),
    sourceWorkspaceIds: slices.map((s) => s.workspaceId),
  });

  // Cross-project workbook goes ONLY to user profile archive — never overwrites a project's latest.xlsx.

  console.log(`\nCross-project workbook: ${cross.filename}`);
  console.log(`  ${cross.exported} files with full metrics, ${cross.skipped} incomplete`);
  console.log(`User archive saved for ${userId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
