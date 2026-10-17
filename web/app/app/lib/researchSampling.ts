/**
 * Research-oriented stratified sampling: Cochran n, stratified random (smell × LOC),
 * seeded selection, feasibility caps, exportable manifest.
 */

import type { FileInfo } from '../api/client';
import type { FileProgressMap } from './fileActivity';
import { effectivePmdCount } from './fileListSort';
import {
  approximateMarginOfError,
  finitePopulationSampleSize,
  Z_SCORE_95,
} from './researchSampleSize';
import { createSeededRng, seededPickN, seededShuffle } from './researchSeededRandom';

export type SmellStratum = 'low' | 'mid' | 'high';
export type LocStratum = 'small' | 'medium' | 'large';

export const DEFAULT_RESEARCH_SEED = 42;
export const DEFAULT_MARGIN_OF_ERROR = 0.08;
export const DEFAULT_MAX_PER_PROJECT = 15;
export const DEFAULT_MAX_LOC_OVER_2000 = 2;
export const DEFAULT_MIN_SMELLS = 1;

export const LOC_SMALL_MAX = 499;
export const LOC_MEDIUM_MAX = 2000;

export type ResearchSamplingConfig = {
  seed?: number;
  marginOfError?: number;
  maxPerProject?: number;
  minSmells?: number;
  maxLocOver2000?: number;
  confidenceLevel?: number;
  /** Paths from archived samples — excluded when picking a new study sample. */
  excludePaths?: Iterable<string>;
};

export type ResearchPoolEntry = {
  file: FileInfo;
  smellCount: number;
  smellStratum: SmellStratum;
  loc: number;
  locStratum: LocStratum;
  cellKey: string;
};

export type ResearchPickedFile = {
  path: string;
  name: string;
  smellCount: number;
  smellStratum: SmellStratum;
  loc: number;
  locStratum: LocStratum;
};

export type ResearchSampleResult = {
  paths: string[];
  picked: ResearchPickedFile[];
  eligibleCount: number;
  targetSampleSize: number;
  pickedCount: number;
  config: {
    seed: number;
    marginOfError: number;
    maxPerProject: number;
    minSmells: number;
    maxLocOver2000: number;
    confidenceLevel: number;
  };
  poolBySmell: { low: number; mid: number; high: number };
  poolByLoc: { small: number; medium: number; large: number };
  approximateMarginOfError: number;
  warnings: string[];
  generatedAt: string;
};

export function smellStratum(count: number): SmellStratum {
  if (count <= 9) return 'low';
  if (count <= 49) return 'mid';
  return 'high';
}

export function locStratum(loc: number): LocStratum {
  if (loc <= LOC_SMALL_MAX) return 'small';
  if (loc <= LOC_MEDIUM_MAX) return 'medium';
  return 'large';
}

export function fileLinesOfCode(file: FileInfo): number {
  const loc = file.metrics?.linesOfCode;
  return typeof loc === 'number' && loc >= 0 ? loc : 0;
}

function isMainJavaSource(file: FileInfo): boolean {
  if (!file.name.endsWith('.java')) return false;
  const p = file.relativePath.replace(/\\/g, '/').toLowerCase();
  return !p.includes('/test/') && !p.includes('/tests/');
}

/** Eligible population: main Java, known PMD count, ≥ minSmells. */
export function buildEligibleResearchPool(
  files: FileInfo[],
  fileProgress: FileProgressMap,
  minSmells = DEFAULT_MIN_SMELLS
): ResearchPoolEntry[] {
  const out: ResearchPoolEntry[] = [];
  for (const file of files) {
    if (!isMainJavaSource(file)) continue;
    const smellCount = effectivePmdCount(file, fileProgress);
    if (smellCount === null || smellCount < minSmells) continue;
    const loc = fileLinesOfCode(file);
    const sStratum = smellStratum(smellCount);
    const lStratum = locStratum(loc);
    out.push({
      file,
      smellCount,
      smellStratum: sStratum,
      loc,
      locStratum: lStratum,
      cellKey: `${sStratum}|${lStratum}`,
    });
  }
  return out;
}

function countBySmell(pool: ResearchPoolEntry[]): ResearchSampleResult['poolBySmell'] {
  return {
    low: pool.filter((e) => e.smellStratum === 'low').length,
    mid: pool.filter((e) => e.smellStratum === 'mid').length,
    high: pool.filter((e) => e.smellStratum === 'high').length,
  };
}

