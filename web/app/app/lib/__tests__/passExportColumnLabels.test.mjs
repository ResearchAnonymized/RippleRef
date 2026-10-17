import test from 'node:test';
import assert from 'node:assert/strict';
import {
  displayLabelForExportColumn,
  displayHeadersForKeys,
  columnGuideRowsForKeys,
} from '../passExportColumnLabels.ts';

test('displayLabelForExportColumn — key smell columns', () => {
  assert.match(displayLabelForExportColumn('pmd_smells_before'), /\[Smells\].*Baseline/i);
  assert.match(displayLabelForExportColumn('pmd_smells_removed'), /Removed/i);
  assert.match(displayLabelForExportColumn('verify_accepted'), /\[Run\].*Verification/i);
});

test('displayLabelForExportColumn — pattern groups', () => {
  assert.match(displayLabelForExportColumn('halstead_volume_before'), /\[Halstead\].*Before/i);
  assert.match(displayLabelForExportColumn('nesting_depth_max_after'), /\[Nesting\].*After/i);
});

test('displayHeadersForKeys preserves order', () => {
  const keys = ['file_name', 'pmd_smells_before', 'halstead_effort_after'];
  const headers = displayHeadersForKeys(keys);
  assert.equal(headers.length, 3);
  assert.match(headers[1], /\[Smells\]/);
});

test('columnGuideRowsForKeys includes internal key', () => {
  const rows = columnGuideRowsForKeys(['pmd_smells_delta']);
  assert.equal(rows[0][0], 'Internal key');
  assert.equal(rows[1][0], 'pmd_smells_delta');
});
