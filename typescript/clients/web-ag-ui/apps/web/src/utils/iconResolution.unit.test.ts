import { describe, expect, it } from 'vitest';

import {
  chainNameKeyVariants,
  proxyIconUri,
  resolveAgentAvatarUri,
  resolveChainIconUris,
  resolveProtocolIconUris,
  resolveTokenIconUri,
  resolveTokenIconUris,
} from './iconResolution';

describe('iconResolution', () => {
  it('creates chain name variants for common long names', () => {
    expect(chainNameKeyVariants('Arbitrum One').sort()).toEqual(['arbitrum', 'arbitrum one'].sort());
  });

  it('resolves chain icon uris case-insensitively and preserves order', () => {
    const uris = resolveChainIconUris({
      chainNames: ['Arbitrum', 'ethereum', 'Unknown'],
      chainIconByName: {
        arbitrum: 'https://example.test/arbitrum.png',
        ethereum: 'https://example.test/eth.png',
      },
    });

    expect(uris).toEqual(['https://example.test/arbitrum.png', 'https://example.test/eth.png']);
  });

  it('resolves protocol icon uris from fallback token symbols (and omits missing)', () => {
    const uris = resolveProtocolIconUris({
      protocols: ['Camelot', 'GMX', 'Nope'],
      tokenIconBySymbol: {
        GRAIL: 'https://example.test/grail.png',
        GMX: 'https://example.test/gmx.png',
      },
      protocolTokenFallback: {
        Camelot: 'GRAIL',
        GMX: 'GMX',
      },
    });

    expect(uris).toEqual(['https://example.test/grail.png', 'https://example.test/gmx.png']);
  });

  it('resolves token icon uris by symbol (and omits missing)', () => {
    const uris = resolveTokenIconUris({
      tokenSymbols: ['USDC', 'weth', 'MISSING'],
      tokenIconBySymbol: {
        USDC: 'https://example.test/usdc.png',
        WETH: 'https://example.test/weth.png',
      },
    });

    expect(uris).toEqual(['https://example.test/usdc.png', 'https://example.test/weth.png']);
  });

  it('does not use surrogate symbol fallbacks when token icon is missing', () => {
    const uri = resolveTokenIconUri({
      symbol: 'sUSDai',
      tokenIconBySymbol: {
        DAI: 'https://example.test/dai.png',
      },
    });

    expect(uri).toBeNull();
  });

  it('selects the first available protocol token icon as the agent avatar', () => {
    const uri = resolveAgentAvatarUri({
      protocols: ['Nope', 'Camelot', 'GMX'],
      tokenIconBySymbol: {
        GMX: 'https://example.test/gmx.png',
        GRAIL: 'https://example.test/grail.png',
      },
      protocolTokenFallback: {
        Camelot: 'GRAIL',
        GMX: 'GMX',
      },
    });

    expect(uri).toBe('https://example.test/grail.png');
  });

  it('proxies known icon hosts through the icon proxy endpoint', () => {
    expect(proxyIconUri('https://coin-images.coingecko.com/coins/images/279/large/ethereum.png')).toBe(
      '/api/icon-proxy?url=https%3A%2F%2Fcoin-images.coingecko.com%2Fcoins%2Fimages%2F279%2Flarge%2Fethereum.png',
    );
  });

  it('proxies linktr.ee-hosted icons so client blockers do not drop them', () => {
    expect(proxyIconUri('https://ugc.production.linktr.ee/path/to/icon.png')).toBe(
      '/api/icon-proxy?url=https%3A%2F%2Fugc.production.linktr.ee%2Fpath%2Fto%2Ficon.png',
    );
  });

  it('normalizes github tree/blob asset URLs to raw.githubusercontent.com', () => {
    expect(proxyIconUri('https://github.com/owner/repo/tree/main/images/icon.webp')).toBe(
      '/api/icon-proxy?url=https%3A%2F%2Fraw.githubusercontent.com%2Fowner%2Frepo%2Fmain%2Fimages%2Ficon.webp',
    );
    expect(proxyIconUri('https://github.com/owner/repo/blob/main/images/icon.webp')).toBe(
      '/api/icon-proxy?url=https%3A%2F%2Fraw.githubusercontent.com%2Fowner%2Frepo%2Fmain%2Fimages%2Ficon.webp',
    );
  });
});
