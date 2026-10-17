import type { BeforeAfterRow } from './types';

type Deltas = {
  before?: number;
  after?: number;
  qualityMetrics?: {
    before?: { complexity?: number; maintainability?: number; testability?: number };
    after?: { complexity?: number; maintainability?: number; testability?: number };
  };
  comprehensiveAnalysis?: {
    metrics?: {
      lines_of_code?: { before: number; after: number };
      methods?: { before: number; after: number };
    };
  };
};

type Improvement = {
  before?: { total: number };
  after?: { total: number };
};

type Research = {
  comparison?: Record<string, { before: number; after: number }>;
  halstead?: Record<string, { before: number; after: number }>;
  method_lengths?: Record<string, { before: number; after: number }>;
  nesting_depth?: Record<string, { before: number; after: number }>;
  coupling?: Record<string, { before: number; after: number }>;
  cohesion?: Record<string, { before: number; after: number }>;
  code_smells?: { total?: { before: number; after: number } };
};

export function buildCoreMetricRows(
  deltas?: Deltas | null,
  improvementStats?: Improvement | null
): BeforeAfterRow[] {
  if (!deltas) return [];
  const rows: BeforeAfterRow[] = [];
  const qm = deltas.qualityMetrics;
  const loc = deltas.comprehensiveAnalysis?.metrics?.lines_of_code;
  const methods = deltas.comprehensiveAnalysis?.metrics?.methods;

  const smellBefore =
    improvementStats?.before?.total ?? (typeof deltas.before === 'number' ? deltas.before : undefined);
  const smellAfter =
    improvementStats?.after?.total ?? (typeof deltas.after === 'number' ? deltas.after : undefined);

  if (smellBefore != null && smellAfter != null) {
    rows.push({
      id: 'smells',
      label: 'PMD smell count',
      before: smellBefore,
      after: smellAfter,
      lowerIsBetter: true,
      definition: 'Static analysis findings (PMD ruleset).',
    });
  }
  if (loc) {
    rows.push({
      id: 'loc',
      label: 'Lines of code',
      before: loc.before,
      after: loc.after,
      lowerIsBetter: true,
      definition: 'Non-comment source lines in the refactored compilation unit.',
    });
  }
  if (methods) {
    rows.push({
      id: 'methods',
      label: 'Method count',
      before: methods.before,
      after: methods.after,
      lowerIsBetter: false,
      definition: 'Declared methods (extract method increases count).',
    });
  }
  if (qm?.before && qm?.after) {
    rows.push(
      {
        id: 'cc',
        label: 'Cyclomatic complexity',
        before: qm.before.complexity ?? 0,
        after: qm.after.complexity ?? 0,
        lowerIsBetter: true,
      },
      {
        id: 'mi',
        label: 'Maintainability index',
        before: qm.before.maintainability ?? 0,
        after: qm.after.maintainability ?? 0,
        lowerIsBetter: false,
      },
      {
        id: 'test',
        label: 'Testability score',
        before: qm.before.testability ?? 0,
        after: qm.after.testability ?? 0,
        lowerIsBetter: false,
      }
    );
  }
  return rows;
}

export function buildResearchMetricRows(research?: Research | null): BeforeAfterRow[] {
  if (!research) return [];
  const rows: BeforeAfterRow[] = [];

  const push = (
    id: string,
    label: string,
    block: { before: number; after: number } | undefined,
    lowerIsBetter: boolean,
    definition?: string
  ) => {
    if (!block || typeof block.before !== 'number' || typeof block.after !== 'number') return;
    if (block.before === 0 && block.after === 0) return;
    rows.push({
      id,
      label,
      before: Math.round(block.before * 100) / 100,
      after: Math.round(block.after * 100) / 100,
      lowerIsBetter,
      definition,
    });
  };

  const cmp = research.comparison;
  if (cmp?.pmd_smell_total) {
    push('pmd', 'PMD smell total', cmp.pmd_smell_total, true);
  }

  push('hv', 'Halstead volume', research.halstead?.volume, true, 'Operator/operand volume (Halstead, 1977).');
  push('hd', 'Halstead difficulty', research.halstead?.difficulty, true);
  push('mmean', 'Mean method length', research.method_lengths?.mean, true, 'Lines per method (mean).');
  push('nmax', 'Max nesting depth', research.nesting_depth?.max, true);
  push('cbo', 'Coupling (CBO)', research.coupling?.cbo, true, 'Coupling between objects.');
  push('lcom', 'LCOM cohesion', research.cohesion?.lcom, true, 'Lack of cohesion in methods.');

  return rows;
}
