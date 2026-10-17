#!/usr/bin/env bash
# Audit research sample integrity: counts, metrics, multi-LLM pass data.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
python3 << 'PY'
import json, base64, sys
from pathlib import Path
from collections import Counter

home = Path.home() / '.refactai/workspaces'
registry = json.loads(open(home / 'projects.json').read())

SECTION_KEYS = [
    'comparison', 'behavioral', 'structural', 'practices_applied', 'summary',
    'halstead', 'method_lengths', 'nesting_depth', 'coupling', 'cohesion',
    'diff_churn', 'semantic_preservation', 'token_efficiency', 'smell_resolution', 'meta',
]

def decode_stem(stem):
    pad = '=' * ((4 - len(stem) % 4) % 4)
    return base64.urlsafe_b64decode(stem + pad).decode()

def inner_rm(rm):
    if not rm:
        return {}
    if rm.get('comparison') or rm.get('meta'):
        return rm
    return rm.get('research_metrics') or rm.get('metrics') or rm

def runs_from_bundle(b):
    if isinstance(b.get('multiLlmRuns'), list) and b['multiLlmRuns']:
        return b['multiLlmRuns']
    ar = b.get('applyResult') or {}
    return ar.get('multiLlmRuns') or []

totals = Counter()
issues = []

for proj in registry:
    ws = home / proj['id']
    manifest_path = ws / '.refactai/research-sample-manifest.json'
    if not manifest_path.exists():
        issues.append(f"{proj['name']}: missing research-sample-manifest.json")
        continue
    paths = json.loads(open(manifest_path).read())['result']['paths']
    totals['sample_files'] += len(paths)

    sr_dir = ws / '.refactai/saved-reports'
    saved = {}
    if sr_dir.exists():
        for f in sr_dir.glob('*.json'):
            saved[decode_stem(f.stem)] = json.loads(open(f).read())

    batch_by = {}
    br = ws / '.refactai/batch-run-latest.json'
    if br.exists():
        for r in json.loads(open(br).read()).get('results', []):
            fp = r.get('filePath')
            if fp and r.get('multiLlmRuns'):
                batch_by[fp] = r['multiLlmRuns']

    for fp in paths:
        b = saved.get(fp)
        if not b:
            totals['missing_saved_report'] += 1
            issues.append(f"{proj['name']}: no saved report — {fp.split('/')[-1]}")
            continue
        totals['saved_reports'] += 1

        rm = inner_rm(b.get('researchMetrics'))
        if not rm:
            totals['no_research_metrics'] += 1
            issues.append(f"{proj['name']}: no researchMetrics — {fp.split('/')[-1]}")
        else:
            missing = [k for k in SECTION_KEYS if not rm.get(k)]
            if len(missing) >= 5:
                totals['thin_metrics'] += 1

        runs = runs_from_bundle(b)
        pm = b.get('pipelineMetadata') or {}
        if len(runs) >= 3:
            totals['full_multi_llm'] += 1
        elif len(runs) > 0:
            totals['partial_multi_llm'] += 1
        elif pm.get('multiLlmChain') is True:
            totals['chain_flag_no_runs'] += 1
            if fp in batch_by:
                issues.append(f"{proj['name']}: multiLlmChain but no runs in saved report (batch has data) — {fp.split('/')[-1]}")
            else:
                issues.append(f"{proj['name']}: multiLlmChain but no pass data anywhere — {fp.split('/')[-1]}")
        elif pm.get('multiLlmChain') is False:
            totals['single_llm_only'] += 1
        else:
            totals['unknown_pipeline'] += 1

        if pm.get('backfill'):
            totals['backfill'] += 1

        if pm.get('multiLlmMode') == 'independent_parallel':
            totals['independent_parallel'] += 1
        if pm.get('researchArtifactsOnly') is True:
            totals['artifacts_only'] += 1

        full_pass = 0
        independent_pass = 0
        for run in runs:
            prm = inner_rm(run.get('researchMetrics'))
            if run.get('passScope') == 'independent_baseline_parallel':
                independent_pass += 1
            if prm.get('comparison') and prm.get('behavioral') and prm.get('smell_resolution'):
                full_pass += 1
        if independent_pass >= 3:
            totals['files_3pass_independent_scope'] += 1
        if len(runs) >= 3 and full_pass >= 3:
            totals['files_3pass_full_metrics'] += 1
        elif len(runs) >= 3:
            totals['files_3pass_partial_metrics'] += 1

print('=== Research integrity audit ===')
for k, v in sorted(totals.items()):
    print(f'  {k}: {v}')

if issues:
    print(f'\nIssues ({len(issues)}):')
    for line in issues[:40]:
        print(f'  - {line}')
    if len(issues) > 40:
        print(f'  ... and {len(issues) - 40} more')

fail = (
    totals['sample_files'] != 150
    or totals['missing_saved_report'] > 0
    or totals['no_research_metrics'] > 0
    or totals['chain_flag_no_runs'] > 0
    or totals.get('files_3pass_full_metrics', 0) < 150
)
sys.exit(1 if fail else 0)
PY
