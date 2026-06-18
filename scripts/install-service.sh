#!/usr/bin/env bash
# Install the bridge as an always-on macOS background service (LaunchAgent),
# bullet-proofed against port conflicts.
#
#   bash scripts/install-service.sh            # install/update + start (does everything)
#   bash scripts/install-service.sh doctor     # show what's holding the ports + health
#   bash scripts/install-service.sh uninstall  # stop + remove
#
# What it does for you:
#   • stops any old/zombie bridge and frees the ports (killing the real LISTENER)
#   • if a port still can't be freed, automatically picks a free one instead
#   • builds + installs the service (starts on login, auto-restarts)
#   • rewrites your Claude Desktop + Antigravity MCP configs to match the port
set -euo pipefail

LABEL="com.claudeforpremiere.bridge"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRIDGE="$ROOT/bridge"
SCRIPTS="$ROOT/scripts"
LOG="$BRIDGE/.bridge.log"
UID_NUM="$(id -u)"

CLAUDE_CFG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
GEMINI_CFG="$HOME/.gemini/config/mcp_config.json"

# ── helpers ────────────────────────────────────────────────────────────────
unload() {
  launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null \
    || launchctl bootout "gui/$UID_NUM" "$PLIST" 2>/dev/null \
    || launchctl unload "$PLIST" 2>/dev/null || true
}

# PID(s) of whatever is *listening* on a port (not clients connected to it).
listener_pid() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null || true; }

kill_listener() {
  local pid
  pid="$(listener_pid "$1")"
  [ -n "$pid" ] && kill -9 $pid 2>/dev/null || true
}

report_ports() {
  local p
  for p in "$@"; do
    echo "  • port $p:"
    if [ -n "$(listener_pid "$p")" ]; then
      lsof -nP -iTCP:"$p" -sTCP:LISTEN 2>/dev/null | sed 's/^/      /'
    else
      echo "      (nothing listening)"
    fi
  done
}

# ── subcommands ────────────────────────────────────────────────────────────
case "${1:-install}" in
  uninstall)
    unload
    rm -f "$PLIST"
    echo "✓ bridge service removed."
    exit 0
    ;;
  doctor)
    echo "── Claude-for-Premiere doctor ──"
    echo "LaunchAgent:"
    launchctl list 2>/dev/null | grep -i claudeforpremiere | sed 's/^/  /' || echo "  (not loaded)"
    echo "Listeners:"
    report_ports 3030 3031 3040 3041 3050 3051 3060 3070
    echo "Health (trying common ports):"
    for hp in 3030 3040 3050 3060 3070; do
      r="$(curl -s "http://127.0.0.1:$hp/health" 2>/dev/null || true)"
      [ -n "$r" ] && echo "  :$hp → $r"
    done
    echo "Last log lines:"
    tail -n 15 "$LOG" 2>/dev/null | sed 's/^/  /' || echo "  (no log yet)"
    exit 0
    ;;
esac

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

# ── 1. stop anything old and free the ports ────────────────────────────────
echo "→ stopping any old bridge / crash-looping service..."
unload
pkill -f "src/index.ts" 2>/dev/null || true
pkill -f "dist/index.js" 2>/dev/null || true
for _ in 1 2 3 4 5 6; do
  kill_listener 3030
  kill_listener 3031
  sleep 0.4
  [ -z "$(listener_pid 3030)" ] && [ -z "$(listener_pid 3031)" ] && break
done

# ── 2. choose free ports (prefers the defaults; bumps only if still taken) ──
echo "→ choosing free ports..."
HTTP_PORT="$("$NODE_BIN" "$SCRIPTS/_pick-port.cjs" 3030 3040 3050 3060 3070 || true)"
WS_PORT="$("$NODE_BIN" "$SCRIPTS/_pick-port.cjs" 3031 3032 3033 3034 3035 3036 3037 3038 3039 3041 || true)"
if [ -z "$HTTP_PORT" ] || [ -z "$WS_PORT" ]; then
  echo "✗ Could not find a free port. Here's what's holding them:"
  report_ports 3030 3031 3040 3041 3050 3051 3060 3070
  echo "  Close whatever process is listed above, or tell me the output and I'll adjust."
  exit 1
fi
echo "  HTTP (MCP) port: $HTTP_PORT"
echo "  WS  (panel) port: $WS_PORT"

# ── 3. build ───────────────────────────────────────────────────────────────
echo "→ building the bridge..."
cd "$BRIDGE"
[ -d node_modules ] || npm install
npm run build

# ── 4. write the LaunchAgent (ports passed via the environment) ────────────
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
    <key>HTTP_PORT</key><string>$HTTP_PORT</string>
    <key>WS_PORT</key><string>$WS_PORT</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLISTEOF

# ── 5. load + verify ───────────────────────────────────────────────────────
echo "→ loading the service..."
: > "$LOG" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST" 2>/dev/null || launchctl load -w "$PLIST"

up=""
for _ in $(seq 1 40); do
  if curl -s "http://127.0.0.1:$HTTP_PORT/health" >/dev/null 2>&1; then up=1; break; fi
  sleep 0.5
done

if [ -z "$up" ]; then
  echo "✗ service did not become healthy. Diagnostics:"
  report_ports "$HTTP_PORT" "$WS_PORT"
  echo "  --- last log lines ---"
  tail -n 25 "$LOG" 2>/dev/null | sed 's/^/  /' || true
  unload   # don't leave a crash-looping agent behind
  exit 1
fi

# ── 6. point the MCP clients at the chosen port (merge, don't clobber) ──────
echo "-> updating MCP client configs to port ${HTTP_PORT} ..."
MCP_URL="http://127.0.0.1:${HTTP_PORT}/mcp"
"$NODE_BIN" "$SCRIPTS/_write-mcp.cjs" "$CLAUDE_CFG" "$MCP_URL" 2>/dev/null && echo "  ✓ Claude Desktop" || echo "  • Claude Desktop config not updated (skipped)"
"$NODE_BIN" "$SCRIPTS/_write-mcp.cjs" "$GEMINI_CFG" "$MCP_URL" 2>/dev/null && echo "  ✓ Antigravity (Gemini)" || echo "  • Antigravity config not updated (skipped)"

echo ""
echo "✓ ALL SET — the bridge service is running and will stay running (even after reboot)."
echo "  health:   $(curl -s "http://127.0.0.1:$HTTP_PORT/health")"
echo "  MCP URL:  $MCP_URL"
echo "  next:     1) restart Claude Desktop and Antigravity"
echo "            2) reopen the Claude panel in Premiere (it finds WS port $WS_PORT automatically)"
echo "            3) ask: \"Use the premiere tools to read my timeline.\""
echo "  doctor:   bash scripts/install-service.sh doctor"
echo "  remove:   bash scripts/install-service.sh uninstall"
