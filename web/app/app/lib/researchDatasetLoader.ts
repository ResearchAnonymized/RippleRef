/**
 * Load saved refactoring reports from ~/.refactai/workspaces for export/analysis.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseSavedRefactoringReportBundle, type SavedRefactoringReportBundle } from './savedRefactoringReport';
import { getResearchSamplePaths } from './researchExportCandidates';

export type LoadedResearchFile = {
  workspaceId: string;
  projectName: string;
  sourceFolder: string;
  filePath: string;
  fileName: string;
  bundle: SavedRefactoringReportBundle;
  inCurrentSample: boolean;
};

export type ResearchDatasetLoadResult = {
  files: LoadedResearchFile[];
  samplePathCount: number;
};

type RegistryMeta = { id: string; name: string };

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

function loadRegistry(workspacesRoot: string): Map<string, RegistryMeta> {
  const map = new Map<string, RegistryMeta>();
  const regPath = path.join(workspacesRoot, 'projects.json');
  if (!fs.existsSync(regPath)) return map;
  const list = JSON.parse(fs.readFileSync(regPath, 'utf8')) as RegistryMeta[];
  for (const m of list) map.set(m.id, m);
  return map;
}

export function loadResearchDatasetFromDisk(
  workspacesRoot = path.join(os.homedir(), '.refactai', 'workspaces')
): ResearchDatasetLoadResult {
  const registry = loadRegistry(workspacesRoot);
  const files: LoadedResearchFile[] = [];
  let samplePathCount = 0;

  if (!fs.existsSync(workspacesRoot)) {
    return { files, samplePathCount };
  }

  for (const ent of fs.readdirSync(workspacesRoot, { withFileTypes: true })) {
    if (!ent.isDirectory() || !ent.name.startsWith('project-')) continue;
    const wsId = ent.name;
    const wsDir = path.join(workspacesRoot, wsId);
    const srDir = path.join(wsDir, '.refactai', 'saved-reports');
    if (!fs.existsSync(srDir)) continue;

    const meta = registry.get(wsId);
    const projectName = meta?.name ?? wsId;
    const sourceFolder = resolveSourceFolder(wsDir);

    let samplePathSet = new Set<string>();
    const mp = path.join(wsDir, '.refactai', 'research-sample-manifest.json');
    if (fs.existsSync(mp)) {
      const manifest = JSON.parse(fs.readFileSync(mp, 'utf8')) as Parameters<typeof getResearchSamplePaths>[0];
      samplePathSet = new Set(getResearchSamplePaths(manifest));
      samplePathCount += samplePathSet.size;
    }

    for (const f of fs.readdirSync(srDir)) {
      if (!f.endsWith('.json')) continue;
      const filePath = decodeReportName(f.replace(/\.json$/, ''));
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(srDir, f), 'utf8'));
        const bundle = parseSavedRefactoringReportBundle(raw);
        if (!bundle) continue;
        bundle.workspaceId = wsId;
        bundle.filePath = filePath;
        files.push({
          workspaceId: wsId,
          projectName,
          sourceFolder,
          filePath,
          fileName: filePath.split('/').pop() || filePath,
          bundle,
          inCurrentSample: samplePathSet.has(filePath),
        });
      } catch {
        /* skip corrupt report */
      }
    }
  }

  files.sort((a, b) =>
    a.projectName.localeCompare(b.projectName) || a.filePath.localeCompare(b.filePath)
  );
  return { files, samplePathCount };
}
