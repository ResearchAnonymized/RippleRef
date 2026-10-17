/**
 * Canonical definitions for every research Excel sheet tab.
 * Used by export-excel-sheet-definitions.ts and the sheet reference wiki.
 */

import { RESEARCH_EXCEL_SHEETS } from './researchExcelCatalog';

export type SheetDefinitionRow = {
  sheet_id: string;
  sheet_name: string;
  granularity: string;
  description: string;
  data_source: string;
  icse_rq: string;
  in_master_complete: string;
  in_all_files_master: string;
  open_first_order: string;
  size_note: string;
};

const EXTENDED_SHEETS: Omit<SheetDefinitionRow, 'in_master_complete' | 'in_all_files_master'>[] = [
  {
    sheet_id: '31',
    sheet_name: '31_Inclusion_Cohort',
    granularity: '1 row / file',
    description: 'Inclusion audit: cohort, backfill, metrics_complete, verify_accepted, exclude reasons',
    data_source: 'computed',
    icse_rq: '—',
    open_first_order: '',
    size_note: 'Medium',
  },
  {
    sheet_id: '32',
    sheet_name: '32_RQ2_All_Pass_Rows',
    granularity: '1 row / provider pass',
    description: 'All frontier provider pass rows (audit trail, not primary-filtered)',
    data_source: 'computed',
    icse_rq: 'RQ2, RQ3',
    open_first_order: '',
    size_note: 'Long — filter by project_name or provider',
  },
  {
    sheet_id: '33',
    sheet_name: '33_RQ3_Comparison_Wide',
    granularity: '1 row / file',
    description: 'Extended RQ3 side-by-side provider comparison (frontier cohort)',
    data_source: 'saved_report_multi_llm',
    icse_rq: 'RQ3',
    open_first_order: '',
    size_note: 'Wide',
  },
  {
    sheet_id: '34',
    sheet_name: '34_RQ3_Primary_Wide',
    granularity: '1 row / file',
    description: 'RQ3 comparison for in_current_sample=yes only',
    data_source: 'saved_report_multi_llm',
    icse_rq: 'RQ3',
    open_first_order: '',
    size_note: 'Wide',
  },
  {
    sheet_id: '35',
    sheet_name: '35_Behavioral_Pass_Test',
    granularity: '1 row / check / pass',
    description: 'Behavioral checks with pass/fail and explanations (all frontier files)',
    data_source: 'saved_report',
    icse_rq: 'RQ2 (v)',
    open_first_order: '',
    size_note: 'Long',
  },
  {
    sheet_id: '36',
    sheet_name: '36_Verification_Gates',
    granularity: '1 row / gate',
    description: 'Verification gate outcomes and why_pass / why_fail',
    data_source: 'saved_report',
    icse_rq: 'RQ1, RQ2 (i)',
    open_first_order: '',
    size_note: 'Medium',
  },
  {
    sheet_id: '37',
    sheet_name: '37_Balanced_N_Summary',
    granularity: 'Summary',
    description: 'Equal-N complete-case cohort file and pass counts',
    data_source: 'computed',
    icse_rq: 'RQ2, RQ3',
    open_first_order: '',
    size_note: 'Small',
  },
  {
    sheet_id: '38',
    sheet_name: '38_Balanced_RQ2_FULL',
    granularity: 'Summary',
    description: 'RQ2 paired tests on balanced complete-case (all metrics present)',
    data_source: 'computed',
    icse_rq: 'RQ2',
    open_first_order: '',
    size_note: 'Small',
  },
  {
    sheet_id: '39',
    sheet_name: '39_Balanced_RQ3',
    granularity: 'Summary',
    description: 'RQ3 Friedman + pairwise tests on balanced complete-case',
    data_source: 'computed',
    icse_rq: 'RQ3',
    open_first_order: '',
    size_note: 'Small',
  },
  {
    sheet_id: '40',
    sheet_name: '40_Balanced_Pass_Data',
    granularity: '1 row / pass',
    description: 'Audit rows for balanced FULL cohort',
    data_source: 'computed',
    icse_rq: 'RQ2, RQ3',
    open_first_order: '',
    size_note: 'Long',
  },
  {
    sheet_id: '41',
    sheet_name: '41_Balanced_RQ2_RUN',
    granularity: 'Summary',
    description: 'RQ2 on balanced cohort using smell/LOC only (larger N)',
    data_source: 'computed',
    icse_rq: 'RQ2',
    open_first_order: '',
    size_note: 'Small',
  },
  {
    sheet_id: '42',
    sheet_name: '42_Balanced_RQ2_Primary',
    granularity: 'Summary',
    description: 'RQ2 balanced stats on primary sample only',
    data_source: 'computed',
    icse_rq: 'RQ2',
    open_first_order: '',
    size_note: 'Small',
  },
  {
    sheet_id: '43',
    sheet_name: '43_MASTER_GUIDE',
    granularity: 'Document',
    description: 'START HERE — scope, counts, sheet map for MASTER_COMPLETE workbook',
    data_source: 'computed',
    icse_rq: '—',
    open_first_order: '1',
    size_note: 'Small',
  },
  {
    sheet_id: '44',
    sheet_name: '44_Open_Systems_Summary',
    granularity: '1 row / project',
    description: '15 open-source systems: saved count, frontier count, sample slots',
    data_source: 'computed',
    icse_rq: '—',
    open_first_order: '2',
    size_note: 'Small — 15 rows',
  },
];

