#!/bin/bash
# Unloads and removes both LaunchAgents.
set -euo pipefail

TARGET="$HOME/Library/LaunchAgents"

for plist in com.readio.server.plist com.readio.nightly.plist; do
  launchctl unload "$TARGET/$plist" 2>/dev/null || true
  rm -f "$TARGET/$plist"
  echo "Removed $plist"
done
