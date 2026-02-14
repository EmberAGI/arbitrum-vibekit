import { describe, expect, it } from 'vitest';

import {
  chainNameKeyVariants,
  resolveAgentAvatarUri,
  resolveChainIconUris,
  resolveProtocolIconUris,
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
});
