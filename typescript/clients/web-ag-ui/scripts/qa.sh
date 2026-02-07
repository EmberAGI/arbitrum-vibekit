#!/usr/bin/env bash
set -euo pipefail

# Manual QA entrypoint: run the production-like web server (`next build && next start`)
# plus the local LangGraph agent dev servers required by the web runtime.
#
# Stop with Ctrl-C; the trap below will clean up background agent processes.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  # Kill the whole process group so we don't leave stray LangGraph processes behind.
  local pid
  pid="$(jobs -pr | tr '\n' ' ' | xargs echo -n)"
  if [ -n "${pid:-}" ]; then
    kill ${pid} 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

cd "$ROOT_DIR"

resolve_forge_root() {
  # web-ag-ui lives inside the arbitrum-vibekit worktree at:
  #   $FORGE_ROOT/worktrees/<id>/arbitrum-vibekit/typescript/clients/web-ag-ui
  local git_root
  git_root="$(git -C "$ROOT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -z "$git_root" ]; then
    return 1
  fi
  (cd "$git_root/../../.." && pwd -P)
}

resolve_onchain_actions_worktree_dir() {
  if [ -n "${ONCHAIN_ACTIONS_WORKTREE_DIR:-}" ]; then
    echo "$ONCHAIN_ACTIONS_WORKTREE_DIR"
    return 0
  fi

  local forge_root
  forge_root="$(resolve_forge_root || true)"
  if [ -z "$forge_root" ]; then
    return 1
  fi

  local candidates=()
  local d
  while IFS= read -r d; do
    [ -n "$d" ] && candidates+=("$d")
  done < <(find "$forge_root/worktrees" -maxdepth 1 -type d -name 'onchain-actions-*' -print 2>/dev/null || true)

  if [ "${#candidates[@]}" -eq 1 ]; then
    echo "${candidates[0]}"
    return 0
  fi

  echo "[qa] Unable to auto-discover onchain-actions worktree under $forge_root/worktrees." >&2
  echo "[qa] Set ONCHAIN_ACTIONS_WORKTREE_DIR=/absolute/path/to/forge/worktrees/onchain-actions-001" >&2
  return 1
}

wait_for_http_ok() {
  local url="$1"
  local timeout_s="${2:-60}"

  local start
  start="$(date +%s)"
  while true; do
    if curl -fs -o /dev/null "$url"; then
      return 0
    fi
    local now
    now="$(date +%s)"
    if [ $((now - start)) -ge "$timeout_s" ]; then
      return 1
    fi
    sleep 1
  done
}

resolve_onchain_actions_pnpm_bin() {
  local onchain_dir="${1:?missing onchain-actions dir}"
  # This repo uses a pinned pnpm version (packageManager field). The onchain-actions
  # worktree enforces pnpm >= 10 via engines.pnpm, so we must invoke a pnpm 10+ binary
  # explicitly (not whatever pnpm version the current workspace is using).
  if [ -n "${ONCHAIN_ACTIONS_PNPM_BIN:-}" ]; then
    echo "$ONCHAIN_ACTIONS_PNPM_BIN"
    return 0
  fi

  local candidates=(
    "/usr/local/bin/pnpm"
    "/opt/homebrew/bin/pnpm"
    "$(command -v pnpm 2>/dev/null || true)"
  )

  local tool_dir="${HOME}/Library/pnpm/.tools/pnpm"
  if [ -d "$tool_dir" ]; then
    local b
    while IFS= read -r b; do
      [ -n "$b" ] && candidates+=("$b")
    done < <(find "$tool_dir" -maxdepth 3 \( -type f -o -type l \) -path "*/bin/pnpm" -print 2>/dev/null || true)
  fi

  local bin version major
  for bin in "${candidates[@]}"; do
    [ -n "$bin" ] || continue
    [ -x "$bin" ] || continue
    # Ask pnpm to resolve its version in the onchain-actions directory (so packageManager switching
    # doesn't lock us to this repo's pinned pnpm).
    version="$("$bin" -C "$onchain_dir" -v 2>/dev/null || true)"
    major="${version%%.*}"
    if [[ "$major" =~ ^[0-9]+$ ]] && [ "$major" -ge 10 ]; then
      echo "$bin"
      return 0
    fi
  done

  echo "[qa] Could not find a pnpm 10+ binary for onchain-actions." >&2
  echo "[qa] Set ONCHAIN_ACTIONS_PNPM_BIN=/absolute/path/to/pnpm" >&2
  return 1
}

ensure_onchain_actions_50051() {
  export ONCHAIN_ACTIONS_BASE_URL="${ONCHAIN_ACTIONS_BASE_URL:-http://localhost:50051}"

  local markets_url="${ONCHAIN_ACTIONS_BASE_URL}/perpetuals/markets?chainIds=42161"

  if curl -fs -o /dev/null "$markets_url"; then
    echo "[qa] onchain-actions already reachable at ${ONCHAIN_ACTIONS_BASE_URL}"
    return 0
  fi

  local onchain_dir
  onchain_dir="$(resolve_onchain_actions_worktree_dir)"
  if [ -z "$onchain_dir" ]; then
    exit 1
  fi

  if [ ! -d "$onchain_dir" ]; then
    echo "[qa] ONCHAIN_ACTIONS_WORKTREE_DIR does not exist: $onchain_dir" >&2
    exit 1
  fi

  if [ -f "$onchain_dir/compose.dev.db.yaml" ] && command -v docker >/dev/null 2>&1; then
    # Only bring up memgraph (compose file also defines memgraph_lab on 3000 which conflicts with the web QA server).
    docker compose -f "$onchain_dir/compose.dev.db.yaml" up -d memgraph >/dev/null
  fi

  local pnpm_bin
  pnpm_bin="$(resolve_onchain_actions_pnpm_bin "$onchain_dir")" || exit 1

  local log_file="$ROOT_DIR/.qa-onchain-actions.log"
  echo "[qa] starting onchain-actions on http://localhost:50051 (logs: $log_file) ..."
  (
    "$pnpm_bin" -C "$onchain_dir" dev
  ) >"$log_file" 2>&1 &

  if ! wait_for_http_ok "$markets_url" 120; then
    echo "[qa] onchain-actions failed to become reachable at ${ONCHAIN_ACTIONS_BASE_URL} within 120s" >&2
    echo "[qa] tail of $log_file:" >&2
    tail -n 40 "$log_file" >&2 || true
    exit 1
  fi

  echo "[qa] onchain-actions ready at ${ONCHAIN_ACTIONS_BASE_URL}"
}

ensure_onchain_actions_50051

echo "[qa] starting agent runtimes (LangGraph dev servers)..."

# Match `apps/web/src/app/api/copilotkit/route.ts` defaults.
pnpm --filter agent-clmm start >/dev/null 2>&1 &
pnpm --filter agent-pendle start >/dev/null 2>&1 &
pnpm --filter agent-gmx-allora start >/dev/null 2>&1 &

echo "[qa] starting web (build + next start) on http://localhost:3000 ..."
exec pnpm --filter web qa
