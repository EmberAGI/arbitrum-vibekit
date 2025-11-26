import { describe, it, expect, vi } from 'vitest';
import { executeLoopingLender } from '../src/strategies/loopingLender';
import { makeRadiantMock } from './mocks/radiantClient.mock';

describe('Radiant Looping Lender', () => {
  it('should stop at maxLoops', async () => {
    const client = makeRadiantMock();
    
    const result = await executeLoopingLender(client, {
      wallet: '0xABC',
      token: '0xUSDC',
      maxLoops: 3,
      minHealthFactor: 1.3,
      utilizationBps: 9000,
    });

    expect(result.loopsExecuted).toBe(3);
    expect(result.stoppedReason).toBe('Max loops reached');
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

    const result = await executeLoopingLender(client, {
      wallet: '0xABC',
      token: '0xUSDC',
      maxLoops: 10,
      minHealthFactor: 1.3,
      utilizationBps: 9000,
    });

    expect(result.loopsExecuted).toBe(2);
    expect(result.stoppedReason).toBe('HF below threshold');
    expect(result.finalHealthFactor).toBe(1.2);
  });

  it('should call borrow and supply with correct amounts', async () => {
    const client = makeRadiantMock({
      getBorrowCapacity: vi.fn(async () => 1000n),
    });

    await executeLoopingLender(client, {
      wallet: '0xABC',
      token: '0xUSDC',
      maxLoops: 1,
      minHealthFactor: 1.3,
      utilizationBps: 9000,
    });

    expect(client.borrow).toHaveBeenCalledWith({
      token: '0xUSDC',
      amount: '900',
    });
    expect(client.supply).toHaveBeenCalledWith({
      token: '0xUSDC',
      amount: '900',
    });
  });
});
