/**
 * Raw open-systems counts → Excel only (no stats, no cohort tests).
 * Usage: cd web/app && npm run export:open-systems-raw
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import ExcelJS from 'exceljs';
import { loadResearchDatasetFromDisk } from '../app/lib/researchDatasetLoader';
import { getResearchSamplePaths } from '../app/lib/researchExportCandidates';

const HOME = os.homedir();
const WORKSPACES = path.join(HOME, '.refactai', 'workspaces');

type RegistryMeta = { id: string; name: string };

function loadRegistry(): RegistryMeta[] {
  const regPath = path.join(WORKSPACES, 'projects.json');
  if (!fs.existsSync(regPath)) return [];
  return JSON.parse(fs.readFileSync(regPath, 'utf8')) as RegistryMeta[];
}

function addAoaSheet(
  wb: ExcelJS.Workbook,
  name: string,
  aoa: (string | number | boolean)[][]
): void {
  const ws = wb.addWorksheet(name.slice(0, 31));
  for (const row of aoa) ws.addRow(row);
  if (aoa.length > 0) {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
}

async function main(): Promise<void> {
  const registry = loadRegistry().sort((a, b) => a.name.localeCompare(b.name));
  const { files } = loadResearchDatasetFromDisk();

  const byProject = new Map<
    string,
    {
      workspace_id: string;
      saved_paths: string[];
      sample_paths: string[];
    }
  >();

  for (const meta of registry) {
    const wsDir = path.join(WORKSPACES, meta.id);
    const mp = path.join(wsDir, '.refactai', 'research-sample-manifest.json');
    let sample_paths: string[] = [];
    if (fs.existsSync(mp)) {
      const manifest = JSON.parse(fs.readFileSync(mp, 'utf8')) as Parameters<
        typeof getResearchSamplePaths
      >[0];
      sample_paths = getResearchSamplePaths(manifest);
    }
    byProject.set(meta.name, {
      workspace_id: meta.id,
      saved_paths: [],
      sample_paths,
    });
  }

  for (const f of files) {
    const entry = byProject.get(f.projectName);
    if (entry) entry.saved_paths.push(f.filePath);
  }

  const summaryRows: (string | number)[][] = [
    [
      'project_name',
      'workspace_id',
      'saved_report_count',
      'locked_sample_path_count',
      'sample_paths_with_saved_report',
    ],
  ];

  const pathRows: (string | number)[][] = [
    ['project_name', 'workspace_id', 'file_path', 'in_locked_sample'],
  ];

  let totalSaved = 0;
  let totalSample = 0;
  let totalSampleSaved = 0;

  for (const meta of registry) {
    const entry = byProject.get(meta.name);
    if (!entry) continue;
    const saved = [...new Set(entry.saved_paths)].sort();
    const sampleSet = new Set(entry.sample_paths);
    const sampleSaved = entry.sample_paths.filter((p) => saved.includes(p)).length;

    summaryRows.push([
      meta.name,
      meta.id,
      saved.length,
      entry.sample_paths.length,
      sampleSaved,
    ]);

    for (const fp of saved) {
      pathRows.push([meta.name, meta.id, fp, sampleSet.has(fp) ? 'yes' : 'no']);
    }

    totalSaved += saved.length;
    totalSample += entry.sample_paths.length;
    totalSampleSaved += sampleSaved;
  }

  summaryRows.push([]);
  summaryRows.push([
    'TOTAL',
    '',
    totalSaved,
    totalSample,
    totalSampleSaved,
  ]);

  const exportedAt = new Date().toISOString();
  const outDir = path.join(HOME, 'RENDRI-R-export', 'raw-open-systems-counts');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'open_systems_counts_RAW.xlsx');

  const wb = new ExcelJS.Workbook();
  addAoaSheet(wb, '00_ReadMe', [
    ['RENDRI-R — Raw open-systems file counts'],
    ['Exported', exportedAt],
    [''],
    ['No statistical tests. No cohort filtering. Disk counts only.'],
    [''],
    ['Sheet', 'Contents'],
    ['01_Counts', 'One row per project (15 open systems) + TOTAL'],
    ['02_All_Saved_Paths', 'One row per saved report JSON on disk'],
    [''],
    ['saved_report_count', 'Files in .refactai/saved-reports/'],
    ['locked_sample_path_count', 'Paths in research-sample-manifest.json'],
    ['sample_paths_with_saved_report', 'Sample paths that have a saved report'],
  ]);
  addAoaSheet(wb, '01_Counts', summaryRows);
  addAoaSheet(wb, '02_All_Saved_Paths', pathRows);

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  fs.writeFileSync(outPath, Buffer.from(buffer));

  console.log(`Raw Excel written: ${outPath}`);
  console.log(`Projects: ${registry.length}`);
  console.log(`Saved reports: ${totalSaved}`);
  console.log(`Locked sample paths: ${totalSample}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
