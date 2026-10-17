/** Shared types for publication-style before/after figures. */

export type BeforeAfterRow = {
  id: string;
  label: string;
  before: number;
  after: number;
  /** When true, a decrease in value is an improvement (e.g. smells, complexity). */
  lowerIsBetter: boolean;
  unit?: string;
  /** Optional short definition for paper captions / tooltips. */
  definition?: string;
};

export type ChurnRow = {
  label: string;
  value: number;
  color: string;
};
