#!/usr/bin/env bash
set -euo pipefail

PORT="${1:?missing port}"
shift

# langgraph-cli unconditionally tries to read a local `.env` file in the graph directory
# and crashes with ENOENT if it doesn't exist. Create an empty one for dev so `pnpm dev`
# doesn't fail when a developer hasn't copied `.env.example` yet.
if [ ! -f ".env" ]; then
  : > .env
fi

# Load .env for LangGraph CLI processes.
# Precedence rule: do not override variables already set in the environment
# (so `DELEGATIONS_BYPASS=true turbo run dev` continues to win over `.env`).
#
# We load the closest `.env` first, then parent `.env` files (if any) to fill in
# missing keys like ONCHAIN_ACTIONS_API_URL that may be configured at repo root.
load_env_file() {
  local env_file="$1"
  while IFS= read -r line || [ -n "$line" ]; do
    # Trim Windows CR if present.
    line="${line%%$'\r'}"

    case "$line" in
      ''|\#*) continue ;;
    esac

    if [[ "$line" == export\ * ]]; then
      line="${line#export }"
    fi

    key="${line%%=*}"
    value="${line#*=}"

    if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      continue
    fi

    # Only populate variables that are currently unset.
    if [ -z "${!key+x}" ]; then
      if [[ "$value" == \"*\" && "$value" == *\" ]]; then
        value="${value:1:${#value}-2}"
      elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
        value="${value:1:${#value}-2}"
      fi

      export "${key}=${value}"
    fi
  done < "$env_file"
}

dir="$PWD"
while true; do
  env_file="$dir/.env"
  if [ -f "$env_file" ]; then
    load_env_file "$env_file"
  fi

  parent="$(dirname "$dir")"
  if [ "$parent" = "$dir" ]; then
    break
  fi
  dir="$parent"
done

# Keep LangGraph server request logs quieter by default to reduce dev-console noise.
# Developers can override per command, e.g. `LOG_LEVEL=info pnpm dev`.
if [ -z "${LOG_LEVEL+x}" ]; then
  export LOG_LEVEL="warn"
fi

exec npx @langchain/langgraph-cli dev --port "$PORT" --no-browser "$@"
