import { describe, it, expect } from 'vitest';
import { fetchMarkets } from '../src/markets.js';

describe('fetchMarkets', () => {
  it('should return an array of markets', async () => {
    const result = await fetchMarkets();
    
    expect(Array.isArray(result)).toBe(true);
    
    if (result.length > 0) {
      const market = result[0];
      expect(typeof market.symbol).toBe('string');
      expect(typeof market.address).toBe('string');
      expect(typeof market.decimals).toBe('number');
      expect(typeof market.ltv).toBe('number');
      expect(typeof market.liquidationThreshold).toBe('number');
      expect(typeof market.supplyAPR).toBe('string');
      expect(typeof market.borrowAPR).toBe('string');
      expect(typeof market.liquidity).toBe('string');
      expect(typeof market.price).toBe('string');
    }
  }, 30000);
});
