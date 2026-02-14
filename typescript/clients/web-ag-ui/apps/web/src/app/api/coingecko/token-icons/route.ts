import { NextResponse } from 'next/server';

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

function pickBestIconUri(params: { symbolKey: string; payload: CoingeckoSearchResponse }): string | null {
  const { symbolKey, payload } = params;
  const coins = payload.coins ?? [];

  const exact = coins.find((coin) => normalizeSymbolKey(coin.symbol) === symbolKey);
  if (exact?.large) return exact.large;
  if (exact?.thumb) return exact.thumb;

  const first = coins[0];
  if (first?.large) return first.large;
  if (first?.thumb) return first.thumb;

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

  for (const symbolKey of uniqueSymbols) {
    const cached = cache.get(symbolKey);
    if (cached && cached.expiresAt > Date.now()) {
      if (cached.uri) icons[symbolKey] = cached.uri;
      else missing.push(symbolKey);
      continue;
    }

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

    if (!response.ok) {
      cache.set(symbolKey, { expiresAt: Date.now() + CACHE_TTL_MS, uri: null });
      missing.push(symbolKey);
      continue;
    }

    const payload = (await response.json()) as CoingeckoSearchResponse;
    const iconUri = pickBestIconUri({ symbolKey, payload });

    cache.set(symbolKey, { expiresAt: Date.now() + CACHE_TTL_MS, uri: iconUri });
    if (iconUri) icons[symbolKey] = iconUri;
    else missing.push(symbolKey);
  }

  const result: TokenIconsResponse = { icons, missing };
  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

