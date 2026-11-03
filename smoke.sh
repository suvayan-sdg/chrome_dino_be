#!/usr/bin/env bash
set -euo pipefail

echo "== Dino Race server smoke =="

# Start the server in the background (requires MONGO_URI in .env or env).
if [ -z "${MONGO_URI:-}" ]; then
  echo "SKIP: MONGO_URI not set. Configure .env first."
  exit 0
fi

echo "Starting server on port ${PORT:-4000}..."
npm run dev > /tmp/dino-server.log 2>&1 &
SERVER_PID=$!

# Wait for the health endpoint to respond.
for i in $(seq 1 20); do
  if curl -fsS http://localhost:${PORT:-4000}/health > /dev/null 2>&1; then
    echo "Server is up."
    break
  fi
  sleep 0.5
done

echo "Health check:"
curl -fsS http://localhost:${PORT:-4000}/health
echo

echo "Root:"
curl -fsS http://localhost:${PORT:-4000}/
echo

# Cleanup.
if kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "Stopping server PID $SERVER_PID..."
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
fi
