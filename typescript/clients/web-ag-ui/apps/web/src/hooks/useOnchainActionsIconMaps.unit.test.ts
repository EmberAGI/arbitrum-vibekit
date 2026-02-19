import { beforeEach, describe, expect, it, vi } from 'vitest';

import { __useOnchainActionsIconMapsTestOnly } from './useOnchainActionsIconMaps';

const fetchOnchainActionsChainsPageMock = vi.fn();

vi.mock('../clients/onchainActionsIcons', () => {
  return {
    fetchOnchainActionsChainsPage: (params: { baseUrl: string; page: number }) =>
      fetchOnchainActionsChainsPageMock(params),
  };
});

function setWindowOrigin(origin: string) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      location: {
        origin,
      },
    },
  });
}

describe('useOnchainActionsIconMaps internals', () => {
  beforeEach(() => {
    __useOnchainActionsIconMapsTestOnly.resetIconMapsCachesForTests();
    fetchOnchainActionsChainsPageMock.mockReset();
    vi.restoreAllMocks();
    setWindowOrigin('http://localhost:3000');
  });

  it('loads chain icon map once and caches normalized chain-name variants', async () => {
    fetchOnchainActionsChainsPageMock.mockResolvedValue({
      chains: [
        { name: 'Arbitrum One', iconUri: 'https://cdn.example/arbitrum.png' },
        { name: 'Base Mainnet', iconUri: 'https://cdn.example/base.png' },
        { name: 'Chain Without Icon', iconUri: null },
      ],
    });

    const first = await __useOnchainActionsIconMapsTestOnly.loadChainIconByName();
    const second = await __useOnchainActionsIconMapsTestOnly.loadChainIconByName();

    expect(fetchOnchainActionsChainsPageMock).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first['arbitrum one']).toBe('https://cdn.example/arbitrum.png');
    expect(first['arbitrum']).toBe('https://cdn.example/arbitrum.png');
    expect(first['base']).toBe('https://cdn.example/base.png');
  });

  it('clears load promise on failure so a later call can retry', async () => {
    fetchOnchainActionsChainsPageMock.mockRejectedValueOnce(new Error('temporary outage')).mockResolvedValueOnce({
      chains: [{ name: 'Arbitrum', iconUri: 'https://cdn.example/arbitrum.png' }],
    });

    await expect(__useOnchainActionsIconMapsTestOnly.loadChainIconByName()).rejects.toThrow('temporary outage');

    const recovered = await __useOnchainActionsIconMapsTestOnly.loadChainIconByName();

    expect(fetchOnchainActionsChainsPageMock).toHaveBeenCalledTimes(2);
    expect(recovered['arbitrum']).toBe('https://cdn.example/arbitrum.png');
  });

  it('loads token icons from the coingecko endpoint and stores cache entries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        icons: {
          USDC: 'https://cdn.example/usdc.png',
        },
        missing: ['WBTC'],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await __useOnchainActionsIconMapsTestOnly.loadTokenIcons({ symbolKeys: ['USDC', 'WBTC'] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
    expect(calledUrl).toContain('/api/coingecko/token-icons');
    expect(calledUrl).toContain('symbols=USDC');
    expect(calledUrl).toContain('symbols=WBTC');

    expect(__useOnchainActionsIconMapsTestOnly.getCachedTokenIconUri('USDC')).toBe(
      'https://cdn.example/usdc.png',
    );
    expect(__useOnchainActionsIconMapsTestOnly.getCachedTokenIconUri('WBTC')).toBeNull();
  });

  it('builds token resolution snapshot with static, cached, and missing symbols', async () => {
    const dynamicSymbol = 'TEST_DYNAMIC_GMX';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        icons: {
          [dynamicSymbol]: 'https://cdn.example/gmx.png',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await __useOnchainActionsIconMapsTestOnly.loadTokenIcons({ symbolKeys: [dynamicSymbol] });

    const snapshot = __useOnchainActionsIconMapsTestOnly.buildTokenIconResolutionSnapshot({
      requestedSymbolKeys: [dynamicSymbol, 'UNKNOWN'],
    });

    expect(snapshot.tokenIconBySymbol[dynamicSymbol]).toBe('https://cdn.example/gmx.png');
    expect(snapshot.missingSymbolKeys).toEqual(['UNKNOWN']);
  });

  it('builds refreshed token icon map after cache population', async () => {
    const dynamicSymbol = 'TEST_DYNAMIC_ARB';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        icons: {
          [dynamicSymbol]: 'https://cdn.example/arb.png',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await __useOnchainActionsIconMapsTestOnly.loadTokenIcons({ symbolKeys: [dynamicSymbol] });

    const refreshed = __useOnchainActionsIconMapsTestOnly.buildRefreshedTokenIconMap({
      requestedSymbolKeys: [dynamicSymbol, 'MISSING'],
    });

    expect(refreshed[dynamicSymbol]).toBe('https://cdn.example/arb.png');
    expect(refreshed.MISSING).toBeUndefined();
  });

  it('evicts expired cache entries based on TTL checks', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        icons: {
          ARB: 'https://cdn.example/arb.png',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await __useOnchainActionsIconMapsTestOnly.loadTokenIcons({ symbolKeys: ['ARB'] });
    expect(__useOnchainActionsIconMapsTestOnly.getCachedTokenIconUri('ARB')).toBe(
      'https://cdn.example/arb.png',
    );

    nowSpy.mockReturnValue(1_000 + 12 * 60 * 60 * 1000 + 1);
    expect(__useOnchainActionsIconMapsTestOnly.getCachedTokenIconUri('ARB')).toBeUndefined();
  });

  it('does not write cache entries when token icon fetch is unsuccessful', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    await __useOnchainActionsIconMapsTestOnly.loadTokenIcons({ symbolKeys: ['GMX'] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(__useOnchainActionsIconMapsTestOnly.getCachedTokenIconUri('GMX')).toBeUndefined();
  });

  it('swallows token icon fetch errors so loading state can recover', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      __useOnchainActionsIconMapsTestOnly.loadTokenIcons({ symbolKeys: ['GMX'] }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(__useOnchainActionsIconMapsTestOnly.getCachedTokenIconUri('GMX')).toBeUndefined();
  });
});
