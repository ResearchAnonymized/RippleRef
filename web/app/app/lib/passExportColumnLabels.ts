/**
 * Human-readable Excel column headers and guide text for pass-level exports.
 * Internal row keys stay machine-readable; only sheet headers are relabeled.
 */

const EXACT_LABELS: Record<string, string> = {
  project_name: '[Study] OSS Project Name',
  source_folder: '[Study] System / Source Folder',
  workspace_id: '[Study] Workspace ID',
  file_name: '[Study] Java File Name',
  file_path: '[Study] Full File Path',
  cohort: '[Study] Research Cohort Tag',
  model_tier: '[Study] Model Tier (frontier)',
  multi_llm_mode: '[Study] Multi-LLM Mode',
  in_current_sample: '[Study] In Primary Sample (yes/no)',
  sample_id: '[Study] Stratified Sample ID',
  metrics_complete: '[Study] All Metrics Present (yes/no)',
  provider_key: '[LLM] Provider Key',
  provider: '[LLM] Provider Name',
  model: '[LLM] Model ID',
  pass_index: '[Run] Pass Index (0=OpenAI, 1=Google, 2=Anthropic)',
  ok: '[Run] Pass Finished OK (yes/no)',
  changed: '[Run] Refactored Code Differs from Baseline (yes/no)',
  verify_accepted: '[Run] Automated Verification Passed (yes/no)',
  overall_score: '[Run] Analysis Overall Score (0–100)',
  refactoring_successful: '[Run] Marked Successful by Analyzer (yes/no)',
  orchestration: '[Run] Orchestration Mode',
  agent_step_count: '[Run] Agent Step Count',
  pass_scope: '[Run] Pass Scope',
  meta_llm_provider: '[Run] LLM Provider (metadata)',
  lines_before: '[Run] Line Count Before (run record)',
  lines_after: '[Run] Line Count After (run record)',
  loc_delta_run: '[Run] Line Delta (run record)',
  run_smells_before: '[Run] Smell Count Before (run record)',
  run_smells_after: '[Run] Smell Count After (run record)',
  run_smell_delta: '[Run] Smell Delta (run record)',
  has_research_metrics: '[Run] Full researchMetrics Saved (yes/no)',
  metrics_sections_present: '[Run] researchMetrics Sections Present',
  pmd_smells_source: '[Smells] PMD Data Source',
  pmd_smells_before: '[Smells] PMD Count — Frozen Baseline (before)',
  pmd_smells_after: '[Smells] PMD Count — After Refactor (remaining)',
  pmd_smells_remaining: '[Smells] PMD Remaining (same as After)',
  pmd_smells_removed: '[Smells] PMD Removed (before − after; + = better)',
  pmd_smells_reduction_pct: '[Smells] PMD Reduction % (100× removed/before)',
  pmd_smells_delta: '[Smells] PMD Delta (= removed count, NOT remaining)',
  pmd_smells_delta_signed: '[Smells] PMD Signed Delta (after − before)',
  pmd_smells_improved: '[Smells] PMD Improved? (yes/no)',
  smell_run_vs_comparison_match: '[Smells] Run vs Comparison Smell Count Match',
  smell_resolution_rate_pct: '[Smells] Smell Resolution Rate %',
  smell_resolution_overall_rate_pct: '[Smells] Overall Smell Resolution Rate %',
  smell_resolution_total_before: '[Smells] Resolution Block — Total Before',
  smell_resolution_total_after: '[Smells] Resolution Block — Total After',
  smell_resolution_total_resolved: '[Smells] Resolution Block — Total Resolved',
  smell_resolution_types_fully_eliminated: '[Smells] Smell Types Fully Eliminated',
  smell_resolution_types_with_regression: '[Smells] Smell Types with Regression',
  smell_by_type_json: '[Smells] Per-Type Resolution (JSON)',
  smell_by_type_count: '[Smells] Per-Type Resolution Count',
  complexity_before: '[Quality] Cyclomatic Complexity — Before',
  complexity_after: '[Quality] Cyclomatic Complexity — After',
  complexity_removed: '[Quality] Cyclomatic Complexity — Removed (+ = better)',
  complexity_reduction_pct: '[Quality] Cyclomatic Complexity — Reduction %',
  complexity_improved: '[Quality] Cyclomatic Complexity — Improved? (yes/no)',
  maintainability_before: '[Quality] Maintainability Index — Before',
  maintainability_after: '[Quality] Maintainability Index — After',
  maintainability_gain: '[Quality] Maintainability Index — Gain (after − before)',
  maintainability_gain_pct: '[Quality] Maintainability Index — Gain %',
  maintainability_improved: '[Quality] Maintainability — Improved? (yes/no)',
  testability_before: '[Quality] Testability Index — Before',
  testability_after: '[Quality] Testability Index — After',
  testability_gain: '[Quality] Testability Index — Gain',
  testability_gain_pct: '[Quality] Testability Index — Gain %',
  testability_improved: '[Quality] Testability — Improved? (yes/no)',
  loc_before: '[Structure] Lines of Code — Before',
  loc_after: '[Structure] Lines of Code — After',
  loc_removed: '[Structure] Lines of Code — Removed (+ = better)',
  loc_reduction_pct: '[Structure] Lines of Code — Reduction %',
  loc_delta: '[Structure] Lines of Code — Delta (after − before)',
  lines_of_code_before: '[Structure] LOC (comparison) — Before',
  lines_of_code_after: '[Structure] LOC (comparison) — After',
  lines_of_code_removed: '[Structure] LOC (comparison) — Removed',
  lines_of_code_reduction_pct: '[Structure] LOC (comparison) — Reduction %',
  method_count_before: '[Structure] Method Count — Before',
  method_count_after: '[Structure] Method Count — After',
  method_count_improved: '[Structure] Method Count — Improved? (yes/no)',
  semantic_overall_preservation_pct: '[Preservation] Public API Preservation %',
  semantic_preservation_pct: '[Preservation] Semantic Preservation % (alias)',
  semantic_classes_preservation_pct: '[Preservation] Public Classes Preservation %',
  semantic_methods_preservation_pct: '[Preservation] Public Methods Preservation %',
  semantic_fields_preservation_pct: '[Preservation] Public Fields Preservation %',
  semantic_classes_removed: '[Preservation] Public Classes Removed',
  semantic_classes_added: '[Preservation] Public Classes Added',
  semantic_methods_removed: '[Preservation] Public Methods Removed',
  semantic_methods_added: '[Preservation] Public Methods Added',
  semantic_fields_removed: '[Preservation] Public Fields Removed',
  semantic_fields_added: '[Preservation] Public Fields Added',
  semantic_methods_removed_items: '[Preservation] Removed Public Method Names',
  tokens_total: '[Cost] Total LLM Tokens',
  token_total_tokens: '[Cost] Total Tokens (detail)',
  token_prompt_tokens: '[Cost] Prompt Tokens',
  token_completion_tokens: '[Cost] Completion Tokens',
  token_cost_usd: '[Cost] Estimated Cost (USD)',
  token_meaningful_line_changes: '[Cost] Meaningful Line Changes',
  token_changes_per_1k_tokens: '[Cost] Line Changes per 1k Tokens',
  token_cost_per_change_usd: '[Cost] USD per Line Change',
  practices_applied_long: '[RQ1] Refactoring Practices Applied',
  key_achievements_long: '[Analysis] Key Achievements (text)',
  concerns_long: '[Analysis] Concerns / Warnings (text)',
  smells_critical_before: '[Smells] Critical Severity — Before',
  smells_critical_after: '[Smells] Critical Severity — After',
  smells_major_before: '[Smells] Major Severity — Before',
  smells_major_after: '[Smells] Major Severity — After',
  smells_minor_before: '[Smells] Minor Severity — Before',
  smells_minor_after: '[Smells] Minor Severity — After',
  smells_info_before: '[Smells] Info Severity — Before',
  smells_info_after: '[Smells] Info Severity — After',
  smells_other_before: '[Smells] Other Severity — Before',
  smells_other_after: '[Smells] Other Severity — After',
};

