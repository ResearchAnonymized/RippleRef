/**
 * Merge multiLlmRuns from batch-run-latest.json into saved-reports that lack them.
 *
 * Usage: cd web/app && npm run backfill:multi-llm
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { getResearchSamplePaths } from '../app/lib/researchExportCandidates';
import type { MultiLlmRunRecord } from '../app/lib/batchRunStorage';

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

function sanitizeRuns(raw: unknown): MultiLlmRunRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, idx) => {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    return {
      passIndex: typeof r.passIndex === 'number' ? r.passIndex : idx,
      provider: String(r.provider ?? ''),
      model: String(r.model ?? ''),
      ok: Boolean(r.ok),
      changed: Boolean(r.changed),
      linesBefore: typeof r.linesBefore === 'number' ? r.linesBefore : undefined,
      linesAfter: typeof r.linesAfter === 'number' ? r.linesAfter : undefined,
      smellsBefore: typeof r.smellsBefore === 'number' ? r.smellsBefore : undefined,
      smellsAfter: typeof r.smellsAfter === 'number' ? r.smellsAfter : undefined,
      smellDelta: typeof r.smellDelta === 'number' ? r.smellDelta : undefined,
      orchestration: typeof r.orchestration === 'string' ? r.orchestration : undefined,
      agentSteps: Array.isArray(r.agentSteps) ? (r.agentSteps as MultiLlmRunRecord['agentSteps']) : undefined,
      researchMetrics:
        r.researchMetrics && typeof r.researchMetrics === 'object'
          ? (r.researchMetrics as Record<string, unknown>)
          : undefined,
      experiment:
        r.experiment && typeof r.experiment === 'object'
          ? (r.experiment as Record<string, unknown>)
          : undefined,
    };
  });
}

function main(): void {
  const registry = readJson<Array<{ id: string; name: string }>>(
    path.join(WORKSPACES, 'projects.json')
  );
  if (!registry) {
    console.error('No projects.json');
    process.exit(1);
  }

  let updated = 0;
  let skippedHasRuns = 0;
  let skippedNoBatch = 0;

  for (const proj of registry) {
    const wsDir = path.join(WORKSPACES, proj.id);
    const manifest = readJson<Parameters<typeof getResearchSamplePaths>[0]>(
      path.join(wsDir, '.refactai', 'research-sample-manifest.json')
    );
    const samplePaths = new Set(getResearchSamplePaths(manifest));
    if (!samplePaths.size) continue;

    const batch = readJson<{ results?: Array<{ filePath?: string; multiLlmRuns?: unknown }> }>(
      path.join(wsDir, '.refactai', 'batch-run-latest.json')
    );
    const batchByPath = new Map<string, MultiLlmRunRecord[]>();
    for (const r of batch?.results ?? []) {
      const fp = r.filePath ?? '';
      const runs = sanitizeRuns(r.multiLlmRuns);
      if (fp && runs.length) batchByPath.set(fp, runs);
    }

    const srDir = path.join(wsDir, '.refactai', 'saved-reports');
    if (!fs.existsSync(srDir)) continue;

    let projUpdated = 0;
    for (const fp of samplePaths) {
      const reportPath = path.join(srDir, `${encodeFilePath(fp)}.json`);
      if (!fs.existsSync(reportPath)) continue;

      const bundle = readJson<Record<string, unknown>>(reportPath);
      if (!bundle) continue;

      const existing = sanitizeRuns(bundle.multiLlmRuns ?? (bundle.applyResult as Record<string, unknown>)?.multiLlmRuns);
      if (existing.length >= 3) {
        skippedHasRuns += 1;
        continue;
      }

      const fromBatch = batchByPath.get(fp);
      if (!fromBatch?.length) {
        skippedNoBatch += 1;
        continue;
      }

      bundle.multiLlmRuns = fromBatch;
      const ar = (bundle.applyResult as Record<string, unknown> | null) ?? {};
      ar.multiLlmRuns = fromBatch;
      bundle.applyResult = ar;
      const pm = (bundle.pipelineMetadata as Record<string, unknown> | null) ?? {};
      if (pm.multiLlmChain == null) pm.multiLlmChain = true;
      bundle.pipelineMetadata = pm;

      fs.writeFileSync(reportPath, JSON.stringify(bundle, null, 2));
      updated += 1;
      projUpdated += 1;
      console.log(`  ${proj.name}: ${fp.split('/').pop()} ← ${fromBatch.length} pass(es)`);
    }
    if (projUpdated) console.log(`${proj.name}: updated ${projUpdated} file(s)`);
  }

  console.log(`\nDone. Updated ${updated} saved report(s).`);
  console.log(`Skipped (already had runs): ${skippedHasRuns}`);
  console.log(`Skipped (no batch-run data): ${skippedNoBatch}`);
  if (updated > 0) {
    console.log('Re-run: npm run export:all-research');
  }
}

main();
