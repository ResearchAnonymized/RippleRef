/**
 * Serialize for API / disk; drops values that break JSON.stringify (cycles, BigInt, etc.).
 */
export function jsonSafeForArchive<T>(obj: T): T {
  try {
    return JSON.parse(JSON.stringify(obj)) as T;
  } catch {
    const lean = stripHeavyNestedFields(obj);
    try {
      return JSON.parse(JSON.stringify(lean)) as T;
    } catch {
      throw new Error(
        'Report is too large or contains values that cannot be saved. Try Export CSV, or restart the backend and try again.'
      );
    }
  }
}

function stripHeavyNestedFields<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((x) => stripHeavyNestedFields(x)) as T;
  }
  const o = obj as Record<string, unknown>;
  const out: Record<string, unknown> = { ...o };
  if (o.applyResult && typeof o.applyResult === 'object') {
    const ar = { ...(o.applyResult as Record<string, unknown>) };
    if (ar.deltas && typeof ar.deltas === 'object') {
      const d = { ...(ar.deltas as Record<string, unknown>) };
      delete d.comprehensiveAnalysis;
      delete d.qualityMetrics;
      ar.deltas = d;
    }
    out.applyResult = ar;
  }
  return out as T;
}
