#!/usr/bin/env bash

set -u

ports=(3000 3001 3002 3003 3004 3005 8123 8124 8125 8126)

kill_pids() {
  local pids="$1"
  if [ -n "$pids" ]; then
    echo "Killing PIDs: $pids"
    kill -9 $pids 2>/dev/null || true
  fi
}

kill_playwright_headless() {
  # Smoke scripts (and other test tooling) can leave headless Chromium running if interrupted.
  # Those stale processes may keep polling the dev server, making logs appear "busy" even when
  # you haven't manually opened the UI.
  local pids
  pids=$(ps -axo pid=,command= | awk '$0 ~ /chrome-headless-shell/ && $0 ~ /playwright_chromiumdev_profile/ {print $1}')
  kill_pids "$pids"
}

kill_ports() {
  if ! command -v lsof >/dev/null 2>&1; then
    echo "lsof not found; skipping port-based cleanup."
    return 0
  fi

  for port in "${ports[@]}"; do
    local pids
    pids=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)
    kill_pids "$pids"
  done
}

kill_langgraph() {
  local pids
  pids=$(ps -axo pid=,command= | awk -v p1="langgraph-api/dist/cli/entrypoint.mjs" -v p2="apps/(agent|agent-clmm|agent-pendle|agent-gmx-allora)" '$0 ~ p1 && $0 ~ p2 {print $1}')
  kill_pids "$pids"
}

kill_next_dev() {
  local pids
  pids=$(ps -axo pid=,command= | awk -v p1="apps/web" -v p2="next dev" '$0 ~ p1 && $0 ~ p2 {print $1}')
  kill_pids "$pids"
}

cleanup_state() {
  rm -rf apps/agent-clmm/.langgraph_api apps/agent/.langgraph_api apps/agent-pendle/.langgraph_api apps/agent-gmx-allora/.langgraph_api apps/web/.next/dev/lock
}

kill_ports
kill_langgraph
kill_next_dev
kill_playwright_headless
cleanup_state

exit 0
