/**
 * Export standalone Excel workbook listing every research sheet tab and its definition.
 * Usage: cd web/app && npm run export:sheet-definitions
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import ExcelJS from 'exceljs';
import {
  sheetDefinitionsToAoa,
  SHEET_DEFINITIONS_FILENAME,
} from '../app/lib/researchExcelSheetDefinitions';

async function main(): Promise<void> {
  const exportedAt = new Date().toISOString();
  const aoa = sheetDefinitionsToAoa(exportedAt);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('All_Sheet_Definitions');
  for (const row of aoa) ws.addRow(row);
  ws.getRow(8).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 8 }];
  ws.getColumn(4).width = 72;
  ws.getColumn(3).width = 22;
  ws.getColumn(2).width = 28;

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

  const home = os.homedir();
  const dirs = [
    path.join(home, 'RENDRI-R-export'),
    path.join(home, 'RENDRI-R-export', 'reference'),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, SHEET_DEFINITIONS_FILENAME), Buffer.from(buffer));
  }

  const latest = fs
    .readdirSync(path.join(home, 'RENDRI-R-export'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-/.test(d.name))
    .map((d) => d.name)
    .sort()
    .reverse()[0];
  if (latest) {
    fs.writeFileSync(
      path.join(home, 'RENDRI-R-export', latest, SHEET_DEFINITIONS_FILENAME),
      Buffer.from(buffer)
    );
  }

  console.log(`Sheet definitions Excel: ${path.join(dirs[1], SHEET_DEFINITIONS_FILENAME)}`);
  if (latest) {
    console.log(`Also copied to: ~/RENDRI-R-export/${latest}/${SHEET_DEFINITIONS_FILENAME}`);
  }
  console.log(`Rows: ${aoa.length - 8} sheet definitions`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
