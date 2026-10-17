#!/usr/bin/env bash
# Overnight EMSE recovery: bootstrap → restore Desktop → fan-in → Qwen rerun → export.
# Logs: .run/emse-overnight-recovery.log
# Status: .run/emse-overnight-status.md
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/.run/emse-overnight-recovery.log"
STATUS="$ROOT/.run/emse-overnight-status.md"
# shellcheck disable=SC1091
source "$ROOT/scripts/ripple-ref-lib.sh"

export REFACTAI_WORKSPACE_TEMP_DIR="${REFACTAI_WORKSPACE_TEMP_DIR:-$HOME/.refactai/workspaces}"
export EMSE_STUDY_BASE="${EMSE_STUDY_BASE:-$REFACTAI_WORKSPACE_TEMP_DIR/ripple_study_runs}"
export EMSE_DESKTOP_DIR="${EMSE_DESKTOP_DIR:-$HOME/Desktop/EMSE-data/EMSE_Master}"
export EMSE_DATA_SRC="${EMSE_DATA_SRC:-$HOME/Desktop/EMSE-data}"

exec >>"$LOG" 2>&1
echo ""
echo "======== $(date -u +%Y-%m-%dT%H:%M:%SZ) EMSE overnight recovery ========"

ripple_ref_load_ports

write_status() {
  echo "$1" >>"$STATUS"
}

: >"$STATUS"
write_status "# EMSE overnight recovery"
write_status ""
write_status "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
write_status ""

study_dir() {
  curl -sf "$API/ripple-ref/studies/ripple_ref_master/export-info" 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('studyDir',''))" 2>/dev/null || true
}

scan_count() {
  local dir
  dir=$(study_dir)
  if [ -n "$dir" ] && [ -d "$dir/repository_profiles" ]; then
    ls "$dir/repository_profiles" 2>/dev/null | wc -l | tr -d ' '
  else
    echo 0
  fi
}

wait_for_bootstrap() {
  echo "--- Phase 0: wait for in-flight bootstrap ---"
  local pid
  pid=$(pgrep -f "bootstrap-ripple-ref-from-cohort.sh" | head -1 || true)
  if [ -n "$pid" ]; then
    echo "Waiting for bootstrap PID $pid ..."
    local i=0
    while kill -0 "$pid" 2>/dev/null; do
      i=$((i + 1))
      echo "[$(date -u +%H:%M:%S)] bootstrap running scans=$(scan_count)/15"
      sleep 60
      if [ "$i" -ge 120 ]; then
        echo "WARN: bootstrap >120 min; continuing monitor"
      fi
    done
    echo "Bootstrap process exited"
  fi
}

ensure_bootstrap() {
  echo "--- Phase 1: ensure bootstrap complete ---"
  local n
  n=$(scan_count)
  if [ "$n" -lt 15 ]; then
    echo "Scans=$n/15 — running bootstrap"
    bash "$ROOT/scripts/bootstrap-ripple-ref-from-cohort.sh" || true
  fi
  n=$(scan_count)
  write_status "- Bootstrap scans: **$n/15**"
  if [ "$n" -lt 15 ]; then
    write_status "- Bootstrap: **INCOMPLETE** (see log)"
    return 1
  fi
  write_status "- Bootstrap: **OK**"
}

restore_desktop() {
  echo "--- Phase 2: restore Desktop EMSE-data ---"
  if bash "$ROOT/scripts/restore-emse-data-from-desktop.sh" "$EMSE_DATA_SRC"; then
    write_status "- Desktop restore: **OK** → $EMSE_STUDY_BASE"
  else
    write_status "- Desktop restore: **FAILED or partial** (macOS privacy? run manually)"
  fi
}