function countByLoc(pool: ResearchPoolEntry[]): ResearchSampleResult['poolByLoc'] {
  return {
    small: pool.filter((e) => e.locStratum === 'small').length,
    medium: pool.filter((e) => e.locStratum === 'medium').length,
    large: pool.filter((e) => e.locStratum === 'large').length,
  };
}

function groupByCell(pool: ResearchPoolEntry[]): Map<string, ResearchPoolEntry[]> {
  const map = new Map<string, ResearchPoolEntry[]>();
  for (const e of pool) {
    const list = map.get(e.cellKey) ?? [];
    list.push(e);
    map.set(e.cellKey, list);
  }
  return map;
}

/** Proportional allocation of target n across non-empty cells. */
export function allocateAcrossCells(
  cells: Array<{ key: string; size: number }>,
  targetN: number
): Map<string, number> {
  const alloc = new Map<string, number>();
  if (targetN <= 0 || cells.length === 0) return alloc;

  const total = cells.reduce((s, c) => s + c.size, 0);
  if (total === 0) return alloc;

  const fractions = cells.map((c) => ({
    key: c.key,
    size: c.size,
    exact: (targetN * c.size) / total,
  }));

  let assigned = 0;
  for (const f of fractions) {
    const floor = Math.min(f.size, Math.floor(f.exact));
    alloc.set(f.key, floor);
    assigned += floor;
  }

  const remainders = fractions
    .map((f) => ({
      key: f.key,
      size: f.size,
      remainder: f.exact - Math.floor(f.exact),
      current: alloc.get(f.key) ?? 0,
    }))
    .filter((f) => f.current < f.size)
    .sort((a, b) => b.remainder - a.remainder);

  let left = targetN - assigned;
  let i = 0;
  while (left > 0 && remainders.length > 0) {
    const cell = remainders[i % remainders.length];
    const cur = alloc.get(cell.key) ?? 0;
    if (cur < cell.size) {
      alloc.set(cell.key, cur + 1);
      left -= 1;
    }
    i += 1;
    if (i > remainders.length * (targetN + 1)) break;
  }

  return alloc;
}

/** At least one pick per non-empty smell stratum when n allows. */
export function ensureSmellStratumFloors(
  pool: ResearchPoolEntry[],
  allocation: Map<string, number>,
  targetN: number
): Map<string, number> {
  const next = new Map(allocation);
  const smellStrata: SmellStratum[] = ['low', 'mid', 'high'];
  const nonEmpty = smellStrata.filter((s) => pool.some((e) => e.smellStratum === s));
  if (nonEmpty.length === 0 || targetN < nonEmpty.length) return next;

  for (const s of nonEmpty) {
    const keys = Array.from(next.keys()).filter((k) => k.startsWith(`${s}|`));
    const current = keys.reduce((sum, k) => sum + (next.get(k) ?? 0), 0);
    if (current > 0) continue;

    const candidateKeys = keys.filter((k) => {
      const cellPool = pool.filter((e) => e.cellKey === k);
      return cellPool.length > 0;
    });
    if (candidateKeys.length === 0) continue;

    const pickKey = candidateKeys.sort(
      (a, b) =>
        pool.filter((e) => e.cellKey === b).length -
        pool.filter((e) => e.cellKey === a).length
    )[0];
    next.set(pickKey, (next.get(pickKey) ?? 0) + 1);
  }

  const total = Array.from(next.values()).reduce((a, b) => a + b, 0);
  if (total > targetN) {
    const sortedKeys = Array.from(next.entries())
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    let excess = total - targetN;
    for (const [key, val] of sortedKeys) {
      if (excess <= 0) break;
      const drop = Math.min(excess, Math.max(0, val - 1));
      if (drop > 0) {
        next.set(key, val - drop);
        excess -= drop;
      }
    }
  }

  return next;
}

