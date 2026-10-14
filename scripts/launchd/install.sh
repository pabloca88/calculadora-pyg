#!/usr/bin/env bash
# Installs the launchd agent that runs scripts/push-chaco.ts every 30 min,
# Mon–Sat 08:00–19:00 (local time; the Mac is expected to be on UTC-3, same
# as Paraguay). Fills calpyg.chaco.plist.template with this machine's paths.
#
# Usage: scripts/launchd/install.sh [label]   (default label: com.calpyg.chaco)
set -euo pipefail

LABEL="${1:-com.calpyg.chaco}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
NODE="$(command -v node)"
NODE_DIR="$(dirname "$NODE")"
LOG="$HOME/Library/Logs/calculadora-pyg-chaco.log"
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ ! -f "$REPO/.env.local" ] || ! grep -q '^PUSH_TOKEN=' "$REPO/.env.local"; then
  echo "error: $REPO/.env.local must define PUSH_TOKEN" >&2
  exit 1
fi

sed -e "s|__LABEL__|$LABEL|g" \
    -e "s|__NODE__|$NODE|g" \
    -e "s|__NODE_DIR__|$NODE_DIR|g" \
    -e "s|__REPO__|$REPO|g" \
    -e "s|__LOG__|$LOG|g" \
    "$REPO/scripts/launchd/calpyg.chaco.plist.template" > "$DEST"
plutil -lint "$DEST"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST"
echo "installed $LABEL → $DEST (log: $LOG)"
