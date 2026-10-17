#!/usr/bin/env bash
# Verify research export does not delete or modify saved refactoring data.
# Usage: ./scripts/verify-research-export-safety.sh

set -euo pipefail
HOME_REFACT="${HOME}/.refactai"
WORKSPACES="${HOME_REFACT}/workspaces"

snapshot() {
  python3 << 'PY'
import json, hashlib
from pathlib import Path

ws_root = Path.home() / '.refactai' / 'workspaces'
out = {"saved_reports": {}, "refactored_artifacts": {}, "totals": {}}
total_sr = 0
total_ref = 0
for ws in sorted(ws_root.glob('project-*')):
    sr = ws / '.refactai' / 'saved-reports'
    if sr.is_dir():
        files = {}
        for f in sr.glob('*.json'):
            data = f.read_bytes()
            files[f.name] = hashlib.sha256(data).hexdigest()
            total_sr += 1
        out['saved_reports'][ws.name] = files
    ref = ws / '.refactai' / 'refactored'
    if ref.is_dir():
        arts = [p.name for p in ref.rglob('*') if p.is_file()]
        out['refactored_artifacts'][ws.name] = sorted(arts)
        total_ref += len(arts)
out['totals'] = {'saved_report_files': total_sr, 'refactored_artifact_files': total_ref}
print(json.dumps(out, indent=2))
PY
}

echo "=== Baseline snapshot (saved-reports + refactored artifacts) ==="
BEFORE=$(snapshot)
echo "$BEFORE" | python3 -c "import sys,json; d=json.load(sys.stdin); print('saved reports:', d['totals']['saved_report_files']); print('refactored artifacts:', d['totals']['refactored_artifact_files'])"

echo ""
echo "=== Running full export ==="
cd "$(dirname "$0")/../web/app" && npm run export:all-research

echo ""
echo "=== After export snapshot ==="
AFTER=$(snapshot)
echo "$AFTER" | python3 -c "import sys,json; d=json.load(sys.stdin); print('saved reports:', d['totals']['saved_report_files']); print('refactored artifacts:', d['totals']['refactored_artifact_files'])"

echo ""
echo "=== Comparing (must be identical) ==="
python3 << PY
import json, sys
before = json.loads('''$BEFORE''')
after = json.loads('''$AFTER''')
ok = True
if before['totals'] != after['totals']:
    print('FAIL: totals changed', before['totals'], '->', after['totals'])
    ok = False
if before['saved_reports'] != after['saved_reports']:
    print('FAIL: saved-reports content hashes changed')
    ok = False
if before['refactored_artifacts'] != after['refactored_artifacts']:
    print('FAIL: refactored artifacts changed')
    ok = False
if ok:
    print('PASS: no refactoring data was lost or modified')
else:
    sys.exit(1)
PY

echo ""
echo "=== Excel structure check ==="
python3 << 'PY'
import zipfile, xml.etree.ElementTree as ET
from pathlib import Path
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def sheets(p):
    with zipfile.ZipFile(p) as z:
        wb = ET.fromstring(z.read('xl/workbook.xml'))
        return [s.attrib['name'] for s in wb.findall('m:sheets/m:sheet', NS)]
ws = Path.home()/'.refactai/workspaces'
mockito = ws/'project-1012eb54/.refactai/exports/excel/latest.xlsx'
if mockito.exists():
    n = len(sheets(mockito))
    print(f'Mockito latest.xlsx: {n} sheets (expect ~35 per-project, NOT 178 cross-project)')
    if n > 50:
        print('WARN: Mockito may still have cross-project workbook')
    else:
        print('OK: Mockito has per-project workbook')
PY

echo "Done."