function applyLargeLocCap(
  picked: ResearchPickedFile[],
  pool: ResearchPoolEntry[],
  maxLarge: number,
  rng: () => number
): { picked: ResearchPickedFile[]; warnings: string[] } {
  const warnings: string[] = [];
  const pickedPaths = new Set(picked.map((p) => p.path));
  let large = picked.filter((p) => p.locStratum === 'large');

  if (large.length <= maxLarge) {
    return { picked, warnings };
  }

  const toRemove = seededShuffle(large, rng).slice(maxLarge);
  const keepLarge = new Set(large.filter((p) => !toRemove.includes(p)).map((p) => p.path));
  let result = picked.filter((p) => p.locStratum !== 'large' || keepLarge.has(p.path));

  for (const removed of toRemove) {
    const replacements = pool.filter(
      (e) =>
        !pickedPaths.has(e.file.relativePath) &&
        !result.some((r) => r.path === e.file.relativePath) &&
        e.smellStratum === removed.smellStratum &&
        e.locStratum !== 'large'
    );
    if (replacements.length === 0) {
      warnings.push(
        `LOC>2000 cap: removed ${removed.name}; no same-smell replacement under 2000 LOC.`
      );
      continue;
    }
    const [rep] = seededPickN(replacements, 1, rng);
    pickedPaths.add(rep.file.relativePath);
    result.push({
      path: rep.file.relativePath,
      name: rep.file.name,
      smellCount: rep.smellCount,
      smellStratum: rep.smellStratum,
      loc: rep.loc,
      locStratum: rep.locStratum,
    });
  }

  warnings.push(
    `LOC>${LOC_MEDIUM_MAX} cap: at most ${maxLarge} large file(s) in the sample (${toRemove.length} deferred).`
  );

  return { picked: result, warnings };
}

function entryToPicked(e: ResearchPoolEntry): ResearchPickedFile {
  return {
    path: e.file.relativePath,
    name: e.file.name,
    smellCount: e.smellCount,
    smellStratum: e.smellStratum,
    loc: e.loc,
    locStratum: e.locStratum,
  };
}

