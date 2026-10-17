/** PMD before/after smell diff for saved reports (batch + interactive). */

export type SmellComparisonResult = {
  before: unknown[];
  after: unknown[];
  removed: unknown[];
  added: unknown[];
  unchanged: unknown[];
  beforeTotal?: number;
  afterTotal?: number;
  typeSummary?: Record<string, { before: number; after: number }>;
};

function smellKey(s: Record<string, unknown>): string {
  return `${String(s.type || s.smell || '')}::${String(s.severity || '')}`;
}

function capPerType(smells: unknown[], max: number): unknown[] {
  const counts: Record<string, number> = {};
  return smells.filter((s) => {
    const row = s as Record<string, unknown>;
    const t = String(row.type || row.smell || 'Unknown');
    counts[t] = (counts[t] || 0) + 1;
    return counts[t] <= max;
  });
}

export async function computeSmellComparison(
  workspaceId: string,
  filePath: string,
  original: string,
  refactored: string
): Promise<SmellComparisonResult | null> {
  if (!original?.trim() || !refactored?.trim() || original.trim() === refactored.trim()) {
    return null;
  }
  const analyzeLive = async (content: string) => {
    const res = await fetch('/api/workspace-enhanced-analysis/analyze-live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, filePath, content }),
    });
    if (!res.ok) throw new Error(`analyze-live failed: ${res.status}`);
    return res.json();
  };
  const bRes = await analyzeLive(original);
  const aRes = await analyzeLive(refactored);
  const bSmells: Record<string, unknown>[] = Array.isArray(bRes?.codeSmells) ? bRes.codeSmells : [];
  const aSmells: Record<string, unknown>[] = Array.isArray(aRes?.codeSmells) ? aRes.codeSmells : [];

  const bMap = new Map<string, number>();
  bSmells.forEach((s) => bMap.set(smellKey(s), (bMap.get(smellKey(s)) || 0) + 1));
  const aMap = new Map<string, number>();
  aSmells.forEach((s) => aMap.set(smellKey(s), (aMap.get(smellKey(s)) || 0) + 1));

  const removedList: Record<string, unknown>[] = [];
  const unchangedList: Record<string, unknown>[] = [];
  const addedList: Record<string, unknown>[] = [];
  const aUsed = new Map<string, number>();

  bSmells.forEach((s) => {
    const k = smellKey(s);
    const afterCount = aMap.get(k) || 0;
    const used = aUsed.get(k) || 0;
    if (used < afterCount) {
      unchangedList.push(s);
      aUsed.set(k, used + 1);
    } else {
      removedList.push(s);
    }
  });
  aSmells.forEach((s) => {
    const k = smellKey(s);
    const usedFromBefore = aUsed.get(k) || 0;
    if (usedFromBefore > 0) {
      aUsed.set(k, usedFromBefore - 1);
    } else {
      addedList.push(s);
    }
  });

  const typeSummary: Record<string, { before: number; after: number }> = {};
  bSmells.forEach((s) => {
    const t = String(s.type || s.smell || 'Unknown');
    typeSummary[t] = typeSummary[t] || { before: 0, after: 0 };
    typeSummary[t].before++;
  });
  aSmells.forEach((s) => {
    const t = String(s.type || s.smell || 'Unknown');
    typeSummary[t] = typeSummary[t] || { before: 0, after: 0 };
    typeSummary[t].after++;
  });

  return {
    before: capPerType(bSmells, 5),
    after: capPerType(aSmells, 5),
    removed: removedList,
    added: addedList,
    unchanged: unchangedList,
    beforeTotal: bSmells.length,
    afterTotal: aSmells.length,
    typeSummary,
  };
}
