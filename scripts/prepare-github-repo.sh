#!/bin/bash
# Build a clean REFINE tool repo for GitHub (no study data, no internal docs).
set -euo pipefail

MONO="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$MONO/.publish/Refine"
STAGE="$(mktemp -d)"
REMOTE_URL="${REFINE_GITHUB_REMOTE:-https://github.com/ResearchAnonymized/REFINE.git}"

cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

echo "Preparing REFINE tool repo at $OUT"

"$MONO/sync-refine.sh"

RSYNC=(rsync -a --delete)
"${RSYNC[@]}" \
  --exclude '.run/' \
  --exclude '.git/' \
  --exclude 'agents/.env' \
  --exclude 'web/app/node_modules/' \
  --exclude 'web/app/.next/' \
  --exclude 'web/app/.env.local' \
  --exclude 'backend/**/target/' \
  --exclude '**/__pycache__/' \
  --exclude 'agents/.memory/' \
  --exclude 'agents/.venv/' \
  --exclude 'agents/venv/' \
  --exclude '**/.pytest_cache/' \
  --exclude 'wiki/' \
  --exclude 'agents/WHERE_TO_PASTE_KEY.md' \
  --exclude 'agents/REFACTORING_PROMPT.md' \
  --exclude 'agents/CURRENT_REFACTORING_PROMPT.md' \
  --exclude 'agents/OPENROUTER_SETUP.md' \
  --exclude 'web/app/scripts/export-*.ts' \
  --exclude 'web/app/scripts/validate-icse*.ts' \
  --exclude 'web/app/scripts/audit-*.ts' \
  --exclude 'web/app/scripts/verify-combined-smells.ts' \
  --exclude 'web/app/scripts/verify-extended-research-export.ts' \
  --exclude 'web/app/scripts/write-research*.ts' \
  --exclude 'web/app/scripts/backfill-*.ts' \
  --exclude 'web/app/scripts/prepare-research*.ts' \
  --exclude 'REVIEWER.md' \
  --exclude 'PAPER_ALIGNMENT.md' \
  --exclude 'GITHUB_REPO_SETUP.md' \
  --exclude 'README.md' \
  --exclude 'README_GITHUB.md' \
  --exclude 'PLAN.md' \
  --exclude 'MANIFEST.md' \
  --exclude 'frontend.log' \
  --exclude 'backend/server.log' \
  --exclude 'agents/agents.log' \
  --exclude '**/*.tsbuildinfo' \
  --exclude '**/logs/' \
  --exclude '**/*.log' \
  --exclude '**/*.gz' \
  --exclude '*.log' \
  "$MONO/REFINE/" "$STAGE/"

cp "$MONO/start-refine.sh" "$STAGE/start-refine.sh"
cp "$MONO/REFINE/README_GITHUB.md" "$STAGE/README.md"
if [ -d "$MONO/REFINE/examples" ]; then
  mkdir -p "$STAGE/examples"
  rsync -a "$MONO/REFINE/examples/" "$STAGE/examples/"
fi
chmod +x "$STAGE/scripts/setup.sh" "$STAGE/scripts/verify-install.sh" "$STAGE/scripts/start-refine.sh" \
  "$STAGE/scripts/e2e-refactai-smoke.sh" "$STAGE/start-refine.sh" 2>/dev/null || true

mkdir -p "$(dirname "$OUT")"
if [ -d "$OUT/.git" ]; then
  current_remote="$(git -C "$OUT" remote get-url origin 2>/dev/null || true)"
  if [[ "$current_remote" != *"ResearchAnonymized/REFINE"* ]]; then
    echo "Removing stale git metadata (remote was not ResearchAnonymized/REFINE)"
    rm -rf "$OUT"
  fi
fi

if [ ! -d "$OUT/.git" ]; then
  echo "Cloning $REMOTE_URL"
  git clone "$REMOTE_URL" "$OUT"
fi

"${RSYNC[@]}" --exclude '.git/' "$STAGE/" "$OUT/"
rm -f "$OUT/README_GITHUB.md"

echo ""
echo "Done: $OUT"
echo "Study data is NOT included — upload separately."
echo "Next: cd $OUT && git add . && git commit -m '...' && git push"
