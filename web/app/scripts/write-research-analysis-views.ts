/**
 * Write RQ2/RQ3 analysis CSVs into an export directory.
 */

import fs from 'fs';
import path from 'path';
import {
  buildResearchAnalysisExports,
  buildRq2MetricsLongCsv,
  recordsToCsv,
} from '../app/lib/researchAnalysisExports';
import {
  buildBehavioralPassTestRows,
  buildVerificationGateRows,
} from '../app/lib/behavioralPassTestExport';
import { classifyResearchCohort } from '../app/lib/researchExportCohort';
import { loadResearchDatasetFromDisk } from '../app/lib/researchDatasetLoader';

export function writeResearchAnalysisViews(outDir: string, exportedAtIso?: string): {
  analysisDir: string;
  counts: ReturnType<typeof buildResearchAnalysisExports>['counts'];
} {
  const { files } = loadResearchDatasetFromDisk();
  const analysis = buildResearchAnalysisExports(files);
  const iso = exportedAtIso ?? new Date().toISOString();
  const analysisDir = path.join(outDir, '05_rq_analysis_views');
  fs.mkdirSync(analysisDir, { recursive: true });

  fs.writeFileSync(path.join(analysisDir, 'RQ2_primary_passes.csv'), recordsToCsv(analysis.rq2Primary));
  fs.writeFileSync(path.join(analysisDir, 'RQ2_extended_passes.csv'), recordsToCsv(analysis.rq2Extended));
  fs.writeFileSync(
    path.join(analysisDir, 'RQ3_comparison_wide.csv'),
    recordsToCsv(analysis.rq3ComparisonWide)
  );
  fs.writeFileSync(
    path.join(analysisDir, 'RQ3_primary_comparison_wide.csv'),
    recordsToCsv(analysis.rq3PrimaryComparisonWide)
  );
  const extendedFiles = files.filter((f) => {
    const c = classifyResearchCohort(f.bundle, f.inCurrentSample);
    return c.cohort === 'A_frontier_parallel' || c.cohort === 'B_legacy_chain_non_frontier';
  });

  fs.writeFileSync(
    path.join(analysisDir, 'RQ2_metrics_long.csv'),
    buildRq2MetricsLongCsv(extendedFiles, iso)
  );

  const behavioralRows = buildBehavioralPassTestRows(files);
  fs.writeFileSync(
    path.join(analysisDir, 'behavioral_pass_test.csv'),
    recordsToCsv(behavioralRows as unknown as Record<string, string | number | boolean>[])
  );
  fs.writeFileSync(
    path.join(analysisDir, 'verification_gates.csv'),
    recordsToCsv(buildVerificationGateRows(files) as unknown as Record<string, string | number | boolean>[])
  );

  fs.writeFileSync(
    path.join(analysisDir, 'analysis_counts.json'),
    JSON.stringify({ exportedAt: iso, ...analysis.counts }, null, 2)
  );

  return { analysisDir, counts: analysis.counts };
}
