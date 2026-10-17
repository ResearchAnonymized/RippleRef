#!/usr/bin/env bash
# Run only the remaining gap candidates (JabRef + ArgoUML) — fast, GUI-visible.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/ripple-ref-lib.sh"

ripple_ref_load_ports
ripple_ref_health_check

STUDY_ID="${MASTER_STUDY_ID:-ripple_ref_master}"
LOG_FILE="${LOG_FILE:-$SCRIPT_DIR/../.run/ripple-ref-final-7.log}"

echo "=== Final 7 candidates ===" | tee "$LOG_FILE"
echo "Study: $STUDY_ID" | tee -a "$LOG_FILE"

# JabRef: DiffHighlighter V1 Gemini
# ArgoUML: MyTokenizer — V1/V2 × Gemini, GPT, Claude, DeepSeek (6)
run_one() {
  local ws="$1" file="$2" model="$3" variant="$4"
  local pair_key="${ws}|${file}|${model}|${variant}"
  if [ "$(ripple_ref_pair_completed "$STUDY_ID" "$pair_key")" = "yes" ]; then
    echo "  SKIP (done) $variant $(basename "$file") $model" | tee -a "$LOG_FILE"
    return 0
  fi
  echo "  RUN $variant $(basename "$file") $model [$ws] ..." | tee -a "$LOG_FILE"
  curl -sf -X POST "$API/ripple-ref/studies/$STUDY_ID/live-candidate" \
    -H 'Content-Type: application/json' \
    -d "{\"workspaceId\":\"$ws\",\"filePath\":\"$file\",\"modelId\":\"$model\",\"variant\":\"$variant\",\"phase\":\"queued\"}" \
    >/dev/null 2>&1 || true
  RESULT="$(ripple_ref_run_candidate "$STUDY_ID" "$ws" "$file" "$model" "$variant")"
  echo "$RESULT" | ripple_ref_print_candidate_result | tee -a "$LOG_FILE"
}

JABREF_WS="project-56221077"
JABREF_FILE="jabref-main/jablib/src/main/java/org/jabref/logic/importer/fileformat/DiffHighlighter.java"

ARGO_WS="project-873bd0c4"
ARGO_FILE="argouml-VERSION_0_35/src/argouml-app/src/org/argouml/uml/ToDoByPoster/MyTokenizer.java"

# Resolve exact paths from study if defaults wrong
STUDY_JSON="$(ripple_ref_load_study "$STUDY_ID")"
JABREF_FILE="$(echo "$STUDY_JSON" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for f in (d.get('selectedByRepo') or {}).get('$JABREF_WS') or []:
 p=f['filePath'] if isinstance(f,dict) else f
 if 'DiffHighlighter' in p: print(p); break
" 2>/dev/null || echo "$JABREF_FILE")"

ARGO_FILE="$(echo "$STUDY_JSON" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for f in (d.get('selectedByRepo') or {}).get('$ARGO_WS') or []:
 p=f['filePath'] if isinstance(f,dict) else p
 if 'MyTokenizer' in p: print(p); break
" 2>/dev/null || echo "$ARGO_FILE")"

echo "JabRef file: $JABREF_FILE" | tee -a "$LOG_FILE"
echo "ArgoUML file: $ARGO_FILE" | tee -a "$LOG_FILE"

run_one "$JABREF_WS" "$JABREF_FILE" "google/gemini-3.1-pro-preview" "V1"

for model in "google/gemini-3.1-pro-preview" "openai/gpt-5.5" "anthropic/claude-opus-4.8" "deepseek/deepseek-v4-pro"; do
  run_one "$ARGO_WS" "$ARGO_FILE" "$model" "V1"
  run_one "$ARGO_WS" "$ARGO_FILE" "$model" "V2"
done

echo "=== Done ===" | tee -a "$LOG_FILE"
curl -sf "$API/ripple-ref/studies/$STUDY_ID/completeness" | python3 -m json.tool | tee -a "$LOG_FILE"
