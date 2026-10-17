#!/usr/bin/env bash
# Export locked 150-file cohort from ripple_ref_master for ma_ref_master (no re-sampling).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/ripple-ref-lib.sh"

ripple_ref_load_ports
ripple_ref_health_check

SOURCE_STUDY="${SOURCE_STUDY:-ripple_ref_master}"
OUT_DIR="${OUT_DIR:-$SCRIPT_DIR/../.run/shared_cohort}"

mkdir -p "$OUT_DIR/per_repo"

echo "Exporting cohort from $SOURCE_STUDY ..."
TMP_JSON="$(mktemp)"
ripple_ref_load_study "$SOURCE_STUDY" > "$TMP_JSON"

python3 -c "
import json, sys, pathlib
d = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
out = pathlib.Path(sys.argv[2])
source = sys.argv[3]
selected = d.get('selectedByRepo') or {}
config = d.get('config') or {}
files = sum(len(v) for v in selected.values())
manifest = {
    'cohortId': f'{source}_v1',
    'sourceStudyId': source,
    'randomSeed': config.get('randomSeed', 42),
    'filesPerRepo': 10,
    'fileCount': files,
    'repos': [],
    'selectedByRepo': selected,
}
for ws, flist in sorted(selected.items()):
    paths = [f['filePath'] if isinstance(f, dict) else f for f in flist]
    manifest['repos'].append({'workspaceId': ws, 'fileCount': len(paths), 'files': paths})
    (out / 'per_repo' / f'{ws}_paths.txt').write_text('\n'.join(paths) + '\n', encoding='utf-8')
(out / 'cohort_manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
(out / 'ripple_ref_cohort.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(f'Exported {files} files across {len(selected)} repos -> {out}')
if files != 150:
    print(f'WARNING: expected 150 files, got {files}', file=sys.stderr)
    sys.exit(1)
" "$TMP_JSON" "$OUT_DIR" "$SOURCE_STUDY"
rm -f "$TMP_JSON"

echo "Cohort export OK: $OUT_DIR/cohort_manifest.json"