const EXACT_DESCRIPTIONS: Record<string, string> = {
  pmd_smells_before: 'Smell count on frozen baseline Java file (same for all providers on this file).',
  pmd_smells_after: 'Smells remaining after this provider refactor. 0 = all baseline smells removed.',
  pmd_smells_removed: 'Count removed: before − after. Positive means improvement.',
  pmd_smells_delta: 'Same as removed (NOT the remaining count).',
  verify_accepted: 'yes = automated verification gates passed for this pass.',
  changed: 'yes = LLM output text differs from frozen baseline.',
  complexity_removed: 'before − after; positive = complexity reduced.',
  maintainability_gain: 'after − before; positive = maintainability improved.',
  loc_removed: 'before − after; positive = fewer lines.',
};

const GROUP_PREFIX: Record<string, string> = {
  halstead: '[Halstead]',
  method_lengths: '[Method Length]',
  nesting_depth: '[Nesting]',
  coupling: '[Coupling]',
  cohesion: '[Cohesion]',
  diff_churn: '[Diff Churn]',
  structural: '[RQ1 Structure]',
  behavioral: '[Behavioral]',
  semantic: '[Preservation]',
  token: '[Cost]',
  smell: '[Smells]',
};

const SUFFIX_LABELS: Record<string, string> = {
  before: 'Before (baseline)',
  after: 'After (refactored)',
  improved: 'Improved? (yes/no)',
  removed: 'Removed / reduced (+ = better)',
  reduction_pct: 'Reduction %',
  gain: 'Gain (after − before)',
  gain_pct: 'Gain %',
  change: 'Change (after − before)',
  delta: 'Delta (after − before)',
  preservation_pct: 'Preservation %',
};

