#!/bin/bash
# Startup script for RippleREF Agents Service (FastAPI + LangGraph)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# SINGLE SOURCE OF TRUTH: agents/.env when that file exists (overrides inherited env).
ENV_FILE="$SCRIPT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi
if [ -z "${OPENROUTER_API_KEY:-}" ]; then
    echo "======================================================================"
    echo "ERROR: OPENROUTER_API_KEY not found!"
    echo "======================================================================"
    echo ""
    echo "Paste your key in: $ENV_FILE"
    echo "  OPENROUTER_API_KEY=sk-or-v1-YOUR-NEW-KEY-HERE"
    echo "  OPENROUTER_MODEL=openai/gpt-5.5"
    echo "  MULTI_LLM_AGENT_MODE=full"
    echo "  REFACTOR_ORCHESTRATOR=langgraph"
    echo ""
    exit 1
fi

# Defaults for a real multi-agent LangGraph stack
export BACKEND_BASE="${BACKEND_BASE:-http://localhost:8083/api}"
export OPENROUTER_MODEL="${OPENROUTER_MODEL:-openai/gpt-5.5}"
export PORT="${PORT:-8091}"
export MULTI_LLM_AGENT_MODE="${MULTI_LLM_AGENT_MODE:-full}"
export REFACTOR_ORCHESTRATOR="${REFACTOR_ORCHESTRATOR:-langgraph}"
export MA_MAX_REVISE_LOOPS="${MA_MAX_REVISE_LOOPS:-2}"

# Prefer local venv (never pip-install into the system interpreter)
if [ ! -x "$SCRIPT_DIR/.venv/bin/python" ]; then
    echo "Creating agents/.venv ..."
    python3 -m venv "$SCRIPT_DIR/.venv"
    "$SCRIPT_DIR/.venv/bin/pip" install -r "$SCRIPT_DIR/requirements.txt"
fi
PYTHON="$SCRIPT_DIR/.venv/bin/python"
PIP="$SCRIPT_DIR/.venv/bin/pip"
if ! "$PYTHON" -c "import fastapi, langgraph, uvicorn" 2>/dev/null; then
    echo "Installing agents dependencies into .venv ..."
    "$PIP" install -r "$SCRIPT_DIR/requirements.txt"
fi

echo "Starting RippleREF Agents Service..."
echo "   Port: $PORT"
echo "   Model: $OPENROUTER_MODEL"
echo "   Backend: $BACKEND_BASE"
echo "   Orchestrator: $REFACTOR_ORCHESTRATOR"
echo "   Multi-LLM agents: $MULTI_LLM_AGENT_MODE"
echo "   OpenRouter Key: ${OPENROUTER_API_KEY:0:15}...${OPENROUTER_API_KEY: -4}"
echo ""

exec "$SCRIPT_DIR/.venv/bin/uvicorn" main:app --host 0.0.0.0 --port "$PORT" --reload
