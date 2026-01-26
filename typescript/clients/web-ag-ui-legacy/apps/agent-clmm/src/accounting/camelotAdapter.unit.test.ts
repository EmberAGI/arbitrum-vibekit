import { describe, expect, it } from 'vitest';

import type { CamelotPool, WalletPosition } from '../domain/types.js';

import { computeCamelotPositionValues } from './camelotAdapter.js';
import { toCaip19TokenId } from './coinGecko.js';

const pool: CamelotPool = {
  address: '0xpool',
  token0: { address: '0xAAA', symbol: 'AAA', decimals: 18 },
  token1: { address: '0xBBB', symbol: 'BBB', decimals: 6 },
  tickSpacing: 60,
  tick: 0,
  liquidity: '0',
};

describe('computeCamelotPositionValues', () => {
  it('values supplied tokens and fees using the price map', () => {
    // Given a wallet position with supplied tokens and fees
    const positions: WalletPosition[] = [
      {
        poolAddress: '0xpool',
        operator: '0xoperator',
        tickLower: 0,
        tickUpper: 10,
        suppliedTokens: [
          { tokenAddress: '0xAAA', symbol: 'AAA', decimals: 18, amount: '1000000000000000000' },
        ],
        tokensOwed0: '500000000000000000',
        tokensOwed1: '2500000',
      },
    ];

    const priceMap = new Map([
      [toCaip19TokenId({ chainId: 42161, address: '0xaaa' }), {
        tokenAddress: '0xaaa',
        usdPrice: 2,
        source: 'ember',
      }],
      [toCaip19TokenId({ chainId: 42161, address: '0xbbb' }), {
        tokenAddress: '0xbbb',
        usdPrice: 1,
        source: 'ember',
      }],
    ]);

    // When position values are computed
    const values = computeCamelotPositionValues({
      chainId: 42161,
      positions,
      poolsByAddress: new Map([['0xpool', pool]]),
      priceMap,
    });

    // Then supplied tokens and fees should be priced
    expect(values).toHaveLength(1);
    expect(values[0]?.positionValueUsd).toBe(5.5);
    expect(values[0]?.feesUsd).toBe(3.5);
    expect(values[0]?.tokens.map((token) => token.category)).toContain('supplied');
    expect(values[0]?.tokens.map((token) => token.category)).toContain('fees');
  });

  it('sorts positions by pool address for deterministic output', () => {
    // Given positions with pool addresses out of order
    const positions: WalletPosition[] = [
      {
        poolAddress: '0xbbb',
        operator: '0xoperator',
        tickLower: 0,
        tickUpper: 10,
      },
      {
        poolAddress: '0xaaa',
        operator: '0xoperator',
        tickLower: 0,
        tickUpper: 10,
      },
    ];

    // When values are computed
    const values = computeCamelotPositionValues({
      chainId: 42161,
      positions,
      poolsByAddress: new Map([
        ['0xbbb', pool],
        ['0xaaa', pool],
      ]),
      priceMap: new Map(),
    });

    // Then the output should be sorted by pool address
    expect(values[0]?.poolAddress).toBe('0xaaa');
    expect(values[1]?.poolAddress).toBe('0xbbb');
  });
});
