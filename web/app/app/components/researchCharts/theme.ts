/** Print-friendly palette (works on dark UI and exports to light PDF). */

export const RESEARCH_CHART = {
  before: '#64748b',
  beforeFill: 'rgba(100, 116, 139, 0.35)',
  improved: '#059669',
  improvedFill: 'rgba(5, 150, 105, 0.85)',
  regressed: '#d97706',
  regressedFill: 'rgba(217, 119, 6, 0.85)',
  neutral: '#94a3b8',
  grid: 'rgba(148, 163, 184, 0.25)',
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  track: 'rgba(51, 65, 85, 0.6)',
  /** For exported figures (white background). */
  export: {
    bg: '#ffffff',
    text: '#1e293b',
    textMuted: '#64748b',
    grid: '#e2e8f0',
  },
} as const;

export function formatDelta(before: number, after: number, unit = ''): string {
  const d = after - before;
  if (Math.abs(d) < 1e-9) return '0';
  const sign = d > 0 ? '+' : '';
  const v = Number.isInteger(d) ? d : Number(d.toFixed(2));
  return `${sign}${v}${unit}`;
}

export function formatPctChange(before: number, after: number): string | null {
  if (before === 0) return after === 0 ? '0%' : null;
  const pct = ((after - before) / Math.abs(before)) * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

export function isImproved(lowerIsBetter: boolean, before: number, after: number): boolean {
  if (before === after) return true;
  return lowerIsBetter ? after < before : after > before;
}

export function formatValue(n: number, unit = ''): string {
  if (Math.abs(n) >= 10000) return `${(n / 1000).toFixed(1)}k${unit}`;
  if (Number.isInteger(n)) return `${n}${unit}`;
  return `${n.toFixed(1)}${unit}`;
}
