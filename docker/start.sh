#!/usr/bin/env bash
# Start the engine and the app, and keep them alive together.
#
# This mirrors scripts/dev.mjs deliberately: one half of the stack dying leaves
# the other in a state that only looks like it works — the UI comes up, every
# panel sits on "Computing city intelligence…", and it reads as a frontend bug
# rather than a dead backend. So if either process exits, take both down and
# let the platform restart the container.
set -uo pipefail

PORT="${PORT:-7860}"
HOST="${HOST:-0.0.0.0}"
ENGINE_PORT="${ENGINE_PORT:-8000}"

echo "UrbanLens — engine :${ENGINE_PORT} · app :${PORT}"

# The engine binds loopback only. It is reached through the Next rewrite, and
# a Space exposes a single port, so there is nothing to gain from listening on
# every interface and one fewer surface if the platform ever exposes more.
python -m uvicorn app.main:app \
  --app-dir backend \
  --host 127.0.0.1 \
  --port "${ENGINE_PORT}" &
ENGINE_PID=$!

npm run start --prefix web -- --hostname "${HOST}" --port "${PORT}" &
WEB_PID=$!

shutdown() {
  trap - TERM INT
  kill "${ENGINE_PID}" "${WEB_PID}" 2>/dev/null
  wait "${ENGINE_PID}" "${WEB_PID}" 2>/dev/null
  exit 0
}
trap shutdown TERM INT

# wait -n returns as soon as *either* child exits, which is the signal we want.
wait -n "${ENGINE_PID}" "${WEB_PID}"
CODE=$?
echo "a process exited (${CODE}) — stopping the other"
kill "${ENGINE_PID}" "${WEB_PID}" 2>/dev/null
exit "${CODE}"
