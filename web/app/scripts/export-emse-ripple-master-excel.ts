/**
 * Export EMSE Ripple-REF + MA-REF master Excel workbook for paper analysis.
 *
 * Usage:
 *   cd web/app && npm run export:emse-ripple-master
 *
 * Env:
 *   EMSE_STUDY_BASE — parent of ripple_ref_master / ma_ref_master dirs
 *   EMSE_MASTER_OUTPUT_DIR — output directory (default: repo/.run)
 */

import path from 'path';
import { writeAllEmseExports, resolveDefaultStudyPaths } from '../app/lib/buildEmseRippleMasterExcel';

async function main() {
  const paths = resolveDefaultStudyPaths();
  console.log('Ripple study:', paths.rippleRefDir);
  console.log('MA study:', paths.maRefDir);
  const bundle = await writeAllEmseExports(paths);
  console.log('\nWrote unified master (all sheets):');
  console.log(' ', bundle.unified);
  console.log('\nRaw master (one file, every RQ unanalyzed):');
  console.log(' ', bundle.rawMaster);
  console.log('\nAlso in .run/: combined, B0-only, MA-only, analysis workbooks');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
