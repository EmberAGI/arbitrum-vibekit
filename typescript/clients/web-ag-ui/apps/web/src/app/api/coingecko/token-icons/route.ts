import { NextResponse } from 'next/server';

import { fetchOnchainActionsTokensPage } from '@/clients/onchainActionsIcons';
import { normalizeSymbolKey } from '@/utils/iconResolution';

type TokenIconsResponse = {
  icons: Record<string, string>;
  missing: string[];
};

type CoingeckoSearchResponse = {
  coins?: Array<{
    id: string;
    name: string;
    symbol: string;
    thumb?: string;
    large?: string;
  }>;
};

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; uri: string | null }>();
const COINGECKO_MAX_RETRIES = 4;
const COINGECKO_REQUEST_DELAY_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveOnchainActionsBaseUrl(): string {
  return process.env.ONCHAIN_ACTIONS_API_URL ?? process.env.NEXT_PUBLIC_ONCHAIN_ACTIONS_API_URL ?? 'https://api.emberai.xyz';
}

function pickBestIconUri(params: { symbolKey: string; payload: CoingeckoSearchResponse }): string | null {
  const { symbolKey, payload } = params;
  const coins = payload.coins ?? [];

  const exact = coins.find((coin) => normalizeSymbolKey(coin.symbol) === symbolKey);
  if (exact?.large) return exact.large;
  if (exact?.thumb) return exact.thumb;

  return null;
}

async function loadTokenIconsFromOnchainActions(symbolKeys: string[]): Promise<Record<string, string>> {
  const remaining = new Set(symbolKeys);
  const matched: Record<string, string> = {};
  let page = 1;
  let totalPages = 1;

  while (remaining.size > 0 && page <= totalPages && page <= 50) {
    const payload = await fetchOnchainActionsTokensPage({
      baseUrl: resolveOnchainActionsBaseUrl(),
      page,
    });

    totalPages = payload.totalPages;

    for (const token of payload.tokens) {
      if (!token.iconUri) continue;
      const symbolKey = normalizeSymbolKey(token.symbol);
      if (!remaining.has(symbolKey)) continue;
      matched[symbolKey] = token.iconUri;
      remaining.delete(symbolKey);
    }

    page += 1;
  }

  return matched;
}

async function fetchCoingeckoSearchWithRetry(symbolKey: string): Promise<Response | null> {
  let attempt = 0;

  while (attempt < COINGECKO_MAX_RETRIES) {
    // Coingecko search is stable and returns hosted image URIs (thumb/large).
    const searchUrl = new URL('https://api.coingecko.com/api/v3/search');
    searchUrl.searchParams.set('query', symbolKey);

    const response = await fetch(searchUrl.toString(), {
      headers: {
        // A descriptive UA improves reliability with some CDNs.
        'User-Agent': 'forge-web-ag-ui (icon lookup)',
        Accept: 'application/json',
      },
    });

    if (response.status !== 429) return response;
    attempt += 1;
    if (attempt >= COINGECKO_MAX_RETRIES) return null;

    // Exponential backoff for temporary throttling.
    await sleep(300 * 2 ** (attempt - 1));
  }

  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbols = url.searchParams
    .getAll('symbols')
    .map(normalizeSymbolKey)
    .filter((value) => value.length > 0);

  const uniqueSymbols: string[] = [];
  const seen = new Set<string>();
  for (const symbol of symbols) {
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    uniqueSymbols.push(symbol);
  }

  if (uniqueSymbols.length > 25) {
    return NextResponse.json({ error: 'Too many symbols' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const icons: Record<string, string> = {};
  const missing: string[] = [];
  const symbolsToResolve: string[] = [];

  for (const symbolKey of uniqueSymbols) {
    const cached = cache.get(symbolKey);
    if (cached && cached.expiresAt > Date.now()) {
      if (cached.uri) icons[symbolKey] = cached.uri;
      else missing.push(symbolKey);
      continue;
    }
    symbolsToResolve.push(symbolKey);
  }

  let onchainActionsMatches: Record<string, string> = {};
  if (symbolsToResolve.length > 0) {
    try {
      onchainActionsMatches = await loadTokenIconsFromOnchainActions(symbolsToResolve);
    } catch {
      onchainActionsMatches = {};
    }
  }

  for (const symbolKey of symbolsToResolve) {
    const onchainIcon = onchainActionsMatches[symbolKey];
    if (onchainIcon) {
      cache.set(symbolKey, { expiresAt: Date.now() + CACHE_TTL_MS, uri: onchainIcon });
      icons[symbolKey] = onchainIcon;
      continue;
    }

    const response = await fetchCoingeckoSearchWithRetry(symbolKey);
    if (!response || !response.ok) {
      missing.push(symbolKey);
      continue;
    }

    const payload = (await response.json()) as CoingeckoSearchResponse;
    const iconUri = pickBestIconUri({ symbolKey, payload });

    cache.set(symbolKey, { expiresAt: Date.now() + CACHE_TTL_MS, uri: iconUri });
    if (iconUri) icons[symbolKey] = iconUri;
    else missing.push(symbolKey);

    await sleep(COINGECKO_REQUEST_DELAY_MS);
  }

  const result: TokenIconsResponse = { icons, missing };
  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
