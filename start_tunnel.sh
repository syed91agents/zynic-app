#!/usr/bin/env bash
# ============================================================
# Zynic — Start Server + Cloudflare Quick Tunnel
# ============================================================
# This script:
#   1. Starts the Python backend on port 8000 (if not already running)
#   2. Opens a Cloudflare Quick Tunnel (no account needed)
#      and prints the public *.trycloudflare.com URL
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8000
PYTHON_PID=""
TUNNEL_PID=""
TUNNEL_LOG="${SCRIPT_DIR}/cf_tunnel.log"

cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    [[ -n "$TUNNEL_PID" ]] && kill "$TUNNEL_PID" 2>/dev/null && echo "   Cloudflare tunnel closed."
    [[ -n "$PYTHON_PID" ]] && kill "$PYTHON_PID" 2>/dev/null && echo "   Python server stopped."
    rm -f "$TUNNEL_LOG"
    exit 0
}
trap cleanup INT TERM

# ── 1. Start Python server if not already running ──────────
if lsof -ti tcp:"$PORT" > /dev/null 2>&1; then
    echo "✅ Server already running on port $PORT"
else
    echo "🐍 Starting Zynic API server on port $PORT..."
    python3 "$SCRIPT_DIR/server.py" &
    PYTHON_PID=$!
    sleep 2
    if ! kill -0 "$PYTHON_PID" 2>/dev/null; then
        echo "❌ Python server failed to start."
        exit 1
    fi
    echo "✅ Server running (PID $PYTHON_PID)"
fi

# ── 2. Start Cloudflare Quick Tunnel ───────────────────────
echo ""
echo "🌐 Opening Cloudflare Tunnel to http://localhost:$PORT ..."
cloudflared tunnel --url "http://localhost:$PORT" > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

# Wait for URL to appear in log
echo "   Waiting for public URL..."
for i in $(seq 1 30); do
    URL=$(grep -oE 'https://[a-z0-9\-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1)
    if [[ -n "$URL" ]]; then
        echo ""
        echo "  ┌─────────────────────────────────────────────────────────┐"
        echo "  │  🎵  Zynic is LIVE on Cloudflare!                       │"
        printf "  │  👉  %-52s│\n" "$URL"
        echo "  └─────────────────────────────────────────────────────────┘"
        echo ""
        break
    fi
    sleep 1
done

if [[ -z "$URL" ]]; then
    echo "⚠️  Could not detect tunnel URL. Check the log: $TUNNEL_LOG"
fi

echo "Press Ctrl+C to stop the tunnel."
wait "$TUNNEL_PID"
