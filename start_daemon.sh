#!/usr/bin/env bash
# Lightweight process helper for RippleREF local development.
# Full study overnight daemons live under scripts/; this covers day-to-day start/status.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$ROOT/ports.env" 2>/dev/null || true
BACKEND_PORT="${BACKEND_PORT:-8083}"
AGENTS_PORT="${AGENTS_PORT:-8091}"
FRONTEND_PORT="${FRONTEND_PORT:-3001}"

AGENTS_PID_FILE="$ROOT/.run/agents.pid"
BACKEND_PID_FILE="$ROOT/.run/backend.pid"
mkdir -p "$ROOT/.run"

usage() {
  cat <<EOF
Usage: ./start_daemon.sh <start|stop|restart|status>

  start    Start Python agents (port ${AGENTS_PORT}); print how to start API + UI
  stop     Stop agents started by this script
  restart  stop + start
  status   Health-check backend :${BACKEND_PORT} and agents :${AGENTS_PORT}

Canonical ports: see ports.env (API ${BACKEND_PORT}, agents ${AGENTS_PORT}, UI ${FRONTEND_PORT}).
EOF
}

agents_running() {
  curl -sf "http://127.0.0.1:${AGENTS_PORT}/agents/health" >/dev/null 2>&1 \
    || curl -sf "http://127.0.0.1:${AGENTS_PORT}/health" >/dev/null 2>&1
}

backend_running() {
  curl -sf "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1
}

cmd_status() {
  if backend_running; then
    echo "OK  backend  http://127.0.0.1:${BACKEND_PORT}/api/health"
  else
    echo "DOWN backend http://127.0.0.1:${BACKEND_PORT} — build/run Spring Boot (see wiki/Setup.md)"
  fi
  if agents_running; then
    echo "OK  agents   http://127.0.0.1:${AGENTS_PORT}"
  else
    echo "DOWN agents  http://127.0.0.1:${AGENTS_PORT} — run: ./start_daemon.sh start"
  fi
}

cmd_stop() {
  if [ -f "$AGENTS_PID_FILE" ]; then
    pid="$(cat "$AGENTS_PID_FILE" 2>/dev/null || true)"
    if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
      echo "Stopped agents (pid $pid)"
    fi
    rm -f "$AGENTS_PID_FILE"
  else
    echo "No agents pid file (nothing to stop via this script)"
  fi
}

cmd_start() {
  if [ ! -f "$ROOT/agents/.env" ]; then
    echo "Missing agents/.env — copy agents/.env.example and set OPENROUTER_API_KEY"
    exit 1
  fi
  if agents_running; then
    echo "Agents already healthy on :${AGENTS_PORT}"
    return 0
  fi
  echo "Starting agents on :${AGENTS_PORT} ..."
  (
    cd "$ROOT/agents"
    export PORT="${AGENTS_PORT}"
    export BACKEND_BASE="http://localhost:${BACKEND_PORT}/api"
    nohup ./start.sh >"$ROOT/.run/agents.log" 2>&1 &
    echo $! >"$AGENTS_PID_FILE"
  )
  sleep 2
  if agents_running; then
    echo "Agents up — log: $ROOT/.run/agents.log"
  else
    echo "Agents starting — check $ROOT/.run/agents.log"
  fi
  cat <<EOF

Next (separate terminals if not already running):
  # API
  cd backend && mvn -pl server -am package -DskipTests
  # then run ai.refact.server.RefactAIServerApplication (port ${BACKEND_PORT})

  # UI
  cd web/app && npm install
  NEXT_PUBLIC_ENABLE_RIPPLE_REF_STUDY=1 NEXT_PUBLIC_API_PORT=${BACKEND_PORT} \\
    NEXT_PUBLIC_AGENTS_PORT=${AGENTS_PORT} npm run dev
  # → http://localhost:${FRONTEND_PORT}
EOF
}

case "${1:-}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  restart) cmd_stop; cmd_start ;;
  status) cmd_status ;;
  *) usage; exit 1 ;;
esac
