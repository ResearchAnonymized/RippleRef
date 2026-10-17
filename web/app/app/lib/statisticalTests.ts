/**
 * Statistical helpers for research Excel export (no native Excel formulas for these).
 */

export function mean(values: number[]): number {
  if (!values.length) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function stdDevSample(values: number[]): number {
  if (values.length < 2) return NaN;
  const m = mean(values);
  const v = values.reduce((s, x) => s + (x - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

export function cohensD(deltas: number[]): number {
  const sd = stdDevSample(deltas);
  if (!deltas.length || !Number.isFinite(sd) || sd === 0) return NaN;
  return mean(deltas) / sd;
}

/** Cohen's d for two independent groups (pooled SD). */
export function cohensDIndependent(a: number[], b: number[]): number {
  if (a.length < 2 || b.length < 2) return NaN;
  const ma = mean(a);
  const mb = mean(b);
  const va = a.reduce((s, x) => s + (x - ma) ** 2, 0) / (a.length - 1);
  const vb = b.reduce((s, x) => s + (x - mb) ** 2, 0) / (b.length - 1);
  const pooled = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2));
  if (!Number.isFinite(pooled) || pooled === 0) return NaN;
  return (ma - mb) / pooled;
}

function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t *
      Math.exp(-ax * ax));
  return sign * y;
}

/** Regularized incomplete beta — for t CDF. */
function betainc(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBeta =
    lgamma(a) + lgamma(b) - lgamma(a + b);
  let m = 1;
  let m2 = 0;
  let aa = 1;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let i = 1; i <= 200; i += 1) {
    m2 = i;
    let num = (m2 * (b - m2) * x) / ((a + 2 * m2 - 1) * (a + 2 * m2));
    d = 1 + num * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + num / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    num = -((a + m2) * (a + b + m2) * x) / ((a + 2 * m2) * (a + 2 * m2 + 1));
    d = 1 + num * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + num / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-10) break;
  }
  return Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) * h / a;
}

function lgamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.984369578019571e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i += 1) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export function tCdf(t: number, df: number): number {
  if (df <= 0 || !Number.isFinite(t)) return NaN;
  const x = df / (df + t * t);
  const p = betainc(df / 2, 0.5, x);
  return t >= 0 ? 1 - p / 2 : p / 2;
}

export function pairedTTestP(before: number[], after: number[]): number {
  const deltas: number[] = [];
  for (let i = 0; i < before.length; i += 1) {
    const d = after[i] - before[i];
    if (Number.isFinite(before[i]) && Number.isFinite(after[i])) deltas.push(d);
  }
  const n = deltas.length;
  if (n < 2) return NaN;
  const m = mean(deltas);
  const sd = stdDevSample(deltas);
  if (!Number.isFinite(sd) || sd === 0) return NaN;
  const t = m / (sd / Math.sqrt(n));
  return 2 * (1 - tCdf(Math.abs(t), n - 1));
}

/** Normal approximation for Wilcoxon signed-rank (paired, two-sided). */
export function wilcoxonSignedRankP(before: number[], after: number[]): number {
  const pairs = before
    .map((b, i) => ({ d: after[i] - b }))
    .filter((p) => Number.isFinite(p.d) && p.d !== 0);
  const n = pairs.length;
  if (n < 6) return NaN;
  const ranked = pairs
    .map((p) => ({ d: p.d, abs: Math.abs(p.d) }))
    .sort((a, b) => a.abs - b.abs);
  let sumPos = 0;
  let i = 0;
  while (i < ranked.length) {
    let j = i;
    while (j + 1 < ranked.length && ranked[j + 1].abs === ranked[i].abs) j += 1;
    const rank = (i + j + 2) / 2;
    for (let k = i; k <= j; k += 1) {
      if (ranked[k].d > 0) sumPos += rank;
    }
    i = j + 1;
  }
  const mu = (n * (n + 1)) / 4;
  const sigma = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24);
  if (sigma === 0) return NaN;
  const z = Math.abs(sumPos - mu) / sigma;
  return 2 * (1 - normalCdf(z));
}

/** One-sample Wilcoxon signed-rank on deltas vs 0. */
export function wilcoxonOneSampleP(deltas: number[]): number {
  const before = deltas.filter((d) => Number.isFinite(d)).map(() => 0);
  const after = deltas.filter((d) => Number.isFinite(d));
  return wilcoxonSignedRankP(before, after);
}

/** Mann–Whitney U (two-sided, normal approximation). */
export function mannWhitneyUP(a: number[], b: number[]): number {
  const xs = a.filter(Number.isFinite);
  const ys = b.filter(Number.isFinite);
  const n1 = xs.length;
  const n2 = ys.length;
  if (n1 < 5 || n2 < 5) return NaN;
  const all = [...xs.map((v) => ({ v, g: 1 })), ...ys.map((v) => ({ v, g: 2 }))].sort((p, q) => p.v - q.v);
  let r = 1;
  const ranks1: number[] = [];
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j += 1;
    const avgRank = (r + r + (j - i)) / 2;
    for (let k = i; k <= j; k += 1) {
      if (all[k].g === 1) ranks1.push(avgRank);
    }
    r += j - i + 1;
    i = j + 1;
  }
  const r1 = ranks1.reduce((s, x) => s + x, 0);
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  if (sigma === 0) return NaN;
  const z = Math.abs(u1 - mu) / sigma;
  return 2 * (1 - normalCdf(z));
}

