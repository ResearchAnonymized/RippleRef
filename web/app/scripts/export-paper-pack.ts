/**
 * Full paper pack export — 527 frontier cohort.
 * Usage:
 *   cd web/app && npm run export:paper-pack
 *   cd web/app && npm run export:icse-dataset   # → ~/Desktop/ICSE-Dataset
 */

import path from 'path';
import os from 'os';
import { runPaperPackExport, validatePaperPackCounts } from '../app/lib/buildPaperPackExport';

async function main(): Promise<void> {
  const homeDir = path.join(os.homedir(), 'ICSE-Dataset');
  const desktopDir = path.join(os.homedir(), 'Desktop', 'ICSE-Dataset');
  const toDesktop = process.argv.includes('--desktop') || process.env.ICSE_DATASET_DESKTOP === '1';

  console.log('=== RENDRI-R Paper Pack Export (527 frontier) ===\n');

  let outDir = homeDir;
  if (toDesktop) {
    console.log(`Target (preferred): ${desktopDir}`);
    console.log(`Fallback: ${homeDir}\n`);
  }

  const result = await runPaperPackExport({ outDir: homeDir });

  if (toDesktop) {
    try {
      const fs = await import('fs');
      fs.rmSync(desktopDir, { recursive: true, force: true });
      fs.cpSync(homeDir, desktopDir, { recursive: true });
      result.outDir = desktopDir;
      console.log(`\nCopied to Desktop: ${desktopDir}`);
    } catch (e) {
      console.warn(`\nCould not write to Desktop (${(e as Error).message}).`);
      console.warn(`Dataset is at: ${homeDir}`);
      console.warn('Move manually: drag ICSE-Dataset from your home folder to Desktop in Finder.');
    }
  }
  const issues = validatePaperPackCounts(result);

  console.log(`Output folder:\n  ${result.outDir}\n`);
  console.log(`Frontier files: ${result.frontierFileCount}`);
  console.log(`Provider passes: ${result.passRowCount}`);
  console.log(`Projects: ${result.projectCount}\n`);
  console.log('Key files:');
  console.log(`  Master:      ${result.paths.master}`);
  console.log(`  Combined:    ${result.paths.combined}`);
  console.log(`  Paper-ready: ${result.paths.paperReady}`);
  console.log(`  CSV folder:  ${result.paths.csvDir}`);
  console.log(`  README:      ${result.paths.readme}`);
  if (result.paths.icsePaper) {
    console.log('\nDesktop-friendly copies (folder root):');
    console.log(`  ${result.paths.icsePaper}`);
    console.log(`  ${result.paths.icseMaster}`);
    console.log(`  ${result.paths.icseCombined}`);
    console.log(`  ${result.paths.icseCleaningMaster}`);
  }

  if (issues.length) {
    console.warn('\nValidation notes:');
    for (const i of issues) console.warn(`  - ${i}`);
  } else {
    console.log('\nValidation: OK');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
