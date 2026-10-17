#!/usr/bin/env npx tsx
/**
 * Pick stratified research sample (default 15 files) and persist manifest + baselines.
 *
 * Usage:
 *   API_BASE=http://127.0.0.1:8083/api npx tsx scripts/prepare-research-system-sample.ts \
 *     --workspace project-07aa431d --label "01-Johotdraw"
 */
import type { FileInfo } from '../app/api/client';
import {
  DEFAULT_RESEARCH_SEED,
  pickResearchSample,
  buildResearchSampleManifest,
  type ResearchSampleResult,
} from '../app/lib/researchSampling';
import { buildResearchSampleId } from '../app/lib/researchSampleStorage';

const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:8083/api').replace(/\/$/, '');

function arg(name: string, fallback = ''): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const workspaceId = arg('--workspace', process.env.WORKSPACE_ID || '');
const projectLabel = arg('--label', process.env.PROJECT_LABEL || workspaceId);
const maxPerProject = Number(arg('--max', process.env.SAMPLE_SIZE || '15'));
const seed = Number(arg('--seed', String(DEFAULT_RESEARCH_SEED)));
const force = process.argv.includes('--force');
const skipIfExists = process.argv.includes('--skip-if-exists');

if (!workspaceId) {
  console.error('Usage: --workspace <id> [--label name] [--max 15] [--seed 42] [--force] [--skip-if-exists]');
  process.exit(1);
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${init?.method || 'GET'} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

async function fetchAllFiles(ws: string): Promise<FileInfo[]> {
  const all: FileInfo[] = [];
  const size = 500;
  for (let page = 0; page < 200; page++) {
    const data = await apiJson<{ files: FileInfo[] }>(
      `/workspaces/${ws}/files/paginated?page=${page}&size=${size}&analyzeCodeSmells=false`
    );
    const batch = data.files ?? [];
    all.push(...batch);
    if (batch.length < size) break;
  }
  return all;
}

async function main() {
  console.log(`API_BASE=${API_BASE}`);
  console.log(`workspace=${workspaceId} label=${projectLabel} max=${maxPerProject} seed=${seed}`);

  if (skipIfExists) {
    try {
      const existing = await apiJson<{ result: ResearchSampleResult }>(
        `/workspaces/${workspaceId}/research-sample`
      );
      const n = existing.result?.paths?.length ?? 0;
      if (n >= maxPerProject) {
        console.log(`SKIP: manifest already has ${n} paths`);
        for (const p of existing.result.paths) console.log(p);
        return;
      }
    } catch {
      /* 404 — continue */
    }
  }

  let excludePaths: string[] = [];
  try {
    const ex = await apiJson<{ excludedPaths: string[] }>(
      `/workspaces/${workspaceId}/research/excluded-paths`
    );
    excludePaths = ex.excludedPaths ?? [];
  } catch {
    excludePaths = [];
  }

  const files = await fetchAllFiles(workspaceId);
  console.log(`Listed ${files.length} files from workspace`);

  const result = pickResearchSample(files, {}, {
    seed,
    maxPerProject,
    excludePaths,
  });

  if (result.pickedCount < 1) {
    console.error('No eligible files for sample — run PMD scan first.');
    console.error('Warnings:', result.warnings);
    process.exit(2);
  }

  if (result.pickedCount < maxPerProject) {
    console.warn(
      `WARN: picked ${result.pickedCount}/${maxPerProject} (eligible=${result.eligibleCount})`
    );
  }

  const savedAt = Date.now();
  const sampleId = buildResearchSampleId(workspaceId, result.config.seed, savedAt);
  const manifest = {
    ...buildResearchSampleManifest(workspaceId, projectLabel, result),
    sampleId,
  };

  await apiJson(`/workspaces/${workspaceId}/research-sample`, {
    method: 'PUT',
    body: JSON.stringify({
      savedAt,
      sampleId,
      projectLabel,
      result,
      manifest,
      archivePrevious: force,
    }),
  });

  const snap = await apiJson<{ status: string; snapshots: unknown[] }>(
    `/workspaces/${workspaceId}/research/baseline-snapshot`,
    {
      method: 'POST',
      body: JSON.stringify({ sampleId, filePaths: result.paths }),
    }
  );

  console.log(`Saved manifest: ${result.pickedCount} files, sampleId=${sampleId}`);
  console.log(`Baselines snapshotted: ${snap.snapshots?.length ?? 0}`);
  if (result.warnings.length) console.warn('Warnings:', result.warnings);
  console.log('--- paths ---');
  for (const p of result.paths) console.log(p);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