/** Friedman test for k related groups (blocks = same file). Returns chi2 and p. */
export function friedmanTest(blocks: number[][]): { chi2: number; df: number; p: number; n: number } {
  const k = blocks[0]?.length ?? 0;
  const valid = blocks.filter((row) => row.length === k && row.every(Number.isFinite));
  const n = valid.length;
  if (n < 2 || k < 2) return { chi2: NaN, df: k - 1, p: NaN, n };
  const rankSums = new Array(k).fill(0);
  for (const row of valid) {
    const indexed = row.map((v, j) => ({ v, j })).sort((a, b) => a.v - b.v);
    let i = 0;
    while (i < indexed.length) {
      let j = i;
      while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j += 1;
      const avgRank = (i + j + 2) / 2;
      for (let t = i; t <= j; t += 1) rankSums[indexed[t].j] += avgRank;
      i = j + 1;
    }
  }
  const chi2 =
    (12 / (n * k * (k + 1))) * rankSums.reduce((s, rs) => s + rs * rs, 0) - 3 * n * (k + 1);
  const df = k - 1;
  const p = 1 - chiSquareCdf(chi2, df);
  return { chi2, df, p, n };
}

function chiSquareCdf(x: number, df: number): number {
  if (x <= 0 || df <= 0) return 0;
  return betainc(df / 2, 0.5, x / (x + df));
}

/** Wilson score interval for a binomial proportion. */
export function wilsonInterval(successes: number, n: number, z = 1.96): { low: number; high: number; rate: number } {
  if (n <= 0) return { low: NaN, high: NaN, rate: NaN };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denom;
  return { low: center - margin, high: center + margin, rate: p };
}

/** Holm–Bonferroni adjusted p-values (same order as input). */
export function holmAdjust(pValues: number[]): number[] {
  const m = pValues.length;
  const indexed = pValues.map((p, i) => ({ p: Number.isFinite(p) ? p : 1, i }));
  indexed.sort((a, b) => a.p - b.p);
  const adj = new Array(m).fill(1);
  let prev = 0;
  for (let rank = 0; rank < m; rank += 1) {
    const factor = m - rank;
    const val = Math.min(1, indexed[rank].p * factor);
    prev = Math.max(prev, val);
    adj[indexed[rank].i] = prev;
  }
  return adj;
}

export function confidenceInterval95(values: number[]): { low: number; high: number; mean: number } {
  const m = mean(values);
  const n = values.length;
  if (n < 2) return { low: NaN, high: NaN, mean: m };
  const se = stdDevSample(values) / Math.sqrt(n);
  const margin = 1.96 * se;
  return { low: m - margin, high: m + margin, mean: m };
}

export function fmtNum(v: number, digits = 4): string | number {
  if (!Number.isFinite(v)) return '';
  return Math.round(v * 10 ** digits) / 10 ** digits;
}

export function fmtP(v: number): string | number {
  if (!Number.isFinite(v)) return '';
  if (v < 0.0001) return '<0.0001';
  return fmtNum(v, 4);
}

export function pctImproved(deltas: number[], lowerIsBetter = true): number {
  const valid = deltas.filter(Number.isFinite);
  if (!valid.length) return NaN;
  const improved = valid.filter((d) => (lowerIsBetter ? d < 0 : d > 0)).length;
  return (100 * improved) / valid.length;
}

/** Pearson chi-square test of independence on an r×c contingency table (counts ≥ 0). */
export function chiSquareIndependence(table: number[][]): {
  chi2: number;
  df: number;
  p: number;
  n: number;
} {
  const rows = table.length;
  const cols = table[0]?.length ?? 0;
  if (rows < 2 || cols < 2) return { chi2: NaN, df: NaN, p: NaN, n: 0 };

  let n = 0;
  const rowTotals: number[] = [];
  const colTotals = new Array(cols).fill(0);
  for (let i = 0; i < rows; i += 1) {
    let rowSum = 0;
    for (let j = 0; j < cols; j += 1) {
      const v = table[i][j] ?? 0;
      rowSum += v;
      colTotals[j] += v;
    }
    rowTotals.push(rowSum);
    n += rowSum;
  }
  if (n === 0) return { chi2: NaN, df: NaN, p: NaN, n: 0 };

  let chi2 = 0;
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      const expected = (rowTotals[i] * colTotals[j]) / n;
      if (expected <= 0) continue;
      const obs = table[i][j] ?? 0;
      chi2 += ((obs - expected) ** 2) / expected;
    }
  }
  const df = (rows - 1) * (cols - 1);
  const p = 1 - chiSquareCdf(chi2, df);
  return { chi2, df, p, n };
}

/** Spearman rank correlation (two-sided p via t approximation). */
export function spearmanR(x: number[], y: number[]): { r: number; p: number; n: number } {
  const pairs = x
    .map((xi, i) => ({ x: xi, y: y[i] }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = pairs.length;
  if (n < 4) return { r: NaN, p: NaN, n };

  const rank = (values: number[]): number[] => {
    const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(values.length).fill(0);
    let i = 0;
    while (i < indexed.length) {
      let j = i;
      while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j += 1;
      const avg = (i + j + 2) / 2;
      for (let k = i; k <= j; k += 1) ranks[indexed[k].i] = avg;
      i = j + 1;
    }
    return ranks;
  };

  const xs = pairs.map((p) => p.x);
  const ys = pairs.map((p) => p.y);
  const rx = rank(xs);
  const ry = rank(ys);
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = rx[i] - mx;
    const b = ry[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  if (den === 0) return { r: NaN, p: NaN, n };
  const r = num / den;
  const t = r * Math.sqrt((n - 2) / Math.max(1e-12, 1 - r * r));
  const p = 2 * (1 - tCdf(Math.abs(t), n - 2));
  return { r, p, n };
}
