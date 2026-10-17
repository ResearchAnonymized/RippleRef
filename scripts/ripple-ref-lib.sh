#!/usr/bin/env bash
# Shared helpers for RIPPLE-REF orchestration scripts.

_RIPPLE_REF_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ripple_ref_root() {
  echo "$(cd "$_RIPPLE_REF_LIB_DIR/.." && pwd)"
}

ripple_ref_load_ports() {
  local root
  root="$(ripple_ref_root)"
  if [ -f "$root/ports.env" ]; then
    # shellcheck disable=SC1091
    source "$root/ports.env"
  fi
  BACKEND_PORT="${BACKEND_PORT:-8083}"
  AGENTS_PORT="${AGENTS_PORT:-8091}"
  API="http://127.0.0.1:${BACKEND_PORT}/api"
  AGENTS="http://127.0.0.1:${AGENTS_PORT}"
  RIPPLE_REF_CURL_TIMEOUT_SEC="${RIPPLE_REF_CURL_TIMEOUT_SEC:-3600}"
  export BACKEND_PORT AGENTS_PORT API AGENTS RIPPLE_REF_CURL_TIMEOUT_SEC
}

ripple_ref_curl() {
  curl -sf --max-time "$RIPPLE_REF_CURL_TIMEOUT_SEC" "$@"
}

ripple_ref_health_check() {
  curl -sf "$API/health" >/dev/null || { echo "Backend not running: $API"; return 1; }
  curl -sf "$AGENTS/health" >/dev/null || { echo "Agents not running: $AGENTS"; return 1; }
}

ripple_ref_health_check_retry() {
  local attempts="${1:-5}"
  local delay="${2:-6}"
  local i=1
  while [ "$i" -le "$attempts" ]; do
    if ripple_ref_health_check 2>/dev/null; then
      return 0
    fi
    sleep "$delay"
    i=$((i + 1))
  done
  return 1
}

ripple_ref_default_models_json() {
  cat <<'EOF'
[
  {"provider":"google","family":"gemini","displayName":"Gemini 3.1 Pro","modelId":"google/gemini-3.1-pro-preview","apiRoute":"openrouter","contextWindow":2000000},
  {"provider":"openai","family":"gpt","displayName":"GPT-5.5","modelId":"openai/gpt-5.5","apiRoute":"openrouter","contextWindow":1000000},
  {"provider":"anthropic","family":"claude","displayName":"Claude Opus 4.8","modelId":"anthropic/claude-opus-4.8","apiRoute":"openrouter","contextWindow":1000000},
  {"provider":"deepseek","family":"deepseek","displayName":"DeepSeek V4 Pro","modelId":"deepseek/deepseek-v4-pro","apiRoute":"openrouter","contextWindow":1000000},
  {"provider":"qwen","family":"qwen","displayName":"Qwen 3.6 Plus","modelId":"qwen/qwen3.6-plus","apiRoute":"openrouter","contextWindow":1000000}
]
EOF
}

ripple_ref_model_ids() {
  echo "google/gemini-3.1-pro-preview openai/gpt-5.5 anthropic/claude-opus-4.8 deepseek/deepseek-v4-pro qwen/qwen3.6-plus"
}

ripple_ref_all_workspace_ids() {
  curl -sf "$API/workspaces" | python3 -c "
import sys, json
ws = json.load(sys.stdin)
print(' '.join(w['id'] for w in ws))
"
}

ripple_ref_ws_json() {
  python3 -c "import json,os; print(json.dumps(os.environ.get('WORKSPACE_IDS','').split()))"
}

