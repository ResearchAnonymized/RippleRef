/** Canonical list of research Excel workbook sheets and what each exports. */

export type ResearchExcelSheetSpec = {
  id: string;
  name: string;
  description: string;
  dataSource: 'saved_report' | 'saved_report_multi_llm' | 'computed';
};

export const RESEARCH_EXCEL_SHEETS: ResearchExcelSheetSpec[] = [
  {
    id: '00',
    name: '00_ReadMe',
    description: 'Export metadata, file counts, sheet index, completeness notes',
    dataSource: 'computed',
  },
  {
    id: '01',
    name: '01_Files_Master',
    description:
      'One row per file: final chain metrics + multi-LLM pass summary (OpenAI/Google/Claude loc & smell deltas)',
    dataSource: 'saved_report',
  },
  {
    id: '02',
    name: '02_Before_After',
    description: 'Final researchMetrics comparison (all before/after/delta columns)',
    dataSource: 'saved_report',
  },
  { id: '03', name: '03_Behavioral', description: 'Behavioral preservation checks (final)', dataSource: 'saved_report' },
  {
    id: '03b',
    name: '03b_Behavioral_Pass_Test',
    description: 'Long format: each behavioral check with pass/fail status and why_pass / why_fail explanations (final + each LLM pass)',
    dataSource: 'saved_report',
  },
  {
    id: '03c',
    name: '03c_Behavioral_Pass_Wide',
    description: 'Wide format: behavioral checks with pass/fail and explanation columns per file/pass',
    dataSource: 'saved_report',
  },
  {
    id: '03d',
    name: '03d_Verification_Gates',
    description: 'Automatic verification gate outcomes with why_pass / why_fail (explains saved vs rejected refactor)',
    dataSource: 'saved_report',
  },
  { id: '04', name: '04_Structural', description: 'Structural change counts (final)', dataSource: 'saved_report' },
  { id: '05', name: '05_Practices', description: 'Refactoring practices applied (long, final)', dataSource: 'saved_report' },
  { id: '06', name: '06_Narrative', description: 'Achievements and concerns (long, final)', dataSource: 'saved_report' },
  { id: '07', name: '07_Halstead', description: 'Halstead metrics before/after (final)', dataSource: 'saved_report' },
  { id: '08', name: '08_Method_Length', description: 'Method length distribution (final)', dataSource: 'saved_report' },
  { id: '09', name: '09_Nesting', description: 'Nesting depth (final)', dataSource: 'saved_report' },
  { id: '10', name: '10_Coupling', description: 'Coupling CBO (final)', dataSource: 'saved_report' },
  { id: '11', name: '11_Cohesion', description: 'Cohesion LCOM (final)', dataSource: 'saved_report' },
  { id: '12', name: '12_Diff_Churn', description: 'Diff churn (final)', dataSource: 'saved_report' },
  { id: '13', name: '13_Semantic', description: 'Semantic preservation (final)', dataSource: 'saved_report' },
  { id: '14', name: '14_Tokens', description: 'Token efficiency / cost (final)', dataSource: 'saved_report' },
  { id: '15', name: '15_Smell_By_Type', description: 'PMD smell resolution by type (long, final)', dataSource: 'saved_report' },
  {
    id: '16',
    name: '16_Pipeline',
    description: 'Pipeline metadata (multiLlmChain, model, retries, rejection category)',
    dataSource: 'saved_report',
  },
  {
    id: '17',
    name: '17_Multi_LLM_Passes',
    description: 'Per-pass outcomes: provider, loc/smell delta, changed, ok (OpenAI → Google → Claude)',
    dataSource: 'saved_report_multi_llm',
  },
  {
    id: '18',
    name: '18_Multi_LLM_Agent_Steps',
    description: 'Agent orchestration trace per pass (Analyze, Plan, Feasibility, LLM, Verify)',
    dataSource: 'saved_report_multi_llm',
  },
  {
    id: '19',
    name: '19_Multi_LLM_Comparison_Wide',
    description:
      'Side-by-side before/after/delta per provider (smells, complexity, maintainability, LOC) for RQ comparison',
    dataSource: 'saved_report_multi_llm',
  },
  {
    id: '20',
    name: '20_Multi_LLM_Metrics_Long',
    description: 'All 15 metric sections × file × LLM pass (long format for pivot charts)',
    dataSource: 'saved_report_multi_llm',
  },
  {
    id: '21',
    name: '21_Metrics_Long',
    description: 'All 15 metric sections × file (final chain output, long format)',
    dataSource: 'saved_report',
  },
  {
    id: '22',
    name: '22_Project_Stats',
    description: 'Excel formulas: N, mean/median smell delta, files with full report',
    dataSource: 'computed',
  },
  {
    id: '23',
    name: '23_Statistical_Tests',
    description: 'Paired t-test, Cohen d, Wilcoxon, CI95 on master sheet columns',
    dataSource: 'computed',
  },
  {
    id: '24',
    name: '24_RQ2_Stats_Primary',
    description: 'RQ2 paired Wilcoxon/t-test per provider on 150-file primary sample (450 passes)',
    dataSource: 'computed',
  },
  {
    id: '25',
    name: '25_RQ2_Stats_Extended',
    description: 'RQ2 paired tests on extended multi-LLM sample (cohorts A+B)',
    dataSource: 'computed',
  },
  {
    id: '26',
    name: '26_RQ3_Provider_Comparison',
    description: 'RQ3 Friedman + pairwise Wilcoxon with Holm correction (same files, 3 providers)',
    dataSource: 'computed',
  },
  {
    id: '27',
    name: '27_Cohort_A_vs_B',
    description: 'Mann–Whitney U: frontier parallel vs legacy chain (unpaired, different files)',
    dataSource: 'computed',
  },
  {
    id: '28',
    name: '28_Acceptance_Rates',
    description: 'verify_accepted / changed / ok rates with Wilson 95% CI by cohort and provider',
    dataSource: 'computed',
  },
  {
    id: '29',
    name: '29_Analysis_ReadMe',
    description: 'Guide to statistical analysis sheets and interpretation rules',
    dataSource: 'computed',
  },
  {
    id: '30',
    name: '30_RQ2_Pass_Data',
    description: 'Primary-sample provider pass rows (audit trail for sheets 24–26)',
    dataSource: 'computed',
  },
];

export const CORE_SHEET_NAMES = RESEARCH_EXCEL_SHEETS.map((s) => s.name);
