/**
 * Node ESM tests for refactor response ingest (no Jest required).
 * Run: node web/app/app/lib/__tests__/ingestRefactorResponse.test.mjs
 */
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, '../../../../package.json'));

// Compiled path: import from sibling TS via dynamic import of built JS is awkward;
// duplicate minimal logic for test or use tsx. Here we inline mirror of key functions.

function normalizeReportPath(p) {
  return p.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

function refactorResponseMatchesFile(data, selectedFilePath) {
  if (!data || !selectedFilePath) return true;
  const fp = String(data.filePath || '').trim();
  if (!fp) return true;
  const nSel = normalizeReportPath(selectedFilePath);
  const nFp = normalizeReportPath(fp);
  if (nFp === nSel) return true;
  if (nSel.endsWith(nFp) || nSel.endsWith('/' + nFp)) return true;
  const selBase = (selectedFilePath.split(/[/\\]/).pop() || '').toLowerCase();
  const fpBase = (fp.split(/[/\\]/).pop() || nFp).toLowerCase();
  return !!selBase && selBase === fpBase;
}

function getLlmCandidateContent(data, original) {
  if (!data) return original;
  const llm = data.llmCandidateContent ?? data.proposedContent;
  if (typeof llm === 'string' && llm.length > 0) return llm;
  if (typeof data.refactoredContent === 'string' && data.refactoredContent.length > 0) {
    return data.refactoredContent;
  }
  return original;
}

function isIdenticalRefactorCandidate(data, original) {
  const orig = (typeof data?.originalContent === 'string' ? data.originalContent : original) || '';
  const candidate = getLlmCandidateContent(data ?? {}, orig);
  return candidate.trim() === orig.trim();
}

function improvementStatsFromRefactorResponse(data) {
  if (!data) return null;
  const steps = Array.isArray(data.steps) ? data.steps : [];
  const verifyStep = steps.find((s) => s.name === 'Verify' && s.details);
  const vd = verifyStep?.details || {};
  const before = typeof vd.before === 'number' ? vd.before : data.deltas?.before;
  const after = typeof vd.after === 'number' ? vd.after : data.deltas?.after;
  if (typeof before !== 'number' || typeof after !== 'number') return null;
  return { before: { total: before }, after: { total: after }, delta: { total: before - after } };
}

// --- tests ---

assert.strictEqual(
  refactorResponseMatchesFile({ filePath: 'a/b/Scalr.java' }, 'project/a/b/Scalr.java'),
  true
);
assert.strictEqual(
  refactorResponseMatchesFile({ filePath: 'Other.java' }, 'project/Scalr.java'),
  false
);

const orig = 'class A {}\n';
const identical = { originalContent: orig, llmCandidateContent: orig, proposedContent: orig };
assert.strictEqual(isIdenticalRefactorCandidate(identical, orig), true);

const changed = { originalContent: orig, llmCandidateContent: 'class A { int x; }\n' };
assert.strictEqual(isIdenticalRefactorCandidate(changed, orig), false);

const stats = improvementStatsFromRefactorResponse({
  steps: [{ name: 'Verify', details: { before: 88, after: 80 } }],
  deltas: { before: 88, after: 80 },
});
assert.strictEqual(stats.before.total, 88);
assert.strictEqual(stats.after.total, 80);
assert.strictEqual(stats.delta.total, 8);

console.log('ingestRefactorResponse.test.mjs: all assertions passed');