merge_restored_csvs() {
  echo "--- Phase 3: merge restored CSVs into active study ---"
  local active
  active=$(study_dir)
  [ -n "$active" ] || return 0
  mkdir -p "$EMSE_STUDY_BASE/ripple_ref_master" "$EMSE_STUDY_BASE/ma_ref_master"
  for study in ripple_ref_master ma_ref_master; do
    local src="$EMSE_STUDY_BASE/$study/results_candidates.csv"
    local dst="$EMSE_STUDY_BASE/$study/results_candidates.csv"
    if [ "$study" = "ripple_ref_master" ] && [ -n "$active" ]; then
      dst="$active/results_candidates.csv"
    fi
    if [ -f "$src" ]; then
      local src_lines=0 dst_lines=0
      src_lines=$(wc -l < "$src" | tr -d ' ')
      if [ -f "$dst" ]; then dst_lines=$(wc -l < "$dst" | tr -d ' '); fi
      if [ "$src_lines" -gt "$dst_lines" ]; then
        mkdir -p "$(dirname "$dst")"
        cp "$src" "$dst"
        echo "Merged $study CSV ($src_lines lines) -> $dst"
      fi
    fi
  done
  if [ -n "$active" ] && [ -d "$active" ]; then
    rsync -a "$active/" "$EMSE_STUDY_BASE/ripple_ref_master/" || true
    echo "Synced active study -> $EMSE_STUDY_BASE/ripple_ref_master"
  fi
  if [ -f "$EMSE_STUDY_BASE/ma_ref_master/results_candidates.csv" ]; then
    write_status "- MA CSV restored: **$(wc -l < "$EMSE_STUDY_BASE/ma_ref_master/results_candidates.csv" | tr -d ' ') rows**"
  fi
  if [ -f "$EMSE_STUDY_BASE/ripple_ref_master/results_candidates.csv" ]; then
    write_status "- B0 CSV restored: **$(wc -l < "$EMSE_STUDY_BASE/ripple_ref_master/results_candidates.csv" | tr -d ' ') rows**"
  fi
}

collect_fan_in() {
  echo "--- Phase 4: fan-in for 150 files ---"
  export EMSE_STUDY_BASE
  if python3 "$ROOT/scripts/collect-fan-in-for-cohort.py" ripple_ref_master; then
    write_status "- Fan-in collection: **OK** (.run/shared_cohort/fan_in_exposure.csv)"
  else
    write_status "- Fan-in collection: **FAILED**"
    return 1
  fi
}

rerun_qwen() {
  echo "--- Phase 5: Qwen B0-V2 rerun (150) ---"
  export EMSE_STUDY_BASE
  if bash "$ROOT/scripts/rerun-qwen-b0-v2-only.sh"; then
    write_status "- Qwen B0-V2 rerun: **OK**"
  else
    write_status "- Qwen B0-V2 rerun: **FAILED or partial**"
  fi
  python3 "$ROOT/scripts/diagnose-qwen-b0-failures.py" 2>&1 | tail -20 || true
}

enrich_and_export() {
  echo "--- Phase 6: enrich + Excel export ---"
  export EMSE_STUDY_BASE EMSE_DESKTOP_DIR
  python3 "$ROOT/scripts/enrich-ripple-study-csv-from-artifacts.py" ripple_ref_master || true
  if [ -f "$EMSE_STUDY_BASE/ma_ref_master/results_candidates.csv" ]; then
    python3 "$ROOT/scripts/enrich-ripple-study-csv-from-artifacts.py" ma_ref_master || true
  fi
  if bash "$ROOT/scripts/export-emse-ripple-master-excel.sh"; then
    local dest="$EMSE_DESKTOP_DIR/EMSE_MASTER_ALL_SHEETS.xlsx"
    write_status "- Excel export: **OK** → $dest"
    ls -lh "$dest" 2>/dev/null || true
  else
    write_status "- Excel export: **FAILED**"
  fi
}

finalize() {
  write_status ""
  write_status "Finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  write_status ""
  write_status "## Outputs"
  write_status "- Log: \`.run/emse-overnight-recovery.log\`"
  write_status "- Workbook: \`$EMSE_DESKTOP_DIR/EMSE_MASTER_ALL_SHEETS.xlsx\`"
  write_status "- Fan-in: \`.run/shared_cohort/fan_in_exposure.csv\`"
  write_status "- Study: \`$EMSE_STUDY_BASE\`"
  echo "=== Overnight recovery complete ==="
}

main() {
  ripple_ref_health_check || {
    echo "Starting services..."
    bash "$ROOT/start_daemon.sh" restart
    sleep 10
    ripple_ref_health_check
  }

  wait_for_bootstrap
  ensure_bootstrap || true
  restore_desktop || true
  merge_restored_csvs || true
  collect_fan_in || true
  rerun_qwen || true
  enrich_and_export || true
  finalize
}

main "$@"
