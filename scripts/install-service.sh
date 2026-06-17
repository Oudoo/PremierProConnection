#!/usr/bin/env bash
# Install the bridge as an always-on macOS background service (LaunchAgent).
# After this, the bridge starts on login, stays running, and auto-restarts if
# it crashes — so the MCP endpoint at http://127.0.0.1:3030/mcp is always up.
# No terminal to babysit.
#
#   bash scripts/install-service.sh            # install/update + start
#   bash scripts/install-service.sh uninstall  # stop + remove
set -euo pipefail

LABEL="com.claudeforpremiere.bridge"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRIDGE="$ROOT/bridge"
LOG="$BRIDGE/.bridge.log"
UID_NUM="$(id -u)"

unload() {
  launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null \
    || launchctl unload "$PLIST" 2>/dev/null || true
}

if [ "${1:-}" = "uninstall" ]; then
  unload
  rm -f "$PLIST"
  echo "✓ bridge service removed."
  exit 0
fi

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This service installer is macOS-only. On other systems use scripts/bridge.sh."
  exit 1
fi

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "✗ Node.js not found. Install it (e.g. 'brew install node') and retry."
  exit 1
fi
NODE_DIR="$(dirname "$NODE_BIN")"

echo "→ building the bridge…"
cd "$BRIDGE"
[ -d node_modules ] || npm install
npm run build

echo "→ writing LaunchAgent: $PLIST"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$BRIDGE/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key><string>$BRIDGE</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$NODE_DIR:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLISTEOF

echo "→ stopping any old bridge / crash-looping service so the ports are free…"
unload                                   # stop an old/looping agent first (no respawn)
pkill -f "src/index.ts" 2>/dev/null || true
pkill -f "dist/index.js" 2>/dev/null || true
for p in 3030 3031; do                   # the reliable part: kill whatever holds the port
  pids="$(lsof -ti tcp:"$p" 2>/dev/null || true)"
  [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
done
sleep 1

echo "→ loading the service…"
launchctl bootstrap "gui/$UID_NUM" "$PLIST" 2>/dev/null || launchctl load -w "$PLIST"

up=""
for _ in $(seq 1 40); do
  if curl -s "http://127.0.0.1:3030/health" >/dev/null 2>&1; then up=1; break; fi
  sleep 0.5
done

if [ -n "$up" ]; then
  echo ""
  echo "✓ bridge service running — and it will stay running (even after reboot)."
  echo "  health:  $(curl -s http://127.0.0.1:3030/health)"
  echo "  MCP URL: http://127.0.0.1:3030/mcp"
  echo "  logs:    tail -f \"$LOG\""
  echo "  update:  re-run this script after a git pull (it rebuilds + reloads)"
  echo "  remove:  bash scripts/install-service.sh uninstall"
else
  echo "✗ service did not become healthy. Last log lines:"
  tail -n 25 "$LOG" 2>/dev/null || true
  exit 1
fi
