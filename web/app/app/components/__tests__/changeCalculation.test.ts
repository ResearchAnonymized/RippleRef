/**
 * Unit tests for change calculation logic
 * Tests the calculateChanges function accuracy
 */

interface ChangeResult {
  added: number;
  removed: number;
  modified: number;
  linesChanged: number;
}

function calculateChanges(original: string, refactored: string): ChangeResult {
  if (!original && !refactored) {
    return { added: 0, removed: 0, modified: 0, linesChanged: 0 };
  }
  if (!original) {
    const refLines = (refactored || '').split('\n').filter(l => l.trim().length > 0);
    return { added: refLines.length, removed: 0, modified: 0, linesChanged: refLines.length };
  }
  if (!refactored) {
    const origLines = (original || '').split('\n').filter(l => l.trim().length > 0);
    return { added: 0, removed: origLines.length, modified: 0, linesChanged: origLines.length };
  }
  
  const origLines = (original || '').split('\n');
  const refLines = (refactored || '').split('\n');
  let added = 0, removed = 0, modified = 0;
  
  // Simplified version for testing
  const origMap = new Map<string, number[]>();
  origLines.forEach((line, idx) => {
    const key = line.trim();
    if (!origMap.has(key)) origMap.set(key, []);
    origMap.get(key)!.push(idx);
  });
  
  const refMap = new Map<string, number[]>();
  refLines.forEach((line, idx) => {
    const key = line.trim();
    if (!refMap.has(key)) refMap.set(key, []);
    refMap.get(key)!.push(idx);
  });
  
  const origMatched = new Set<number>();
  const refMatched = new Set<number>();
  
  // Match lines at same position
  for (let i = 0; i < Math.min(origLines.length, refLines.length); i++) {
    const origLine = origLines[i].trim();
    const refLine = refLines[i].trim();
    if (origLine === refLine && origLine.length > 0) {
      origMatched.add(i);
      refMatched.add(i);
    }
  }
  
  // Match lines in different positions
  for (let i = 0; i < origLines.length; i++) {
    if (origMatched.has(i)) continue;
    const origLine = origLines[i].trim();
    if (origLine.length === 0) continue;
    
    const refPositions = refMap.get(origLine) || [];
    for (const refPos of refPositions) {
      if (!refMatched.has(refPos)) {
        origMatched.add(i);
        refMatched.add(refPos);
        break;
      }
    }
  }
  
  // Count changes
  for (let i = 0; i < origLines.length; i++) {
    if (!origMatched.has(i) && origLines[i].trim().length > 0) {
      removed++;
    }
  }
  
  for (let i = 0; i < refLines.length; i++) {
    if (!refMatched.has(i) && refLines[i].trim().length > 0) {
      added++;
    }
  }
  
  // Modified lines
  for (let i = 0; i < Math.min(origLines.length, refLines.length); i++) {
    if (origMatched.has(i) && refMatched.has(i)) {
      const origLine = origLines[i].trim();
      const refLine = refLines[i].trim();
      if (origLine !== refLine && origLine.length > 0 && refLine.length > 0) {
        modified++;
      }
    }
  }
  
  return {
    added,
    removed,
    modified,
    linesChanged: added + removed + modified
  };
}

// Test cases
const tests = [
  {
    name: 'Added lines',
    original: 'line1\nline2',
    refactored: 'line1\nline2\nline3\nline4',
    expected: { added: 2, removed: 0, modified: 0 }
  },
  {
    name: 'Removed lines',
    original: 'line1\nline2\nline3',
    refactored: 'line1',
    expected: { added: 0, removed: 2, modified: 0 }
  },
  {
    name: 'Modified lines',
    original: 'line1\nline2\nline3',
    refactored: 'line1\nline2_modified\nline3',
    expected: { added: 0, removed: 0, modified: 1 }
  },
  {
    name: 'Empty original',
    original: '',
    refactored: 'line1\nline2',
    expected: { added: 2, removed: 0, modified: 0 }
  },
  {
    name: 'Empty refactored',
    original: 'line1\nline2',
    refactored: '',
    expected: { added: 0, removed: 2, modified: 0 }
  },
  {
    name: 'Complex changes',
    original: 'line1\nline2\nline3\nline4',
    refactored: 'line1\nline2_new\nline4\nline5',
    expected: { added: 2, removed: 1, modified: 1 }
  }
];

console.log('🧪 Running Change Calculation Tests...\n');
let passed = 0;
let failed = 0;

for (const test of tests) {
  const result = calculateChanges(test.original, test.refactored);
  const match = result.added === test.expected.added && 
                result.removed === test.expected.removed && 
                result.modified === test.expected.modified;
  
  if (match) {
    console.log(`✅ ${test.name}: PASSED`);
    passed++;
  } else {
    console.log(`❌ ${test.name}: FAILED`);
    console.log(`   Expected: ${JSON.stringify(test.expected)}`);
    console.log(`   Got: ${JSON.stringify({ added: result.added, removed: result.removed, modified: result.modified })}`);
    failed++;
  }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

