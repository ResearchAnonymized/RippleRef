#!/usr/bin/env bash
# Verify uploading a second project does NOT remove the first workspace.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
[[ -f "$ROOT/ports.env" ]] && source "$ROOT/ports.env"
API_BASE="${API_BASE:-http://localhost:8083/api}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

make_zip() {
  local name="$1"
  local dir="$TMP/$name"
  mkdir -p "$dir/src"
  cat >"$dir/src/${name}.java" <<EOF
public class ${name} {
  public void demo() {
    try { System.out.println("x"); } catch (Exception e) { }
  }
}
EOF
  (cd "$dir" && zip -qr "$TMP/${name}.zip" .)
}

make_zip "AlphaProj"
make_zip "BetaProj"

echo "== Multi-workspace test (API: $API_BASE) =="

before_count="$(curl -sf "$API_BASE/workspaces" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))')"
echo "Workspaces before: $before_count"

up1="$(curl -sf -X POST "$API_BASE/workspaces" -F "file=@$TMP/AlphaProj.zip")"
id1="$(echo "$up1" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')"
echo "Uploaded AlphaProj -> $id1"

mid_count="$(curl -sf "$API_BASE/workspaces" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))')"
echo "Workspaces after first upload: $mid_count"

up2="$(curl -sf -X POST "$API_BASE/workspaces" -F "file=@$TMP/BetaProj.zip")"
id2="$(echo "$up2" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')"
echo "Uploaded BetaProj -> $id2"

after_count="$(curl -sf "$API_BASE/workspaces" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))')"
echo "Workspaces after second upload: $after_count"

ids="$(curl -sf "$API_BASE/workspaces" | python3 -c 'import sys,json; print(" ".join(w["id"] for w in json.load(sys.stdin)))')"

if [[ "$after_count" -lt "$mid_count" ]]; then
  echo "FAIL: workspace count dropped after second upload ($mid_count -> $after_count)"
  exit 1
fi

if ! echo "$ids" | grep -q "$id1"; then
  echo "FAIL: first workspace $id1 missing after second upload"
  exit 1
fi

if ! echo "$ids" | grep -q "$id2"; then
  echo "FAIL: second workspace $id2 not listed"
  exit 1
fi

if [[ "$id1" == "$id2" ]]; then
  echo "FAIL: both uploads returned same workspace id"
  exit 1
fi

echo "PASS: both workspaces coexist ($id1, $id2); total=$after_count"
