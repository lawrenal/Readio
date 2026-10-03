#!/bin/bash
# Triggers tonight's episode generation against the running server.
# Invoked by launchd (see launchd/com.readio.nightly.plist) — logs to
# data/logs/nightly.log so failures are visible after the fact rather than
# vanishing into a background process nobody watches.

set -euo pipefail

SERVER_URL="${READIO_SERVER_URL:-http://localhost:3000}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_DIR/data/logs"
mkdir -p "$LOG_DIR"

{
  echo "=== $(date -Iseconds) ==="
  curl -sS -X POST "$SERVER_URL/api/episodes/generate" \
    -H "Content-Type: application/json" \
    -w "\nHTTP %{http_code}\n"
} >> "$LOG_DIR/nightly.log" 2>&1
