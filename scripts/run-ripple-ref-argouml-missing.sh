#!/usr/bin/env bash
# Run only ArgoUML MyTokenizer candidates that were never attempted (6 gaps).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/ripple-ref-lib.sh"

ripple_ref_load_ports
ripple_ref_health_check

STUDY_ID="${MASTER_STUDY_ID:-ripple_ref_master}"
LOG_FILE="${LOG_FILE:-$SCRIPT_DIR/../.run/ripple-ref-argouml-missing.log}"
WS="project-873bd0c4"

STUDY_JSON="$(ripple_ref_load_study "$STUDY_ID")"
FILE="$(echo "$STUDY_JSON" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for f in (d.get('selectedByRepo') or {}).get('$WS') or []:
 p=f['filePath'] if isinstance(f,dict) else f
 if 'MyTokenizer' in p:
  print(p); break
")"

if [ -z "$FILE" ]; then
  echo "ERROR: MyTokenizer not found in selected files" | tee "$LOG_FILE"
  exit 1
fi

echo "=== ArgoUML missing candidates ===" | tee "$LOG_FILE"
echo "file: $FILE" | tee -a "$LOG_FILE"
echo "Started: $(date -u +"%Y-%m-%d %H:%M UTC")" | tee -a "$LOG_FILE"

pair_status() {
  local pair_key="$1"
  python3 -c "
import sys,json
d=json.load(sys.stdin)
k=sys.argv[1]
done=set(d.get('completedCandidates') or [])
fail=set(d.get('failedCandidates') or [])
if k in done: print('completed')
elif k in fail: print('failed')
else: print('missing')
" "$pair_key" <<< "$STUDY_JSON"
}

run_if_needed() {
  local model="$1" variant="$2"
  local pair_key="${WS}|${FILE}|${model}|${variant}"
  local st
  st="$(pair_status "$pair_key")"
  if [ "$st" = "completed" ]; then
    echo "  SKIP (completed) $variant $model" | tee -a "$LOG_FILE"
    return 0
  fi
  if [ "$st" = "failed" ]; then
    echo "  RETRY (failed) $variant $(basename "$FILE") $model ..." | tee -a "$LOG_FILE"
  else
    echo "  RUN $variant $(basename "$FILE") $model ..." | tee -a "$LOG_FILE"
  fi
  curl -sf -X POST "$API/ripple-ref/studies/$STUDY_ID/live-candidate" \
    -H 'Content-Type: application/json' \
    -d "{\"workspaceId\":\"$WS\",\"filePath\":\"$FILE\",\"modelId\":\"$model\",\"variant\":\"$variant\",\"phase\":\"queued\"}" \
    >/dev/null 2>&1 || true
  set +e
  RESULT="$(ripple_ref_run_candidate "$STUDY_ID" "$WS" "$FILE" "$model" "$variant")"
  rc=$?
  set -e
  echo "$RESULT" | ripple_ref_print_candidate_result | tee -a "$LOG_FILE"
  if [ $rc -ne 0 ]; then
    echo "  WARN: curl/agent exit $rc" | tee -a "$LOG_FILE"
  fi
  STUDY_JSON="$(ripple_ref_load_study "$STUDY_ID")"
}

# Exactly the 6 gaps identified 2026-07-04 (retry failed — prior failures were apply-and-verify 500s)
run_if_needed "google/gemini-3.1-pro-preview" "V2"
run_if_needed "openai/gpt-5.5" "V1"
run_if_needed "anthropic/claude-opus-4.8" "V1"
run_if_needed "anthropic/claude-opus-4.8" "V2"
run_if_needed "deepseek/deepseek-v4-pro" "V1"
run_if_needed "deepseek/deepseek-v4-pro" "V2"

echo "=== Completeness ===" | tee -a "$LOG_FILE"
curl -sf "$API/ripple-ref/studies/$STUDY_ID/completeness" | python3 -m json.tool | tee -a "$LOG_FILE"
python3 -c "
import json,urllib.request
d=json.loads(urllib.request.urlopen('http://127.0.0.1:8084/api/ripple-ref/studies/ripple_ref_master?view=summary').read())
ws='project-873bd0c4'
p=ws+'|'
ok=sum(1 for k in d.get('completedCandidates',[]) if k.startswith(p))
fl=sum(1 for k in d.get('failedCandidates',[]) if k.startswith(p))
print(f'ArgoUML: {ok+fl}/100 ok={ok} fail={fl}')
" | tee -a "$LOG_FILE"
echo "Finished: $(date -u +"%Y-%m-%d %H:%M UTC")" | tee -a "$LOG_FILE"
