/**
 * Cochran sample-size formulas (finite population correction).
 * @see Cochran, W. G. (1977). Sampling Techniques, 3rd ed., Ch. 4.
 */

export const Z_SCORE_95 = 1.96;

/** Ideal sample size for infinite population (proportion estimation). */
export function cochranInfiniteSampleSize(
  marginOfError: number,
  proportion = 0.5,
  zScore = Z_SCORE_95
): number {
  if (marginOfError <= 0 || marginOfError >= 1) {
    throw new Error('marginOfError must be between 0 and 1 (exclusive)');
  }
  const p = Math.min(1, Math.max(0, proportion));
  const n0 = (zScore ** 2 * p * (1 - p)) / marginOfError ** 2;
  return Math.ceil(n0);
}

/**
 * Sample size for a known finite population N, optionally capped.
 * Returns min(computed n, maxSample, N).
 */
export function finitePopulationSampleSize(
  populationSize: number,
  marginOfError: number,
  options?: {
    proportion?: number;
    zScore?: number;
    maxSample?: number;
  }
): number {
  if (populationSize <= 0) return 0;
  const n0 = cochranInfiniteSampleSize(
    marginOfError,
    options?.proportion ?? 0.5,
    options?.zScore ?? Z_SCORE_95
  );
  const corrected = Math.ceil(n0 / (1 + (n0 - 1) / populationSize));
  let n = corrected;
  if (options?.maxSample != null) {
    n = Math.min(n, options.maxSample);
  }
  return Math.min(n, populationSize);
}

/** Approximate margin of error at 95% CI for a given n and N (proportion, p=0.5). */
export function approximateMarginOfError(
  sampleSize: number,
  populationSize: number,
  zScore = Z_SCORE_95
): number {
  if (sampleSize <= 0 || populationSize <= 0) return 1;
  const n = Math.min(sampleSize, populationSize);
  const N = populationSize;
  const p = 0.5;
  const fpc = N > n ? (N - n) / (N - 1) : 0;
  const variance = (p * (1 - p) / n) * fpc;
  return zScore * Math.sqrt(variance);
}