export function pickResearchSample(
  files: FileInfo[],
  fileProgress: FileProgressMap,
  config: ResearchSamplingConfig = {}
): ResearchSampleResult {
  const seed = config.seed ?? DEFAULT_RESEARCH_SEED;
  const marginOfError = config.marginOfError ?? DEFAULT_MARGIN_OF_ERROR;
  const maxPerProject = config.maxPerProject ?? DEFAULT_MAX_PER_PROJECT;
  const minSmells = config.minSmells ?? DEFAULT_MIN_SMELLS;
  const maxLocOver2000 = config.maxLocOver2000 ?? DEFAULT_MAX_LOC_OVER_2000;
  const confidenceLevel = config.confidenceLevel ?? 0.95;

  const warnings: string[] = [];
  const norm = (p: string) => String(p || '').replace(/\\/g, '/');
  const exclude = new Set((config.excludePaths ?? []).map(norm));
  const pool = buildEligibleResearchPool(files, fileProgress, minSmells).filter(
    (e) => !exclude.has(norm(e.file.relativePath))
  );
  const eligibleCount = pool.length;

  if (exclude.size > 0 && eligibleCount === 0) {
    warnings.push(
      `All eligible files excluded (${exclude.size} archived paths) — try a different seed or upload more projects.`
    );
  }

  if (eligibleCount === 0) {
    return {
      paths: [],
      picked: [],
      eligibleCount: 0,
      targetSampleSize: 0,
      pickedCount: 0,
      config: {
        seed,
        marginOfError,
        maxPerProject,
        minSmells,
        maxLocOver2000,
        confidenceLevel,
      },
      poolBySmell: { low: 0, mid: 0, high: 0 },
      poolByLoc: { small: 0, medium: 0, large: 0 },
      approximateMarginOfError: 1,
      warnings: [
        'No eligible files. Run PMD analysis first; need main-source Java with ≥1 smell.',
      ],
      generatedAt: new Date().toISOString(),
    };
  }

  const targetSampleSize = finitePopulationSampleSize(eligibleCount, marginOfError, {
    maxSample: maxPerProject,
  });

  const rng = createSeededRng(seed);
  const cellMap = groupByCell(pool);
  const cells = Array.from(cellMap.entries()).map(([key, entries]) => ({
    key,
    size: entries.length,
  }));

  let allocation = allocateAcrossCells(cells, targetSampleSize);
  allocation = ensureSmellStratumFloors(pool, allocation, targetSampleSize);

  let picked: ResearchPickedFile[] = [];
  for (const [cellKey, take] of Array.from(allocation.entries())) {
    if (take <= 0) continue;
    const cellPool = cellMap.get(cellKey) ?? [];
    const chosen = seededPickN(cellPool, take, rng);
    for (const e of chosen) {
      picked.push(entryToPicked(e));
    }
    if (chosen.length < take) {
      warnings.push(`Cell ${cellKey}: wanted ${take}, only ${chosen.length} available.`);
    }
  }

  const capResult = applyLargeLocCap(picked, pool, maxLocOver2000, rng);
  picked = capResult.picked;
  warnings.push(...capResult.warnings);

  picked = seededShuffle(picked, rng);

  const actualN = picked.length;
  const moe = approximateMarginOfError(actualN, eligibleCount);

  if (eligibleCount < targetSampleSize) {
    warnings.push(
      `Eligible pool (${eligibleCount}) smaller than computed target (${targetSampleSize}); using all eligible or available picks.`
    );
  }

  return {
    paths: picked.map((p) => p.path),
    picked,
    eligibleCount,
    targetSampleSize,
    pickedCount: actualN,
    config: {
      seed,
      marginOfError,
      maxPerProject,
      minSmells,
      maxLocOver2000,
      confidenceLevel,
    },
    poolBySmell: countBySmell(pool),
    poolByLoc: countByLoc(pool),
    approximateMarginOfError: moe,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

export function formatResearchSampleSummary(result: ResearchSampleResult): string {
  if (result.eligibleCount === 0) {
    return result.warnings[0] ?? 'No eligible files for research sampling.';
  }
  const moePct = (result.approximateMarginOfError * 100).toFixed(1);
  const targetPct = (result.config.marginOfError * 100).toFixed(0);
  const { poolBySmell: s, poolByLoc: l } = result;
  const lines = [
    `Eligible: ${result.eligibleCount} files → sample ${result.pickedCount} (target ${result.targetSampleSize}, 95% CI, ~${moePct}% MoE vs ${targetPct}% goal)`,
    `Smell pool: ${s.low} low / ${s.mid} mid / ${s.high} high · LOC pool: ${l.small} small / ${l.medium} med / ${l.large} large`,
    `Seed ${result.config.seed} · cap ≤${result.config.maxPerProject}/project · ≤${result.config.maxLocOver2000} files with LOC>${LOC_MEDIUM_MAX}`,
  ];
  if (result.warnings.length) {
    lines.push(result.warnings.join(' '));
  }
  return lines.join('\n');
}

export function buildResearchSampleManifest(
  workspaceId: string,
  projectLabel: string,
  result: ResearchSampleResult
): Record<string, unknown> {
  return {
    version: 1,
    workspaceId,
    projectLabel,
    generatedAt: result.generatedAt,
    method: 'stratified-random-smell-x-loc-cochran-finite-population',
    references: [
      'Cochran (1977) Sampling Techniques',
      'Baltes & Ralph (2022) EMSE sampling guidelines',
    ],
    eligibleCount: result.eligibleCount,
    targetSampleSize: result.targetSampleSize,
    pickedCount: result.pickedCount,
    approximateMarginOfError: result.approximateMarginOfError,
    config: result.config,
    poolBySmell: result.poolBySmell,
    poolByLoc: result.poolByLoc,
    strata: {
      smell: { low: '≤9 PMD', mid: '10–49', high: '≥50' },
      loc: {
        small: `≤${LOC_SMALL_MAX} LOC`,
        medium: `${LOC_SMALL_MAX + 1}–${LOC_MEDIUM_MAX}`,
        large: `>${LOC_MEDIUM_MAX}`,
      },
    },
    picked: result.picked,
    warnings: result.warnings,
  };
}

export function downloadResearchSampleManifest(
  workspaceId: string,
  projectLabel: string,
  result: ResearchSampleResult
): void {
  const manifest = buildResearchSampleManifest(workspaceId, projectLabel, result);
  const blob = new Blob([JSON.stringify(manifest, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `research-sample-${workspaceId}-${result.config.seed}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** @deprecated Use pickResearchSample — legacy fixed 4+4+4 API */
export const STRATIFIED_PICK_PER_BUCKET = 4;
export const STRATIFIED_TOTAL_TARGET = 12;

export function researchSamplePool(
  files: FileInfo[],
  fileProgress: FileProgressMap
): Array<{ file: FileInfo; smellCount: number }> {
  return buildEligibleResearchPool(files, fileProgress, 0).map((e) => ({
    file: e.file,
    smellCount: e.smellCount,
  }));
}
