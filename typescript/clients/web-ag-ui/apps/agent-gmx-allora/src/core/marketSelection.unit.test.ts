import { describe, expect, it } from 'vitest';

import type { PerpetualMarket } from '../clients/onchainActions.js';

import { selectGmxPerpetualMarket } from './marketSelection.js';

describe('selectGmxPerpetualMarket', () => {
  it('matches GMX market by index + collateral symbols', () => {
    const markets: PerpetualMarket[] = [
      {
        marketToken: { chainId: '42161', address: '0x1' },
        longFundingFee: '0.01',
        shortFundingFee: '0.02',
        longBorrowingFee: '0.03',
        shortBorrowingFee: '0.04',
        chainId: '42161',
        name: 'GMX BTC/USD',
        indexToken: {
          tokenUid: { chainId: '42161', address: '0xbtc' },
          name: 'Bitcoin',
          symbol: 'BTC',
          isNative: false,
          decimals: 8,
          iconUri: null,
          isVetted: true,
        },
        longToken: {
          tokenUid: { chainId: '42161', address: '0xusdc' },
          name: 'USD Coin',
          symbol: 'USDC',
          isNative: false,
          decimals: 6,
          iconUri: null,
          isVetted: true,
        },
        shortToken: {
          tokenUid: { chainId: '42161', address: '0xusdc' },
          name: 'USD Coin',
          symbol: 'USDC',
          isNative: false,
          decimals: 6,
          iconUri: null,
          isVetted: true,
        },
      },
    ];

    const result = selectGmxPerpetualMarket({
      markets,
      baseSymbol: 'BTC',
      quoteSymbol: 'USDC',
    });

    expect(result?.marketToken.address).toBe('0x1');
  });
});
