#!/bin/bash
# Token Universe — UserPromptSubmit hook.
#
# Runs every time you submit a prompt in Claude Code. It:
#   1. starts the Token Universe server if it isn't already running
#   2. opens the universe page in your browser — but ONLY if no page
#      is currently open (so you don't get a new tab on every prompt)
#
# Everything runs in the background and always exits 0, so it can never
# slow down or block your actual prompt.

PORT=4816
DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Claude passes hook context as JSON on stdin; grab the session id.
INPUT=$(cat)
SESSION_ID=$(printf '%s' "$INPUT" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

(
  ping() { curl -s -m 1 "http://localhost:$PORT/api/ping" 2>/dev/null; }

  if [ -z "$(ping)" ]; then
    nohup /usr/bin/env node "$DIR/server.js" >> "$DIR/server.log" 2>&1 &
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
      [ -n "$(ping)" ] && break
      sleep 0.25
    done
  fi

  CLIENTS=$(ping | sed -n 's/.*"clients"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p')
  if [ "$CLIENTS" = "0" ]; then
    open "http://localhost:$PORT/?session=$SESSION_ID"
  fi
) >/dev/null 2>&1 &

exit 0
