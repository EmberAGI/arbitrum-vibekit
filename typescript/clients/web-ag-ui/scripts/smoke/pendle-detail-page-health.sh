#!/usr/bin/env bash

set -euo pipefail

WEB_BASE_URL="${WEB_BASE_URL:-http://localhost:3000}"

html="$(curl -sS "${WEB_BASE_URL}/hire-agents/agent-pendle")"

if echo "$html" | rg -q "Application error: a client-side exception has occurred"; then
  echo "FAIL: detail page is rendering the Next.js client exception splash"
  exit 1
fi

if echo "$html" | rg -q "BAILOUT_TO_CLIENT_SIDE_RENDERING"; then
  # Not necessarily fatal in dev, but it often correlates with SSR issues.
  echo "WARN: route bailed out to client-side rendering (dev-only warning)"
fi

echo "OK: detail page HTML does not contain the client exception splash"

