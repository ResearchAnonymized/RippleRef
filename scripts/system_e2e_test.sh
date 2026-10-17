#!/usr/bin/env bash
# RefactAI end-to-end smoke test: upload → static smells → dependencies → ripple → agents.
# Prerequisites: backend :8083, agents :8091 (optional), frontend :4000 (optional).
# Usage:
#   ./scripts/system_e2e_test.sh
#   WORKSPACE_ID=project-xxx ./scripts/system_e2e_test.sh   # skip ZIP upload, use existing workspace
#   SKIP_AGENTS=1 ./scripts/system_e2e_test.sh
#   SKIP_UPLOAD=1 WORKSPACE_ID=... ./scripts/system_e2e_test.sh

set -euo pipefail
cd "$(dirname "$0")/.."

BACKEND="${BACKEND:-http://localhost:8083/api}"
AGENTS="${AGENTS:-http://localhost:8091}"
FRONTEND="${FRONTEND:-http://localhost:4000}"
SKIP_AGENTS="${SKIP_AGENTS:-0}"
SKIP_UPLOAD="${SKIP_UPLOAD:-0}"
WORKSPACE_ID="${WORKSPACE_ID:-}"

PASS=0
FAIL=0
ok() { echo "  OK  $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL $1"; FAIL=$((FAIL+1)); }

json_get() {
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('$1','') if isinstance(d,dict) else '')"
}

echo "=============================================="
echo "RefactAI system E2E test"
echo "BACKEND=$BACKEND AGENTS=$AGENTS"
echo "=============================================="

echo ""
echo "[1] Frontend (optional)"
if curl -sf -m 5 "$FRONTEND" >/dev/null; then ok "GET $FRONTEND"; else bad "GET $FRONTEND"; fi

echo ""
echo "[2] Backend health"
if resp=$(curl -sf -m 10 "$BACKEND/health" 2>/dev/null); then ok "GET $BACKEND/health"; echo "    $resp" | head -c 200; echo; else bad "GET $BACKEND/health"; fi

echo ""
echo "[3] Agents health (optional if SKIP_AGENTS=1)"
if [[ "$SKIP_AGENTS" == "1" ]]; then
  echo "    (skipped)"
else
  if resp=$(curl -sf -m 5 "$AGENTS/agents/health" 2>/dev/null); then ok "GET $AGENTS/agents/health"; echo "    $resp"; else bad "GET $AGENTS/agents/health"; fi
fi

if [[ -z "$WORKSPACE_ID" && "$SKIP_UPLOAD" != "1" ]]; then
  echo ""
  echo "[4] Minimal Java ZIP upload (static analysis project)"
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
  mkdir -p "$TMP/minimal/src/main/java/com/example"
  cat > "$TMP/minimal/src/main/java/com/example/Helper.java" << 'EOF'
package com.example;
public class Helper {
  public static int add(int a, int b) { return a + b; }
}
EOF
  cat > "$TMP/minimal/src/main/java/com/example/Service.java" << 'EOF'
package com.example;
/** Calls Helper — change here can ripple to tests if any. */
public class Service {
  public int compute() {
    return Helper.add(1, 2);
  }
}
EOF
  (cd "$TMP/minimal" && zip -qr "$TMP/minimal.zip" src)
  if up=$(curl -sf -m 120 -X POST "$BACKEND/workspaces" -F "file=@$TMP/minimal.zip" 2>/dev/null); then
    ok "POST $BACKEND/workspaces (upload)"
    WORKSPACE_ID=$(echo "$up" | json_get id)
    if [[ -n "$WORKSPACE_ID" ]]; then echo "    workspaceId=$WORKSPACE_ID"; else bad "parse workspace id"; fi
  else
    bad "POST $BACKEND/workspaces (upload)"
  fi
elif [[ -z "$WORKSPACE_ID" ]]; then
  bad "WORKSPACE_ID empty and SKIP_UPLOAD=1 — set WORKSPACE_ID or allow upload"
fi

if [[ -z "$WORKSPACE_ID" ]]; then
  echo ""
  echo "Stopping: no workspace id."
  echo "PASSED=$PASS FAILED=$FAIL"
  exit 1
fi

