#!/usr/bin/env bash
# Stop duplicate MA-REF runners; keep one canonical wrapper/supervisor tree.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEEPER="${1:-}"
# shellcheck disable=SC1091
source "$ROOT/scripts/ripple-ref-lib.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/ma-ref-pipeline-lib.sh"

ripple_ref_load_ports
export MA_STUDY_ID="${MA_STUDY_ID:-ma_ref_master}"
ma_ref_dedupe_runners "$ROOT" "$KEEPER"
curl -sf "$API/ripple-ref/studies/ma_ref_master/completeness" 2>/dev/null | python3 -m json.tool 2>/dev/null || true
