#!/usr/bin/env bash
# Preflight all RIPPLE-REF repositories: scan + eligibility + selection readiness.
#
# Usage:
#   ./scripts/preflight-ripple-ref-repos.sh
#   FILES_PER_REPO=15 ./scripts/preflight-ripple-ref-repos.sh
#   WORKSPACE_IDS="project-b16f055f project-07aa431d" ./scripts/preflight-ripple-ref-repos.sh
#
# Output:
#   .run/ripple-ref-preflight-report.md
#   .run/ripple-ref-preflight-report.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RIPPLE_REF_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/ripple-ref-lib.sh"

ripple_ref_load_ports
ripple_ref_health_check

FILES_PER_REPO="${FILES_PER_REPO:-15}"
RANDOM_SEED="${RANDOM_SEED:-42}"
MIN_SMELL_COUNT="${MIN_SMELL_COUNT:-1}"

if [ -z "${WORKSPACE_IDS:-}" ]; then
  WORKSPACE_IDS="$(ripple_ref_all_workspace_ids)"
fi
export WORKSPACE_IDS

REPO_COUNT=$(echo "$WORKSPACE_IDS" | wc -w | tr -d ' ')
RUN_DIR="$RIPPLE_REF_ROOT/.run"
mkdir -p "$RUN_DIR"
REPORT_MD="$RUN_DIR/ripple-ref-preflight-report.md"
REPORT_JSON="$RUN_DIR/ripple-ref-preflight-report.json"

echo "=== RIPPLE-REF PREFLIGHT ==="
echo "Repositories: $REPO_COUNT"
echo "Required files per repo: $FILES_PER_REPO"
echo ""

echo "Creating preflight study..."
STUDY="$(ripple_ref_create_study "ripple-ref-preflight" "custom")"
STUDY_ID=$(echo "$STUDY" | python3 -c "import sys,json; print(json.load(sys.stdin)['config']['studyId'])")
echo "Study ID: $STUDY_ID"

ripple_ref_study_setup "$STUDY_ID" "$WORKSPACE_IDS"
STUDY_JSON="$(ripple_ref_load_study "$STUDY_ID")"
TMP_STUDY="$RUN_DIR/ripple-ref-preflight-${STUDY_ID}.json"
echo "$STUDY_JSON" > "$TMP_STUDY"

python3 - <<PY
import json, os
from pathlib import Path

study = json.load(open("$TMP_STUDY"))
required = int(os.environ.get('FILES_PER_REPO', '15'))
rows = []
ready = 0
not_ready = []

for repo in os.environ.get('WORKSPACE_IDS','').split():
    files = (study.get('selectedByRepo') or {}).get(repo) or []
    eligible = (study.get('eligibleByRepo') or {}).get(repo) or []
    scans = (study.get('repositoryScans') or {}).get(repo) or {}
    ok = len(files) >= required
    if ok:
        ready += 1
    else:
        not_ready.append(repo)
    rows.append({
        'projectId': repo,
        'repositoryName': scans.get('repositoryName', repo),
        'productionFiles': scans.get('productionFileCount', 0),
        'eligibleFiles': len(eligible),
        'selectedFiles': len(files),
        'requiredFiles': required,
        'ready': ok,
        'shortfall': max(0, required - len(files)),
    })

out = {
    'studyId': '$STUDY_ID',
    'requiredFilesPerRepo': required,
    'repositoryCount': len(rows),
    'readyRepositories': ready,
    'notReadyRepositories': not_ready,
    'repositories': rows,
}
Path('$REPORT_JSON').write_text(json.dumps(out, indent=2), encoding='utf-8')

lines = [
    '# RIPPLE-REF Preflight Report',
    '',
    f'- Study ID: \`$STUDY_ID\`',
    f'- Required files/repo: **{required}**',
    f'- Ready repos: **{ready}/{len(rows)}**',
    '',
    '| Repository | Production Java | Eligible | Selected | Ready |',
    '|------------|-----------------|----------|----------|-------|',
]
for r in rows:
    mark = '✅' if r['ready'] else '❌'
    lines.append(
        f"| {r['projectId']} | {r['productionFiles']} | {r['eligibleFiles']} | {r['selectedFiles']} | {mark} |"
    )
if not_ready:
    lines += ['', '## Not ready', '']
    for repo in not_ready:
        r = next(x for x in rows if x['projectId'] == repo)
        lines.append(f"- `{repo}`: need {required}, selected {r['selectedFiles']}, eligible {r['eligibleFiles']}")
lines += ['', '## Recommendation', '']
if ready == len(rows):
    lines.append('All repositories meet file quota. Proceed with batch run.')
else:
    lines.append('Lower FILES_PER_REPO or add PMD analysis / more smell-detected files before full batch.')

Path('$REPORT_MD').write_text('\\n'.join(lines), encoding='utf-8')
print('Wrote', '$REPORT_MD')
print('Wrote', '$REPORT_JSON')
print()
print('Ready:', ready, '/', len(rows))
PY

cat "$REPORT_MD"

if python3 -c "import json; d=json.load(open('$REPORT_JSON')); raise SystemExit(0 if d['readyRepositories']==d['repositoryCount'] else 1)"; then
  echo ""
  echo "PREFLIGHT: PASS"
  exit 0
else
  echo ""
  echo "PREFLIGHT: SOME REPOS NOT READY (see report)"
  exit 2
fi
