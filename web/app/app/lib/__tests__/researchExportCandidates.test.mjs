import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expandResearchSampleCandidates,
  getResearchSamplePaths,
} from '../researchExportCandidates.ts';

test('getResearchSamplePaths prefers result.paths', () => {
  const paths = getResearchSamplePaths({
    result: {
      paths: ['a.java', 'b.java'],
      picked: [{ path: 'ignored.java' }],
    },
  });
  assert.deepEqual(paths, ['a.java', 'b.java']);
});

test('getResearchSamplePaths falls back to picked[].path', () => {
  const paths = getResearchSamplePaths({
    result: {
      picked: [
        { path: 'foo/Bar.java', name: 'Bar.java' },
        { filePath: 'legacy/Baz.java' },
      ],
    },
  });
  assert.deepEqual(paths, ['foo/Bar.java', 'legacy/Baz.java']);
});

test('expandResearchSampleCandidates includes missing sample paths', () => {
  const sample = ['a.java', 'b.java', 'c.java'];
  const saved = new Set(['a.java', 'c.java']);
  const expanded = expandResearchSampleCandidates([], sample, saved);
  assert.equal(expanded.length, 3);
  assert.equal(expanded.find((c) => c.filePath === 'b.java')?.hasSavedReport, false);
  assert.equal(expanded.find((c) => c.filePath === 'b.java')?.status, 'rejected');
});

test('expandResearchSampleCandidates sampleOnly excludes old saved reports', () => {
  const sample = ['new/A.java', 'new/B.java'];
  const saved = new Set(['new/A.java', 'old/seed42/C.java']);
  const merged = [
    { filePath: 'new/A.java', label: 'A.java', hasSavedReport: true, status: 'refactored' },
    { filePath: 'old/seed42/C.java', label: 'C.java', hasSavedReport: true, status: 'refactored' },
  ];
  const strict = expandResearchSampleCandidates(merged, sample, saved, { sampleOnly: true });
  assert.equal(strict.length, 2);
  assert.ok(!strict.some((c) => c.filePath === 'old/seed42/C.java'));
});
