import { describe, expect, it } from 'vitest';

import { formatPoolPair } from './poolFormat';

describe('poolFormat', () => {
  it('returns placeholder when pool is missing', () => {
    expect(formatPoolPair(undefined)).toBe('—');
  });

  it('returns placeholder when token symbols are missing', () => {
    expect(formatPoolPair({ address: '0xpool' } as never)).toBe('—');
    expect(formatPoolPair({ address: '0xpool', token0: { symbol: '' }, token1: { symbol: 'USDC' } } as never)).toBe('—');
  });

  it('formats token0/token1 as a pair', () => {
    expect(formatPoolPair({ address: '0xpool', token0: { symbol: 'ETH' }, token1: { symbol: 'USDC' } } as never)).toBe(
      'ETH/USDC',
    );
  });
});

