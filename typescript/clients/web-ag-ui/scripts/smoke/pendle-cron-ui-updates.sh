#!/usr/bin/env bash

set -euo pipefail

WEB_BASE_URL="${WEB_BASE_URL:-http://localhost:3000}"
PENDLE_LANGGRAPH_URL="${PENDLE_LANGGRAPH_URL:-http://localhost:8125}"
THREAD_ID="${THREAD_ID:-feff39ac-2d60-5b06-a928-42495b34ca52}"

echo "Checking /api/agents/sync iteration increases..."
body='{"agentId":"agent-pendle"}'

iter0="$(curl -sS -X POST -H 'content-type: application/json' -d "$body" "${WEB_BASE_URL}/api/agents/sync" | python -c 'import json,sys; print(json.load(sys.stdin).get("metrics",{}).get("iteration"))')"
if [[ -z "${iter0}" || "${iter0}" == "None" ]]; then
  echo "FAIL: missing iteration from /api/agents/sync"
  exit 1
fi

iter1="$iter0"
for _ in $(seq 1 10); do
  sleep 3
  iter1="$(curl -sS -X POST -H 'content-type: application/json' -d "$body" "${WEB_BASE_URL}/api/agents/sync" | python -c 'import json,sys; print(json.load(sys.stdin).get("metrics",{}).get("iteration"))')"
  echo "sync.iteration: ${iter0} -> ${iter1}"
  if [[ -n "${iter1}" && "${iter1}" != "None" && "${iter1}" -gt "${iter0}" ]]; then
    break
  fi
done

if [[ -z "${iter1}" || "${iter1}" == "None" ]]; then
  echo "FAIL: missing iteration from /api/agents/sync on follow-up checks"
  exit 1
fi
if [[ "${iter1}" -le "${iter0}" ]]; then
  echo "FAIL: expected /api/agents/sync iteration to increase"
  exit 1
fi

echo "Checking LangGraph thread iteration increases..."
t0="$(curl -sS "${PENDLE_LANGGRAPH_URL}/threads/${THREAD_ID}/state" | python -c 'import json,sys; s=json.load(sys.stdin); print((s.get("values",{}).get("view",{}).get("metrics",{}) or {}).get("iteration"))')"
if [[ -z "${t0}" || "${t0}" == "None" ]]; then
  echo "FAIL: missing iteration from LangGraph thread state"
  exit 1
fi

t1="$t0"
for _ in $(seq 1 10); do
  sleep 3
  t1="$(curl -sS "${PENDLE_LANGGRAPH_URL}/threads/${THREAD_ID}/state" | python -c 'import json,sys; s=json.load(sys.stdin); print((s.get("values",{}).get("view",{}).get("metrics",{}) or {}).get("iteration"))')"
  echo "thread.iteration: ${t0} -> ${t1}"
  if [[ -n "${t1}" && "${t1}" != "None" && "${t1}" -gt "${t0}" ]]; then
    break
  fi
done

if [[ -z "${t1}" || "${t1}" == "None" ]]; then
  echo "FAIL: missing iteration from LangGraph thread state on follow-up checks"
  exit 1
fi
if [[ "${t1}" -le "${t0}" ]]; then
  echo "FAIL: expected LangGraph thread iteration to increase"
  exit 1
fi

echo "Checking UI (headless) iteration increases..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TYPESCRIPT_DIR="$(cd "${SCRIPT_DIR}/../../../../" && pwd)"
cd "${TYPESCRIPT_DIR}"

node - <<'NODE'
const pw = require('./node_modules/.pnpm/playwright@1.56.0/node_modules/playwright');
const { chromium } = pw;

function findIteration() {
  const points = Array.from(document.querySelectorAll('div')).find((d) => d.textContent?.trim() === 'Points');
  if (!points) return null;
  const container = points.parentElement;
  if (!container) return null;
  const spans = Array.from(container.querySelectorAll('span'));
  const iterSpan = spans.find((s) => /^\d+x$/.test((s.textContent ?? '').trim()));
  if (!iterSpan) return null;
  return Number((iterSpan.textContent ?? '').trim().replace('x', ''));
}

(async () => {
  const url = `${process.env.WEB_BASE_URL ?? 'http://localhost:3000'}/hire-agents/agent-pendle`;
  let browser;
  const closeBrowser = async () => {
    if (!browser) return;
    try {
      await browser.close();
    } catch {
      // best-effort cleanup
    } finally {
      browser = undefined;
    }
  };

  const handleSignal = (signal) => {
    // Ensure we don't leave a headless browser running if the smoke is interrupted.
    void closeBrowser().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  };

  process.once('SIGINT', () => handleSignal('SIGINT'));
  process.once('SIGTERM', () => handleSignal('SIGTERM'));

  browser = await chromium.launch({
    headless: true,
    // Reuse the agent-browser cached headless shell path.
    executablePath:
      '/Users/tomdaniel/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell',
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(5000);
  const a = await page.evaluate(findIteration);
  let b = a;
  for (let i = 0; i < 6; i += 1) {
    await page.waitForTimeout(5000);
    b = await page.evaluate(findIteration);
    console.log(`ui.iteration: ${a} -> ${b}`);
    if (typeof a === 'number' && typeof b === 'number' && b > a) break;
  }
  await closeBrowser();

  if (typeof a !== 'number' || typeof b !== 'number') {
    console.error('FAIL: unable to read iteration from UI');
    process.exitCode = 1;
    return;
  }
  if (b <= a) {
    console.error('FAIL: expected UI iteration to increase');
    process.exitCode = 1;
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
NODE

echo "OK: cron-driven iteration updates are observable via sync, thread state, and UI"
