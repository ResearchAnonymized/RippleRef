#!/usr/bin/env bash
# Smoke-test research export APIs (backend must be running on 8084).
set -euo pipefail
API="${API_BASE:-http://localhost:8084/api}"
USER_ID="${USER_ID:-user-2f821fe5}"
WS_ID="${WS_ID:-project-b16f055f}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "=== List user research exports ==="
LIST=$(curl -sf "$API/users/$USER_ID/research-exports")
COUNT=$(echo "$LIST" | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))")
echo "count=$COUNT"
[ "$COUNT" -ge 1 ] || { echo "FAIL: expected at least 1 archive"; exit 1; }

EXPORT_ID=$(echo "$LIST" | python3 -c "import sys,json; print(json.load(sys.stdin)['exports'][0]['exportId'])")
echo "first exportId=$EXPORT_ID"

echo "=== Download user research export ==="
curl -sf "$API/users/$USER_ID/research-exports/$EXPORT_ID" -o "$TMP/workbook.xlsx"
SIZE=$(wc -c < "$TMP/workbook.xlsx")
echo "downloaded bytes=$SIZE"
[ "$SIZE" -gt 10000 ] || { echo "FAIL: workbook too small"; exit 1; }

echo "=== Download index JSON ==="
curl -sf "$API/users/$USER_ID/research-exports/$EXPORT_ID/index" -o "$TMP/index.json"
python3 -c "import json; json.load(open('$TMP/index.json'))" && echo "index JSON valid"

echo "=== Replace workspace excel export (empty workspace only; does not touch saved-reports) ==="
EMPTY_WS="project-75bdf455"
printf 'PK\x03\x04' > "$TMP/tiny.xlsx"
META='{"filename":"smoke-test.xlsx","fileCount":0,"exportedCount":0,"skippedCount":0,"projectLabel":"smoke"}'
HTTP=$(curl -s -o "$TMP/replace.json" -w "%{http_code}" -X POST "$API/workspaces/$EMPTY_WS/excel-exports?replace=true" \
  -F "file=@$TMP/tiny.xlsx;type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" \
  -F "metadata=$META")
echo "replace HTTP=$HTTP"
[ "$HTTP" = "200" ] || { echo "FAIL: replace returned $HTTP"; cat "$TMP/replace.json"; exit 1; }
python3 -c "import json; d=json.load(open('$TMP/replace.json')); assert d.get('exportId')=='latest', d; print('replace exportId=', d['exportId'])"

SR_JUNIT=$(find "$HOME/.refactai/workspaces/project-b16f055f/.refactai/saved-reports" -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
echo "JUnit saved-reports present: $SR_JUNIT (expect >= 15)"
[ "$SR_JUNIT" -ge 15 ] || { echo "FAIL: JUnit saved reports missing"; exit 1; }

echo "=== POST new user archive entry ==="
ARCHIVE_XLSX="$HOME/.refactai/workspaces/project-b16f055f/.refactai/exports/excel/extended.xlsx"
if [ ! -f "$ARCHIVE_XLSX" ]; then
  ARCHIVE_XLSX="$HOME/.refactai/workspaces/project-b16f055f/.refactai/exports/excel/latest.xlsx"
fi
[ -f "$ARCHIVE_XLSX" ] || { echo "FAIL: no junit excel export (extended.xlsx or latest.xlsx)"; exit 1; }
curl -sf -X POST "$API/users/$USER_ID/research-exports" \
  -F "file=@$ARCHIVE_XLSX;type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" \
  -F 'metadata={"filename":"api-smoke-junit.xlsx","fileCount":15,"exportedCount":15,"skippedCount":0,"exportKind":"smoke_test"}' \
  -F "index=@$TMP/index.json;type=application/json" \
  > "$TMP/post.json"
NEW_ID=$(python3 -c "import json; print(json.load(open('$TMP/post.json'))['exportId'])")
echo "created exportId=$NEW_ID"

echo "=== DELETE smoke test archive ==="
curl -sf -X DELETE "$API/users/$USER_ID/research-exports/$NEW_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('status')=='deleted'; print('deleted ok')"

echo ""
echo "PASS: all research export API smoke tests"
