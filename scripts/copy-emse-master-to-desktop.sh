#!/usr/bin/env bash
# Copy EMSE master workbook to Desktop (needs Terminal — macOS privacy).
set -euo pipefail
SRC="${1:-$HOME/refactai/.run/EMSE_MASTER_ALL_SHEETS.xlsx}"
DEST_DIR="$HOME/Desktop/EMSE-data/EMSE_Master"
mkdir -p "$DEST_DIR"
cp -f "$SRC" "$DEST_DIR/EMSE_MASTER_ALL_SHEETS.xlsx"
ls -lh "$DEST_DIR/EMSE_MASTER_ALL_SHEETS.xlsx"
echo "Open: $DEST_DIR/EMSE_MASTER_ALL_SHEETS.xlsx"
