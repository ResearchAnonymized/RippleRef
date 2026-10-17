/** PMD ruleset category label for a smell from the API. */
export function smellPmdCategory(smell: {
  pmdCategory?: string | null;
  category?: string | null;
}): string {
  const pmd = smell.pmdCategory?.trim();
  if (pmd) return pmd;
  const cat = smell.category?.trim();
  if (!cat) return 'Other';
  if (cat.includes('_') || cat === cat.toUpperCase()) {
    return formatLegacyCategory(cat);
  }
  return cat;
}

function formatLegacyCategory(raw: string): string {
  return raw
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

export function smellRuleName(smell: {
  title?: string | null;
  type?: string | null;
  name?: string | null;
}): string {
  return String(smell.title || smell.type || smell.name || 'Code smell');
}

const PMD_CATEGORY_STYLES: Record<string, string> = {
  'Best Practices': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  'Code Style': 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  Documentation: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
  Design: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
  'Error Prone': 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  Multithreading: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40',
  Performance: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  Security: 'bg-red-500/20 text-red-400 border-red-500/40',
  Testing: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
  Other: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
};

export function pmdCategoryBadgeClass(category: string): string {
  return PMD_CATEGORY_STYLES[category] ?? PMD_CATEGORY_STYLES.Other;
}

export function collectPmdCategories(
  smells: Array<{ pmdCategory?: string | null; category?: string | null }>
): string[] {
  const set = new Set<string>();
  for (const s of smells) {
    set.add(smellPmdCategory(s));
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
