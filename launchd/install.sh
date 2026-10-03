#!/bin/bash
# Installs both LaunchAgents (server keep-alive + nightly trigger) and
# loads them. Run by hand when you're ready for this to run unattended —
# see README.md in this directory for why it's not loaded automatically.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$HOME/Library/LaunchAgents"
mkdir -p "$TARGET"

NPM_PATH="$(command -v npm)"
if [ -z "$NPM_PATH" ]; then
  echo "npm not found on PATH — install Node first." >&2
  exit 1
fi

for plist in com.readio.server.plist com.readio.nightly.plist; do
  # The committed plists use __READIO_DIR__/__NPM_PATH__ placeholders
  # (launchd runs with a minimal environment, so these need to be real
  # absolute paths, not relative or PATH-dependent) — substituted here
  # for wherever this repo actually is and whichever npm is on this
  # machine, rather than being hardcoded to one specific setup.
  sed -e "s#__READIO_DIR__#$DIR#g" -e "s#__NPM_PATH__#$NPM_PATH#g" \
    "$DIR/launchd/$plist" > "$TARGET/$plist"
  launchctl unload "$TARGET/$plist" 2>/dev/null || true
  launchctl load "$TARGET/$plist"
  echo "Loaded $plist"
done

launchctl list | grep readio || true
