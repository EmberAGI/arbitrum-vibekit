#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"

resolve_session_root() {
  local dir="$ROOT_DIR"
  while [ "$dir" != "/" ]; do
    if [ "$(basename "$dir")" = "worktrees" ]; then
      dirname "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

resolve_node_bin() {
  if [ -n "${LOCAL_STACK_NODE_BIN:-}" ]; then
    if [ ! -x "$LOCAL_STACK_NODE_BIN" ]; then
      echo "LOCAL_STACK_NODE_BIN is not executable: $LOCAL_STACK_NODE_BIN" >&2
      exit 1
    fi
    echo "$LOCAL_STACK_NODE_BIN"
    return 0
  fi

  local session_root
  session_root="$(resolve_session_root || true)"
  if [ -n "${session_root:-}" ] && [ -x "$session_root/runtime/bin/node" ]; then
    echo "$session_root/runtime/bin/node"
    return 0
  fi

  if command -v node >/dev/null 2>&1; then
    echo "$(command -v node)"
    return 0
  fi

  echo "Unable to resolve a Node binary for the wallet QA stack launcher." >&2
  echo "Set LOCAL_STACK_NODE_BIN=/absolute/path/to/node if automatic discovery is wrong." >&2
  exit 1
}

NODE_BIN="$(resolve_node_bin)"
export PATH="$(dirname "$NODE_BIN"):$PATH"

cd "$ROOT_DIR"
exec "$NODE_BIN" ./apps/agent-portfolio-manager/node_modules/tsx/dist/cli.mjs ./scripts/smoke/start-wallet-qa-stack.ts "$@"
