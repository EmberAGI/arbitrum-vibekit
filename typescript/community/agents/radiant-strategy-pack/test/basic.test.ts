/**
 * Basic functionality tests for Radiant Strategy Pack
 */

import { describe, it, expect } from 'vitest';
import { RadiantClient } from '../src/radiantClient';

// Mock RadiantClient for testing
class MockRadiantClient implements RadiantClient {
  async supply(params: { token: string; amount: string }): Promise<void> {
    console.log(`Mock supply: ${params.amount} of ${params.token}`);
  }

  async borrow(params: { token: string; amount: string }): Promise<void> {
    console.log(`Mock borrow: ${params.amount} of ${params.token}`);
  }

  async repay(params: { token: string; amount: string }): Promise<void> {
    console.log(`Mock repay: ${params.amount} of ${params.token}`);
  }

  async withdraw(params: { token: string; amount: string }): Promise<void> {
    console.log(`Mock withdraw: ${params.amount} of ${params.token}`);
  }

  async getHealthFactor(wallet: string): Promise<number> {
    return 1.5; // Mock healthy position
  }

  async getBorrowCapacity(wallet: string): Promise<bigint> {
    return 1000n; // Mock capacity
  }

  async getTotalCollateral(wallet: string): Promise<bigint> {
    return 2000n; // Mock collateral
  }

  async getBorrowedAmount(wallet: string): Promise<bigint> {
    return 500n; // Mock debt
  }

  async getPendingRewards(wallet: string): Promise<bigint> {
    return 10n; // Mock rewards
  }

  async getAPYSpread(): Promise<{ lendingAPY: number; borrowAPY: number }> {
    return { lendingAPY: 5.5, borrowAPY: 8.2 };
  }
}

describe('RadiantClient Interface', () => {
  it('should implement all required methods', () => {
    const client = new MockRadiantClient();
    
    expect(typeof client.supply).toBe('function');
    expect(typeof client.borrow).toBe('function');
    expect(typeof client.repay).toBe('function');
    expect(typeof client.withdraw).toBe('function');
    expect(typeof client.getHealthFactor).toBe('function');
    expect(typeof client.getBorrowCapacity).toBe('function');
    expect(typeof client.getTotalCollateral).toBe('function');
    expect(typeof client.getBorrowedAmount).toBe('function');
    expect(typeof client.getPendingRewards).toBe('function');
    expect(typeof client.getAPYSpread).toBe('function');
  });

  it('should return correct data types', async () => {
    const client = new MockRadiantClient();
    
    const hf = await client.getHealthFactor('0x123');
    expect(typeof hf).toBe('number');
    
    const capacity = await client.getBorrowCapacity('0x123');
    expect(typeof capacity).toBe('bigint');
    
    const apy = await client.getAPYSpread();
    expect(typeof apy.lendingAPY).toBe('number');
    expect(typeof apy.borrowAPY).toBe('number');
  });
});