ripple_ref_create_study() {
  local label="${1:-ripple-ref-study}"
  local scale="${2:-custom}"
  local models_json
  models_json="$(ripple_ref_default_models_json)"
  local ws_json
  ws_json="$(ripple_ref_ws_json)"
  local study_id_json=""
  if [ -n "${MASTER_STUDY_ID:-}" ]; then
    study_id_json=",\"studyId\":\"${MASTER_STUDY_ID}\""
  fi
  curl -sf -X POST "$API/ripple-ref/studies" \
    -H 'Content-Type: application/json' \
    -d "{\"scale\":\"$scale\",\"label\":\"$label\",\"workspaceIds\":$ws_json,\"filesPerRepository\":${FILES_PER_REPO},\"randomSeed\":${RANDOM_SEED},\"minSmellCount\":${MIN_SMELL_COUNT},\"models\":$models_json${study_id_json}}"
}

ripple_ref_load_study() {
  ripple_ref_curl "$API/ripple-ref/studies/$1?view=summary"
}

ripple_ref_repo_has_scan() {
  local study_id="$1"
  local workspace_id="$2"
  ripple_ref_curl "$API/ripple-ref/studies/$study_id?view=summary" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ws = sys.argv[1]
scans = d.get('repositoryScans') or {}
print('yes' if ws in scans and (scans[ws].get('productionFileCount') or 0) > 0 else 'no')
" "$workspace_id"
}

ripple_ref_repo_has_selection() {
  local study_id="$1"
  local workspace_id="$2"
  ripple_ref_curl "$API/ripple-ref/studies/$study_id?view=summary" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ws = sys.argv[1]
sel = (d.get('selectedByRepo') or {}).get(ws) or []
print('yes' if len(sel) >= 10 else 'no')
" "$workspace_id"
}

ripple_ref_study_setup() {
  local study_id="$1"
  local workspace_ids="$2"
  echo "--- Scan repositories ---" >&2
  for ws in $workspace_ids; do
    if [ "$(ripple_ref_repo_has_scan "$study_id" "$ws")" = "yes" ]; then
      echo "  Already scanned $ws — skip" >&2
      continue
    fi
    echo "  Scanning $ws ..." >&2
    ripple_ref_curl -X POST "$API/ripple-ref/studies/$study_id/scan/$ws" >/dev/null || {
      echo "  ERROR: scan failed for $ws" >&2
      return 1
    }
  done
  if [ -n "${SETUP_REPO_ONLY:-}" ] && [ "$(ripple_ref_repo_has_selection "$study_id" "${SETUP_REPO_ONLY}")" = "yes" ]; then
    echo "  Files already selected for ${SETUP_REPO_ONLY:-repo} — skip select" >&2
    echo "--- Build dependency contexts ---" >&2
    ripple_ref_curl -X POST "$API/ripple-ref/studies/$study_id/build-contexts" >/dev/null
    echo "  Contexts built." >&2
    return 0
  fi
  ripple_ref_select_files "$study_id" "${SETUP_REPO_ONLY:-}"
}

