import ExcelJS from 'exceljs';

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: npx tsx scripts/verify-combined-smells.ts <workbook.xlsx>');
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
const ws = wb.getWorksheet('01_Files_Master');
if (!ws) throw new Error('missing 01_Files_Master');
const hdr = (ws.getRow(1).values as (string | number)[]).slice(1).map(String);
const col = (name: string) => hdr.indexOf(name);
let same = 0;
let changed = 0;
let test: Record<string, unknown> | null = null;
for (let r = 2; r <= ws.rowCount; r++) {
  const row = ws.getRow(r);
  const b = Number(row.getCell(col('pmd_smells_before') + 1).value);
  const a = Number(row.getCell(col('pmd_smells_after') + 1).value);
  if (!Number.isFinite(b)) continue;
  if (b === a) same += 1;
  else changed += 1;
  if (String(row.getCell(col('file_name') + 1).value) === 'Test.java') {
    test = {
      before: b,
      after: a,
      removed: row.getCell(col('pmd_smells_removed') + 1).value,
      delta: row.getCell(col('pmd_smells_delta') + 1).value,
      source: row.getCell(col('pmd_smells_source') + 1).value,
      openai_after: row.getCell(col('llm_openai_smells_after') + 1).value,
    };
  }
}
console.log('01_Files_Master:', { unchanged: same, changed, total: same + changed });
console.log('Test.java:', test);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
