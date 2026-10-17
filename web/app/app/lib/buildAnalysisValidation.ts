/**
 * Pre-analysis validation for STUDY_MASTER_ONE_SHEET — problem detection before RQ1/RQ2.
 */

import type { Rq2ProviderPassRow } from './researchAnalysisExports';
import { MULTI_LLM_PROVIDERS } from './multiLlmExport';
import { mean } from './statisticalTests';

export type AnalysisValidationIssue = {
  severity: 'error' | 'warn' | 'info';
  check: string;
  detail: string;
};

function num(v: string | number | boolean | undefined): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  return NaN;
}

export function runAnalysisValidation(rows: Rq2ProviderPassRow[]): {
  issues: AnalysisValidationIssue[];
  summary: Record<string, string | number>;
  aoa: (string | number | boolean)[][];
} {
  const issues: AnalysisValidationIssue[] = [];
  const files = new Set(rows.map((r) => String(r.file_path)));
  const projects = new Set(rows.map((r) => String(r.project_name)));

  const byProvider: Record<string, number> = {};
  for (const p of MULTI_LLM_PROVIDERS) {
    byProvider[p] = rows.filter((r) => r.provider_key === p).length;
  }

  let withMetrics = 0;
  let smellChanged = 0;
  let smellUnchanged = 0;
  let deltaMismatch = 0;
  let removedMismatch = 0;
  let missingBefore = 0;
  let verifyYes = 0;
  let verifyNo = 0;

  for (const r of rows) {
    if (r.has_research_metrics === 'yes') withMetrics += 1;
    const b = num(r.pmd_smells_before);
    const a = num(r.pmd_smells_after);
    const rem = num(r.pmd_smells_removed);
    const delta = num(r.pmd_smells_delta);
    if (!Number.isFinite(b)) missingBefore += 1;
    if (Number.isFinite(b) && Number.isFinite(a)) {
      if (b === a) smellUnchanged += 1;
      else smellChanged += 1;
    }
    if (Number.isFinite(b) && Number.isFinite(a) && Number.isFinite(rem) && rem !== b - a) {
      removedMismatch += 1;
    }
    if (Number.isFinite(rem) && Number.isFinite(delta) && rem !== delta) {
      deltaMismatch += 1;
    }
    if (r.verify_accepted === 'yes') verifyYes += 1;
    if (r.verify_accepted === 'no') verifyNo += 1;
  }

  const expectedPerProvider = files.size;
  for (const p of MULTI_LLM_PROVIDERS) {
    if (byProvider[p] !== expectedPerProvider) {
      issues.push({
        severity: 'warn',
        check: 'provider_row_balance',
        detail: `${p}: ${byProvider[p]} rows (expected ${expectedPerProvider} = 1 per file)`,
      });
    }
  }

  if (rows.length !== files.size * MULTI_LLM_PROVIDERS.length) {
    issues.push({
      severity: 'warn',
      check: 'pass_row_total',
      detail: `Total ${rows.length} rows; expected ${files.size}×3=${files.size * 3} if every file has 3 passes`,
    });
  }

  const incompleteFiles: string[] = [];
  for (const fp of files) {
    const passes = rows.filter((r) => r.file_path === fp);
    const providers = new Set(passes.map((r) => r.provider_key));
    if (providers.size !== 3) incompleteFiles.push(`${fp} (${providers.size} providers)`);
  }
  if (incompleteFiles.length) {
    issues.push({
      severity: 'warn',
      check: 'files_missing_provider',
      detail: `${incompleteFiles.length} files without 3 providers (first 5: ${incompleteFiles.slice(0, 5).join('; ')})`,
    });
  }

  if (removedMismatch > 0) {
    issues.push({
      severity: 'error',
      check: 'pmd_smells_removed_formula',
      detail: `${removedMismatch} rows where removed ≠ before−after`,
    });
  }
  if (deltaMismatch > 0) {
    issues.push({
      severity: 'error',
      check: 'pmd_smells_delta_formula',
      detail: `${deltaMismatch} rows where delta ≠ removed`,
    });
  }
  if (missingBefore > 0) {
    issues.push({
      severity: 'warn',
      check: 'missing_pmd_before',
      detail: `${missingBefore} passes missing pmd_smells_before`,
    });
  }

  const noMetrics = rows.length - withMetrics;
  if (noMetrics > 0) {
    issues.push({
      severity: 'info',
      check: 'partial_research_metrics',
      detail: `${noMetrics} passes without full researchMetrics (${withMetrics} have metrics)`,
    });
  }

  const openaiRemoved = rows
    .filter((r) => r.provider_key === 'openai')
    .map((r) => num(r.pmd_smells_removed))
    .filter(Number.isFinite);
  const meanRemovedOpenai = mean(openaiRemoved);

  const testRows = rows.filter((r) => r.file_name === 'Test.java');
  const testOk = testRows.every(
    (r) => num(r.pmd_smells_before) === 3 && num(r.pmd_smells_after) === 0 && num(r.pmd_smells_removed) === 3
  );
  if (!testOk) {
    issues.push({
      severity: 'error',
      check: 'spot_check_test_java',
      detail: `Test.java expected 3→0 removed=3 for all providers; got ${testRows.map((r) => `${r.provider_key}:${r.pmd_smells_before}→${r.pmd_smells_after}`).join(', ')}`,
    });
  }

  const summary: Record<string, string | number> = {
    pass_rows: rows.length,
    unique_files: files.size,
    projects: projects.size,
    rows_openai: byProvider.openai ?? 0,
    rows_google: byProvider.google ?? 0,
    rows_anthropic: byProvider.anthropic ?? 0,
    with_research_metrics: withMetrics,
    pmd_smell_changed: smellChanged,
    pmd_smell_unchanged: smellUnchanged,
    verify_accepted_yes: verifyYes,
    verify_accepted_no: verifyNo,
    mean_pmd_removed_openai: Math.round(meanRemovedOpenai * 100) / 100,
    validation_errors: issues.filter((i) => i.severity === 'error').length,
    validation_warnings: issues.filter((i) => i.severity === 'warn').length,
  };

  const aoa: (string | number | boolean)[][] = [
    ['ANALYSIS VALIDATION — run before RQ1/RQ2'],
    ['Status', summary.validation_errors === 0 ? 'PASS (no errors)' : 'FAIL — fix errors before paper claims'],
    [''],
    ['SUMMARY METRIC', 'VALUE'],
    ...Object.entries(summary).map(([k, v]) => [k, v]),
    [''],
    ['ISSUES', 'severity', 'check', 'detail'],
    ...(issues.length
      ? issues.map((i) => ['', i.severity, i.check, i.detail])
      : [['', 'info', 'all_checks', 'No problems detected — safe to proceed with analysis']]),
    [''],
    ['NEXT STEPS'],
    ['1', 'Use tab 01_Key_Metrics for cleaning and pivots'],
    ['2', 'Compare stats with STUDY_PAPER_READY.xlsx → RQ1_03 + RQ1_03_Excel_CHECK'],
    ['3', 'Filter provider_key for RQ2; use file_path to match same file across LLMs'],
    ['4', 'Rows with pmd_smells_removed=0 are valid (no smell reduction on that pass)'],
  ];

  return { issues, summary, aoa };
}
