#!/usr/bin/env bash

set -u

ports=(3000 3001 3002 3003 3004 3005 8123 8124 8125 8126)

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

kill_pids() {
  local pids="$1"
  if [ -n "$pids" ]; then
    echo "Killing PIDs: $pids"
    kill -9 $pids 2>/dev/null || true
  fi
}

pid_cwd() {
  local pid="$1"
  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi
  lsof -p "$pid" 2>/dev/null | awk '$4=="cwd" {print $9; exit}'
}

kill_pid_tree() {
  local root_pid="$1"
  local children

  # Depth-first: kill descendants first to reduce immediate respawns.
  if command -v pgrep >/dev/null 2>&1; then
    children="$(pgrep -P "$root_pid" 2>/dev/null || true)"
    if [ -n "$children" ]; then
      local child
      for child in $children; do
        kill_pid_tree "$child"
      done
    fi
  fi

  kill_pids "$root_pid"
}

kill_by_pattern_in_repo() {
  local pattern="$1"
  local pids pid cwd

  # Only kill processes whose working directory is inside this repo to avoid
  # nuking unrelated `pnpm dev` sessions in other worktrees.
  pids="$(ps -axo pid=,command= | awk -v pat="$pattern" '$0 ~ pat {print $1}')"
  if [ -z "$pids" ]; then
    return 0
  fi

  for pid in $pids; do
    # Avoid killing ourselves / our parent shell.
    if [ "$pid" = "$$" ] || [ "$pid" = "$PPID" ]; then
      continue
    fi

    cwd="$(pid_cwd "$pid" || true)"
    if [ -n "$cwd" ] && [[ "$cwd" == "$repo_root"* ]]; then
      kill_pid_tree "$pid"
    fi
  done
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
  # LangGraph CLI signatures have changed over time:
  # - older: .../langgraph-api/dist/cli/entrypoint.mjs
  # - newer: @langchain/langgraph-cli/.../cli.mjs or `pnpm exec langgraphjs dev`
  #
  # Some processes can also get orphaned (`ppid=1`) and will survive port-based kills
  # if they chose a different port. We only kill those whose CWD is within this repo.
  # Be specific enough to not kill shells/editor commands that merely *mention* these strings.
  kill_by_pattern_in_repo "^node .*langgraph-api/dist/cli/entrypoint\\.mjs"
  kill_by_pattern_in_repo "^node .*@langchain/langgraph-cli/.*cli\\.mjs dev"
  kill_by_pattern_in_repo "^node .*\\/pnpm[^ ]* exec langgraphjs dev"
  kill_by_pattern_in_repo "^bash .*scripts/langgraph-dev\\.sh"
}

kill_next_dev() {
  # Match the actual Next.js dev process (usually `node .../next/dist/bin/next dev`).
  kill_by_pattern_in_repo "^node .*next/dist/bin/next dev"
}

kill_turbo_dev() {
  # If a parent `turbo run dev` is still running, it will respawn children we just killed.
  kill_by_pattern_in_repo "^node .*turbo[^ ]* .* run dev"
}

kill_pnpm_dev() {
  # `pnpm dev` is typically a node wrapper: `node .../pnpm dev`.
  kill_by_pattern_in_repo "^node .*\\/pnpm[^ ]* dev( |$)"
}

cleanup_state() {
  rm -rf apps/agent-clmm/.langgraph_api apps/agent/.langgraph_api apps/agent-pendle/.langgraph_api apps/agent-gmx-allora/.langgraph_api apps/web/.next/dev/lock
}

kill_ports
kill_turbo_dev
kill_pnpm_dev
kill_langgraph
kill_next_dev
kill_playwright_headless
cleanup_state

exit 0
