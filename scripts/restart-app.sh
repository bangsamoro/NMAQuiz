#!/usr/bin/env bash
# Restarts the app's Node process on the server. Run from the app root
# (deploy.sh does: cd "$DEPLOY_PATH" && bash scripts/restart-app.sh).
#
# There is NO supervisor for this process — confirmed on 2026-08-21: no
# systemd unit, no cron @reboot entry, no PM2 process, no Passenger (the
# app was never registered through Webuzo's Application Manager — "No
# application exist" there). It's a bare `node server.js` someone started
# by hand at some point and left running. Apache proxies to it via a
# hand-written .htaccess (see server-htaccess.reference in the repo root)
# — that's routing only, it has no idea whether the Node process behind it
# is even alive, let alone running current code.
#
# Practically: a deploy that only replaces files on disk does NOT update
# the running app — Node doesn't hot-reload, and without this script the
# old process just keeps serving whatever was loaded at its last manual
# start indefinitely (this happened for real: files were updated hours
# before the process was actually restarted).
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="$(grep '^PORT=' .env | cut -d= -f2 | tr -d '[:space:]')"
if [ -z "$PORT" ]; then
  echo "!! Could not read PORT from .env" >&2
  exit 1
fi

OLD_PID="$(lsof -ti ":$PORT" 2>/dev/null || true)"
if [ -n "$OLD_PID" ]; then
  echo "Stopping old process (PID $OLD_PID) on port $PORT"
  kill "$OLD_PID"
  sleep 1
fi

echo "Starting new process"
nohup node server.js >> app.log 2>&1 &
disown
sleep 1

NEW_PID="$(lsof -ti ":$PORT" 2>/dev/null || true)"
if [ -z "$NEW_PID" ]; then
  echo "!! New process isn't listening on port $PORT — check app.log" >&2
  exit 1
fi
echo "Running as PID $NEW_PID"