echo ""
echo "[5] List workspace files"
if ! files_json=$(curl -sf -m 60 "$BACKEND/workspaces/$WORKSPACE_ID/files" 2>/dev/null); then
  bad "GET files"
  JAVA_PATH=""
else
  ok "GET .../workspaces/$WORKSPACE_ID/files"
  JAVA_PATH=$(echo "$files_json" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if not isinstance(d,list): sys.exit(1)
paths=[(f.get('relativePath') or f.get('path') or '') for f in d if (f.get('relativePath') or f.get('path') or '').endswith('.java')]
paths=sorted(set(paths))
# Prefer a non-trivial file (e.g. not only Helper) for dependency/ripple checks
pick=None
for p in paths:
  if '/Helper.java' not in p and p.endswith('.java'):
    pick=p
    break
if not pick and paths:
  pick=paths[0]
if pick:
  print(pick)
")
  if [[ -n "$JAVA_PATH" ]]; then echo "    sampleJava=$JAVA_PATH"; else bad "no .java in file list"; fi
fi

if [[ -z "$JAVA_PATH" ]]; then JAVA_PATH="src/main/java/com/example/Service.java"; echo "    (fallback path) $JAVA_PATH"; fi

echo ""
echo "[6] Static code smells (enhanced analysis / engine)"
if smell_resp=$(curl -sf -m 120 -X POST "$BACKEND/workspace-enhanced-analysis/analyze-file" \
  -H "Content-Type: application/json" \
  -d "{\"workspaceId\":\"$WORKSPACE_ID\",\"filePath\":\"$JAVA_PATH\"}" 2>/dev/null); then
  ok "POST .../analyze-file (static smells)"
  n=$(echo "$smell_resp" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('codeSmells')or[]))")
  echo "    codeSmells count: $n"
else
  bad "POST .../analyze-file"
fi

echo ""
echo "[7] File dependencies (static)"
enc=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$JAVA_PATH''', safe=''))")
if dep=$(curl -sf -m 60 "$BACKEND/workspaces/$WORKSPACE_ID/dependencies/file?filePath=$enc" 2>/dev/null); then
  ok "GET .../dependencies/file"
  echo "$dep" | head -c 300; echo "..."
else
  bad "GET .../dependencies/file"
fi

echo ""
echo "[8] Ripple-effect file set (static)"
if rip=$(curl -sf -m 60 "$BACKEND/workspaces/$WORKSPACE_ID/dependencies/ripple-effect?filePath=$enc" 2>/dev/null); then
  ok "GET .../dependencies/ripple-effect"
  echo "$rip" | head -c 400; echo "..."
else
  bad "GET .../dependencies/ripple-effect"
fi

echo ""
echo "[9] Ripple impact API (engine analyzer, static)"
if [[ "$SKIP_AGENTS" != "1" ]]; then
  if impact=$(curl -sf -m 60 -X POST "$BACKEND/refactoring/workspaces/$WORKSPACE_ID/analyze-impact" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"RENAME_METHOD\",\"filePath\":\"$JAVA_PATH\",\"className\":\"Service\",\"methodName\":\"compute\",\"oldName\":\"compute\",\"newName\":\"computeRenamed\"}" 2>/dev/null); then
    ok "POST .../refactoring/.../analyze-impact"
    echo "$impact" | head -c 400; echo "..."
  else
    bad "POST .../analyze-impact (may be high-risk or path mismatch — check logs)"
  fi
else
  echo "    (skipped)"
fi

echo ""
echo "[10] Agentic analyze (LLM + pipeline)"
if [[ "$SKIP_AGENTS" == "1" ]]; then
  echo "    (skipped)"
else
  if an=$(curl -sf -m 180 -X POST "$AGENTS/agents/analyze" \
    -H "Content-Type: application/json" \
    -d "{\"workspaceId\":\"$WORKSPACE_ID\",\"filePath\":\"$JAVA_PATH\"}" 2>/dev/null); then
    ok "POST $AGENTS/agents/analyze"
    dec=$(echo "$an" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('decision','?'))")
    echo "    decision=$dec"
  else
    bad "POST $AGENTS/agents/analyze"
  fi
fi

echo ""
echo "=============================================="
echo "Done. PASSED=$PASS FAILED=$FAIL"
echo "=============================================="
[[ "$FAIL" -eq 0 ]]
