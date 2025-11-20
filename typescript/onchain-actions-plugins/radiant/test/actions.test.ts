import { describe, it, expect } from 'vitest';
import { decodeFunctionData, parseAbi } from 'viem';
import { supply } from '../src/actions.js';
import { RADIANT_CONFIG } from '../radiant.config.js';

describe('supply', () => {
  it('should build supply transaction', () => {
    const token = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
    const amount = '1000000';
    const user = '0x000000000000000000000000000000000000dEaD';
    
    const tx = supply({ token, amount, onBehalfOf: user });
    
    expect(tx.to).toBe(RADIANT_CONFIG.addresses.lendingPool);
    expect(tx.data).toMatch(/^0x[a-fA-F0-9]+$/);
    expect(tx.data.length).toBeGreaterThan(2);
    
    const abi = parseAbi([
      'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)'
    ]);
    
    const decoded = decodeFunctionData({
      abi,
      data: tx.data as `0x${string}`
    });
    
    expect(decoded.functionName).toBe('supply');
    expect(decoded.args[0].toLowerCase()).toBe(token.toLowerCase());
    expect(decoded.args[1]).toBe(1000000n);
    expect(decoded.args[2].toLowerCase()).toBe(user.toLowerCase());
  });
});
