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

echo "[qa] starting agent runtimes (LangGraph dev servers)..."

# Match `apps/web/src/app/api/copilotkit/route.ts` defaults.
pnpm --filter agent-clmm start >/dev/null 2>&1 &
pnpm --filter agent-pendle start >/dev/null 2>&1 &
pnpm --filter agent-gmx-allora start >/dev/null 2>&1 &

echo "[qa] starting web (build + next start) on http://localhost:3000 ..."
exec pnpm --filter web qa

