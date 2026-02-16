'use client';

import { useEffect, useMemo, useState } from 'react';

import { fetchOnchainActionsChainsPage } from '../clients/onchainActionsIcons';
import { COINGECKO_TOKEN_ICON_BY_SYMBOL } from '../constants/coingeckoTokenIcons';
import { chainNameKeyVariants, getTokenIconFallbackSymbolKey, normalizeSymbolKey } from '../utils/iconResolution';

type IconMapsState = {
  chainIconByName: Record<string, string>;
  tokenIconBySymbol: Record<string, string>;
  isLoaded: boolean;
};

let chainIconByNameCache: Record<string, string> | null = null;
let chainIconLoadPromise: Promise<Record<string, string>> | null = null;

const TOKEN_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const tokenIconCache = new Map<string, { expiresAt: number; uri: string | null }>();
const tokenLoadPromises = new Map<string, Promise<void>>();

async function loadChainIconByName(): Promise<Record<string, string>> {
  if (chainIconByNameCache) return chainIconByNameCache;
  if (chainIconLoadPromise) return chainIconLoadPromise;

  chainIconLoadPromise = (async () => {
    const chainsPage = await fetchOnchainActionsChainsPage({ baseUrl: '/api/onchain-actions', page: 1 });
    const next: Record<string, string> = {};

    for (const chain of chainsPage.chains) {
      if (!chain.iconUri) continue;
      for (const key of chainNameKeyVariants(chain.name)) {
        if (!next[key]) next[key] = chain.iconUri;
      }
    }

    chainIconByNameCache = next;
    return next;
  })().finally(() => {
    // Allow retry on failure; on success chainIconByNameCache is populated.
    chainIconLoadPromise = null;
  });

  return chainIconLoadPromise;
}

function getCachedTokenIconUri(symbolKey: string): string | null | undefined {
  const cached = tokenIconCache.get(symbolKey);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    tokenIconCache.delete(symbolKey);
    return undefined;
  }
  return cached.uri;
}

async function loadTokenIcons(params: { symbolKeys: string[] }): Promise<void> {
  const symbolKeys = params.symbolKeys;
  if (symbolKeys.length === 0) return;

  const url = new URL('/api/coingecko/token-icons', window.location.origin);
  for (const symbolKey of symbolKeys) url.searchParams.append('symbols', symbolKey);

  const response = await fetch(url.toString());
  if (!response.ok) return;

  const payload = (await response.json()) as { icons?: Record<string, string>; missing?: string[] };
  const icons = payload.icons ?? {};

  for (const symbolKey of symbolKeys) {
    const iconUri = icons[symbolKey];
    tokenIconCache.set(symbolKey, {
      expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
      uri: typeof iconUri === 'string' && iconUri.length > 0 ? iconUri : null,
    });
  }
}

export function useOnchainActionsIconMaps(params: {
  chainNames: string[];
  tokenSymbols: string[];
}): IconMapsState {
  const { tokenSymbols } = params;
  const requestedSymbolKeys = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const symbol of tokenSymbols) {
      const key = normalizeSymbolKey(symbol);
      if (key.length === 0) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);

      // Many Pendle stablecoins do not resolve on coingecko by symbol. We still want an icon
      // for visual continuity, so we pull a fallback icon symbol into the lookup set.
      const fallbackKey = getTokenIconFallbackSymbolKey(key);
      if (fallbackKey && !seen.has(fallbackKey)) {
        seen.add(fallbackKey);
        out.push(fallbackKey);
      }
    }
    return out;
  }, [tokenSymbols]);

  const [tokenIconBySymbol, setTokenIconBySymbol] = useState<Record<string, string>>(() => ({}));
  const [tokenIconsLoaded, setTokenIconsLoaded] = useState<boolean>(() => true);

  const [chainIconByName, setChainIconByName] = useState<Record<string, string>>(() => chainIconByNameCache ?? {});
  const [chainIconsLoaded, setChainIconsLoaded] = useState<boolean>(() => chainIconByNameCache !== null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const nextChainIconByName = await loadChainIconByName();
        if (cancelled) return;
        setChainIconByName(nextChainIconByName);
        setChainIconsLoaded(true);
      } catch {
        if (cancelled) return;
        setChainIconsLoaded(true);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const next: Record<string, string> = {};
    const missing: string[] = [];

    for (const symbolKey of requestedSymbolKeys) {
      const staticUri = COINGECKO_TOKEN_ICON_BY_SYMBOL[symbolKey];
      if (typeof staticUri === 'string' && staticUri.length > 0) {
        next[symbolKey] = staticUri;
        continue;
      }

      const cachedUri = getCachedTokenIconUri(symbolKey);
      if (cachedUri === undefined) {
        missing.push(symbolKey);
        continue;
      }
      if (cachedUri) next[symbolKey] = cachedUri;
    }

    setTokenIconBySymbol(next);

    if (missing.length === 0) {
      setTokenIconsLoaded(true);
      return () => {
        cancelled = true;
      };
    }

    setTokenIconsLoaded(false);

    const missingKey = missing.slice().sort().join('|');
    const existing = tokenLoadPromises.get(missingKey);
    const promise =
      existing ??
      (async () => {
        try {
          await loadTokenIcons({ symbolKeys: missing });
        } finally {
          tokenLoadPromises.delete(missingKey);
        }
      })();

    if (!existing) tokenLoadPromises.set(missingKey, promise);

    void promise.then(() => {
      if (cancelled) return;

      const refreshed: Record<string, string> = {};
      for (const symbolKey of requestedSymbolKeys) {
        const staticUri = COINGECKO_TOKEN_ICON_BY_SYMBOL[symbolKey];
        if (typeof staticUri === 'string' && staticUri.length > 0) {
          refreshed[symbolKey] = staticUri;
          continue;
        }
        const cachedUri = getCachedTokenIconUri(symbolKey);
        if (cachedUri) refreshed[symbolKey] = cachedUri;
      }

      setTokenIconBySymbol(refreshed);
      setTokenIconsLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [requestedSymbolKeys]);

  // "Loaded" means we have enough icon data to render without skeletons.
  // Token/protocol icons resolve synchronously from the coingecko mapping.
  return {
    chainIconByName,
    tokenIconBySymbol,
    isLoaded: chainIconsLoaded && tokenIconsLoaded,
  };
}
