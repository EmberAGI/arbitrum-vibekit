#!/usr/bin/env bash
set -euo pipefail

PORT="${1:?missing port}"
shift

# Load .env for LangGraph CLI processes.
# Precedence rule: do not override variables already set in the environment
# (so `DELEGATIONS_BYPASS=true turbo run dev` continues to win over `.env`).
ENV_FILE=".env"
if [ -f "$ENV_FILE" ]; then
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
  done < "$ENV_FILE"
fi

exec npx @langchain/langgraph-cli dev --port "$PORT" --no-browser "$@"

