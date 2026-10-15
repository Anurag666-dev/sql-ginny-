#!/usr/bin/env bash
# ==============================================================================
# SQL Ginny - Service Launcher Script
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=========================================================="
echo "                   SQL GINNY LAUNCHER                     "
echo "=========================================================="

# Check if Docker compose is available and accessible
if docker info >/dev/null 2>&1; then
    echo "[Docker] Starting database services (Postgres, Mongo, Redis, Memgraph, LibreChat)..."
    docker compose up -d postgres mongo redis memgraph librechat
else
    echo "[Notice] Docker daemon requires sudo or permissions on /var/run/docker.sock"
    echo "         To launch docker services, run: sudo docker compose up -d"
fi

# Start Backend if not already running on port 8000
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null ; then
    echo "[✓] Backend is already active on http://localhost:8000"
else
    echo "[*] Launching Backend FastAPI + FastMCP on port 8000..."
    cd "${DIR}/backend"
    nohup ./venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &
    sleep 2
    echo "[✓] Backend started. Logs: backend/backend.log"
fi

# Start Frontend if not already running on port 5173 or 5174
if lsof -Pi :5174 -sTCP:LISTEN -t >/dev/null || lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null ; then
    echo "[✓] Frontend is already active."
else
    echo "[*] Launching Frontend on port 5174..."
    cd "${DIR}/frontend"
    nohup npm run dev -- --port 5174 > frontend.log 2>&1 &
    sleep 2
    echo "[✓] Frontend started. Logs: frontend/frontend.log"
fi

echo "=========================================================="
echo " SQL Ginny is Live:"
echo "   - Frontend UI:             http://localhost:5174"
echo "   - Backend API & Docs:      http://localhost:8000/docs"
echo "   - FastMCP Streamable HTTP: http://localhost:8000/mcp"
echo "   - FastMCP SSE Transport:   http://localhost:8000/sse"
echo "   - LibreChat UI:            http://localhost:3080"
echo "=========================================================="
