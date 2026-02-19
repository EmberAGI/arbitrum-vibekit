#!/usr/bin/env bash

set -u

# Web QA uses 3000, LangGraph dev servers use 8123-8126.
# Keep 50051 untouched so external onchain-actions dev sessions are not killed.
ports=(3000 3001 3002 3003 3004 3005 8123 8124 8125 8126)

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

max_passes="${RESET_DEV_STACK_MAX_PASSES:-5}"
sleep_between_passes_s="${RESET_DEV_STACK_SLEEP_BETWEEN_PASSES_S:-0.2}"
debug="${RESET_DEV_STACK_DEBUG:-}"

find_forge_root() {
  local dir="$1"
  while [ -n "$dir" ] && [ "$dir" != "/" ]; do
    if [ -d "$dir/worktrees" ] && [ -d "$dir/repos" ]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

forge_root="$(find_forge_root "$repo_root" || true)"
scope_root="${RESET_DEV_STACK_SCOPE_ROOT:-${forge_root:-$repo_root}}"

kill_pids() {
  local pids="$1"
  if [ -n "$pids" ]; then
    echo "Killing PIDs: $pids"
    if [ -n "$debug" ]; then
      local pid
      for pid in $pids; do
        if [ "$pid" = "$$" ] || [ "$pid" = "$PPID" ]; then
          continue
        fi
        local cmd cwd
        cmd="$(ps -p "$pid" -o pid=,ppid=,etime=,command= 2>/dev/null || true)"
        cwd="$(pid_cwd "$pid" || true)"
        if [ -n "$cmd" ]; then
          echo "  -> $cmd"
        fi
        if [ -n "$cwd" ]; then
          echo "     cwd: $cwd"
        fi
      done
    fi
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

ps_pids_by_pattern() {
  local pattern="$1"

  # Wide ps so we don't miss long node command lines.
  # Note: avoid `pgrep -f` here because it can match the `pgrep` process itself
  # (its argv includes the pattern), leading to noisy "kills" and preventing
  # the multi-pass loop from ever converging.
  # Also avoid passing the pattern via `awk -v pat=...` because that puts the
  # pattern into the awk process argv, which can then match itself.
  ps axww -o pid= -o command= 2>/dev/null | PATTERN="$pattern" DEBUG="$debug" awk '
    BEGIN {
      pat = ENVIRON["PATTERN"];
      dbg = ENVIRON["DEBUG"];
    }
    {
      pid=$1;
      $1="";
      sub(/^ /, "", $0);
      cmd=$0;
      if (cmd ~ pat) {
        if (dbg != "") {
          print "match(" pat "): " pid " " cmd > "/dev/stderr";
        }
        print pid
      }
    }
  ' || true
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

  # Only kill processes whose working directory is inside the selected scope:
  # - by default: the Forge checkout root (directory containing `worktrees/` + `repos/`)
  # - fallback: this repo root
  # This avoids nuking unrelated `pnpm dev` sessions outside this Forge checkout.
  pids="$(ps_pids_by_pattern "$pattern")"
  if [ -z "$pids" ]; then
    return 0
  fi

  for pid in $pids; do
    # Avoid killing ourselves / our parent shell.
    if [ "$pid" = "$$" ] || [ "$pid" = "$PPID" ]; then
      continue
    fi

    cwd="$(pid_cwd "$pid" || true)"
    if [ -n "$cwd" ]; then
      if [[ "$cwd" == "$scope_root"* ]]; then
        kill_pid_tree "$pid"
      fi
      continue
    fi

    # Fallback: if `lsof` couldn't determine cwd (common under load / permission quirks),
    # still kill the process when its command line clearly points inside this scope.
    # This catches stray `next dev -p <random>` processes that aren't bound to known ports.
    local cmd
    cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [ -n "$cmd" ] && [[ "$cmd" == *"$scope_root"* ]]; then
      kill_pid_tree "$pid"
    fi
  done
}

kill_playwright_headless() {
  # Smoke scripts (and other test tooling) can leave headless Chromium running if interrupted.
  # Those stale processes may keep polling the dev server, making logs appear "busy" even when
  # you haven't manually opened the UI.
  local pids
  # Avoid self-matching: don't filter based on strings that appear in the `awk` argv itself.
  # Use `comm` (executable name) for the chrome process name, and read the profile marker
  # from the environment so it doesn't appear in argv.
  pids=$(
    ps axww -o pid= -o comm= -o command= 2>/dev/null | PROFILE_MARKER="playwright_chromiumdev_profile" awk '
      BEGIN { marker = ENVIRON["PROFILE_MARKER"] }
      {
        pid=$1;
        comm=$2;
        $1="";
        $2="";
        sub(/^  */, "", $0);
        cmd=$0;
        if (comm == "chrome-headless-shell" && cmd ~ marker) {
          print pid
        }
      }
    ' || true
  )
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
    if [ -n "$debug" ] && [ -n "$pids" ]; then
      echo "port $port has listeners:"
      lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
    fi
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
  # Note: on macOS the command line often begins with the full node binary path,
  # not the literal string `node`, so avoid anchoring on `^node`.
  kill_by_pattern_in_repo "langgraph-api/dist/cli/entrypoint\\.mjs"
  kill_by_pattern_in_repo "@langchain/langgraph-cli/.*cli\\.mjs dev"
  kill_by_pattern_in_repo "\\/pnpm[^ ]* exec langgraphjs dev"
  kill_by_pattern_in_repo "scripts/langgraph-dev\\.sh"
}

kill_next_dev() {
  # Match the actual Next.js dev process (usually `node .../next/dist/bin/next dev`).
  kill_by_pattern_in_repo "next/dist/bin/next dev"
}

kill_turbo_dev() {
  # If a parent `turbo run dev` is still running, it will respawn children we just killed.
  # Note: `turbo run dev` often appears with *no* extra args between `turbo` and `run`,
  # so we must match both:
  # - `... turbo run dev`
  # - `... turbo <args> run dev`
  kill_by_pattern_in_repo "turbo[^ ]* run dev( |$)"
  kill_by_pattern_in_repo "turbo[^ ]* .* run dev( |$)"
  kill_by_pattern_in_repo "/turbo[^ ]* run dev( |$)"
  kill_by_pattern_in_repo "/turbo[^ ]* .* run dev( |$)"
}

kill_pnpm_dev() {
  # `pnpm dev` is typically a node wrapper: `node .../pnpm dev`.
  kill_by_pattern_in_repo "\\/pnpm[^ ]* dev( |$)"
  kill_by_pattern_in_repo "\\/pnpm[^ ]* run dev( |$)"
  kill_by_pattern_in_repo "\\/pnpm[^ ]* dev:([^ ]+)( |$)"
}

cleanup_state() {
  rm -rf apps/agent-clmm/.langgraph_api apps/agent/.langgraph_api apps/agent-pendle/.langgraph_api apps/agent-gmx-allora/.langgraph_api apps/web/.next
}

has_targets_in_repo() {
  local patterns=(
    "next/dist/bin/next dev"
    "langgraph-api/dist/cli/entrypoint\\.mjs"
    "@langchain/langgraph-cli/.*cli\\.mjs dev"
    "langgraphjs dev"
    "turbo[^ ]* run dev"
    "turbo[^ ]* .* run dev"
    "/turbo[^ ]* run dev"
    "/turbo[^ ]* .* run dev"
    "\\/pnpm[^ ]* dev( |$)"
    "\\/pnpm[^ ]* run dev( |$)"
    "\\/pnpm[^ ]* dev:([^ ]+)( |$)"
  )

  local pat pid cwd cmd
  for pat in "${patterns[@]}"; do
    local pids
    pids="$(ps_pids_by_pattern "$pat")"
    if [ -z "$pids" ]; then
      continue
    fi
    for pid in $pids; do
      if [ "$pid" = "$$" ] || [ "$pid" = "$PPID" ]; then
        continue
      fi

      cwd="$(pid_cwd "$pid" || true)"
      if [ -n "$cwd" ] && [[ "$cwd" == "$scope_root"* ]]; then
        return 0
      fi

      cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
      if [ -n "$cmd" ] && [[ "$cmd" == *"$scope_root"* ]]; then
        return 0
      fi
    done
  done

  return 1
}

pass=1
while [ "$pass" -le "$max_passes" ]; do
  echo "reset-dev-stack: pass $pass/$max_passes (scope: $scope_root)"

  # Kill respawners first (turbo/pnpm), then children and ports as a safety net.
  kill_turbo_dev
  kill_pnpm_dev
  kill_langgraph
  kill_next_dev
  kill_ports
  kill_playwright_headless

  if ! has_targets_in_repo; then
    break
  fi

  sleep "$sleep_between_passes_s"
  pass=$((pass + 1))
done

cleanup_state

exit 0
