/**
 * Tests for research statistical analysis sheet builders.
 * Run: cd web/app && npx tsx app/lib/__tests__/researchStatisticalAnalysis.test.mjs
 */

import assert from 'node:assert/strict';
import {
  friedmanTest,
  holmAdjust,
  mannWhitneyUP,
  pairedTTestP,
  wilcoxonSignedRankP,
  wilsonInterval,
} from '../statisticalTests.ts';
import { buildRq2StatsSheet, buildRq3ProviderComparisonSheet } from '../researchStatisticalAnalysis.ts';

// Wilson CI
const w = wilsonInterval(75, 100);
assert.ok(w.rate === 0.75);
assert.ok(w.low < w.rate && w.high > w.rate);

// Holm
const adj = holmAdjust([0.01, 0.04, 0.03]);
assert.ok(adj[0] <= adj[1] || adj[0] <= adj[2]);

// Friedman — identical blocks should yield low chi2 / high p
const blocks = Array.from({ length: 20 }, () => [1, 2, 3]);
const fr = friedmanTest(blocks);
assert.ok(Number.isFinite(fr.chi2));
assert.ok(fr.n === 20);

// Paired tests on synthetic improvement
const before = [10, 12, 8, 15, 9, 11, 14, 7, 13, 10, 16, 8];
const after = before.map((b, i) => b - 2 - (i % 3));
const wp = wilcoxonSignedRankP(before, after);
assert.ok(wp < 0.05, `expected significant wilcoxon, got ${wp}`);
const tp = pairedTTestP(before, after);
assert.ok(Number.isFinite(tp) && tp < 0.1, `paired t p=${tp}`);

// Mann–Whitney
const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const b = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const mp = mannWhitneyUP(a, b);
assert.ok(mp < 0.05);

// Sheet builders smoke
const mockRow = (provider, fp, delta) => ({
  project_name: '07-Junit',
  workspace_id: 'project-x',
  file_path: fp,
  file_name: fp.split('/').pop(),
  cohort: 'A_frontier_parallel',
  model_tier: 'frontier',
  multi_llm_mode: 'independent_parallel',
  in_current_sample: 'yes',
  provider_key: provider,
  provider: provider,
  pmd_smells_before: 10,
  pmd_smells_after: 5,
  pmd_smells_removed: 5,
  pmd_smells_reduction_pct: 50,
  pmd_smells_delta: 5,
  smell_delta: delta,
  complexity_before: 20,
  complexity_after: 15,
  maintainability_before: 50,
  maintainability_after: 60,
  testability_before: 40,
  testability_after: 45,
  loc_before: 100,
  loc_after: 95,
  overall_score: 80,
  verify_accepted: 'yes',
  changed: 'yes',
  ok: 'yes',
});

const rows = [];
for (let i = 0; i < 10; i += 1) {
  for (const p of ['openai', 'google', 'anthropic']) {
    rows.push(mockRow(p, `src/F${i}.java`, -2));
  }
}

const rq2 = buildRq2StatsSheet(rows, 'test');
assert.ok(rq2.length > 20);
assert.equal(rq2[3][0], 'analysis_set');

const rq3 = buildRq3ProviderComparisonSheet(rows);
assert.ok(rq3.some((r) => String(r[0]).includes('Friedman')));

console.log('researchStatisticalAnalysis.test.mjs: PASS');
