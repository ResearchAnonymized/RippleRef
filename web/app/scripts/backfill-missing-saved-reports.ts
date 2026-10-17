/**
 * Backfill saved-report JSON for research sample files that have rejected/original
 * artifacts + file-status but no saved-reports entry (agent disconnect during batch).
 *
 * Usage: cd web/app && npx tsx scripts/backfill-missing-saved-reports.ts
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { buildSavedRefactoringReportBundle } from '../app/lib/savedRefactoringReport';
import { getResearchSamplePaths } from '../app/lib/researchExportCandidates';

const HOME = os.homedir();
const WORKSPACES = path.join(HOME, '.refactai', 'workspaces');

function encodeFilePath(filePath: string): string {
  return Buffer.from(filePath, 'utf8').toString('base64url');
}

function decodeStem(stem: string): string {
  const pad = '='.repeat((4 - (stem.length % 4)) % 4);
  return Buffer.from(stem + pad, 'base64url').toString('utf8');
}

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

type FileStatusEntry = {
  filePath?: string;
  status?: string;
  smellsBefore?: number;
  smellsAfter?: number;
  lastRefactorAt?: number;
  rejectionReason?: string;
  verifyAccepted?: boolean;
};

function backfillOne(wsId: string, filePath: string): boolean {
  const wsDir = path.join(WORKSPACES, wsId);
  const reportDir = path.join(wsDir, '.refactai', 'saved-reports');
  const encoded = encodeFilePath(filePath);
  const reportPath = path.join(reportDir, `${encoded}.json`);

  if (fs.existsSync(reportPath)) {
    console.log(`  skip (already saved): ${filePath}`);
    return false;
  }

  const statusMap = readJson<Record<string, FileStatusEntry>>(
    path.join(wsDir, '.refactai', 'file-status.json')
  );
  const st = statusMap?.[filePath];
  if (!st) {
    console.log(`  skip (no file-status): ${filePath}`);
    return false;
  }

  const origPath = path.join(wsDir, '.refactai', 'originals', filePath);
  const rejPath = path.join(wsDir, '.refactai', 'rejected', filePath);
  const refPath = path.join(wsDir, '.refactai', 'refactored', filePath);
  const artifactPath = fs.existsSync(rejPath) ? rejPath : fs.existsSync(refPath) ? refPath : null;

  if (!fs.existsSync(origPath)) {
    console.log(`  skip (no original artifact): ${filePath}`);
    return false;
  }

  const originalContent = fs.readFileSync(origPath, 'utf8');
  const refactoredContent = artifactPath ? fs.readFileSync(artifactPath, 'utf8') : originalContent;
  const rejected = st.status === 'rejected' || st.verifyAccepted === false;
  const smellsBefore = st.smellsBefore ?? 0;
  const smellsAfter = st.smellsAfter ?? smellsBefore;

  const bundle = buildSavedRefactoringReportBundle({
    workspaceId: wsId,
    filePath,
    originalContent,
    refactoredContent,
    applyResult: {
      rejected,
      success: !rejected,
      verifyAccepted: st.verifyAccepted ?? !rejected,
      backfillNote:
        'Recovered from .refactai/originals + rejected/refactored after batch save failed (agent disconnect). researchMetrics may be absent — re-run batch for full 15-section metrics.',
    },
    improvementStats: {
      before: { total: smellsBefore, critical: 0, major: 0, minor: smellsBefore },
      after: { total: smellsAfter, critical: 0, major: 0, minor: smellsAfter },
      delta: { total: smellsAfter - smellsBefore, critical: 0, major: 0, minor: smellsAfter - smellsBefore },
    },
    refactoringRejected: {
      rejected,
      rejectionReason: st.rejectionReason ?? (rejected ? 'rejected run' : undefined),
    },
    researchMetrics: null,
    pipelineMetadata: { backfill: true, backfillAt: new Date().toISOString() },
  });

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(bundle, null, 2));
  console.log(`  BACKFILLED: ${filePath} (${rejected ? 'rejected' : st.status})`);
  return true;
}

function main(): void {
  const registry = readJson<Array<{ id: string; name: string }>>(
    path.join(WORKSPACES, 'projects.json')
  );
  if (!registry) {
    console.error('No projects.json');
    process.exit(1);
  }

  let backfilled = 0;
  for (const proj of registry) {
    const wsDir = path.join(WORKSPACES, proj.id);
    const manifest = readJson<Parameters<typeof getResearchSamplePaths>[0]>(
      path.join(wsDir, '.refactai', 'research-sample-manifest.json')
    );
    const picked = getResearchSamplePaths(manifest);
    if (!picked.length) continue;

    const saved = new Set<string>();
    const srDir = path.join(wsDir, '.refactai', 'saved-reports');
    if (fs.existsSync(srDir)) {
      for (const f of fs.readdirSync(srDir)) {
        if (f.endsWith('.json')) saved.add(decodeStem(f.replace(/\.json$/, '')));
      }
    }

    const missing = picked.filter((p) => !saved.has(p));
    if (!missing.length) continue;

    console.log(`\n${proj.name} (${proj.id}): ${missing.length} missing saved report(s)`);
    for (const fp of missing) {
      if (backfillOne(proj.id, fp)) backfilled += 1;
    }
  }

  console.log(`\nDone. Backfilled ${backfilled} saved report(s).`);
  if (backfilled > 0) {
    console.log('Re-run: npm run export:all-research');
  }
}

main();
