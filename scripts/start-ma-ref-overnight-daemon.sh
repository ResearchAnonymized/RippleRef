#!/usr/bin/env bash
# Launch MA-REF supervisor (all 15 systems, auto-restart until 750/750).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIDFILE="$ROOT/.run/ma-ref-master-overnight.pid"
NOHUP="$ROOT/.run/ma-ref-master-supervisor.nohup"
WRAPPER="$ROOT/scripts/run-ma-ref-master-supervisor-wrapper.sh"

if [ -f "$PIDFILE" ]; then
  old="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [ -n "$old" ] && kill -0 "$old" 2>/dev/null; then
    echo "Supervisor already running (PID $old)"
    exit 0
  fi
fi

run_detached() {
  local logfile="$1"
  shift
  local detach="$ROOT/scripts/detach_daemon.py"
  if [ -f "$detach" ]; then
    python3 "$detach" "$logfile" -- "$@" >/dev/null 2>&1 && return 0
  fi
  nohup "$@" </dev/null >>"$logfile" 2>&1 &
  disown -h 2>/dev/null || disown 2>/dev/null || true
}

run_detached "$NOHUP" bash "$WRAPPER"
sleep 3
if [ -f "$PIDFILE" ]; then
  pid="$(cat "$PIDFILE")"
  echo "MA-REF pipeline wrapper PID $pid"
  kill -0 "$pid" 2>/dev/null && echo "  status: running" || echo "  status: starting (check $NOHUP)"
else
  echo "WARN: PID file not created yet — check $NOHUP"
fi
echo "  Sequential systems: 1 → 15 (50 candidates each)"
echo "  Logs: .run/ma-ref-master-overnight.log"
echo "  Supervisor: .run/ma-ref-master-supervisor.log"
echo "  Monitor: tail -f .run/ma-ref-master-overnight.log"