function titleWords(raw: string): string {
  return raw
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function labelFromPatterns(key: string): string | null {
  for (const [suffix, label] of Object.entries(SUFFIX_LABELS)) {
    if (key.endsWith(`_${suffix}`)) {
      const stem = key.slice(0, -(suffix.length + 1));
      const group = Object.entries(GROUP_PREFIX).find(([g]) => stem === g || stem.startsWith(`${g}_`));
      if (group) {
        const rest = stem === group[0] ? titleWords(stem) : titleWords(stem.slice(group[0].length + 1));
        return `${group[1]} ${rest} — ${label}`;
      }
      return `[Metric] ${titleWords(stem)} — ${label}`;
    }
  }

  for (const [group, prefix] of Object.entries(GROUP_PREFIX)) {
    if (key === group || key.startsWith(`${group}_`)) {
      const rest = key === group ? titleWords(group) : titleWords(key.slice(group.length + 1));
      return `${prefix} ${rest}`;
    }
  }

  if (key.startsWith('behavioral_check_')) {
    return `[Behavioral] Check — ${titleWords(key.slice('behavioral_check_'.length))}`;
  }

  return null;
}

/** Machine key → human-readable Excel column header. */
export function displayLabelForExportColumn(key: string): string {
  if (EXACT_LABELS[key]) return EXACT_LABELS[key];
  const patterned = labelFromPatterns(key);
  if (patterned) return patterned;
  return `[Data] ${titleWords(key)}`;
}

/** Short explanation for 00_Column_Guide. */
export function descriptionForExportColumn(key: string): string {
  if (EXACT_DESCRIPTIONS[key]) return EXACT_DESCRIPTIONS[key];
  if (key.endsWith('_before')) return 'Value on frozen baseline before this LLM pass.';
  if (key.endsWith('_after')) return 'Value on this provider refactored output.';
  if (key.endsWith('_removed') || key.endsWith('_gain')) return 'Positive usually means improvement (depends on metric direction).';
  if (key.endsWith('_improved')) return 'yes/no from researchMetrics comparison block.';
  if (key.startsWith('behavioral_')) return 'Automated behavioural preservation heuristic (static proxy).';
  if (key.startsWith('halstead_')) return 'Halstead metric from custom Java tokenizer (agents/code_metrics.py).';
  return 'See researchMetrics JSON; internal key shown in export CSV.';
}

export function displayHeadersForKeys(keys: string[]): string[] {
  return keys.map(displayLabelForExportColumn);
}

export function columnGuideRowsForKeys(keys: string[]): (string | number | boolean)[][] {
  const header: (string | number | boolean)[] = ['Internal key', 'Excel column header', 'What it means'];
  const rows = keys.map((k) => [k, displayLabelForExportColumn(k), descriptionForExportColumn(k)]);
  return [header, ...rows];
}
