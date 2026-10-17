/**
 * Legacy stratified sample API (fixed 4+4+4).
 * New studies should use researchSampling.pickResearchSample.
 */

import type { FileInfo } from '../api/client';
import type { FileProgressMap } from './fileActivity';
import {
  buildEligibleResearchPool,
  smellStratum,
  type SmellStratum,
} from './researchSampling';
import { createSeededRng, seededPickN, seededShuffle } from './researchSeededRandom';

export type { SmellStratum } from './researchSampling';
export {
  STRATIFIED_PICK_PER_BUCKET,
  STRATIFIED_TOTAL_TARGET,
  researchSamplePool,
} from './researchSampling';

export type StratifiedSampleResult = {
  paths: string[];
  picked: Array<{ path: string; name: string; smellCount: number; stratum: SmellStratum }>;
  counts: { low: number; mid: number; high: number };
  available: { low: number; mid: number; high: number };
  warnings: string[];
};

/** Pick up to 4 random files per smell stratum (12 total when all buckets are large enough). */
export function pickStratifiedRandomSample(
  files: FileInfo[],
  fileProgress: FileProgressMap,
  perBucket = 4,
  seed = 42
): StratifiedSampleResult {
  const pool = buildEligibleResearchPool(files, fileProgress, 0);
  const buckets: Record<SmellStratum, typeof pool> = {
    low: [],
    mid: [],
    high: [],
  };
  for (const entry of pool) {
    buckets[entry.smellStratum].push(entry);
  }

  const available = {
    low: buckets.low.length,
    mid: buckets.mid.length,
    high: buckets.high.length,
  };

  const rng = createSeededRng(seed);
  const warnings: string[] = [];
  const picked: StratifiedSampleResult['picked'] = [];

  for (const stratum of ['low', 'mid', 'high'] as SmellStratum[]) {
    const label =
      stratum === 'low' ? '≤9' : stratum === 'mid' ? '10–49' : '≥50';
    const have = buckets[stratum].length;
    const take = seededPickN(buckets[stratum], perBucket, rng);
    if (take.length < perBucket) {
      warnings.push(
        `${label} smells: only ${have} file(s) in project — picked ${take.length} (wanted ${perBucket}).`
      );
    }
    for (const { file, smellCount } of take) {
      picked.push({
        path: file.relativePath,
        name: file.name,
        smellCount,
        stratum,
      });
    }
  }

  seededShuffle(picked, rng);

  return {
    paths: picked.map((p) => p.path),
    picked,
    counts: {
      low: picked.filter((p) => p.stratum === 'low').length,
      mid: picked.filter((p) => p.stratum === 'mid').length,
      high: picked.filter((p) => p.stratum === 'high').length,
    },
    available,
    warnings,
  };
}

export function formatStratifiedSampleSummary(result: StratifiedSampleResult): string {
  const { counts, available, warnings } = result;
  const parts = [
    `Random ${result.paths.length}/12: ${counts.low} low (≤9), ${counts.mid} mid (10–49), ${counts.high} high (≥50)`,
    `Pool: ${available.low} / ${available.mid} / ${available.high} available`,
  ];
  if (warnings.length) parts.push(warnings.join(' '));
  return parts.join(' · ');
}
