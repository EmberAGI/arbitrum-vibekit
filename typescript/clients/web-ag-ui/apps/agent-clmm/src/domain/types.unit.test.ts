import { describe, expect, it } from 'vitest';

import { PoolListResponseSchema } from './types.js';

describe('PoolListResponseSchema', () => {
  it('accepts null token iconUri from Ember API and normalizes to undefined', () => {
    const parsed = PoolListResponseSchema.parse({
      liquidityPools: [
        {
          identifier: { chainId: '42161', address: '0xpool' },
          tokens: [
            {
              tokenUid: { chainId: '42161', address: '0xtoken0' },
              name: 'Token0',
              symbol: 'T0',
              decimals: 18,
              iconUri: null,
            },
            {
              tokenUid: { chainId: '42161', address: '0xtoken1' },
              name: 'Token1',
              symbol: 'T1',
              decimals: 18,
            },
          ],
          currentPrice: '1',
          providerId: 'camelot',
          poolName: 'T0/T1',
        },
      ],
    });

    expect(parsed.liquidityPools[0]?.tokens[0]?.iconUri).toBeUndefined();
  });
});

