import { describe, it, expect } from 'vitest';
import { getUserPosition } from '../src/positions.js';

describe('getUserPosition', () => {
  it('should return user position data', async () => {
    const address = '0x0000000000000000000000000000000000000001';
    const result = await getUserPosition(address);
    
    expect(result.address).toBe(address);
    expect(typeof result.healthFactor).toBe('string');
    expect(typeof result.totalCollateralUSD).toBe('string');
    expect(typeof result.totalDebtUSD).toBe('string');
    expect(Array.isArray(result.positions)).toBe(true);
    
    if (result.positions.length > 0) {
      const position = result.positions[0];
      expect(typeof position.asset).toBe('string');
      expect(typeof position.supplied).toBe('string');
      expect(typeof position.borrowed).toBe('string');
    }
  }, 30000);
});
