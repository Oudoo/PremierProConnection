#!/usr/bin/env bash
# One command to run (or stop) the Claude-for-Premiere bridge.
#
#   bash scripts/bridge.sh          # (re)start the bridge in the background
#   bash scripts/bridge.sh stop     # stop it
#   bash scripts/bridge.sh logs     # follow the log
#
# This kills any old/zombie bridge first (the dev file-watcher can leave one
# holding the port), so it's always safe to just run it again.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRIDGE="$ROOT/bridge"
LOG="$BRIDGE/.bridge.log"
HTTP_PORT=3030
WS_PORT=3031

stop_bridge() {
  # Kill any process running the bridge (dev watcher or plain run) ...
  pkill -f "src/index.ts" 2>/dev/null || true
  pkill -f "dist/index.js" 2>/dev/null || true
  # ... and anything still holding the ports.
  for p in "$HTTP_PORT" "$WS_PORT"; do
    pids="$(lsof -ti tcp:"$p" 2>/dev/null || true)"
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  done
}

case "${1:-start}" in
  stop)
    stop_bridge
    echo "✓ bridge stopped"
    exit 0
    ;;
  logs)
    tail -f "$LOG"
    exit 0
    ;;
esac

echo "→ stopping any running bridge..."
stop_bridge
sleep 1

cd "$BRIDGE"
[ -d node_modules ] || { echo "→ installing dependencies..."; npm install; }

echo "→ starting bridge in the background..."
nohup npx tsx src/index.ts > "$LOG" 2>&1 &

# Poll for readiness (cold tsx start can take several seconds).
up=""
for _ in $(seq 1 40); do
  if curl -s "http://127.0.0.1:$HTTP_PORT/health" >/dev/null 2>&1; then up=1; break; fi
  sleep 0.5
done

if [ -n "$up" ]; then
  echo ""
  echo "✓ bridge running."
  echo "  health:   $(curl -s "http://127.0.0.1:$HTTP_PORT/health")"
  echo "  MCP URL:  http://127.0.0.1:$HTTP_PORT/mcp   (point Claude Desktop / Antigravity here)"
  echo "  logs:     bash scripts/bridge.sh logs"
  echo "  stop:     bash scripts/bridge.sh stop"
  echo ""
  echo "  You can close this terminal — the bridge keeps running."
else
  echo "✗ bridge did not come up. Last log lines:"
  tail -n 25 "$LOG" 2>/dev/null || true
  exit 1
fi
