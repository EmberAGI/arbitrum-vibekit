import { describe, it, expect, vi } from 'vitest';
import { LoopingStrategy } from '../src/strategies/looping';
import { makeRadiantMock } from './mocks/radiantClient.mock';

describe('Radiant Looping Strategy', () => {
  it('should execute loops correctly', async () => {
    const client = makeRadiantMock();
    const strategy = new LoopingStrategy(client);
    
    await strategy.execute({
      token: '0xUSDC',
      maxLoops: 3,
      minHealthFactor: 1.3,
      utilizationBps: 9000,
    });

    expect(client.borrow).toHaveBeenCalledTimes(3);
    expect(client.supply).toHaveBeenCalledTimes(3);
  });

  it('should stop when HF below threshold', async () => {
    let callCount = 0;
    const client = makeRadiantMock({
      getHealthFactor: vi.fn(async () => {
        callCount++;
        return callCount > 2 ? 1.2 : 1.5;
      }),
    });

    const strategy = new LoopingStrategy(client);
    await strategy.execute({
      token: '0xUSDC',
      maxLoops: 10,
      minHealthFactor: 1.3,
      utilizationBps: 9000,
    });

    expect(client.borrow).toHaveBeenCalledTimes(2);
  });

  it('should call borrow and supply with correct amounts', async () => {
    const client = makeRadiantMock({
      getBorrowCapacity: vi.fn(async () => 2000n),
    });

    const strategy = new LoopingStrategy(client);
    await strategy.execute({
      token: '0xUSDC',
      maxLoops: 1,
      minHealthFactor: 1.3,
      utilizationBps: 8000, // 80%
    });

    expect(client.borrow).toHaveBeenCalledWith({
      token: '0xUSDC',
      amount: '1600', // 2000 * 80% = 1600
    });
    expect(client.supply).toHaveBeenCalledWith({
      token: '0xUSDC',
      amount: '1600',
    });
  });
});