ripple_ref_select_files() {
  local study_id="$1"
  local workspace_id="${2:-}"
  echo "--- Stratified file selection ---" >&2
  local url="$API/ripple-ref/studies/$study_id/select-files"
  local selected
  if [ -n "$workspace_id" ]; then
    selected="$(ripple_ref_curl -X POST "${url}?workspaceId=${workspace_id}")"
  else
    selected="$(ripple_ref_curl -X POST "$url")"
  fi
  echo "$selected" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for repo, files in (d.get('selectedByRepo') or {}).items():
    elig_raw = (d.get('eligibleByRepo') or {}).get(repo) or []
    elig = elig_raw if isinstance(elig_raw, int) else len(elig_raw)
    print(f'  {repo}: selected={len(files)} eligible={elig}', file=sys.stderr)
    for f in files:
        print(f\"    - {f['filePath']} [{f.get('samplingGroup')}] smells={f.get('smellCount')} callers={f.get('downstreamCallerCount')}\", file=sys.stderr)
" >&2
  echo "--- Build dependency contexts ---" >&2
  ripple_ref_curl -X POST "$API/ripple-ref/studies/$study_id/build-contexts" >/dev/null
  echo "  Contexts built." >&2
}

ripple_ref_preflight_repo() {
  local study_id="$1"
  local workspace_id="$2"
  curl -sf "$API/ripple-ref/studies/$study_id/preflight?workspaceId=${workspace_id}"
}

ripple_ref_setup_repo() {
  local study_id="$1"
  local workspace_id="$2"
  SETUP_REPO_ONLY="$workspace_id" ripple_ref_study_setup "$study_id" "$workspace_id"
}

ripple_ref_pair_completed() {
  local study_id="$1"
  local pair_key="$2"
  python3 -c "
import json, sys, urllib.request
api, study, key = sys.argv[1:4]
try:
    with urllib.request.urlopen(f'{api}/ripple-ref/studies/{study}?view=summary', timeout=30) as r:
        d = json.load(r)
except Exception:
    d = {}
done = set(d.get('completedCandidates') or [])
failed = set(d.get('failedCandidates') or [])
print('yes' if key in done or key in failed else 'no')
" "$API" "$study_id" "$pair_key" 2>/dev/null || echo "no"
}

# Skip only successful pairs (retry failed / never-started) — use after travel or offline gaps.
ripple_ref_pair_succeeded() {
  local study_id="$1"
  local pair_key="$2"
  python3 -c "
import json, sys, urllib.request
api, study, key = sys.argv[1:4]
try:
    with urllib.request.urlopen(f'{api}/ripple-ref/studies/{study}?view=summary', timeout=30) as r:
        d = json.load(r)
except Exception:
    d = {}
done = set(d.get('completedCandidates') or [])
print('yes' if key in done else 'no')
" "$API" "$study_id" "$pair_key" 2>/dev/null || echo "no"
}

# MA pair is resolved when CSV-backed state lists it completed or terminal failed (no duplicate spend).
ripple_ref_ma_pair_resolved() {
  ripple_ref_pair_completed "$1" "$2"
}

ripple_ref_run_candidate() {
  local study_id="$1"
  local workspace_id="$2"
  local file_path="$3"
  local model_id="$4"
  local variant="$5"
  local timeout="${CANDIDATE_TIMEOUT_SEC:-600}"
  python3 -c "
import json, sys
study_id, ws, file_path, model_id, variant = sys.argv[1:6]
print(json.dumps({
  'studyId': study_id,
  'workspaceId': ws,
  'filePath': file_path,
  'variant': variant,
  'model': {'modelId': model_id, 'apiRoute': 'openrouter', 'contextWindow': 1000000},
  'resume': False,
}))
" "$study_id" "$workspace_id" "$file_path" "$model_id" "$variant" | curl -sf --max-time "$timeout" -X POST "$AGENTS/agents/ripple-ref/run-candidate" \
    -H 'Content-Type: application/json' \
    -d @- 2>/dev/null || echo '{"status":"failed","error":"timeout or agent error"}'
}

ripple_ref_print_candidate_result() {
  python3 -c "
import sys, json
r = json.load(sys.stdin)
rep = r.get('rippleReport') or {}
beh = rep.get('behavioral') or {}
tests = rep.get('tests') or {}
print(f\"    -> status={r.get('status')} risk={rep.get('riskLevel')} adoption={rep.get('adoptionClass')} behavioral={beh.get('behavioralCorrect')} tests={tests.get('status')} latency={r.get('latencyMs')}ms err={r.get('error')}\")
"
}

ripple_ref_candidate_queue() {
  local study_json="$1"
  local repo_filter="${2:-}"
  echo "$study_json" | REPO_FILTER="$repo_filter" python3 -c "
import json, os, sys
d = json.load(sys.stdin)
models = [
  'google/gemini-3.1-pro-preview',
  'openai/gpt-5.5',
  'anthropic/claude-opus-4.8',
  'deepseek/deepseek-v4-pro',
  'qwen/qwen3.6-plus',
]
repo_filter = os.environ.get('REPO_FILTER', '').strip()
for repo, files in (d.get('selectedByRepo') or {}).items():
    if repo_filter and repo != repo_filter:
        continue
    for f in files:
        path = f['filePath']
        for model in models:
            for variant in ('V1', 'V2'):
                print(json.dumps({'ws': repo, 'file': path, 'model': model, 'variant': variant}))
"
}

ripple_ref_write_summary_md() {
  local study_id="$1"
  local study_dir="$2"
  local report_path="$3"
  local planned="$4"
  local ran="$5"
  local failed="$6"
  local skipped="$7"
  python3 - <<PY
import csv
from collections import Counter
from pathlib import Path

study_dir = Path("$study_dir")
csv_path = study_dir / "results_candidates.csv"
rows = []
if csv_path.exists():
    with open(csv_path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

lines = [
    "# RIPPLE-REF Run Summary",
    "",
    f"- Study ID: \`$study_id\`",
    f"- Study dir: \`{study_dir}\`",
    f"- Planned: $planned | New runs: $ran | Failed: $failed | Skipped: $skipped",
    f"- CSV rows: {len(rows)}",
    "",
]
for key in ("variant", "model_id", "risk_level", "adoption_class", "behavioral_correct", "status"):
    if not rows:
        break
    field = key
    if field not in rows[0]:
        continue
    c = Counter(r.get(field) or "?" for r in rows)
    lines.append(f"## {field}")
    for k, v in sorted(c.items()):
        lines.append(f"- {k}: {v}")
    lines.append("")

Path("$report_path").write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote $report_path")
PY
}

ripple_ref_run_candidates() {
  local study_id="$1"
  local study_json="$2"
  local repo_filter="${3:-}"
  local summary_file="$4"

  local ran=0 skipped=0 failed=0
  mkdir -p "$(dirname "$summary_file")"
  touch "$summary_file"

  while IFS= read -r line; do
    local ws file model variant pair_key
    ws=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin)['ws'])")
    file=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin)['file'])")
    model=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin)['model'])")
    variant=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin)['variant'])")

    if [ -n "${MAX_CANDIDATES:-}" ] && [ "$ran" -ge "$MAX_CANDIDATES" ]; then
      echo "Reached MAX_CANDIDATES=$MAX_CANDIDATES" >&2
      break
    fi

    pair_key="${ws}|${file}|${model}|${variant}"
    if [ "${RESUME:-1}" = "1" ] && [ "$(ripple_ref_pair_completed "$study_id" "$pair_key")" = "yes" ]; then
      echo "  SKIP $variant $model $(basename "$file") [$ws]" >&2
      skipped=$((skipped + 1))
      continue
    fi

    echo "  RUN  $variant $model $(basename "$file") [$ws] ..." >&2
    curl -sf -X POST "$API/ripple-ref/studies/$study_id/live-candidate" \
      -H 'Content-Type: application/json' \
      -d "{\"workspaceId\":\"$ws\",\"filePath\":\"$file\",\"modelId\":\"$model\",\"variant\":\"$variant\",\"phase\":\"queued\"}" \
      >/dev/null 2>&1 || true
    RESULT="$(ripple_ref_run_candidate "$study_id" "$ws" "$file" "$model" "$variant")"
    echo "$RESULT" >> "$summary_file"
    echo "$RESULT" | ripple_ref_print_candidate_result >&2

    if echo "$RESULT" | python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('status')=='completed' else 1)"; then
      ran=$((ran + 1))
    else
      failed=$((failed + 1))
    fi

    if [ -n "${SLEEP_BETWEEN_CANDIDATES_SEC:-}" ]; then
      sleep "$SLEEP_BETWEEN_CANDIDATES_SEC"
    fi
  done < <(ripple_ref_candidate_queue "$study_json" "$repo_filter")

  echo "$ran $skipped $failed"
}
