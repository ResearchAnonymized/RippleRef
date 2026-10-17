#!/bin/bash
# Startup script for RefactAI Agents Service

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# SINGLE SOURCE OF TRUTH: agents/.env when that file exists (overrides inherited env).
# Otherwise OPENROUTER_API_KEY may come from the parent process (IDE/terminal) and skip .env —
# that caused "new key in .env" to be ignored while an old exported key was still used.
# File: agents/.env
# Content: OPENROUTER_API_KEY=sk-or-v1-...
#          OPENROUTER_MODEL=openai/gpt-5.5   (optional default for single-LLM runs)
ENV_FILE="$SCRIPT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
    # Load .env file (simple parsing; avoid spaces in values)
    export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs)
fi
if [ -z "$OPENROUTER_API_KEY" ]; then
    echo "======================================================================"
    echo "❌ ERROR: OPENROUTER_API_KEY not found!"
    echo "======================================================================"
    echo ""
    echo "📍 Paste your key in:"
    echo "   File: agents/.env"
    echo "   Full path: $ENV_FILE"
    echo ""
    echo "📝 Example:"
    echo "   OPENROUTER_API_KEY=sk-or-v1-YOUR-NEW-KEY-HERE"
    echo "   OPENROUTER_MODEL=openai/gpt-5.5"
    echo ""
    exit 1
fi

# Set defaults if not provided
export BACKEND_BASE="${BACKEND_BASE:-http://localhost:8083/api}"
export OPENROUTER_MODEL="${OPENROUTER_MODEL:-openai/gpt-5.5}"
export PORT="${PORT:-8091}"

echo "🚀 Starting RefactAI Agents Service..."
echo "   Port: $PORT"
echo "   Model: $OPENROUTER_MODEL"
echo "   Backend: $BACKEND_BASE"
echo "   OpenRouter Key: ${OPENROUTER_API_KEY:0:15}...${OPENROUTER_API_KEY: -4}"
echo ""

# Check if dependencies are installed
if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "📦 Installing dependencies..."
    pip install -r requirements.txt
fi

# Start the service
uvicorn main:app --host 0.0.0.0 --port "$PORT" --reload

