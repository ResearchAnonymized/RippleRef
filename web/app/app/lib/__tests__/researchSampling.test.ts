/**
 * Run: npm run test:research-sampling
 */
import assert from 'node:assert/strict';
import {
  cochranInfiniteSampleSize,
  finitePopulationSampleSize,
} from '../researchSampleSize';
import { createSeededRng, seededPickN, seededShuffle } from '../researchSeededRandom';
import {
  allocateAcrossCells,
  buildEligibleResearchPool,
  fileLinesOfCode,
  locStratum,
  pickResearchSample,
  smellStratum,
} from '../researchSampling';
import type { FileInfo } from '../../api/client';

function mockFile(
  path: string,
  smells: number,
  loc: number
): FileInfo {
  return {
    name: path.split('/').pop()!,
    relativePath: path,
    type: 'SOURCE',
    metrics: {
      linesOfCode: loc,
      cyclomaticComplexity: 0,
      cognitiveComplexity: 0,
      methodCount: 0,
      classCount: 1,
      commentLines: 0,
      blankLines: 0,
    },
    findings: smells,
    codeSmells: smells,
    lastModified: 0,
  };
}

// --- sample size (Cochran) ---
assert.equal(cochranInfiniteSampleSize(0.02), 2401);
const n5724 = finitePopulationSampleSize(5724, 0.02);
assert.equal(n5724, 1692);

const n214 = finitePopulationSampleSize(214, 0.08, { maxSample: 15 });
assert.equal(n214, 15);

// --- strata ---
assert.equal(smellStratum(3), 'low');
assert.equal(smellStratum(25), 'mid');
assert.equal(smellStratum(80), 'high');
assert.equal(locStratum(100), 'small');
assert.equal(locStratum(1500), 'medium');
assert.equal(locStratum(3000), 'large');

// --- seeded RNG reproducibility ---
const rng1 = createSeededRng(42);
const rng2 = createSeededRng(42);
const seq1 = [rng1(), rng1(), rng1()];
const seq2 = [rng2(), rng2(), rng2()];
assert.deepEqual(seq1, seq2);
const shuffledA = seededPickN([1, 2, 3, 4, 5], 3, createSeededRng(99));
const shuffledB = seededPickN([1, 2, 3, 4, 5], 3, createSeededRng(99));
assert.deepEqual(shuffledA, shuffledB);

// --- allocation ---
const alloc = allocateAcrossCells(
  [
    { key: 'low|small', size: 100 },
    { key: 'mid|medium', size: 50 },
    { key: 'high|large', size: 10 },
  ],
  12
);
  const total = Array.from(alloc.values()).reduce((a, b) => a + b, 0);
assert.equal(total, 12);

// --- eligible pool ---
const files = [
  mockFile('src/main/A.java', 5, 200),
  mockFile('src/test/T.java', 10, 100),
  mockFile('src/main/B.java', 0, 300),
  mockFile('src/main/C.java', 15, 2500),
];
const pool = buildEligibleResearchPool(files, {}, 1);
assert.equal(pool.length, 2);
assert.ok(pool.some((e) => e.file.name === 'A.java'));
assert.ok(pool.some((e) => e.file.name === 'C.java'));

// --- full pick reproducible ---
const manyFiles: FileInfo[] = [];
for (let i = 0; i < 80; i++) {
  manyFiles.push(
    mockFile(
      `src/main/File${i}.java`,
      i % 60,
      200 + (i % 5) * 400 + (i % 7) * 300
    )
  );
}
const r1 = pickResearchSample(manyFiles, {}, { seed: 42, marginOfError: 0.1 });
const r2 = pickResearchSample(manyFiles, {}, { seed: 42, marginOfError: 0.1 });
assert.deepEqual(r1.paths, r2.paths);
assert.ok(r1.pickedCount > 0);
assert.ok(r1.pickedCount <= 15);

const largePicked = r1.picked.filter((p) => p.loc > 2000);
assert.ok(largePicked.length <= 2, `LOC cap failed: ${largePicked.length} large files`);

const rOtherSeed = pickResearchSample(manyFiles, {}, { seed: 99, marginOfError: 0.1 });
assert.notDeepEqual(r1.paths, rOtherSeed.paths);

const withExclude = pickResearchSample(manyFiles, {}, {
  seed: 42,
  marginOfError: 0.1,
  excludePaths: r1.paths.slice(0, 5),
});
assert.ok(
  withExclude.paths.every((p) => !r1.paths.slice(0, 5).includes(p)),
  'excluded paths must not appear in new sample'
);

assert.equal(fileLinesOfCode(mockFile('x.java', 1, 0)), 0);

console.log('researchSampling.test.ts: all assertions passed');
