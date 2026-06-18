#!/usr/bin/env bash
# Install the "Claude for Premiere" CEP panel on macOS.
#   ./scripts/install-panel.sh           # symlink the panel (live edits) + enable unsigned
#   ./scripts/install-panel.sh --copy    # copy instead of symlink
#
# After running: restart Premiere → Window → Extensions → Claude for Premiere.
set -euo pipefail

EXT_ID="com.claudeforpremiere.panel"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PANEL_SRC="$HERE/panel"
MODE="symlink"
[ "${1:-}" = "--copy" ] && MODE="copy"

OS="$(uname -s)"
if [ "$OS" != "Darwin" ]; then
  echo "This installer is for macOS. On Windows use scripts/install-panel.ps1."
  echo "(Detected: $OS — no Adobe Premiere CEP path here.)"
  exit 1
fi

if [ ! -d "$PANEL_SRC" ]; then
  echo "✗ panel/ not found at $PANEL_SRC"; exit 1
fi

echo "→ Enabling unsigned CEP extensions (PlayerDebugMode) for CSXS 6–12…"
for v in 6 7 8 9 10 11 12; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1 2>/dev/null || true
done

EXT_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
mkdir -p "$EXT_DIR"
DEST="$EXT_DIR/$EXT_ID"

echo "→ Installing panel into: $DEST  ($MODE)"
rm -rf "$DEST"
if [ "$MODE" = "symlink" ]; then
  ln -s "$PANEL_SRC" "$DEST"
else
  cp -R "$PANEL_SRC" "$DEST"
fi

echo ""
echo "✓ Panel installed."
echo "  1. Start the bridge:   cd bridge && npm install && npm run dev"
echo "  2. Restart Premiere Pro."
echo "  3. Window → Extensions → Claude for Premiere."
echo ""
echo "  (Debug the panel UI at http://localhost:8088 in Chrome.)"