const GRANULARITY: Record<string, string> = {
  '00': 'Document',
  '01': '1 row / file',
  '02': '1 row / file',
  '03': '1 row / file',
  '03b': '1 row / check / pass',
  '03c': '1 row / file',
  '03d': '1 row / file (+ passes)',
  '04': '1 row / file',
  '05': '1 row / practice / file',
  '06': '1 row / text / file',
  '07': '1 row / file',
  '08': '1 row / file',
  '09': '1 row / file',
  '10': '1 row / file',
  '11': '1 row / file',
  '12': '1 row / file',
  '13': '1 row / file',
  '14': '1 row / file',
  '15': '1 row / smell type / file',
  '16': '1 row / file',
  '17': '1 row / provider pass',
  '18': '1 row / agent step',
  '19': '1 row / file',
  '20': '1 row / metric × pass',
  '21': '1 row / metric × file',
  '22': 'Summary',
  '23': 'Summary',
  '24': 'Summary',
  '25': 'Summary',
  '26': 'Summary',
  '27': 'Summary',
  '28': 'Summary',
  '29': 'Document',
  '30': '1 row / provider pass',
};

const ICSE_RQ: Record<string, string> = {
  '00': '—',
  '01': 'RQ2, RQ3',
  '02': 'RQ2',
  '03': 'RQ2 (v)',
  '03b': 'RQ2 (v)',
  '03c': 'RQ2 (v)',
  '03d': 'RQ1, RQ2 (i)',
  '04': 'RQ2 (iv)',
  '05': 'RQ1',
  '06': '—',
  '07': 'RQ2 (iv)',
  '08': 'RQ2 (iv)',
  '09': 'RQ2 (iv)',
  '10': 'RQ2 (iv)',
  '11': 'RQ2 (iv)',
  '12': 'RQ2 (iv)',
  '13': 'RQ2 (v)',
  '14': 'RQ3',
  '15': 'RQ2 (ii)(iii)',
  '16': 'RQ1',
  '17': 'RQ3',
  '18': 'RQ1',
  '19': 'RQ3',
  '20': 'RQ2, RQ3',
  '21': 'RQ2',
  '22': '—',
  '23': '—',
  '24': 'RQ2',
  '25': 'RQ2 sensitivity',
  '26': 'RQ3',
  '27': 'Sensitivity only',
  '28': 'RQ2 (i)',
  '29': '—',
  '30': 'RQ2, RQ3',
};

const OPEN_FIRST: Record<string, string> = {
  '00': '3',
  '01': '5',
  '29': '4',
};

const SIZE_NOTE: Record<string, string> = {
  '01': 'Wide — many columns',
  '19': 'Very wide — 3 provider blocks',
  '20': 'LONG — use filters; files × 3 providers × metrics',
  '21': 'Long — files × metric groups',
  '30': 'Long — primary pass audit',
};

function catalogRows(): SheetDefinitionRow[] {
  return RESEARCH_EXCEL_SHEETS.map((s) => ({
    sheet_id: s.id,
    sheet_name: s.name,
    granularity: GRANULARITY[s.id] ?? '',
    description: s.description,
    data_source: s.dataSource,
    icse_rq: ICSE_RQ[s.id] ?? '',
    in_master_complete: 'yes',
    in_all_files_master: 'yes',
    open_first_order: OPEN_FIRST[s.id] ?? '',
    size_note: SIZE_NOTE[s.id] ?? 'Medium',
  }));
}

export function allSheetDefinitionRows(): SheetDefinitionRow[] {
  const core = catalogRows();
  const extended: SheetDefinitionRow[] = EXTENDED_SHEETS.map((s) => ({
    ...s,
    in_master_complete: 'yes',
    in_all_files_master: 'no',
  }));
  const projectTabs: SheetDefinitionRow = {
    sheet_id: 'P',
    sheet_name: 'P_<project_name>',
    granularity: '1 row / file',
    description:
      'Cross-project export only: per-project Before/After comparison slice (one tab per OSS repo, e.g. P_07-Junit)',
    data_source: 'saved_report',
    icse_rq: 'RQ2',
    in_master_complete: 'yes',
    in_all_files_master: 'yes',
    open_first_order: '',
    size_note: 'One tab per project (15 typical)',
  };
  return [...core, ...extended, projectTabs];
}

export const SHEET_DEFINITION_HEADERS: (keyof SheetDefinitionRow)[] = [
  'sheet_id',
  'sheet_name',
  'granularity',
  'description',
  'data_source',
  'icse_rq',
  'in_master_complete',
  'in_all_files_master',
  'open_first_order',
  'size_note',
];

export function sheetDefinitionsToAoa(exportedAt?: string): (string | number)[][] {
  const rows = allSheetDefinitionRows();
  const iso = exportedAt ?? new Date().toISOString();
  return [
    ['REFINE — Research Excel sheet definitions (all tabs)'],
    ['Exported', iso],
    ['Wiki', 'wiki/Research_Excel_Sheet_Reference.md'],
    [''],
    ['Open first: rows where open_first_order is 1–5 in the master workbook'],
    ['Data source: saved-reports JSON — export never invents values'],
    [''],
    SHEET_DEFINITION_HEADERS,
    ...rows.map((r) => SHEET_DEFINITION_HEADERS.map((h) => r[h])),
  ];
}

export const SHEET_DEFINITIONS_FILENAME = 'REFINE_Sheet_Definitions.xlsx';
